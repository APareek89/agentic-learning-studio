# HANDOFF — Agentic Learning Studio

**This doc is a MAP, not the code. Do NOT read the whole repo to get oriented.** Use the file
map below to jump straight to the one or two files a change touches, and open only those. Each
file has a one-line responsibility — that tells you where to go. Companion memory:
`~/.claude/projects/-Users-anandpareek-Documents/memory/agentic-learning-studio-project.md`.
(`DESIGN_SPEC.md` is older deep detail — optional; this HANDOFF is the source of truth.)

---

## 1. What it is
A web app whose **Configurator** tab takes a topic + options and generates a **self-contained
interactive HTML lesson** about agentic AI (mental-map-first, click-to-deepen, (i) on every term,
RAG-grounded). The **Trainer** tab is the lesson viewer; **My Lessons** = saved lessons;
**Library** = public prebuilt lessons. Replaces video with structured reading.

Stack: TypeScript · LangGraph.js · Claude (ChatAnthropic) · Supabase (Postgres + pgvector) ·
local Transformers.js embeddings (bge-small) · Express · vanilla front-end. `tsx` runs the TS
directly — **no build step**. Repo: `github.com/APareek89/agentic-learning-studio` (`main`,
auto-deploys to Render).

**Core invariant:** the model emits a **Blueprint (JSON) only**; a deterministic renderer
(`src/render/*`) turns it into HTML. That's why interactivity always works — never have the model write HTML.

---

## 2. Run / environment (non-negotiable)
- Port **5070** (`PORT=5070 npm start`; 5060 is Chrome-blocked). Kill stale: `lsof -ti tcp:5070 | xargs kill -9`.
- **Every Claude/Supabase/HF call** needs `NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"` (corp MITM).
- `.env` is set (git-ignored). Supabase = **new project `kdgtlbnlyscdldogxorb`** (ap-southeast-2), auth ON, DB password `@`→`%40`.
- `GET /healthz` → `{db, dbConfigured, dbError, auth}` (live `select 1`). `db:false` = env, not code.
- **Render prod (#1 gotcha):** dashboard env `DATABASE_URL` must be the **new** project with the password `@` as `%40`, and `SUPABASE_URL=https://kdgtlbnlyscdldogxorb.supabase.co`. `render.yaml` has `sync:false` (values live only in the dashboard). A wrong/old value ⇒ empty dashboard + failed downloads.

---

## 3. File map (open ONLY what you change)
```
src/server.ts        Express + all routes. /api/generate (bg job)·/api/job/:id·/api/learn (SSE)·
                     /api/artifact/:id (RE-RENDERS from blueprint)·/…/full (download, time-boxed)·
                     /api/module + /api/check (PUBLIC, no auth — artifact iframe calls them)·
                     /api/ask + /ask/expand·/api/upload(+ -repo)·/api/library + /lesson/:slug·
                     /api/lessons /preferences /profile /suggest /rate·/healthz.
src/agent/           THE GENERATION PIPELINE (LangGraph):
  state.ts           GraphState channels (inputs: cards, levels, lessonTypes, framework,
                     industry, buildGoal, readingMode, userProfile, userId/Email).
  llm.ts             makeLLM(tier,temp,opts) → opus/sonnet/haiku. Drops topP always; drops
                     temperature for the OPUS tier (Opus 4.8 400s on it).
  calibration.ts     LEVEL specs (scaffolding) + DENSITY specs (countable prose) + densityBuys()
                     (the level×density COUPLING) → calibrationDirective() injected into prompts.
  prompts.ts         PROFILER_SYSTEM · SKELETON_SYSTEM · MODULE_SYSTEM + architectUserPrompt() /
                     moduleUserPrompt() builders. (ARCHITECT_SYSTEM is dead/legacy — ignore.)
  nodes.ts           profiler · retriever · architect (skeleton: RAW parse via extractJsonObject
                     + coerceSkeleton, NOT withStructuredOutput) · seedFirstModule · composer ·
                     runDeepDive (writes ONE module's blocks + density repair + quiz gate).
  graph.ts           START→profiler→retriever→architect⟲(repair once)→seedFirstModule→composer→END.
  orchestrator.ts    runJob (DETACHED bg): plan course (1–5 lessons) → per lesson:
                     retriever→architect→register artifact EARLY→build modules one by one.
  density.ts         measureModule + repairDensity (per-tier sentence ceilings; RULE 2).
src/render/          BLUEPRINT → HTML (deterministic; the model never writes HTML/JS):
  schema.ts          Blueprint Zod + block kinds + validateBlueprint (7 gates) + repairBlueprint.
  tokens.ts          ARTIFACT_CSS — design tokens, 27-combo gates, OVERVIEW no-scroll grid,
                     HORIZONTAL-mode CSS, modal.
  components.ts      renderBody (vertical) + renderBodyHorizontal + mentalMap() + moduleInner()
                     + every block renderer. THIS is the overview/layout file.
  runtime.ts         RUNTIME_JS — nav, (i) popovers, quiz grading, viz hydration, bg module
                     queue, horizontal pager + modal.
  index.ts           renderArtifact(bp) → one self-contained HTML string (body data-level/depth/
                     examples/reading attrs).
src/lib/             db.ts · artifacts.ts (durable store + JSONB coercion) · lessons.ts (dashboard/
                     prefs/courses) · uploads.ts (in-mem upload store, Array.isArray-guarded) ·
                     jobs.ts · auth.ts · hash.ts · langfuse.ts.
src/rag/             embed · loaders · chunkers · store · retrieve · ingest (KB in Supabase `chunks`).
public/              index.html (tabs Configurator/Trainer/My Lessons/Library) · app.js · styles.css.
supabase/migrations/ schema. scripts/ migrate · seed-library · test-structure · test-horizontal · …
```

---

## 4. How it's configured (the decisions that matter)
- **Models (cost-controlled hybrid):** skeleton/structure = **`claude-opus-4-8`** (set in `nodes.ts` `skeletonLLM`); modules/profiler/density/glossary = Sonnet/Haiku. ~10–15% cost lift. **No proofreader** (latency). Model IDs come from `llm.ts` (env-overridable `ANTHROPIC_MODEL_*`).
- **Skeleton parsing:** Opus 4.8 + langchain `withStructuredOutput` truncates/double-encodes large Blueprints → the skeleton is generated **RAW** and parsed by `extractJsonObject` + `coerceSkeleton` (strip nulls; arrays→records for glossary/citations; recap str→rich-text; buildOrder/checklist str→objects; fill omitted arrays; inject resolved profile) → `BlueprintSchema.safeParse` → existing repair-retry on off-shape. Modules keep Sonnet `withStructuredOutput` (fine).
- **Generation flow:** UI → `/api/generate` → `runJob` (background). Skeleton-first artifact is **openable early**; module bodies build lazily (`/api/module`, cached in `module_cache`). Broad asks become a **course** (planner in `orchestrator.ts`). `/api/learn` is a legacy SSE path (not the live one).
- **Level×density coupling:** `calibration.ts` `densityBuys()` — what "more/less text" BUYS per cell (High+Advanced→substance/edge-cases NOT re-explanation; High+Beginner→scaffolding; Low+Advanced→terse; Low+Beginner→cut scope keep scaffolding).
- **Profiler gap-fill precedence:** selection > request-implied > profile-inferred > cautious default. Subject is the ASK; role/industry only flavor EXAMPLES (never reframe). Level inferred from build goal + topic complexity (not default "intermediate").
- **Quiz gate:** `selfCheckQuiz` + `knowledgeCheck` ONLY when lessonType includes `knowledge_check` (enforced in `runDeepDive` + prompts). In-flow retrieval (predict-then-reveal, recall hooks) is NOT gated.
- **Reading mode:** `learnerProfile.readingMode` `vertical` (default) | `horizontal` (paged deck, modal-on-expand, final knowledge-check page). Horizontal implies knowledge_check. `data-reading` attr drives CSS/runtime.
- **Overview:** compact no-scroll left-to-right card grid (`#overview` in `tokens.ts`; `mentalMap()` in `components.ts`). Detail (what/why/analogy) lives in the module head, not on the map.
- **Existing lessons pick up renderer fixes:** `/api/artifact/:id` RE-RENDERS from the stored Blueprint (fallback to stored html).

---

## 5. Gotchas (load-bearing — don't re-discover)
- Port **5070**; `NODE_EXTRA_CA_CERTS` on every external call; `tsx` (no build).
- **Render `DATABASE_URL`**: new project + `%40` password. `db:false` ⇒ env.
- **Opus 4.8**: `withStructuredOutput` unreliable for big JSON → skeleton uses RAW parse (above). Opus 400s on `temperature` (dropped in `llm.ts`). Non-streaming max_tokens ceiling ≈16k; streaming needed above that.
- **JSONB from DB** can arrive odd: `artifacts.ts` coerces `upload_ids`→array + parses blueprint/cards/profile; `uploads.ts` helpers `Array.isArray`-guard (old rows stored `upload_ids:{}` and crashed `ids.some`).
- `/api/module` + `/api/check` are **public** (the artifact iframe has no auth token); the lesson-creating routes stay gated.
- `pdf-parse` import = `"pdf-parse/lib/pdf-parse.js"`; pg `date`→string; `decisionMatrix.cells` = ARRAY; onnxruntime `mutex` warning on exit is harmless.
- Artifact CSS is **baked per-lesson at render** → renderer/CSS changes only affect re-rendered lessons (and `/api/artifact/:id` re-renders, so most do).

---

## 6. Verify before pushing
```
npx tsc --noEmit                         # must be clean
npx tsx scripts/test-structure.ts        # skeleton + classification (USES CREDITS)
npx tsx scripts/test-horizontal.ts       # renders vertical+horizontal fixtures (NO credits)
```
Then restart :5070 and `curl localhost:5070/healthz` (expect `db:true`). Push to `main` after a coherent chunk (user tests on Render). Generation is deterministic code + model calls — never hand-edit lesson content with the LLM.

---

## 7. Open / next
- **Lesson CONTENT + overview quality** is the active workstream (see the pickup prompt the user holds): overview must be a true concept/process map (not a TOC), with uniform numbered square blocks; content must answer the 7 learner questions; scenarios (specific topic vs portfolio vs how-to vs build-an-app) must be shaped differently.
- DESIGN_SPEC.md not updated for recent phases (this HANDOFF is canonical).
- Obsolete branch `hybrid-opus-skeleton-and-proofreader` (broken Opus structured-output path + proofreader) — superseded by `main`; safe to delete.

---

## 8. What shipped (compressed history)
Durable DB-backed artifacts · per-user dashboard + ratings + preferences · Supabase auth (on-demand
modal) · sign-up profile (gap-fill, never overrides subject) · landing dropdowns (level/coverage/
examples/density/extras/lessonType/framework[code-only]/reading) · document + GitHub-repo grounding ·
background jobs + multi-lesson courses · public Library · structure-typed overview · level=scaffolding
+ code-enforced density + level×density coupling · gated knowledge checks · vertical+horizontal reading
modes · Configurator/Trainer/My-Lessons tabs · hardened `/full` download · Ask-More (crisp answer +
append-a-module) · Opus-4.8 skeleton (raw parse) · pedagogy upgrade (one spine, spaced recall,
worked→completion→solo, failure modes, verify-AI-output, contextualize via inputs).
