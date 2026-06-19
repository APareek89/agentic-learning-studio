# Agentic Learning Studio — Tab 1 "Learning" — Unified Build Specification (v1)

A web app whose **Tab 1 "Learning"** generates, on demand, a **self-contained interactive HTML learning artifact** about any agentic-AI topic, personalized to the learner. It **replaces video** with structured, visual, mental-map-first, click-to-deep-dive **reading** — beating the example at `/Users/anandpareek/Documents/agentic-architect-trainer/index.html` (2840 lines, 219 KB).

**Stack (decided):** TypeScript · LangGraph.js · LangChain · Claude (`ChatAnthropic`) · Supabase (Postgres + pgvector) · Langfuse · Express · SSE · tabbed vanilla front-end. Reuses verified patterns from `/Users/anandpareek/Documents/seo-insights-agent` (`src/agent/llm.ts` `makeLLM` + top_p fix; `src/lib/db.ts` `getPool()`/`dbEnabled()` graceful-optional; `src/server.ts` `send(event,data)` SSE with `streamMode:"updates"`; `tool()`+Zod; `Annotation.Root` state).

---

## 1. Architecture overview

```
Browser (tabbed shell, chat 30% + viewer 70%)
   │  POST /api/learn  (SSE)                 POST /api/module (SSE)
   ▼                                              ▼
Express server (src/server.ts)            lazy deep-dive route
   │  streamMode:"updates"                        │
   ▼                                              ▼
MAIN graph (LangGraph.js)                  deepDive sub-graph (LangGraph.js)
 Profiler → Retriever →[gate]→ WebResearcher* → CurriculumArchitect → QualityCritic⟲ → HtmlComposer → Persist
   │                                              │
   ▼                                              ▼
 RAG layer (pgvector + tsvector + RRF, bge-small local 384-dim)   module_cache (combo-keyed)
   │
   ▼
 Supabase Postgres (graceful-optional via DATABASE_URL; app runs with ZERO infra)
```

* `*` `WebResearcher` / `web_search` / `fetch_url` are **graceful stubs** today (return `[]`/empty) behind real `tool()` signatures; a provider drops in later with no graph change.
* **Load-bearing invariant:** every external dependency degrades to a no-op, never a crash. No `DATABASE_URL` → `ragEnabled()` false → Retriever returns `[]`, coverage 0 → Architect proceeds on Claude's own knowledge. No Langfuse keys → tracing skipped. bge fails to load → treated as `ragEnabled()=false`. Only hard requirement: `ANTHROPIC_API_KEY`.
* **The model emits Blueprint JSON only — never HTML or JS.** One tested, hand-written deterministic renderer + inline runtime provides all markup and behavior. This is the central robustness guarantee.

---

## 2. The agent graph

### 2.1 Main generation graph

```
START → Profiler → Retriever ─┬─(recency)──────────────→ WebResearcher* ─┐
                              ├─(coverage <0.35)────────→ WebResearcher* ─┤→ CurriculumArchitect
                              └─(coverage ≥0.35)──────────────────────────┘
CurriculumArchitect → QualityCritic ─(revise, <2)→ CurriculumArchitect
                                    └─(pass | 2 fails)→ HtmlComposer → Persist → END
```

| Node | Model tier | Role |
|---|---|---|
| **Profiler** | none (JS) if cards present; Sonnet @0 to **infer** when absent | Resolve `LearnerProfile{level,depth,examples,industry,building,topic}`. Default when unclear = **Beginner · Conceptual+Technical · Functional+Code** (most detailed). Sets `expandAcronymsOnFirstUse` + `showTermPopovers` true for beginner/intermediate. |
| **Retriever** | none (free) | Hybrid pgvector ANN + tsvector keyword, RRF-fused; computes blended `coverage` (§4). `ragEnabled()` gated → `[]` when off. |
| **WebResearcher** | none (stub) | Calls `web_search` + `fetch_url` stubs (→ `[]`); embeds+scores results. No-op now. |
| **CurriculumArchitect** | **Sonnet @0.2, maxTokens 8000** | `withStructuredOutput(BlueprintSchema)` → Blueprint with mentalMap + **module STUBS only** (no bodies). Context = retrieved chunks tagged `[S1]…[Sk]`. Validates citations back to real chunk ids; drops hallucinations. |
| **QualityCritic** | **Sonnet @0** | `withStructuredOutput(CritiqueSchema)`. **Hard gates** (auto-fail regardless of model opinion): unexpanded acronym for beginner/intermediate; zero-valid-source claims when RAG on + coverage ok; glossary count < detected core-term count. `pass = weightedScore ≥ 0.8 AND acronymExpansion===1 AND citationValidity ≥ 0.7`. Loop max 2. |
| **HtmlComposer** | none (deterministic) | `renderArtifact(blueprint) → string`. Registers artifact via reused `lib/artifacts.ts`. |
| **Persist** | none | Graceful-optional save to `generations` table (no-op when `dbEnabled()` false). |

### 2.2 Lazy deep-dive sub-graph (separate compiled graph)

```
START → RetrieveModule → ComposeModule → CacheModule → END
```

Invoked per-module on click (`POST /api/module`), so module bodies are **never** generated up front (latency + cost).

* `RetrieveModule` (no LLM): re-query KB with `moduleTitle + industry + terms`, k=6 (sharper than whole-topic pass).
* `ComposeModule` (**Sonnet @0.3 + Anthropic prompt caching** on the large static system+template instructions): writes the full module `blocks[]` at requested depth/examples, with (i) popovers per term + citation footer; flips `loadState:"full"`.
* `CacheModule`: upsert `module_cache` keyed by `sha256(topicHash|moduleId|level|depth|examples|industry)` — **full key prevents the 27 combos colliding**. Cache hit → instant return, no Claude call.

### 2.3 Where Claude is used vs free/deterministic

Claude (genuinely generative/judgment) **only**: Profiler-infer, Architect, Critic, ComposeModule, `define_term` miss (Haiku). **Opus** is an escalation only when Critic fails twice on Advanced/Technical+Code. Everything else is **free & deterministic**: bge-small embeddings (local), pgvector ANN + tsvector, RRF fusion, coverage scoring, term extraction, glossary auto-wrap, template render. Per-artifact cost ≈ 1 Architect + 1–2 Critic + N lazy module calls (most cache hits).

### 2.4 Graph State (`Annotation.Root`)

Reuses prior `appendReducer<T>` + the replace-but-keep-on-empty idiom `(_o,n)=>n??_o, default:()=>null`.

```ts
GraphState = Annotation.Root({
  userPrompt:  Annotation<string>(),
  cards:       Annotation<Partial<{level;depth;examples}>>({reducer:(_o,n)=>n??_o, default:()=>({})}),
  profile:     Annotation<LearnerProfile|null>({...}),
  retrieved:   Annotation<RetrievedChunk[]>({default:()=>[]}),
  webChunks:   Annotation<RetrievedChunk[]>({default:()=>[]}),
  coverage:    Annotation<Coverage|null>({...}),
  blueprint:   Annotation<Blueprint|null>({...}),
  critique:    Annotation<CritiqueResult|null>({...}),
  reviseCount: Annotation<number>({reducer:(_o,n)=>n??_o??0, default:()=>0}),
  messages:    Annotation<ChatMessage[]>({reducer:appendReducer, default:()=>[]}),
  artifacts:   Annotation<ArtifactRef[]>({reducer:appendReducer, default:()=>[]}),
});
// DeepDiveState: {moduleId, profile, blueprintMeta, moduleChunks, fragmentHtml}
```

Compiled with `MemorySaver` (in-memory — artifacts lost on restart; durable Postgres saver is post-v1).

---

## 3. Blueprint JSON schema (the contract — concise but complete)

The single typed contract: agents produce it (`z.discriminatedUnion`), the deterministic renderer consumes it. Promotes **terms** and **citations** to first-class data, adds the **27-combo parameters** and **active recall** — the three biggest example gaps.

### 3.1 Top level

```ts
interface Blueprint {
  schemaVersion: "1.0";
  meta: Meta;                              // topic, title, generatedAt, estTotalMinutes, thesis, accent?
  learnerProfile: LearnerProfile;          // 27-combo + personalization carrier
  mentalMap: MentalMap;                    // ALWAYS first (advance organizer, clickable)
  modules: Module[];                       // ordered; stubs first, lazily filled
  glossary: Record<TermId, Term>;          // single source of truth for (i) popovers
  decisionDoc?: DecisionDoc;               // optional faceted "design-doc" companion ("50 Questions")
  synthesis: Synthesis;                    // ALWAYS last: ref-arch + build-order + checklist + capstone
  whatsNew?: WhatsNewItem[];               // daily-scan slot (stubbed now; renderer hides if empty)
  citations: Record<CitationId, Citation>; // dereferenced registry; KB ids validated, hallucinations dropped
}
```

### 3.2 Profile & 27 combos

```ts
type Level="beginner"|"intermediate"|"advanced";
type Depth="conceptual"|"technical"|"conceptual_technical";
type Examples="functional"|"code"|"functional_code";
interface LearnerProfile {
  level:Level; depth:Depth; examples:Examples;
  industry?:string; buildGoal?:string;     // drives example tailoring & decision defaults
  inferred:boolean;                        // true if no starter cards chosen
  expandAcronymsOnFirstUse:boolean;        // true for beg/int — validation HARD-fails unexpanded acronyms
  showTermPopovers:boolean;
}
```

The 27 combos are the Cartesian product 3×3×3 — **not enumerated**. The renderer reads the three fields and gates blocks (§5.3). Stored-explicit policy flags so the renderer never recomputes.

### 3.3 Terms (closes the #1 gap)

```ts
interface Term {
  id:TermId; label:string; aliases?:string[];
  acronymExpansion?:string;                // REQUIRED if label matches /^[A-Z0-9]{2,}$/ and expandAcronyms on
  laymanDefinition:string;                 // beginner-grade (i) popover body
  technicalNote?:string;                   // shown only when depth includes technical
  wrapPolicy?:"firstOnly"|"all";           // cap noisy short terms (default firstOnly; "all" for beginner)
  sources?:CitationId[];
}
```

### 3.4 Mental map (mandatory first; real navigation, not prose)

```ts
interface MentalMap { title; caption; oneLineThesis; nodes:MapNode[]; edges:MapEdge[]; }
interface MapNode { id; label; sub?; moduleId?; layer?; emphasis?:"spine"|"normal"; }
interface MapEdge { from; to; label?; }
```

Declarative — renderer does layout (stacked bands / grid / tree) → themed SVG. Every node with `moduleId` → focusable, keyboard-activatable `<button data-deepdive>` → `revealModule(id)`.

### 3.5 Module (unit of progressive disclosure; stub-or-full)

```ts
interface Module {
  id; order; icon; title;
  sub;                                     // doubles as "its role in the system" (example convention)
  eyebrow; summary; decisionItForces;      // the single decision this module forces → synthesis checklist
  objectives:string[];                     // "After this you'll be able to…"
  termIds:TermId[];                        // guaranteed (i) coverage
  estMinutes; loadState:"stub"|"full"; blocks:Block[]; citations:CitationId[];
}
```

### 3.6 Block (discriminated union — closed component vocabulary)

```ts
interface BlockBase {
  id; kind:BlockKind;
  visibleWhen?:{level?:Level[];depth?:Depth[];examples?:Examples[]};  // 27-combo gate; absent = always
  termIds?:TermId[]; sources?:CitationId[];
  depthTier?:"core"|"deeper";              // progressive disclosure WITHIN a module (deeper behind "Go deeper")
}
type BlockKind =
  | "conceptual" | "technical"                            // gated by Depth
  | "functionalExample" | "codeExample"                   // gated by Examples; personalized
  | "decisionMatrix" | "decisionCallout" | "decisionTree" // the 3 required chooser shapes
  | "diagram" | "scenario" | "walkthrough" | "taxonomy" | "note"
  | "selfCheckQuiz";                                       // active recall
```

Key block shapes (full set in `src/render/schema.ts`):
* `decisionCallout {useWhen, avoidWhen, ruleOfThumb}` = example's `CALL()`.
* `decisionMatrix {criteria[], options:[{name, cells:Record<criterion,{text,rating:good|ok|bad}>, whenToUse(REQUIRED), cost, complexity, tradeoffs, recommendedFor?}], howToRead}` — "When to choose" column mandatory.
* `decisionTree {root:TreeNode}` where `TreeNode {question? | outcome?, branches:[{label,to}]}`.
* `scenario {ask, implies, personalizedFor?}` = example's `SCN()`; personalization insertion point.
* `codeExample {filePath, language, code, explain?, predictThenReveal?:{prompt,answer}}` — active-recall on code.
* `selfCheckQuiz {prompt, format:"mcq"|"predictThenReveal"|"freeRecall"|"applyToYourBuild", options?, acceptableAnswer?, explanation, applyToYourBuildPrompt?}` — **asks BEFORE revealing** (opposite of the example's passive `<details>` accordion).
* Prose uses `RichText = RichNode[]` (typed `p`/`ul`/`ol`/`h`/`blockRef` nodes with `Span[]` incl. `{text,term:TermId}`) so the **model never emits raw HTML**; renderer owns all markup.

### 3.7 DecisionDoc, Synthesis, Citations

```ts
DecisionDoc.themes[].questions[] = {q, why, opts[], rot, sources?}   // exact example shape; 1st q → synthesis.checklist
Synthesis = {recap, referenceArchitecture:DiagramBlock, buildOrder:[{step,label,detail}],
             checklist:[{id,label,fromModuleId}], capstone:{prompt,scopedTo?}}  // checklist auto-derived from decisionItForces
Citation = {id, kind:"kb"|"liveSearch"|"canonical", title, url?, kbChunkId?, asOfDate?, retrievedAt?}
```

### 3.8 Validation gates (producer fails closed before render)

1. **Term integrity** — every `termIds[]`/`Span.term` resolves in `glossary`.
2. **Acronym policy** — when `expandAcronymsOnFirstUse`, no ALL-CAPS label lacks `acronymExpansion`.
3. **Decision coverage** — any options-bearing module carries ≥1 decision block.
4. **Mental-map wiring** — ≥1 `MapNode.moduleId` resolves to a real module.
5. **Citation integrity** — every `sources[]` id exists; KB citations' `kbChunkId` map to real chunk ids (drop invalid; pin the retrieved chunk-id set for the lifetime of one generation).
6. **Matrix alignment** — `.superRefine`: every option's `cells` keys === `criteria` set.
7. **27-combo soundness** — fast static check that every module yields ≥1 visible block in all 27 states (guaranteed by an always-visible `core` tier).

---

## 4. RAG: retrieval + coverage gate

* **Hybrid by default:** vector (`embedding <=> $1` cosine, normalized, `LIMIT 20`) + keyword (`content_tsv @@ plainto_tsquery`) fused via **RRF** `score=Σ 1/(60+rank)` → keep top-k=8. Rescues proper-noun lookups ("LangGraph vs CrewAI").
* **Coverage score (no LLM):** `0.5·topSim + 0.3·(hits with sim≥0.45)/k + 0.2·termCoverage`. Gate: `≥0.55` KB-only · `0.35–0.55` KB + "thin" flag to author prompt · `<0.35` invoke `searchStub()`.
* **Recency trigger:** route to WebResearcher when prompt matches `/(latest|newest|new|2026|recent|state.of.the.art)/i` OR freshest retrieved `as_of_date` older than `STALENESS_DAYS` (90).
* All thresholds (0.55/0.35/0.45, staleness 90d) are **initial guesses** → emitted as Langfuse scores and tuned on real topics before the web-search gate is trusted.

---

## 5. Deterministic template / component system

### 5.1 Principle
`renderArtifact(bp:Blueprint): string` — pure, dependency-free, returns ONE self-contained HTML string. Same Blueprint ⇒ byte-identical HTML. The LLM writes **zero** CSS/JS.

### 5.2 Component library (parameterized renderer functions, `(props, ctx)=>string`)
Reuses the example's closed vocabulary (`g/CALL/DIA/TBL/SCN/CODE+hl/escCode/WALK/SUP/N/ARR`), each formalized as a typed component, **plus the components the example lacks**: `HubMap` (clickable mental-map), `GlossaryTerm` ((i)-button soft popover), `DecisionMatrix`, `ExampleTabs` (per-block functional/code radio+`:checked` CSS, no JS), `QuizCard`/`RecallCheck`, `WhatsNewBanner`, `YourProjectRail`, `CitationsFooter`.

### 5.3 27 combos = one mechanism
All variants emitted into the file; **CSS reveals the active combo** via three stacked body attributes set by the runtime from `learnerProfile`:
```html
<body data-level="beginner" data-depth="conceptual_technical" data-examples="functional_code" data-theme="light">
```
```css
body[data-depth="conceptual"] .code-example,
body[data-depth="conceptual"] .needs-code { display:none; }
body[data-depth="technical"]  .concept-only { display:none; }
body[data-examples="functional"] .ex-code { display:none; }
body[data-examples="code"]       .ex-functional { display:none; }
body[data-level="advanced"] .tier-1 { display:none; }   /* collapse basics behind "Go deeper" */
body[data-level="beginner"] .tier-3 { display:none; }   /* hide edge-cases by default */
```
Generalizes the example's single `data-learnmode` toggle to three axes. A **build-time matrix lint** asserts non-empty visible content in each of the 27 states before returning HTML (the always-visible `core` tier guarantees this).

### 5.4 Auto-glossary (i) pass (closes #1 gap)
After rendering, an auto-linker operates **only on text nodes** of a parsed token stream (never regex over raw HTML; skips `<code>/<pre>/<svg>/`existing `.term`), wrapping each glossary term/acronym per `wrapPolicy` → `<button class="term" data-term-id aria-describedby>…<span class="i">i</span></button>` → click-pinned, outside-click-dismiss, Esc-closable, focus-trapped soft popover (tiny JS positioner primary path so it escapes overflow containers; native Popover API as progressive enhancement). For beginner/intermediate the renderer **fails the build** on any unexpanded acronym.

### 5.5 Design tokens (adopt example values, restructure into semantic + themeable)
Keep verbatim: `--indigo #605BFF`, `--ink #0f1222`, radius 14px, the two-layer shadow ladder, Inter, line-height 1.62, 780px measure. Restructure into namespaced tokens (`--color-accent*`, `--text-*`, `--surface-*`, `--border*`, `--ok/--danger/--warn`, `--radius*`, `--measure`, `--shell`). **Improvements:** true `[data-theme=dark]` token swap (prefers-color-scheme + persisted toggle); per-industry accent by overriding only `--color-accent*`; `prefers-reduced-motion` guards on every transition.

### 5.6 The single hardened runtime (`RUNTIME_JS`, ~200 lines, written once)
ONE delegated `click`/`keydown` listener (`closest('[data-deepdive],[data-cp],.term,[data-quiz]')`); `body[data-*]` toggles; popover open/position/dismiss; quiz scoring; progress bar; theme; **all `localStorage` in try/catch**; dual-path init (DOMContentLoaded or immediate); `execCommand` copy fallback for `file://`; print stylesheet un-hides hidden sections. Models supply data only; this code is constant across every artifact.

### 5.7 Self-contained + controls
One `.html`, inline `<style>`+`<script>`, only external = Google Fonts (system-font fallback for true offline). **Download** (host chrome, 70% pane): `Blob([html]) → <a download>`. **Open-in-new-window** (host chrome): `w=window.open(); w.document.write(html); w.document.close()`. Both controls live in the **app chrome**, not inside the artifact, so the downloaded file stays clean.

---

## 6. Supabase RAG schema + ingestion

Connect to existing project **`kchrkdatcdxwyugurmws`** as **plain Postgres** via the `pg` driver + IPv4 Session-pooler `DATABASE_URL` (`ssl:{rejectUnauthorized:false}`) — **no supabase-js / service-role key**. Reuse `db.ts` `getPool()`/`dbEnabled()` verbatim; add `ragEnabled()`.

### 6.1 Migration `supabase/migrations/0002_rag.sql` (idempotent; `0001_init.sql` untouched)
```sql
create extension if not exists vector;  create extension if not exists pgcrypto;
-- documents: one row per ingested SOURCE (source_id UNIQUE, content_hash, mtime, source_type, category, meta jsonb)
-- chunks: one embedding each
create table if not exists chunks (
  id bigserial primary key, document_id uuid references documents(id) on delete cascade,
  source_id text not null, chunk_index int, content_kind text default 'prose', -- record|prose|code|table
  title text, category text, url text, content text not null, token_count int,
  license text, verdict text, as_of_date date,                       -- governance + recency, filterable
  content_tsv tsvector generated always as (to_tsvector('english',content)) stored,
  embedding vector(384), content_hash text unique not null,          -- UNIQUE → idempotent upsert
  created_at timestamptz default now());
create index on chunks using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index on chunks using gin (content_tsv);
create index on chunks (category); create index on chunks (verdict); create index on chunks (as_of_date desc);
-- glossary(term, level, acronym_expansion, definition, source_ids[]) unique(term,level)
-- generations(topic_hash, prompt, cards jsonb, profile jsonb, blueprint jsonb, html, citations jsonb, coverage real)
--   UNIQUE index on (topic_hash, cards->>level, cards->>depth, cards->>examples, profile->>industry)  -- combo-safe cache
-- module_cache(cache_key text pk, fragment_html text, created_at)
-- kb_updates(run_at, source, added, updated, skipped, errors jsonb, note)  -- daily-scan audit
```
HNSW (not IVFFlat) because the KB arrives incrementally + daily cron upserts — graceful inserts, no centroid retraining. Vectors normalized → cosine (`<=>`). Pass vectors as the pgvector **TEXT literal** `'[v0,v1,…]'` (pooler-safe). Generalize `scripts/migrate.mjs` to glob `migrations/*.sql` sorted ascending.

### 6.2 Embeddings (FREE local, pluggable)
`@huggingface/transformers` → `Xenova/bge-small-en-v1.5` (384-dim, `{pooling:'mean',normalize:true}`), lazy-singleton warmed at boot (like `getPool()`), HF cache dir set. **BGE asymmetry baked into the API:** `embedQuery()` prepends `"Represent this sentence for searching relevant passages: "`; `embedPassages()` does NOT — separate functions so it can't be forgotten. `EmbeddingProvider {dim, embedQuery, embedPassages}` interface so a hosted model swaps in later.

### 6.3 Ingestion (`src/rag/ingest.ts`, re-runnable, idempotent)
Format-dispatched `ingest(path)`: loaders for **json/csv/docx(mammoth)/pdf/md/html/url**. **Two type-aware chunkers:**
* **Catalog records** (the 186-and-climbing `17_Open_Source_Candidate_List.json`) → **one chunk per repo**, synthetic searchable sentence (`name (category) — one_line. agentic_context_description. Verdict: X. Weaknesses: Y. lang/license/★`), all 17 fields → filterable metadata.
* **Prose** (the planned `00–16` docs) → heading-aware ~450-token windows, 80-token overlap, **never split inside fenced code or markdown tables** (those become `content_kind=code|table` chunks).

**Robustness:** dedup the JSON/CSV mirror at discovery (ingest `.json`, skip same-stem `.csv`) and dedup catalog rows on `github_url`; exclude `rendered_plan/*.png` + `.DS_Store` by default (PNGs are page-renders of the docx; OCR only behind a flag); per-file & per-record `try/skip` with an errors quarantine (KB written concurrently by another tool); `content_hash`+`mtime` skip-if-unchanged, delete-by-`source_id` then re-insert on change. Writes a `kb_updates` row each run. CLI: `npm run ingest -- "/Users/anandpareek/Documents/AI Knowledge base"`.

---

## 7. Personalization

* `LearnerProfile.industry` + `buildGoal` (from starter cards or Profiler inference) flow into the Blueprint and drive: `scenario` (ask/implies tailored to industry), `analogy`, `decisionMatrix.recommendedFor` highlighting, and `selfCheckQuiz.applyToYourBuild`.
* When the KB lacks an industry example → this is the trigger point for the (stubbed) web search; personalized blocks with thin grounding get a `SUP()` "general knowledge — not yet in KB" tag rather than presenting unsourced specifics as fact.
* **Normalize `industry`** into a controlled vocab before hashing the cache key, or the `module_cache` rarely hits.

---

## 8. (i)-term system summary
First-class `glossary{}` + per-block `termIds[]` → deterministic auto-wrap of every term/acronym (text-node-safe, code-exempt) → click/tap (i) soft-popover with layman def, source line, and "last updated". Validation **fails the build** on unexpanded acronyms for beginner/intermediate. This is the differentiator vs the example's 38 author-chosen hover-only terms.

---

## 9. Daily-scan + web-search stubs
* `web_search` / `fetch_url` = `tool()`-wrapped graceful no-ops (return `[]`/empty) — real provider drops in behind identical signatures.
* `runDailyScan()` (stub): re-points the **same idempotent `ingest()`** at the KB folder (so newly-arrived `00–16` docs get picked up for free), calls `searchStub()` (→ `[]`), writes a `kb_updates` provenance row. Wired through the existing scheduled-task mechanism. Real web provider later populates `fetchedAt` so retrieval can freshness-boost.

---

## 10. Front-end shell
* **Landing:** centered prompt box with helper text + 3 rows of **optional** starter cards — Row1 Level {Beginner, Intermediate, Advanced} · Row2 Depth {Conceptual Only, Technical Only, Conceptual+Technical} · Row3 Examples {Functional, Code, Functional+Code}. No cards → Profiler infers; unclear → default most-detailed.
* **On submit:** chat slides to **LEFT 30%**, artifact opens **RIGHT 70%** with **Download** + **Open-in-new-window** controls in the chrome.
* **Tabs:** ARIA `tablist/tab/tabpanel`. Tab 1 "Learning" (live). **Tab 2 "coming soon"** placeholder panel.
* **Mental-map-first UX:** the `blueprint` SSE event paints the whole-picture map + nav rail immediately; clicking a building block fires `POST /api/module` (lazy deep-dive).

---

## 11. SSE contract

Reuses `send(event,data)` + `streamMode:"updates"` loop from `server.ts`.

**`POST /api/learn` (main run):**
| event | payload | front-end action |
|---|---|---|
| `node` | `{stage}` | update "Thinking…" status (Profiler→Retriever→…) |
| `message` | `ChatMessage` | append chat bubble (left 30%) |
| `coverage` | `{score,decision,recencyTriggered}` | optional hint ("searching for recent advances…") |
| `blueprint` | `{mentalMap, moduleStubs, profile}` | **slide chat left 30%, open viewer 70%**; render map hero + nav rail FIRST |
| `term` | `GlossaryEntry[]` | hydrate (i)-popover definitions |
| `artifact` | `ArtifactRef` | enable Download + Open-in-new-window |
| `done` | `{thread_id}` | finalize; persist thread for follow-ups |
| `error` | `{message}` | friendly error bubble |

**`POST /api/module` (lazy deep-dive):**
| event | payload | front-end action |
|---|---|---|
| `module:start` | `{moduleId}` | show skeleton in building-block panel |
| `module` | `{moduleId, fragmentHtml, cached, sources}` | inject deep-dive fragment + citation footer |
| `module:done` | `{moduleId}` | mark nav item complete (drives progress bar) |

---

## 12. Langfuse
One `makeLangfuseHandler()` per request (null when keys absent → tracing skipped). Passed via stream `callbacks`. `runName:"Learn: {topic}"`, `metadata.langfuseSessionId=thread_id`, tags `["learning-gen",level,depth]`. **Emit scores:** `coverage.score`, `coverage.termCoverage`, `critique.scores.*` so thresholds/gates are tunable on real traces. `await langfuse.flushAsync().catch(()=>{})` in `finally`.

---

## 13. File plan

- `package.json` — Deps: copy prior project's set + add @huggingface/transformers (bge embeddings), mammoth (docx), pdf-parse, csv-parse; scripts: dev/start (tsx), migrate, ingest, scan.
- `.env.example` — ANTHROPIC_API_KEY (required) + DATABASE_URL, ANTHROPIC_MODEL_SONNET/OPUS/HAIKU, LANGFUSE_*, TRANSFORMERS_CACHE, STALENESS_DAYS — all optional/graceful.
- `tsconfig.json` — TS config (ESM, node) copied from prior project.
- `START_HERE.md` — Handoff: env setup, run order, graceful-optional behavior, zero-infra quickstart.
- `src/server.ts` — Express + SSE host; routes /api/learn (main graph) and /api/module (deep-dive); reuses send(event,data) + streamMode:'updates'; serves public/ and artifacts.
- `src/agent/state.ts` — Annotation.Root GraphState + DeepDiveState; appendReducer + replace-but-keep-on-empty reducers; shared types (LearnerProfile, RetrievedChunk, Coverage, CritiqueResult).
- `src/agent/llm.ts` — makeLLM(tier,temperature,opts) factory copied verbatim WITH the top_p:-1 fix; adds sonnet/opus/haiku tiers reading ANTHROPIC_MODEL_* env.
- `src/agent/graph.ts` — Builds & compiles the main generation graph and the deepDive sub-graph (MemorySaver); wires conditional edges (coverage_gate, recency, critic loop).
- `src/agent/nodes.ts` — Node fns: profiler, retriever, webResearcher, curriculumArchitect, qualityCritic, htmlComposer, persist, runDeepDive (retrieveModule/composeModule/cacheModule).
- `src/agent/prompts.ts` — System prompts for Architect/Critic/ComposeModule enforcing mental-map-first, decision-it-forces, glossary completeness, acronym expansion, [S#] citation tagging.
- `src/rag/embed.ts` — EmbeddingProvider (bge-small-en-v1.5, 384-dim) lazy singleton; embedQuery (BGE prefix) vs embedPassages (raw); pluggable for hosted later.
- `src/rag/loaders.ts` — Format-dispatched loaders (json catalog vs manifest, csv, docx/mammoth, pdf, md/html, url) → normalized LoadedSource; discover() with ignore-list + JSON/CSV same-stem dedup.
- `src/rag/chunkers.ts` — Type-aware chunker registry: recordChunker (1 chunk/repo + metadata) and proseChunker (heading-aware ~450tok/80 overlap, never split code/tables).
- `src/rag/store.ts` — Idempotent upsert (content_hash UNIQUE, delete-by-source_id on change); embeds chunks; writes vectors as pgvector text literal; gated by dbEnabled().
- `src/rag/retrieve.ts` — Hybrid vector + tsvector retrieval, RRF fusion (k=60), top-k=8; coverage score blend; per-query hnsw.ef_search; recency/staleness flag.
- `src/rag/ingest.ts` — ingest(path) entrypoint + CLI; discover→load→chunk→upsert with per-file/record try-skip quarantine; writes kb_updates row.
- `src/rag/dailyScan.ts` — runDailyScan() stub: re-runs idempotent ingest on the KB folder + searchStub() no-op; records kb_updates provenance. Real web provider plugs in here later.
- `src/tools/webSearch.ts` — tool()+Zod web_search — graceful no-op returning [] now; real provider behind identical signature later.
- `src/tools/fetchUrl.ts` — tool()+Zod fetch_url — graceful stub now; later Playwright headless extraction (reuse extractPageContext pattern).
- `src/tools/retrieveKnowledge.ts` — tool()+Zod wrapper over rag/retrieve for model-callable hybrid KB search with provenance + recency.
- `src/tools/defineTerm.ts` — tool()+Zod define_term — cached glossary lookup; Claude Haiku one-shot on miss, persisted to glossary table.
- `src/render/index.ts` — renderArtifact(blueprint): string orchestrator — validate→glossary index→HubMap→sections→synthesis→assemble→matrixLint→minify.
- `src/render/schema.ts` — Zod schemas for the full Blueprint (discriminatedUnion blocks) + validateBlueprint() with the 7 fail-closed gates.
- `src/render/tokens.ts` — TOKENS_CSS (semantic namespaced), DARK_CSS [data-theme=dark] swap, accentOverride(hex) per-industry.
- `src/render/runtime.ts` — RUNTIME_JS — the single hardened inline script (delegated listener, data-* toggles, popovers, quiz scoring, progress, theme, try/catch localStorage, copy fallback, dual init).
- `src/render/components/` — One file per typed component (HubMap, GlossaryTerm, DeepDivePanel, DecisionCallout/Matrix/Tree, ComparisonTable, ExampleTabs, CodeBlock, QuizCard, RecallCheck, Scenario, Note, Walkthrough, Taxonomy, WhatsNewBanner, YourProjectRail, CitationsFooter).
- `src/render/glossary/autolink.ts` — Text-node-safe auto-linker wrapping every glossary term/acronym per wrapPolicy; skips code/svg/existing terms; injects (i) buttons.
- `src/render/diagram/layout.ts` — N()/ARR() SVG primitives + deterministic autoLayout(nodes,edges) for stack/flow/tree/grid so the model never writes pixel math.
- `src/render/lint.ts` — matrixLint(html): assert non-empty visible content across all 27 level×depth×examples states before returning HTML.
- `src/render/assemble.ts` — Wraps tokens + body + runtime into the final single-file <!doctype> HTML string with print stylesheet + Google Fonts.
- `src/lib/db.ts` — Graceful-optional pg layer copied verbatim (getPool lazy singleton, dbEnabled, ssl rejectUnauthorized:false); adds ragEnabled().
- `src/lib/langfuse.ts` — makeLangfuseHandler() copied verbatim — null when keys absent; emits coverage/critic scores.
- `src/lib/artifacts.ts` — registerArtifact/getArtifact store + download serving, copied from prior project.
- `src/lib/hash.ts` — sha256 helpers: content_hash, topic_hash, normalized-industry cache key (level|depth|examples|industry).
- `supabase/migrations/0001_init.sql` — Prior project's base schema, kept untouched.
- `supabase/migrations/0002_rag.sql` — RAG schema: vector ext, documents/chunks (HNSW + tsvector), glossary, generations (combo-safe cache index), module_cache, kb_updates.
- `scripts/migrate.mjs` — Generalized migration runner: glob migrations/*.sql sorted ascending, each run as one simple query over the pooler.
- `public/index.html` — Tabbed shell: landing (prompt box + 3 starter-card rows + helper text), 30/70 chat+viewer layout, Download/Open-in-window controls, Tab 2 coming-soon.
- `public/styles.css` — Host-app chrome styling (tabs, landing, starter cards, 30/70 split, viewer frame). Distinct from the artifact's inline tokens.
- `public/app.js` — Front-end SSE client: consumes /api/learn + /api/module events, slides chat left, renders viewer, wires Download/Open-in-window, lazy module fetch on building-block click.

---

## 14. How this beats the example

1. Mental-map-first as real NAVIGATION: HubMap nodes are clickable <button data-deepdive> wired to revealModule() — the example's '9 layers, every chapter zooms into one' is only prose; the SVG layers are 100% static (zero onclick/href/tabindex).
2. (i) popover on EVERY core term, automatically: first-class glossary{} + per-block termIds[] + a deterministic text-node-safe auto-linker, vs the example's 38 author-chosen hover-only tooltips that are bare on repeat mentions and unusable on touch.
3. Zero unexpanded acronyms for beginner/intermediate, enforced: the build FAILS if an ALL-CAPS term lacks acronymExpansion — the example expands acronyms only where the author remembered.
4. Active recall (the #1 gap): selfCheckQuiz blocks (mcq/predict-then-reveal/free-recall/apply-to-your-build) that ASK before revealing, score via :checked CSS, persist, and drive the progress bar — vs the example's passive <details> '50 Questions' accordions that only reveal answers.
5. Full personalization: every artifact tailored to the learner's industry + what they're building (scenarios, analogies, decisionMatrix.recommendedFor highlight, apply-to-your-build prompts) — the example is one fixed SEO-Insights-Agent example for everyone.
6. RAG grounding + validated citations + freshness: per-block/term sources[] mapped to real kb_chunks.id (hallucinations dropped), a CitationsFooter, (i)-popover 'Source · last updated' lines, and a WhatsNewBanner — the example is fully static with no provenance.
7. 27 adaptive Level×Depth×Examples combinations from ONE renderer via stacked body[data-*]+CSS — the example is a single fixed Beginner+Both-depth+Both-examples artifact with only a binary global Content/Code toggle.
8. Per-concept progressive disclosure (depthTier core|deeper 'Go deeper'), not just chapter-level — a beginner and an expert see different density of the same module; the example shows everyone the same wall of text per chapter.
9. Decision support as three standardized interactive data shapes — decisionMatrix (with a required 'When to choose' column + cost/complexity), decisionCallout (Use/Avoid/Rule), decisionTree — plus an optional constraint-chip highlighter; the example's choosers are static text only.
10. True dark theme + per-industry accent via token swap (the example is light-only despite dark code blocks); prefers-reduced-motion guards and stronger ARIA (role=dialog/focus-trap on pinned popovers, aria-describedby on terms).
11. Lazy per-module deep-dive with combo-keyed caching: map + stubs stream instantly, bodies generated on click and cached by (topicHash,moduleId,level,depth,examples,industry) — faster, cheaper, and 'click building blocks to deep-dive step by step' is literal, not implied.
12. Daily web-scan freshness loop (stubbed now) that re-ingests the growing KB and will fold in new agentic advancements — the example has no freshness mechanism at all.
13. Mental-map node click + lightweight nested navigation (section → its h2/h3) close the example's rail-is-chapter-level-only gap.

---

## 15. Open risks

1. @huggingface/transformers pulls ONNX native binaries + a ~130MB first-run model download; must verify clean install on the user's macOS/node, set a stable TRANSFORMERS_CACHE, and warm a lazy singleton at boot — otherwise cold-download looks like a hang. If load fails, embed fns must degrade to ragEnabled()=false, not crash the request.
2. Coverage thresholds (0.55/0.35), the 0.45 hit cutoff, and the 90-day staleness window are guesses; bge-small cosine magnitudes are topic-dependent. Untuned, they over-trigger the (empty) web search or starve thin topics. Must be instrumented as Langfuse scores and tuned before the gate is trusted.
3. Citation validation is a hard correctness guard: if S-id→chunk-id mapping is skipped or chunk ids drift mid-generation (re-ingest), valid citations get dropped as hallucinated and/or fake sources surface. Pin the retrieved chunk-id set for the lifetime of one generation and run validation on every Architect and deep-dive output.
4. Term auto-wrapping can over-match short labels/aliases ('token','agent','state') inside code, other terms, or hundreds of times per beginner page; must operate on a parsed token stream (never regex over raw HTML), skip code/svg/existing terms, and honor per-term wrapPolicy — easy to get subtly wrong and corrupt HTML.
5. 27-combo visibility can blank a section for some combinations (e.g. technical-only + functional-examples); the matrix lint must actually run a fast static non-empty check per state, guaranteed by an always-visible 'core' tier — but this is 27× work and easy to skip.
6. Lazy deep-dive incurs a Claude round-trip on first click of each module; without aggressive combo-keyed caching + Anthropic prompt caching of the static system/template prompt, clicking through many modules is slow and costly. The cache key MUST include level+depth+examples+normalized-industry or the 27 combos collide and serve wrong-depth fragments (invisible until a user reports it).
7. withStructuredOutput on a large nested Blueprint (mentalMap + N stubs + glossary + decision blocks) can hit token limits / partial-JSON failures on big topics; mitigated by emitting STUBS only (no bodies) at the Architect, raising maxTokens for that node, and a Zod parse-failure retry.
8. RichText raises the LLM authoring burden (structured nodes/spans vs markdown) and may increase malformed output + token cost; fallback is to accept constrained markdown and parse it server-side into RichText, keeping RichText as the internal contract.
9. The KB is written concurrently by another tool (186 and climbing, evolving 17-field schema); ingestion must tolerate half-written/malformed JSON rows (per-record try/skip), dedup JSON/CSV on github_url, exclude rendered_plan PNGs, and validate-but-not-fail on schema drift — or a mid-write cron run corrupts/aborts.
10. Supabase Session-pooler (pgbouncer transaction mode) can choke on prepared statements/DDL and binary vector params; send each migration as one simple query and pass vectors as the pgvector TEXT literal '[...]'.
11. MemorySaver is in-memory — blueprints/artifacts are lost on server restart, so deep-link/reload of a generated artifact won't survive; durable Postgres saver + persisted generations is post-v1.
12. The 17 planned prose docs (00–16) DO NOT EXIST YET — only the research-plan docx + the catalog do. The proseChunker can only be fully exercised once that tool writes them; build it now from the plan's described shape (headings+code+tables+sources) and test against the catalog.

---

## 16. Build order (next actions)

1. Skeleton: scaffold the file tree; copy src/agent/llm.ts (with top_p fix), src/lib/db.ts (getPool/dbEnabled), src/lib/langfuse.ts, src/lib/artifacts.ts, scripts/migrate.mjs, tsconfig, package.json verbatim; add new deps; confirm `tsx` server boots and serves public/ with ZERO env beyond ANTHROPIC_API_KEY.
2. Schema + embedder: write src/render/schema.ts (full Blueprint Zod + 7 validation gates) and src/rag/embed.ts (bge-small lazy singleton, embedQuery/embedPassages); verify the ~130MB model downloads/caches and embeds 384-dim vectors locally on the user's machine.
3. Supabase RAG schema: author supabase/migrations/0002_rag.sql, generalize migrate.mjs to glob migrations, run against kchrkdatcdxwyugurmws via the Session-pooler DATABASE_URL; confirm HNSW + tsvector indexes create over the pooler.
4. Ingestion: build src/rag/{loaders,chunkers,store,ingest}.ts; run `npm run ingest` against '/Users/anandpareek/Documents/AI Knowledge base' (catalog JSON only, CSV deduped, PNGs/docx handled); verify idempotent re-run skips unchanged + per-record quarantine works.
5. Retrieval: build src/rag/retrieve.ts (hybrid vector+tsvector, RRF, coverage score, recency flag); smoke-test queries ('LangGraph vs CrewAI', 'what is GraphRAG') and log coverage to Langfuse for threshold calibration.
6. Graph nodes: implement state.ts, prompts.ts, nodes.ts (Profiler→Retriever→gate→WebResearcher stub→Architect→Critic loop→Composer→Persist) + graph.ts wiring + conditional edges; produce a valid Blueprint (stubs) end-to-end with citation validation.
7. Template system: build src/render/* (tokens, runtime, components/, autolink, diagram/layout, lint, assemble, index); render the Blueprint to a self-contained HTML and run matrixLint across all 27 combos; diff visual quality against the example.
8. UI shell: build public/{index.html,styles.css,app.js} — landing with prompt box + 3 starter-card rows + helper text, 30/70 slide-on-submit, Download + Open-in-new-window, Tab 2 coming-soon; wire the /api/learn SSE client so the mental-map streams first.
9. Lazy deep-dive: implement the deepDive sub-graph + POST /api/module + module_cache (combo key) + Anthropic prompt caching; wire building-block clicks → module:start/module/module:done events → inject fragments.
10. Stubs + cron: confirm web_search/fetch_url graceful no-ops and runDailyScan() (re-ingest + kb_updates row) are wired through the scheduled-task mechanism; verify the whole app still runs with no DATABASE_URL and no Langfuse keys (graceful-optional invariant).

---

## 17. v1.1 additions (2026-06-19) — lesson-experience controls

Implemented on the single-call architect path; details + files in `HANDOFF.md §2`.

**Landing-page generation controls** (change what the LLM writes → carried on `LearnerProfile`):
- **Text density** `low|medium|high` → architect prose sizing (low = sharp/direct, high = thorough).
- **Visuals & demos** (bool) → when on, architect MUST add interactive visual blocks for genuinely-complex concepts only.
- **Explain syntax** (bool) → every `codeExample` carries a `syntax[]` ({part, explains}) breakdown.

**New data-only block kinds** (model supplies data; renderer+runtime own all SVG/HTML/JS — the no-LLM-HTML invariant holds; templates generalized from `~/Documents/rag-explained.html`):
- `interactiveScatter {points[],queries[]}` — similarity / clustering / embedding space / classification boundaries.
- `interactiveSlider {min,max,unit?,stops[]}` — thresholds / tradeoffs / a parameter's effect.
- `steppedFlow {steps[]}` — multi-stage pipelines / lifecycles.
Prompt picks the right one via the **VISUAL REPRESENTATION GUIDE** in `ARCHITECT_SYSTEM`.

**In-lesson runtime toggles** (artifact top bar; instant CSS show/hide, no regeneration — content already exists):
- Concept / Functional / Code → `body.hide-concept|hide-funcex|hide-code` over `b-concept|b-funcex|b-code` block classes (additive on top of the 27-combo `needs-*` gates). Each toggle renders only if that content type exists.
- Explain syntax → `body.show-syntax` reveals the per-`codeExample` `.syntax-panel` (hidden by default).

**Richer mental map:** `MapNode` gains `what` (what it is) + `relevance` (why it matters here); the overview renders these as info cards, not bare boxes.

**Generation cap:** architect raised to `maxTokens:32000 + streaming:true` (see HANDOFF gotchas) so a fully-loaded lesson (all controls on) completes without truncation. Heavy lessons run ~5 min — the lazy per-module deep-dive (item 9 above) remains the long-term latency fix.

---

## 18. v1.2 additions (2026-06-19) — progressive generation, layout, document upload

(Full status + files in `HANDOFF.md §2`.)

**Progressive generation** — architect emits a SKELETON (stubs) via `SKELETON_SYSTEM` (maxTokens 16000); `seedFirstModule` writes Module 1; the rest build in the background, driven by the artifact's own runtime calling `POST /api/module` (sequential queue, click-to-prioritize, `module_cache`). `GET /api/artifact/:id/full` eager-builds all (bounded re-check loop) for an offline-complete download. Module bodies are written by `runDeepDive()` (`MODULE_SYSTEM`), which is where density/visuals/syntax now apply.

**Layout** — topbar split left(Overview)/center(title, bigger)/right(controls); overview widened so the mental map fills the screen; workbench widened with prose capped for readability.

**Document upload (session-scoped)** — `POST /api/upload` parses (loaders) + chunks + embeds LOCALLY into `lib/uploads.ts` (in-memory, never the shared KB). `/api/learn {uploadIds, referOnly}`: retriever + `runDeepDive` prioritize upload chunks (`U#`) over KB (`S#`); `referOnly` uses uploads only. Provenance: `meta.usedUpload/referOnly/uploadTitles` → banner; citation kind `"upload"` → "your document" tags. Reusable across lessons in a browser session; cleared on refresh.

**Blocked on API credits:** full live verification of generation (progressive first-paint timing, upload-grounded lessons, refer-only end-to-end) is pending an Anthropic credit top-up. The no-LLM paths (layout render, upload parse/chunk/embed/retrieve, provenance render, /api/module cache hit/miss structure) are verified.

