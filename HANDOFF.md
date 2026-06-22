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
- **Staging lane:** see **`STAGING.md`**. `main`→prod Render→prod Supabase (`kdgtlbnlyscdldogxorb`); `staging` branch→staging Render service→a SEPARATE staging Supabase project. ONE local repo (switch branches); local `.env` must point at **staging**, never prod. Migrations run per-DB (staging first, then prod inline). CORS needs no change (staging is same-origin; `EXTRA_ORIGINS` for cross-origin).
- **WORKFLOW FOR CLAUDE (default):** do work on **`staging`** (or local→`staging`), push to `staging`, and let the USER verify on the staging site. **Merge `staging`→`main` ONLY after the user explicitly confirms.** Never push features straight to `main` — `main` is live (prathibhax.com, auto-deploys). Verify (`tsc`, local run) before pushing to `staging`.
- **Staging KB:** the RAG `chunks` are reference data, so a fresh staging DB has an empty knowledge base (generations still work, just ungrounded). Populate it once with `SRC_DATABASE_URL="<prod URI>" node scripts/copy-kb.mjs` (copies documents/chunks/glossary/kb_updates prod→staging, idempotent) or re-ingest from source (`npm run ingest`).

---

## 3. File map (open ONLY what you change)
```
src/server.ts        Express + all routes. /api/overview (bg, free skeleton draft) +
                     /api/build (bg, promote draft→lesson + build bodies)·/api/job/:id·/api/learn (SSE)·
                     /api/artifact/:id (RE-RENDERS from blueprint)·/…/full (download, time-boxed)·
                     /api/module + /api/check (PUBLIC, no auth — artifact iframe calls them)·
                     /api/ask + /ask/expand·/api/upload(+ -repo)·/api/library + /lesson/:slug
                     (RE-RENDERS from stored blueprint, falls back to stored html)·
                     /api/community (list) + /community/lesson/:slug (public, re-renders) +
                     /community/like (public, +1) + /community/share (auth: snapshot + discount; contributor flag = no discount)·
                     /api/contributor/me + /contributor/register (auth) + /community/drivers + /community/driver/:id (public)·
                     /api/progress (auth: host relays iframe progress)·
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
  orchestrator.ts    TWO-STAGE HITL gate (DETACHED bg): runOverviewJob (profile→retrieve→
                     architect→register skeleton as DRAFT kind "overview-draft", preview-only,
                     NO bodies) · runBuildJob (promote draft→"learning-artifact" + build all
                     module bodies). Auto course-splitting retired from the live flow.
  density.ts         measureModule + repairDensity (per-tier sentence ceilings; RULE 2).
src/render/          BLUEPRINT → HTML (deterministic; the model never writes HTML/JS):
  schema.ts          Blueprint Zod + block kinds + validateBlueprint (7 gates) + repairBlueprint.
                     `diagram` block = discriminated `template` (9: neuralNetwork/pipeline/agentLoop/
                     graph/sequence/layeredArchitecture/tree/matrix/barProportion) + a flexible
                     all-optional `data` bag (DiagramDataSchema). Model supplies DATA ONLY — never SVG.
  diagrams.ts        PREBUILT diagram component library (NEW, 9 templates). One pure fn per template → a
                     self-contained INLINE SVG string (theme-aware via CSS vars, <title>/<desc>,
                     every label escaped, $0/offline, no JS). renderDiagram(template,data,idSeed)
                     dispatches; bad/empty payload → safe empty-state, never throws.
  tokens.ts          ARTIFACT_CSS — design tokens, 27-combo gates, OVERVIEW no-scroll grid,
                     HORIZONTAL-mode CSS, modal, `.diagram` container (+ `.hmodal .diagram`).
  components.ts      renderBody (vertical) + renderBodyHorizontal + mentalMap() + moduleInner()
                     + every block renderer (diagramBlock() wraps renderDiagram in a <figure>).
                     THIS is the overview/layout file.
  runtime.ts         RUNTIME_JS — nav, (i) popovers, quiz grading, viz hydration, bg module
                     queue, horizontal pager + modal.
  index.ts           renderArtifact(bp) → one self-contained HTML string (body data-level/depth/
                     examples/reading attrs).
src/lib/             db.ts · artifacts.ts (durable store + JSONB coercion) · lessons.ts (dashboard/
                     prefs/courses + saveProgress + %-completed in listLessons) · community.ts
                     (share→snapshot+discount, list, like, serve + contributors: register/get/
                     listDrivers/getDriver) ·
                     uploads.ts (in-mem upload store, Array.isArray-guarded) ·
                     jobs.ts · auth.ts · hash.ts · langfuse.ts.
src/rag/             embed · loaders · chunkers · store · retrieve · ingest (KB in Supabase `chunks`).
public/              index.html (tabs Configurator/Trainer/My Lessons/Library) · app.js (Library cards
                     = image-free CSS "course tiles": renderLibrary() builds the markup, CATEGORY_STYLE
                     map {bg,icon,text,svg} drives per-category color + inline-SVG icon) · styles.css (.lib-*).
supabase/migrations/ schema (0005 = prebuilt_lessons.content_version/rebuilt_at). scripts/ migrate ·
                     seed-library (deterministic, from prebuilt/*.json) · rebuild-library (RE-GENERATES
                     prebuilt lessons through the LIVE pipeline; filter-gated) · test-structure · test-horizontal · …
```

---

## 4. How it's configured (the decisions that matter)
- **Models (cost-controlled hybrid):** skeleton/structure = **`claude-opus-4-8`** (set in `nodes.ts` `skeletonLLM`); modules/profiler/density/glossary = Sonnet/Haiku. ~10–15% cost lift. **No proofreader** (latency). Model IDs come from `llm.ts` (env-overridable `ANTHROPIC_MODEL_*`).
- **Skeleton parsing:** Opus 4.8 + langchain `withStructuredOutput` truncates/double-encodes large Blueprints → the skeleton is generated **RAW** and parsed by `extractJsonObject` + `coerceSkeleton` (strip nulls; arrays→records for glossary/citations; recap str→rich-text; buildOrder/checklist str→objects; fill omitted arrays; inject resolved profile) → `BlueprintSchema.safeParse` → existing repair-retry on off-shape. Modules keep Sonnet `withStructuredOutput` (fine).
- **Generation flow (human-in-the-loop overview gate):** UI "Generate Overview — Free" → `/api/overview` → `runOverviewJob` builds ONLY the skeleton, registered as a preview-only **draft** (kind `overview-draft`, hidden from My Lessons, renders overview-only — nothing builds, clicking a node shows a "generate the lesson" note). Trainer shows the overview + two CTAs: **Generate Lesson** (`/api/build` → `runBuildJob` promotes the draft to `learning-artifact` and writes all module bodies → user sent to My Lessons, opens as it builds) and **Edit overview** (modal for feedback → re-runs `/api/overview` with the feedback appended → new draft). Module bodies still build lazily via `/api/module` (cached in `module_cache`). `/api/learn` is a legacy SSE path (not the live one). Auto course-splitting was retired from this flow (single overview); existing course artifacts still render.
- **Level×density coupling:** `calibration.ts` `densityBuys()` — what "more/less text" BUYS per cell (High+Advanced→substance/edge-cases NOT re-explanation; High+Beginner→scaffolding; Low+Advanced→terse; Low+Beginner→cut scope keep scaffolding).
- **Profiler gap-fill precedence:** selection > request-implied > profile-inferred > cautious default. Subject is the ASK; role/industry only flavor EXAMPLES (never reframe). Level inferred from build goal + topic complexity (not default "intermediate").
- **Quiz gate:** `selfCheckQuiz` + `knowledgeCheck` ONLY when lessonType includes `knowledge_check` (enforced in `runDeepDive` + prompts). In-flow retrieval (predict-then-reveal, recall hooks) is NOT gated.
- **Reading mode:** `learnerProfile.readingMode` `vertical` (default) | `horizontal` (paged deck, modal-on-expand, final knowledge-check page). Horizontal implies knowledge_check. `data-reading` attr drives CSS/runtime.
- **Overview:** a no-scroll concept/process map of uniform SQUARE blocks (`#overview` + `.map*` in `tokens.ts`; `mentalMap()` in `components.ts`) — corner number/icon badge on the top-left corner; ordered = single arrow-connected row, conceptual/comparative = wrapping square rows. Card = headline + 10–15-word `orient` description only; detail (what/why/analogy) lives in the module head, not on the map.
- **Existing lessons pick up renderer fixes:** both `/api/artifact/:id` (user lessons) AND `/api/lesson/:slug` (library) RE-RENDER from the stored Blueprint (fallback to stored html), so renderer/overview changes reach saved + prebuilt lessons without re-generating.
- **Prebuilt library = real generated lessons:** the library is RE-GENERATED through the SAME live pipeline as fresh lessons (`scripts/rebuild-library.ts`), not authored by hand — so it carries the concept-map overview, 7-question coverage, scenario shaping, and pedagogy. Every module is FULLY built (no stubs — the library has no background build queue). `prebuilt_lessons.content_version` + `rebuilt_at` make rebuilds resumable.
- **Prebuilt diagrams (data-as-CODE, $0):** the `diagram` block extends the viz-block pattern (model emits DATA ONLY, renderer owns every SVG tag) but as STATIC inline SVG — no hydration, so it shows identically in vertical, horizontal, and the horizontal modal. The model picks a `template` by SHAPE when a beginner can't picture an idea from code/prose; archetype→template map lives in `MODULE_SYSTEM` "INTERACTIVE VISUALS & DIAGRAMS" + the `moduleUserPrompt` VISUALS line (agent loop→agentLoop · pipeline/chain→pipeline · state/multi-agent topology→graph · trace/request path→sequence · stack→layeredArchitecture · net→neuralNetwork). Gated on `visualsRequested`, ≤1 visual per module. For `graph` the model gives coarse col/row grid coords; the renderer places + routes (no auto-layout). Fixture: `scripts/test-diagrams.ts` (NO credits) → renders all six in both modes to `/tmp/als-diagrams-*.html`.

---

## 5. Gotchas (load-bearing — don't re-discover)
- Port **5070**; `NODE_EXTRA_CA_CERTS` on every external call; `tsx` (no build).
- **Render `DATABASE_URL`**: new project + `%40` password. `db:false` ⇒ env.
- **Opus 4.8**: `withStructuredOutput` unreliable for big JSON → skeleton uses RAW parse (above). Opus 400s on `temperature` (dropped in `llm.ts`). Non-streaming max_tokens ceiling ≈16k; streaming needed above that.
- **JSONB from DB** can arrive odd: `artifacts.ts` coerces `upload_ids`→array + parses blueprint/cards/profile; `uploads.ts` helpers `Array.isArray`-guard (old rows stored `upload_ids:{}` and crashed `ids.some`).
- **Public routes (no `requireAuth`):** `/api/module` + `/api/check` (artifact iframe has no token) AND `/api/upload` + `/api/upload-repo` (the Configurator is open — learners attach files/repos BEFORE signing in; uploads are session-scoped in-mem, random docIds, not user data). The lesson-CREATING routes (`/api/generate`, `/api/learn`, `/api/ask`, `/api/ask/expand`, dashboard/prefs) stay gated — that's the real wall. Repo-clone abuse bounds (≤400 files / ≤4MB / 90s, public https github/gitlab/bitbucket) unchanged.
- **Overview drafts vs lessons (the gate) keyed off `kind`:** an un-approved overview is stored with `kind = "overview-draft"`; `listLessons` filters `kind = 'learning-artifact'` so drafts never show in My Lessons. `runBuildJob` promotes the kind on approval (`updateArtifact` persists `kind` now). `/api/artifact/:id` renders `previewOnly` when `kind === overview-draft` (empty bg queue + click-to-build disabled in `runtime.ts` via the `PREVIEW` flag). No DB migration — reuses the existing `kind` column.
- **`/api/ask` is a FAST path — NO RAG.** It answers from the model's own knowledge grounded in the lesson's in-memory structure (topic/thesis/module titles); the KB embed+search was the latency. The heavier `/api/ask/expand` ("add details in lesson") still does full grounding via `runDeepDive`.
- `pdf-parse` import = `"pdf-parse/lib/pdf-parse.js"`; pg `date`→string; `decisionMatrix.cells` = ARRAY; onnxruntime `mutex` warning on exit is harmless.
- Artifact CSS is **baked per-lesson at render** → renderer/CSS changes only affect re-rendered lessons (and `/api/artifact/:id` re-renders, so most do).
- **Prod hardening (Jun 2026):** RLS on all 13 tables (migration `0008`; server bypasses via `postgres`/`rolbypassrls`). `server.ts` has `trust proxy` + `helmet` (CSP OFF — lessons inline JS) + `cors` allowlist (`prathibhax.com`/`www`/onrender/localhost + `EXTRA_ORIGINS`) + `express-rate-limit` (600/15min on `/api`, 40/hr on overview/build/upload). Global gen cap `MAX_CONCURRENT_GENERATIONS` (default 4) in `jobs.ts` (acquire in the route, release in the job `finally`). `llm.ts` sets `maxRetries:4` (429/529 backoff).
- **Hardening round 2 (Jun 2026, migration `0009`):** lesson **iframe sandboxed** (`viewer-frame`, runtime verified working); **input caps** (overview prompt ≤5000, upload ≤~10MB→413); **community moderation** — `/api/community/report` + `reported`/`hidden` columns, auto-hide at ≥3 reports, all listings filter `hidden=false`, report button on tiles; **discount anti-farm** — one unredeemed `community_share` code per user; **retry UI** — `showGenError` "Try again" on a failed overview/build; **retention** — lesson expiry 30d→1yr (`expires_at` default; "Saved" badge unless ≤30d left).
- **Live host (Jun 2026):** deployed at **https://prathibhax.com** (+ www) on Render — GoDaddy DNS resolved (apex A → 216.24.57.1, www CNAME → onrender; GoDaddy Forwarding removed) and the Render instance upgraded to **Standard (2 GB)**. CORS allowlist already includes the domain.
- **Langfuse only traces the LEGACY path:** `makeLangfuseHandler()` is wired ONLY into `/api/learn` (the unused SSE route). The LIVE path (`runOverviewJob`/`runBuildJob` in `orchestrator.ts`) passes `{}` to profiler/retriever/architect/runDeepDive, so **adding LANGFUSE_* keys alone does NOT trace real lessons**. Fix = create a handler per job in `orchestrator.ts`, pass `{ callbacks:[handler], runName, metadata }` to those node calls (they already forward `config` to the model), and `flushAsync()` in the `finally`. (NEXT item.)
- **NEXT (deferred by decision):** (1) **billing + per-user credit metering** — gate `/api/overview`+`/api/build` on a paid/granted balance (Paddle); the #1 money risk still open. (2) **account basics** — email-verified gating in code, password reset, account deletion/export. (3) **Langfuse live-path wiring** (above). (4) smaller: tight CSP w/ nonces, per-user (not just per-IP) rate limits, langchain dep upgrade (12 transitive vulns, breaking), admin unpublish UI. USER-side still: **Anthropic spend cap**. (DONE by user: Supabase Pro, confirm-email ON, prod env correct, Render Standard 2GB, domain live.)

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
- **Prebuilt diagram component library (⚠️ INCOMPLETE — IN PROGRESS, NOT COMMITTED, branch `feature/diagram-component-library`):**
  - DONE so far: `src/render/diagrams.ts` (**9 templates**: neuralNetwork · pipeline · agentLoop · graph · sequence · layeredArchitecture · **tree** (hierarchy, tidy top-down layout) · **matrix** (labelled grid/heatmap, intensity-coloured) · **barProportion** (stacked proportion bar + legend) — all data-only → static inline SVG, theme-aware, escaped, `fitText` auto-wrap+auto-shrink that prefers shrinking over mid-word breaks so labels never spill); `diagram` block in schema.ts (discriminated `template` + flexible all-optional `data`, incl. recursive `tree`, `matrix{rows,cols,cells}`, `segments[]`); wired into components.ts (`diagramBlock`) + tokens.ts (`.diagram`, `.hmodal .diagram`); prompts.ts archetype→template mapping (MODULE_SYSTEM "INTERACTIVE VISUALS & DIAGRAMS" + moduleUserPrompt) covers all 9. Verified: tsc clean, fixtures 6/6 both modes, **0 overflows across 22 stress cases** (geometry-checked live), XSS-safe, dark OK. Review gallery: `scripts/diagram-gallery.ts` → `diagram-gallery.html` (throwaway, not committed).
  - **STILL TODO before commit/push:** (1) ONE real lesson generation with Visuals ON to confirm the model actually emits the right template on-topic (USES CREDITS — user runs it); (2) optional minor GAPs still open (see below) — decide if worth it; (3) Mermaid/Kroki fallback (deliverable 5, deferred). Do NOT push until the user approves the gallery + the live generation.
  - **CONCEPT → DIAGRAM COVERAGE (grounded in the live RAG KB — 39 docs, queried Jun 2026).** What the curriculum keeps needing a picture for, mapped to a template (✓ covered) or a GAP (no clean template yet):
    - *Foundations / how LLMs work:* neural-net structure → **neuralNetwork** ✓ · transformer block stack (N× layers) → **layeredArchitecture** ✓ · tokenization (text→tokens→ids) → **pipeline** ✓ · embedding/semantic space → **interactiveScatter** ✓ · training loop (forward→loss→backward→update) → **agentLoop** ✓ · self-attention weights (token×token), confusion matrix → **matrix** ✓ · **backprop forward+backward pass → GAP (annotated bidirectional flow; pipeline + reverse edge is a stopgap)**.
    - *Generative / multimodal:* diffusion denoise steps → **pipeline** ✓ · GAN gen/discriminator, VAE enc→latent→dec → **graph/pipeline** ✓ · multimodal fusion (image+text encoders→fuse) → **graph** ✓.
    - *RAG & retrieval (reference area):* index pipeline (ingest→chunk→embed→store) + query pipeline (retrieve→augment→generate) → **pipeline** ✓ · ANN/vector search nearest-neighbours → **interactiveScatter** ✓ · Graph-RAG entity graph → **graph** ✓ · hybrid search (BM25+vector→fuse), rerank stage → **pipeline/graph** ✓ · **chunking strategies (document split) → GAP (minor)**.
    - *Agentic:* ReAct loop (thought→act→observe), tool-calling loop, browser/computer-use loop → **agentLoop** ✓ · multi-agent topology (supervisor/worker, hierarchical, network), LangGraph state graph w/ conditional edges → **graph** ✓ · MCP architecture (host↔client↔server↔tools) → **graph/layeredArchitecture** ✓ · MCP/tool request lifecycle, human-in-the-loop approval → **sequence** ✓ · durable workflow (steps/retries/checkpoints) → **graph** ✓ · agent memory read/write (working vs long-term) → **graph/sequence** ✓ · task decomposition / planning tree → **tree** ✓.
    - *Training / fine-tuning:* LoRA (frozen base + low-rank A×B adapters) → **layeredArchitecture** ✓ · fine-tune pipeline (pretrain→SFT→RLHF/DPO) → **pipeline** ✓ · RLHF loop (policy→reward model→PPO) → **agentLoop/graph** ✓.
    - *Prompting:* prompt-chaining / chain-of-thought → **pipeline** ✓ · structured output / function calling → **sequence** ✓ · context-window layout (system/user/context stacked) → **layeredArchitecture** ✓ · context-window/token budget allocation → **barProportion** ✓.
    - *Eval & observability:* eval pipeline (dataset→run→score→report), regression flow → **pipeline** ✓ · LLM-as-judge → **graph/sequence** ✓ · Langfuse request trace (ordered spans) → **sequence** ✓ · nested span/trace TREE (span hierarchy) → **tree** ✓.
    - *Infra / serving:* serving stack (gateway→router→model replicas), deployment topology → **layeredArchitecture/graph** ✓ · LLM gateway routing (LiteLLM across providers) → **graph** ✓ · request path through the stack → **sequence** ✓ · **batching/KV-cache timeline → GAP (minor, timeline/queue)**.
    - *Safety / guardrails:* guardrails pipeline (input check→LLM→output check), moderation flow → **pipeline** ✓ · NeMo rails (input/dialog/output) → **graph/pipeline** ✓ · defense-in-depth → **layeredArchitecture** ✓.
  - **GAPS NOW CLOSED (built Jun 2026):** ✅ **`tree`** (hierarchy — task decomposition, trace-span nesting, taxonomy) · ✅ **`matrix`** (labelled grid/heatmap — attention weights, confusion matrix, similarity grid) · ✅ **`barProportion`** (stacked proportion bar — context/token budget, cost split). All three in the gallery with typical/stress/edge cases.
  - **MINOR GAPS still open (optional, low priority):** backprop *bidirectional* forward+backward flow (pipeline + a reverse edge is a stopgap; could add an annotated-flow variant) · a *timeline/queue* visual (batching, KV-cache, request queue). Neither recurs often; skip unless a lesson clearly needs it.
- **Lesson CONTENT + overview quality** (DONE Jun 2026): overview is now a true concept/process map of **uniform SQUARE blocks** (`mentalMap()` in components.ts; `.map`/`.map-path`/`.map-conn` + `#overview` no-scroll in tokens.ts) — corner badge (number for ordered, icon for conceptual/comparative) with its centre ON the top-left corner; ordered maps = ONE non-wrapping row of equal squares joined by **animated arrows** (`.map-conn` spark, motion-safe); conceptual/comparative = wrapping rows of squares. Card = headline (label, 4–6 words) + description (`orient`, 10–15 words) only; deeper detail opens in the module. No-scroll holds (squares flex/clamp to fit); both reading modes + click-to-deepdive verified.
  - PROMPTS: SKELETON_SYSTEM carries the **7-questions arc** (WHAT/WHY/PIECES early → HOW mid → WHEN-IT-BREAKS late → KNOW-IT/WHAT-NEXT in synthesis; #2/#5/#6/#7 are the under-weighted ones to protect) and **scenario shaping** mirrored in PROFILER_SYSTEM (S1 one-thing→understand_mechanism deep-single-subject · S2 portfolio→compare_and_choose · S3 how-to→how_to_build/procedural · S4 build-an-app→how_to_build + buildGoal threaded, capstone=their artifact, weight failure-modes/verify-AI). MODULE_SYSTEM adds the **WHY-IT-EXISTS orientation hook** + pieces-before-steps + forward bridge. `orient` is now a 10–15 word description (was a locator).
  - Verified live: `test-structure.ts` → procedural/comparative/dependency classify right; a full build-an-app generation produced per-module orientation hooks, failure-mode blocks, verify-AI notes, spaced recall + predictThenReveal, and a buildGoal-threaded capstone.
- **Ask speed + upload-401 (DONE Jun 2026):** `/api/ask` no longer does RAG (instant follow-ups; see §5); `/api/upload` + `/api/upload-repo` are now public so signed-out learners can attach files/repos in the open Configurator (`public/app.js` file-input also calls `openAuth("signin")` on a 401, mirroring the repo handler). Verified: signed-out `curl /api/upload` → 200 + docId/chunkCount; browser signed-out attach → "1 chunk" chip with no sign-in error; signed-out Generate still opens the sign-in modal.
  - **ENV (Render) to confirm — code is correct:** a SIGNED-IN user's gated calls still need a valid token, so `SUPABASE_URL` + `SUPABASE_ANON_KEY` on Render must be the NEW project (`kdgtlbnlyscdldogxorb`). A wrong/old value makes `verifyToken` reject the front-end token → 401 on every gated route (same env-mismatch family as the `DATABASE_URL` `%40` issue).
- **Human-in-the-loop overview gate (DONE Jun 2026):** the Configurator CTA is now "Generate Overview — Free" → builds only the overview (free, preview-only draft) and lands on Trainer with progress → on ready, shows **Generate Lesson** + **Edit overview** CTAs. Generate Lesson promotes the draft and builds all bodies, sending the user to My Lessons (the prior build flow). Edit overview reopens the Configurator feedback as a modal and regenerates the overview. See §3/§4/§5. **Decision (note for the user):** the gate operates on a SINGLE lesson — auto course-splitting was retired from the live generate flow (gating a multi-lesson course behind one overview was awkward + costly); existing course artifacts still render/open. Verified: tsc clean; runOverviewJob→draft(overview-draft, preview-only, stubs)→runBuildJob→promoted(learning-artifact, 5/5 built); /api/overview + /api/build gated (401); UI CTAs/modal wired, no console errors.
- **Library rebuilt through the live pipeline (IN PROGRESS Jun 2026):** `scripts/rebuild-library.ts` re-generates each prebuilt lesson with the CURRENT pipeline (profiler→retriever→architect→runDeepDive ALL modules→renderArtifact) and upserts fresh `{blueprint, html}` keyed by slug; inputs reconstructed from the stored row + old blueprint's learnerProfile (level from row, readingMode=vertical); slug/category/level/description/title preserved, est_minutes refreshed. SAFETY: default = DRY RUN; needs `--slug`/`--category`/`--all` (and `--all` needs `--yes`); resumable via `content_version` (skip current unless `--force`); per-lesson failure logs + CONTINUES leaving old html intact. `/api/lesson/:slug` now re-renders from the stored blueprint (migration 0005 adds content_version/rebuilt_at; `blueprint` col already existed). Run with `NODE_EXTRA_CA_CERTS=…`. **Verified:** tsc clean; migration applied; rebuilt `vector-databases-compared` (comparative, 5/5, eyeballed concept-map overview + 7-question coverage), `the-agent-loop` (procedural, 6/6); a transient module-parse failure on `build-document-qa-bot` correctly left the old html intact. **NEXT (user's cost call):** run `--category "<X>"` per category, then `--all --yes` (~100 lessons; bump `CONTENT_VERSION` if the pipeline changes again).
- **Library "course tile" cards (Jun 2026):** the Library thumbnails are image-free, CSS-only tiles (front-end only — no images/DB). Each card = a flat CATEGORY-COLORED cover (`aspect-ratio:3/4`, one swappable CSS line) with a faint inline-SVG icon watermarked top-right, the title (bold) + a 2-line clamped `description` on the cover, then a compact meta row (category pill · level · est min). Per-category palette + icon live in `CATEGORY_STYLE` (app.js) — `{bg, icon, text, svg}` for all 10 categories + a DEFAULT; covers are fixed-light tiles (dark title `--cov-text`, description blends `text↔bg`) so they read in light AND dark host. `.lib-grid` = `repeat(auto-fill, minmax(220px,1fr))`. Filter chips + search unchanged. No icon-font dependency.
- **Community Courses + sharing + progress (Jun 2026):** new **Community** tab (browse-anywhere, like the Library) — learner-shared lessons as course-tiles (reuse `CATEGORY_STYLE`) with "by &lt;name&gt;" + a like button; a **Featured = top-10-by-likes** row + free-text search. Likes are anonymous, deduped per-browser via `localStorage("als-liked")`. **My Lessons** is now one ROW per course (title · %-completed bar · Open/Download/**Community Share — 30% off**). **Sharing** (`/api/community/share`, auth): snapshots the owner's lesson into `community_lessons` (lessons expire in 30d, shares must NOT — so we COPY blueprint+html; category derived by keyword; submitter name asked in the share popup), mints a 30%-off code into `discount_codes` (functionality only — checkout redemption is a billing TODO in checklist.MD §1), shows it in a popup. **Progress is server-persisted**: the artifact iframe (unauthenticated) `postMessage`s progress to the host (`src/render/runtime.ts` setProgress), the host relays it to `POST /api/progress` (authed) → `lesson_progress` table → `% completed` in My Lessons. After **2 modules** of an OWNED lesson, the Trainer fires the share-&-save popup once (guarded by `currentLessonOwned` + `localStorage("als-shared")`). Migration **0006** = `community_lessons` + `discount_codes` + `lesson_progress`. DB-layer in `src/lib/community.ts`; tab/rows/popups in `public/app.js` + `index.html` + `styles.css`.
- **Build for Community + Community Drivers + About + smaller tabs (Jun 2026):** main nav tabs shrunk (smaller font/padding, wrap). New **About** tab (static `#tab-about` — mission/how-it-works/principles). The **Community** tab now has two sub-views (`.comm-subtab`): **Community Courses** (existing grid) + **Community Drivers** (contributor directory → click a card → in-place profile with bio/expertise/link + their published courses). New **Build for Community** tab: one-time contributor **registration** (full name · background/expertise → bio · areas they teach · why-contribute radios + other · optional profile link · originality/AI-disclosure checkbox → `contributors` table, migration **0007**), then a trimmed Configurator (title · level · description · **required** content upload · optional builder prompt) that **reuses the overview→build gate** with `referOnly:true` + empty cards; on build completion the front-end **auto-publishes** to Community crediting the contributor (`/api/community/share {contributor:true}` → no discount). Gate states in `loadBuildCommunity()` (signed-out / register / build) via `/api/contributor/me`. Drivers/profile = `/api/community/drivers` + `/community/driver/:id` (public). NOTE: contributor courses auto-publish with **no moderation** yet (report/review = TODO, see CHECKLIST). All UI eyeballed locally; auth-gated flows verified by gating + wiring (full signed-in run happens on Render). **Migration 0007 must run on prod.**
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
