# HANDOFF — Agentic Learning Studio

**This doc is a MAP, not the code. Do NOT read the whole repo to get oriented.** Use the file
map below to jump straight to the one or two files a change touches, and open only those. Each
file has a one-line responsibility — that tells you where to go. Companion memory:
`~/.claude/projects/-Users-anandpareek-Documents/memory/agentic-learning-studio-project.md`.
(`DESIGN_SPEC.md` is older deep detail — optional; this HANDOFF is the source of truth.)

## ✅ DEPLOY STATUS (2026-06-24) — `staging` AND `main`/prod are IN SYNC, full feature set
> **2026-06-26 UPDATE — NOW ON STAGING AND PROD (in sync again):** promoted to prod (`origin/main` = `83c98a5`, app content
> byte-identical to `origin/staging`): (a) the lesson-toolbar title-removal fix, (b) **"Get Hands on" browser-run Python
> notebooks** (Phase 1 + v2), and (c) two **trainer fixes** — don't reveal a building lesson until module 1 is ready, and
> force-fresh lesson switch during a build. Migration `0015` (`hands_on_notebooks`) applied to **BOTH** the staging AND prod
> Supabase projects. Live-verified: `/hands-on` 200 + the `Beta` button present on both onrender hosts. Owner is still
> reviewing Hands-On on local and may request changes.
> **2026-06-27 UPDATE — S5 + S6 + grounding-log ON STAGING + PROD (`main e134aeb`, no DB migration):** ONE end-of-lesson knowledge
> check (`bp.finalCheck`; `_check` pane/page BEFORE Sources), dynamic module count (profiler `scope` → 5/6/8), and `[retrieve]`
> grounded/ungrounded telemetry. **Batch B (GPT failover) — now ON STAGING + working (see the BATCH B note below).** Full detail: §7.
> **2026-06-27 — BATCH-1 (27-Jun doc) ON STAGING (`origin/staging edbabd7`), NOT yet prod:** signup grant 1→2; fractional credits
> (lesson=1, skill=0.5) via migration **0019** (`credit_lots`/`credit_ledger` int→numeric) + `spend(userId, amount)` multi-lot FIFO
> draw + a skill 402 gate/charge-on-success; out-of-credits **buy-a-plan popup**; **"while you wait"** 4 relevant free-library cards
> during overview generation; **Free** pill on Community; a built skill shows in **My Skills** immediately; **library KC nav fix**
> (`showsFinalCheckPane` — no empty `_check` on old per-module-KC lessons). Migration 0019 applied to the STAGING DB. Verified:
> fractional spend 8/8 vs staging DB; Playwright on staging (Community pill, buy popup, gen-suggest off the 100-lesson library, 5 KC
> library lessons with no empty nav). PENDING: full build/skill charge re-QA (staging Anthropic cap → 07-01); item 9 (home example
> richness — needs a pointer); 2 separate-session prompts (poor diagrams; add real KCs to library content); prod promote (incl.
> applying 0019 to the PROD DB) on owner confirm.
> **2026-06-27 (later) — BATCH B (GPT FAILOVER) NOW ON STAGING + FIXED (`origin/staging 1f15b34`):** OpenAI key set on the
> staging+prod Render envs (and local `.env`). Confirmed `gpt-5.5` / `gpt-5.4-mini` exist on the account. Fixed the real failover bug —
> OpenAI's strict structured-output rejects `.optional()` Zod fields ("all fields must be required"), so EVERY structured GPT fallback
> failed silently (withFallbacks re-raised the Claude error); fix = force `method:"functionCalling"` (tool-calling) on the GPT branch.
> Validated by FORCING failover (invalid Anthropic key) → a full build ran ENTIRELY on GPT, **5/5**, finalCheck/KC generated on GPT, 0
> errors. ⚠️ gpt-5.5 is a SLOW reasoning model (~10-min build); fine as a failover, but while the staging Anthropic spend cap is active
> (→ 2026-07-01) every staging build runs on GPT and is slow — it reverts to fast Claude when the cap resets. This ALSO fixes the
> "KC not coming on staging" report (the cap was blocking `writeOverviewProse` → no `finalCheck`; failover now generates it).
>
> ### 📌 ON STAGING (`origin/staging 1f15b34`) BUT NOT ON PROD (`main e134aeb`) — as of 2026-06-27:
> 1. **Batch-1 (27-Jun doc):** signup→2 credits; fractional credits lesson=1/skill=0.5 (**migration 0019** — applied to the STAGING DB
>    ONLY, NOT prod); out-of-credits buy-a-plan popup; "while you wait" library popup; Community **Free** pill; skill→My-Skills refresh;
>    library-KC nav fix (`showsFinalCheckPane`).
> 2. **Batch B (GPT failover):** all nodes fall over to GPT-5.5 / GPT-5.4-mini after ~2 quick Claude tries (env-gated on `OPENAI_API_KEY`).
>
> **To promote to PROD:** cherry-pick the staging files into `main`, **apply migration 0019 to the PROD DB** (`DATABASE_URL=$PROD_DATABASE_URL`),
> and confirm `OPENAI_API_KEY` is on the prod Render env (then Batch B is live on prod too). **Latency (local Claude, S5/S6 active):**
> overview ~75s→**71s**, build 108s→**81.5s** (~25% faster — S5 drops per-module KC tokens; 5/5, 0 failover).

## 🐞 KNOWN ISSUES / TO-FIX (QA backlog — 2026-06-27)
Consolidated from the full QA sweep (prod UAT, staging re-QA, mobile, KB coverage, input/upload code-trace, verify-before-promote). Full detail + repros: `~/Documents/wizbit-issues-master.md`; per-area: `wizbit-prod-uat-2026-06-26.md`, `wizbit-staging-reqa-2026-06-26.md`, `wizbit-staging-mobile-qa-2026-06-26.md`, `wizbit-kb-coverage-2026-06-26.md`, `wizbit-input-cycle-codetrace.md`. Key: ✅ fixed-on-staging · 🟡 open · 🔴 high · ⚙️ infra · 📋 data.

**🔴 High**
- **Repo upload crashes the instance** — `/api/upload-repo` (server.ts:1123) clones + embeds *synchronously* in the request; a non-trivial repo 502s and on PROD knocked out the next overview+skill (OOM/restart). Tiny repos work but ~16s. → async background ingest off the request path. (Same root as build/module 502s.)
- **Build/skill OOM on the 512MB Starter** → job_404 (in-memory jobs lost on restart). Worsened by the Anthropic cap → all staging gen on slow GPT-5.5 (~10min) until 2026-07-01. → persist job state; bigger/warm instance.

**🟡 Input cycle — accepted-but-silently-dropped (code-trace)**
- `cards` ignored by `/api/build` (runBuildJob never reads `art.cards` — editing card knobs between overview & build has no effect).
- `lessonTypes[]` ignored by the planner (only architect/overview-prose see it).
- `framework` silently dropped unless `examples`=code.
- Stale `uploadIds` → silent ungrounded build (uploads are **in-memory only**, lost on restart; `referOnly` quietly falls back). → persist uploads or fail loudly.
- P3: `objective:'other'`=no-op; `readingMode` never reaches a prompt (`horizontal` secretly adds a KC); body `userProfile` overridden by saved prefs.

**🟡 Uploads**
- `.csv` rejected (415); `/api/upload` + `/api/upload-repo` have **no requireAuth**; file-picker `accept` lists inconsistent + offer `.markdown` (server 415s) / omit several server-accepted exts; docs-only repo (README, no ext) → 422.

**📋 Library / KC**
- ~half of library lessons render a **perpetual empty KC pane** — lessons with neither per-module KC nor a backfilled `finalCheck` show `class="kc kc-pending"` "…appears once the lesson finishes building…" (components.ts:264; showsFinalCheckPane:280 returns true when `!hasModuleKC`). → run `scripts/backfill-finalcheck.ts` over the library, or suppress the pane for library lessons without a real finalCheck. (Affected in sample: the-agent-loop, human-in-the-loop-agents, tool-use-action-boundaries, model-context-protocol, planning-and-reflection, multi-agent-orchestration, serve-local-llm-ollama.)

**🟡 RAG/KB**
- No retrievable **code** or **business** examples (intents return code=false/biz=false); topic gaps (classic ML, generative media, hardware, governance, bias/fairness); coverage metric inflated (gate on `topSim`). See `wizbit-kb-coverage-2026-06-26.md`.

**🟡 Mobile (staging)**
- Lesson build-path map doesn't reflow; stacked sticky toolbars; toggle bar nested h-scroll; tap targets <44px (13×21 ▾); 9–11px fonts; Builder input placeholder clipping. (Page overflow itself ✅ fixed.)

**⚙️ Infra/routing**
- `prathibhax.com` apex has **no DNS A record** (prod only reachable via onrender origin). `/account` + `/my-lessons` direct URLs fall back to Home.

Solo dev → both environments carry the SAME code (pushed together). Everything below is live + runtime-verified
on local `:5070` (the opus-split worktree). The whole pipeline + UI set on both:
- **Module-cache correctness** — `moduleCacheKey` keys on objective/buildGoal/framework/lessonTypes (no wrong-input bleed).
- **Parallel module build (A1/A4/A2)** — cap-3 (`MAX_MODULE_CONCURRENCY`) parallel bodies, spine-order incremental render,
  relaxed density trigger. ~13.5 min → **~3.5–6 min** (verified: 3 module traces start the same second; 1 density pass, not 5).
- **Deterministic overview repair (A5)** + **529/overload resilience** — shared `withOverloadRetry` (`llm.ts`) on
  profiler/architect/modules; runs ride out a transient overload instead of failing.
- **Opus PLANNER → Sonnet WRITER split** — new `planner` node (Opus, STRUCTURE only, ~3-4k chars/~18s) feeds the `architect`
  node (now SONNET) which WRITES the prose. `runOverviewJob` = profiler→retriever→**planner**→architect. `coerceSkeleton`
  tolerates title-less citations + empty glossary defs. See "Generation latency".
- **Deferred glossary + synthesis** — `writeOverviewProse` (nodes.ts) fills glossary definitions + synthesis DURING the build,
  in parallel with the module bodies (the preview never showed them). Overview ~94s → **~73s**; ~0 added to the build.
- **"This lesson will cover"** — `mentalMap.willCover` (≤4 bullets; renderer `coversList()` falls back to module titles) below
  the overview map, + a FLEXIBLE no-clip overview layout (`#overview` min-height + roomy card clamp 162–204px; scrolls
  gracefully only if content genuinely overflows).
- **5 Trainer/renderer UI fixes** — preview lock cleared after "Generate Lesson"; horizontal-overview parity with vertical;
  scatter label de-collision; tabs → dropdown under "Trainer"; Sources link to the real source URL.
- **Upload gating + 25MB cap** — "Generate Overview" is DISABLED while a file/repo is still uploading server-side (else the
  lesson generated UNGROUNDED); 25MB cap client + server (`express.json` 40mb, `/api/upload` 35M-base64 ≈ 25MB).
- Prior baseline already on both: R0 module-build 529 resilience.

## Generation latency (2026-06-23)
- **529/overload resilience (shared `withOverloadRetry` in `src/agent/llm.ts`):** Anthropic `overloaded_error` (529) was
  failing whole builds — the old 3-attempt/~3s retry burned out during a transient overload (clears in 30-90s) → 0 modules,
  empty lesson. Now: detect overload/rate (529/429/overloaded/rate-limit) and ride it out with long JITTERED backoff
  (2/5/12/25/40s, +0-30%), 6 attempts (~84s). Jitter also de-syncs the parallel builds below. Applied to the **module build**
  (`runDeepDive`, on staging + prod) AND the **overview** profiler + Opus skeleton (`profiler`/`architect`, staging only so far).
  (`runDeepDive` still has its own inline copy of the same loop — could adopt the helper later; constants match, no drift.)
- **Parallel module build (`runBuildJob`, A1+A4):** module bodies build in PARALLEL (cap `MAX_MODULE_CONCURRENCY`, default
  **3**) instead of one-at-a-time, in spine order so Module 1 lands in the first wave; persists serially per-completion so the
  lesson grows monotonically as modules finish. ~13.5 min → ~5-6 min. Safe to share `bp`: each module writes only its own
  slot; `repairBlueprint()` is synchronous (atomic in Node) + skips stubs. Cap kept low so parallel calls don't burst the
  Anthropic rate/overload limit. (Module-body ~145s each is still the per-unit cost — next levers: shrink output / templatize
  framing / Haiku for simple modules.)
- **Relaxed density repair (A2, `runDeepDive`):** the extra "TIGHTEN prose" Sonnet call now fires only when prose is
  meaningfully over the tier (≥3 over-ceiling sentences OR ≥25% over), not on a stray long sentence (which fired ~every
  module). Density is a verbosity knob, not correctness — saves ~7-24s/module.

## Repo cleanup (2026-06-23)
- **Module-cache correctness fix:** `moduleCacheKey` (`src/lib/hash.ts`) + its call site (`src/server.ts`) now include
  `objective`/`buildGoal`/`framework`/`lessonTypes`. Before, two lessons differing only in those inputs collided on the
  module cache and a cache hit served the wrong fragment (silently dropping those inputs). Side effect: existing
  `module_cache` rows get new keys and regenerate once.
- **`Stale/` quarantine (gitignored, local-only):** throwaway/leftover files from past sessions were moved into a top-level
  `Stale/` folder (added to `.gitignore`) instead of being deleted — nothing lost, repo root tidy. Contents: throwaway
  helper scripts (`scripts/_*.ts`), mockup HTML (`public/_*-mockup.html`, `public/_enhanced-sample.html`,
  `public/_lesson.html`), design exploration mockups (`public/design/`), `prebuilt/REENRICH_SPEC.md`, `skipped.log`.
  NOT moved: `kb-build/backups/` (live prod/staging DB backups), `services/project-builder/` (Codex-owned),
  `services/kb-curator/` (curator session). Safe to delete `Stale/` once confirmed unneeded.

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
- **`.env` DB vars:** `DATABASE_URL` = **STAGING** (`ydgiysthvxhlfpzxyrmy`, ap-south-1) — the app + all default tooling use this; never repoint it at prod. `PROD_DATABASE_URL` = **PROD** (`kdgtlbnlyscdldogxorb`, ap-southeast-2) — used ONLY for explicit prod data migrations, by overriding per-command: `PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` then `DATABASE_URL="$PROD_URL" …`.
- **WORKFLOW FOR CLAUDE (default):** do work on **`staging`** (or local→`staging`), push to `staging`, and let the USER verify on the staging site. **Merge `staging`→`main` ONLY after the user explicitly confirms.** Never push features straight to `main` — `main` is live (prathibhax.com, auto-deploys). Verify (`tsc`, local run) before pushing to `staging`.
- **Staging KB:** the RAG `chunks` are reference data, so a fresh staging DB has an empty knowledge base (generations still work, just ungrounded). Populate it once with `SRC_DATABASE_URL="<prod URI>" node scripts/copy-kb.mjs` (copies documents/chunks/glossary/kb_updates prod→staging, idempotent) or re-ingest from source (`npm run ingest`).
- **QA + DataforSEO creds (NOT committed — secrets live in `~/.claude/secrets/als-qa-creds`, chmod 600):** QA test accounts are **staging `pojidov934@divahd.com`** / **prod `grz1q@web-library.net`** (passwords in the secrets file as `QA_STAGING_PASSWORD`/`QA_PROD_PASSWORD`). Run: `set -a; . ~/.claude/secrets/als-qa-creds; QA_BASE_URL=<url> QA_EMAIL=$QA_STAGING_EMAIL QA_PASSWORD=$QA_STAGING_PASSWORD npm run qa`. **DataforSEO** creds are in the SAME secrets file (`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, 16-char pw, confirmed working — ~$47 balance Jun 2026; source `~/Documents/DFSEO.rtf`). Call via curl Basic-auth + `--cacert "$CA"` (Python urllib's TLS doesn't trust the corp proxy; curl does). Plaintext secrets are deliberately kept OUT of this committed file even though the repo is private.
- **Prod is reachable at `https://agentic-learning-studio.onrender.com` / staging at `…-1.onrender.com`** (the custom domain `prathibhax.com` does NOT resolve from the agent sandbox — use the onrender URLs to verify deploys).

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
services/kb-curator/ DAILY KB refresh job (GitHub Actions) — detect(24h-delta)·fetch·ipgate·synthesize·
                     apply(reuses src/rag embed+upsertSource)·report·index; sources.yaml allowlist. See §7.
.github/workflows/   kb-curate.yml (cron 15:30 UTC = 9pm IST; merge to main to arm). kb-build/ = Codex KB rebuild tooling (§7).
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
- **Langfuse traces the LIVE path now (DONE Jun 2026):** `makeLangfuseHandler()` is wired into BOTH `runOverviewJob` and `runBuildJob` in `orchestrator.ts` — each builds a per-job `config = { callbacks:[handler], runName:"lesson:<title/prompt>", metadata:{langfuseTags:["live-generation"], stage} }`, passes it to `profiler`/`architect` (and to `runDeepDive` via `opts.config`; `retriever` takes no config), and `flushAsync()`s in the job `finally` (background jobs can exit before traces flush). Legacy `/api/learn` handler kept as-is. So with `LANGFUSE_*` keys (+ `LANGFUSE_BASEURL`) set, real lessons trace. Verified live (Jun 2026): an overview+build run produced traces named `lesson:…` carrying `ChatAnthropic` GENERATION observations (model + token usage) in Langfuse. CAVEAT: `metadata.langfuseTags` does NOT populate trace `tags` in the installed `langfuse-langchain` version (filter by `name` instead) — pre-existing, also affects the legacy path.
- **NEXT (deferred by decision):** (1) **billing + per-user credit metering** — gate `/api/overview`+`/api/build` on a paid/granted balance (Paddle); the #1 money risk still open. (2) **account basics** — email-verified gating in code, password reset, account deletion/export. (3) ~~Langfuse live-path wiring~~ **DONE (above)** — set `LANGFUSE_*` in Render to trace prod. (4) smaller: tight CSP w/ nonces, per-user (not just per-IP) rate limits, langchain dep upgrade (12 transitive vulns, breaking), admin unpublish UI. USER-side still: **Anthropic spend cap**. (DONE by user: Supabase Pro, confirm-email ON, prod env correct, Render Standard 2GB, domain live.)

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

> ### 🚀 PROMOTED TO PROD — 2026-06-27 (`main` `3d3fae4`)
> All 5 items below (1 UAT Batch 1 · 2 LLM Skills · 3 Lesson visuals/v5 · 4 B3 durability+latency · 5 Home/nav UI) were
> promoted to prod on 2026-06-27: the **19 staging files** (byte-identical to `origin/staging`, tsc clean) pushed to `main`
> (`f6347eb..3d3fae4`); **migrations `0017`+`0018` applied to the PROD DB**; **visuals ingested (129/129) + backfilled
> (95/100 library lessons, 136 visuals)** on prod. Verified live on `https://agentic-learning-studio.onrender.com`: healthz
> green; new home heading + AI-landscape box + Library FREE pill + LLM-Skills-after-My-Lessons tab order; a library lesson
> renders the "Visualize this" CTA. ✅ **Authed overview+build re-QA on prod — PASSED (2026-06-27):** a full build completed
> **5/5 = 100%** (`stubModuleIds: []`) and the prod credit debited **1 → 0** — charge-once-on-full-success verified LIVE on
> prod; durability held (build completed despite a slow module). NO 502/404 (B3 ship-blocker gone on prod). Auth used the
> public `anon` key from prod `/api/config` + the prod QA account. **Latency this run was slow (overview ~429s, build ~658s)
> purely from elevated Anthropic latency TODAY** (the same broad slowness hit staging earlier) — NOT the instance (prod is
> Standard 2GB) and NOT rate-limiting (org is Scale tier). On a normal Anthropic day prod does the whole build in ~3.5–6 min
> (and local same-code = 307s); re-measure latency when Anthropic latency normalizes. **All 5 items are now fully promoted +
> verified on prod.**
>
> _(Original staging-ready note, 2026-06-26 — kept for the promote-mechanism reference:)_
> Staging = `https://agentic-learning-studio-1.onrender.com` (Supabase `ydgiyst…`). Prod = `https://agentic-learning-studio.onrender.com`
> (Supabase `kdgtlbnl…`). Promote to `main` with the `git checkout origin/staging -- <paths>` pattern, then run any per-item DB
> step against the **PROD** DB (`PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` then `DATABASE_URL="$PROD_URL" …`).
>
> 1. **UAT Batch 1 fixes** (`3ad0e1e`) — B2 SPA fallback · B6 401-race · B5 stale-build badge · B8 library KC grading ·
>    B9 popover · B4 mobile header · download-mid-build. **No DB migration.** Promote: 6 files (`server.ts`,
>    `render/{runtime,tokens}.ts`, `public/{app.js,styles.css,home.css}`).
> 2. **LLM Skills tab** (`e4be14c`+`da61062`) — Build a Skill / My Skills dropdown. **Migration `0017_generated_skills.sql`**
>    (apply to PROD DB). Promote: `lib/skillgen.ts`, `rag/retrieve.ts`, `server.ts`, `public/{index.html,skills.js,skills.css,app.js}`, migration.
> 3. **Lesson visuals + v5 swap** (`2a200fe`+`2402f53`) — "Visualize this" CTA/popup, v5 diagrams. **Migration
>    `0018_lesson_visuals.sql`** + ingest + backfill on PROD DB (`npm run migrate` → `ingest-visuals.ts` → `backfill-visuals.ts`,
>    all with `DATABASE_URL="$PROD_URL"`). Promote: `lib/visuals.ts`, `render/{schema,components,tokens,runtime}.ts`,
>    `agent/orchestrator.ts`, `scripts/{ingest,backfill}-visuals.ts`, plus the two migrations.
> 4. **B3 build durability + latency** (`bda97ee`) — the 502/404 ship-blocker fix + caching/planner/concurrency (full
>    detail in the B3 bullet below). **No DB migration.** Promote: `src/server.ts`, `src/agent/{orchestrator,nodes}.ts`,
>    `src/lib/jobs.ts`, `src/render/runtime.ts`, `public/app.js`. ⚠️ `orchestrator.ts` + `render/runtime.ts` are shared with
>    item 3 (visuals) — promote the CURRENT files (they contain both). ⚠️ A clean 5/5 *generation* re-QA on the Render host is
>    blocked until the staging Anthropic spend cap resets (2026-07-01) — verified locally (5/5) + 202/no-502 on the host.
> 5. **Home + nav UI batch** (`d5e9235`) — broadened home messaging to the whole AI landscape (new H1, broadened sub/chips,
>    a new `#ai-areas` box: 8 grouped topic areas / 50 chips below the community band); **sticky top nav** (`.topbar`
>    position:sticky + `html,body` height→min-height); **Library "FREE" pill**; **LLM Skills tab moved after My Lessons**;
>    **bigger/lighter dropdown caret**; **dark-mode fix** for the "free overview" toast in the lesson iframe (was white-on-light
>    → invisible; now hardcoded dark bg). **No DB migration.** Promote: `public/{index.html,home.css,styles.css}`,
>    `src/render/runtime.ts` (runtime.ts also shared with items 3+4 — promote current). Verified: home in-browser (Playwright,
>    sticky pinned at scrollY=5481) + served HTML/CSS/runtime bytes. Dark-mode toast fix verified in served bytes (the
>    end-to-end dark lesson view needs a built lesson → re-confirm visually after the Anthropic cap resets).
> KNOWN minor (pre-existing, non-visible): standalone artifact at 375px reports a ~117px phantom scroll while a viz modal is open.
> ✅ **SHIP-BLOCKER LIFTED (2026-06-26, `bda97ee` on `origin/staging`):** the build **502/404 ship-blocker is FIXED** (see the B3
> entry below — `/api/module` now returns 202 + polls instead of synthesizing on the request; `runBuildJob` is per-module
> resilient; `pollJob` 404 reconstructs persisted state). Verified: `/api/module` returns **202 in <1s** on the staging host
> (was ~120s synchronous → 502), and a full build to **5/5 = 100%** locally (staging DB; was timing out at 3/5). When promoting
> these items to prod, `agent/orchestrator.ts` is now shared between item 3 (visuals) and B3 — promote the **current** file.
> ⚠️ **Final clean 5/5 re-QA on the staging Render host is BLOCKED until the Anthropic spend cap resets** (the staging
> `ANTHROPIC_API_KEY` hit its specified usage limit — `400 invalid_request_error: "regain access on 2026-07-01 at 00:00 UTC"`;
> my verification builds exhausted the remaining budget). Until then staging builds degrade gracefully (partial lesson, NOT
> charged) rather than 502/404. Raise the key's limit (or wait for 2026-07-01) to capture a clean staging build-to-100%.

- **🧠 PROD OOM + MEMORY FIX (2026-06-27) — FIXED & ON PROD.** The prod instance (Standard 2 GB) exceeded RAM and Render
  auto-restarted it. Root cause = two unbounded in-memory Maps (audit P0-2/P0-3), aggravated by the Batch-A concurrency bump +
  go-live traffic:
  - **`src/lib/jobs.ts`** — generation progress trackers were never freed (the `activeJobs` cutoff only filtered the view).
    Added the opportunistic sweep the `skillgen`/`handson` maps already use: drop trackers >60 min on each `createJob`. (`8fce4e4`)
  - **`src/lib/uploads.ts`** — parsed/embedded uploads were never evicted. Added `createdAt` + a 2 h `gcUploads()` on each
    upload. (`8fce4e4`)
  - **Concurrency defaults lowered to bound PEAK RAM:** `MAX_MODULE_CONCURRENCY` 8→5 (`orchestrator.ts`),
    `MAX_CONCURRENT_GENERATIONS` 4→2 (`jobs.ts`). Both still env-overridable. (this commit)
  Jobs/uploads are RAM-only; lessons live in Postgres, so these GCs have **zero user impact** (pollJob reconstructs from the
  persisted artifact if a tracker is ever missing). After deploy the Render **Memory graph should plateau** instead of climbing
  to a cliff. NOTE (still open, see STAGING_AUDIT.md Scalability): all this state is single-instance in-memory — it must move to
  Postgres/Redis before any horizontal scaling, and **Sentry + memory alerting (Phase-2 prompt) would have flagged this pre-OOM**.
- **⚡ LATENCY / MODEL-TIERING — Batch A + S5 + S6 + grounding-log DONE & ON PROD; Batch B (GPT failover) coded + env-gated, pending the OpenAI-key validation (2026-06-27, `main e134aeb`).**
  Root cause of slow builds was **output-token generation** (latency ≈ output_tokens ÷ decode_rate), NOT input/cache/RAG/rate-limit
  (org is Scale tier). **Batch A (shipped to staging `6610833` + prod `e23fa33`):**
  - **All modules build in ONE parallel wave** — removed the B3 serial "module-1 cache-warm-up" (it traded wall-clock for cents
    of input cost). `orchestrator.ts` `runBuildJob`. Measured **build 307s → 108s (2.8×)** locally (5/5, 0 failed; wall-clock ≈
    slowest module, not the sum). `MAX_MODULE_CONCURRENCY` 5→8 (env).
  - **Model tiering:** `profiler` → Haiku (`nodes.ts`), `repairDensity` → Haiku (`density.ts`) — both env-overridable; verified
    clean (profiler 6s→2.5s). No gate/credit/schema change.
  - **Overview still ~74s** (planner 23s + **architect 49s = the long pole**, one 16k Sonnet skeleton call) — NOT addressed by
    Batch A; the planner leg is targeted by Batch B (planner→a cheaper model), the architect stays Sonnet (quality-critical).
  - **Cost reality (flag for finance):** a full 5-module lesson ≈ **$0.95–1.70** Anthropic spend vs **$0.99/credit** — thin/negative
    margin. S5 (single end-KC) + Haiku tiering improve it; fewer/lighter modules help.
  - **✅ S5 / S6 / grounding-log — DONE, ON STAGING (`origin/staging 1f3b899`) AND PROD (`main e134aeb`, 2026-06-27; NO DB migration).**
    Verified locally (staging Supabase + working key) + tsc-clean on the prod base; a full build runs 5/5=100% and
    charge-once-on-full-success holds. Promoted 7 files: `src/agent/{nodes,prompts,state}.ts`, `src/rag/retrieve.ts`,
    `src/render/{components,schema}.ts`, `src/server.ts`.
    - **S5 — single end-of-lesson KC:** modules NEVER emit knowledgeCheck/selfCheckQuiz (`moduleUserPrompt` directive forced OFF +
      `runDeepDive` strips both; the in-flow retrieval primitives — predictThenReveal, recall hooks, scenarios — are KEPT). ONE
      lesson-level KC is generated in `writeOverviewProse` → **`bp.finalCheck`** (stable id `_final_check`; schema: extracted
      `KnowledgeCheckBlockSchema`, optional Blueprint field). Rendered in a **`_check` pane (vertical) / page (horizontal) BEFORE
      Sources** (`finalCheckInner` in `components.ts`; the old DEAD `cumulativeCheckItems`/`horizontalCheckPage` were removed).
      `/api/check` resolves `bp.finalCheck` by block id (per-module KC fallback kept for old/library lessons). Gated on `lessonTypes`
      incl `knowledge_check` (horizontal implies it). Verified: broad vertical → 1 KC (5 Qs) before Sources, narrow horizontal → 1 KC
      page, grading works, ZERO per-module quizzes, both modes.
      ⚠️ **Transitional (cosmetic, prod):** an OLD KC lesson re-rendered with this code shows its old per-module KCs AND an empty
      `_check` placeholder (it has no `finalCheck`). Only affects pre-existing KC lessons; new builds are clean. Candidate follow-up:
      suppress the `_check` placeholder when a lesson already has per-module KC blocks and no `finalCheck`.
    - **S6 — dynamic module count:** profiler classifies `scope` (narrow|moderate|broad) → `moduleTarget` **5/6/8** (on `Intent`),
      threaded into the planner + architect (skeleton) prompts (was hardcoded 4-5). `MAX_MODULE_CONCURRENCY` already defaults to 8.
      Verified: "the whole field of machine learning" → 8 modules; "what is an AI agent" → 5.
    - **grounding telemetry:** `src/rag/retrieve.ts` logs `[retrieve] grounded|ungrounded · N chunk(s) · coverage=… · q="…"` per call
      (the early `!ragEnabled()`/empty-query return logs ungrounded with a reason). Cheap; gives data on how often broad topics ground.
  - **🟡 Batch B — GPT failover: CODED + COMMITTED LOCALLY (`feat/credits-billing 192aabf`), NOT pushed; env-gated NO-OP without `OPENAI_API_KEY`.**
    `src/agent/llm.ts` adds `gptFallbackEnabled()` / `makeGptLLM(tier)` (Sonnet→`gpt-5.5`, Haiku→`gpt-5.4-mini`; env-overridable via
    `OPENAI_MODEL_SONNET`/`OPENAI_MODEL_HAIKU`) / `stripCacheControl` (drops the Anthropic-only cache_control on the GPT branch) /
    `structuredWithFallback` / `rawWithFallback` / `invokeResilient`. Wired into profiler, planner, architect, runDeepDive,
    writeOverviewProse, density-repair, and `/api/check`. With a key: Claude SDK retries cut to 2 (`CLAUDE_RETRIES`) + LangChain
    `.withFallbacks([gpt…])` → fails over to GPT FAST (not the ~84s backoff); without a key: unchanged (Claude-only + `withOverloadRetry`).
    Verified: tsc clean + a full no-key build is 5/5=100% with ZERO GPT refs (no regression). `.env` + `.env.example` now carry a blank
    `OPENAI_API_KEY=` field (+ the two `OPENAI_MODEL_*` defaults). **PENDING (needs the user's key):** (1) confirm the exact OpenAI
    model-id strings vs the account (`gpt-5.5`/`gpt-5.4-mini` are best-guess defaults), (2) FORCE the fallback + run full GPT-only
    builds (structured-output parse + lesson quality; watch for GPT-5.x temperature/max_tokens 400s), (3) push to `origin/staging` +
    add `OPENAI_API_KEY` to BOTH the staging AND prod Render envs before any prod promote.
- **🔎 FULL STAGING AUDIT — see [`STAGING_AUDIT.md`](STAGING_AUDIT.md) (2026-06-27, `8f1c8e2`).** A read-only code /
  security / scalability / resilience audit + the full generation-pipeline data-flow map (input → agents → output → user
  context). Owner to review tomorrow. **Headline P0s** (full detail + P1/P2/P3 + ops runbook in the doc):
  - **P0-1 unmetered model-spend faucet** — `POST /api/module` is public, unrate-limited, takes no gen slot, and runs real
    ~16k-tok Sonnet builds (via `ensureModuleBuild`) for FREE; the credit is only charged in `runBuildJob`. A known artifact
    UUID = free paid generation. (Pre-existing: the old synchronous `/api/module` was also free; B3 made it async.) **Decide:**
    add a light gen-slot + per-IP rate-limit to `/api/module`, and/or only allow on-demand builds for artifacts owned by the
    caller. Trade-off: `/api/module` must stay token-less for the lesson iframe — gate by cost/rate, not auth.
  - **P0-2 unauthenticated expensive `/api/upload` + `/api/upload-repo`** (CPU/embedding, `git clone`, unbounded in-mem
    `uploads` Map) → DoS/OOM. **Decide:** rate-limit + cap + TTL-evict the uploads Map.
  - **P0-3 `jobs` Map never pruned** (`src/lib/jobs.ts`) — siblings `skillgen`/`handson` sweep, this one doesn't → slow OOM.
    Quick fix: add the same periodic sweep.
  - **P0-4 credit charge depends on the process surviving the whole build** — a restart/deploy (or the `/api/module`
    recovery path) yields a free lesson; the bare `-1` spend is non-idempotent. **Architectural:** make the charge idempotent
    (key it to the artifact + a "charged" flag) so it survives restarts and can't double/under-charge.
  - **✅ P0-5 zero-module build charged — FIXED (`8f1c8e2`):** `fullSuccess` now requires `pending.length > 0`.
  - **P0-6 backups/PITR undefined** — confirm Supabase PITR is on for BOTH DBs + do a restore drill (single biggest
    data-loss risk; all durable state has one home). See the doc's runbook.
  - **13× P1** incl: per-resource authz (`/api/build` can charge another user; `/api/ask/expand` edits any lesson),
    `module_cache` key omits `uploadIds`/`referOnly` (cross-user upload-grounded leak), `runBuildJob`⇄`ensureModuleBuild`
    last-write-wins blueprint clobber, iframe sandbox effectively disabled (`allow-scripts allow-same-origin` + CSP off),
    DB `rejectUnauthorized:false`, uploaded-doc grounding silently lost on restart, migrations manual/untracked (no
    `schema_migrations`). All in `STAGING_AUDIT.md` with file:line + fixes.
- **🔑 Anthropic API limit (the staging-build blocker):** the `400 "regain access 2026-07-01"` is a **monthly SPEND cap**
  (not a rate limit). Raise it in console.anthropic.com → **Settings → Limits** (org AND the key's **Workspace** — workspace
  limit overrides org) and ensure **Billing** has credit/auto-reload. Give **prod** a high cap, **staging** a modest one
  (~$2-5 covers a clean 5/5 build). Code already degrades gracefully on the cap. After raising it (or after 2026-07-01),
  run the clean 5/5 staging build-to-100% + the live dark-mode lesson check that the cap blocked.

- **✅ B3 — DONE (2026-06-26, `bda97ee` on `origin/staging`): build durability (502/404 ship-blocker) FIXED + latency work landed.**
  **PART A — durability (the ship-blocker):**
  (1) **`/api/module` 502 → 202/poll (`server.ts`).** The PUBLIC per-module endpoint no longer synthesizes a ~16k-tok Sonnet
  body SYNCHRONOUSLY (that exceeded Render's gateway timeout → 502 / a ~120s hang). It now: serves the `module_cache` hit →
  serves the module if the persisted artifact already has it (renders + caches) → else returns **`202 {building:true}`** and a
  deduped off-request worker `ensureModuleBuild()` synthesizes it; the iframe POLLS. If a `runBuildJob` is already building the
  artifact (`hasActiveBuildForArtifact` in `lib/jobs.ts`), IT stays the builder (no double-build). `render/runtime.ts` `pump()`
  handles the 202 (re-queue + poll every 2.5s, 5-min backstop). Verified on the staging host: **202 in <1s** (was ~120s sync).
  (2) **`runBuildJob` per-module resilience (`orchestrator.ts`).** Each module builds in a try/catch — one module that errors
  (502/overload-exhausted/parse) becomes a STUB and the build CONTINUES to a usable 100% (remaining stubs build on demand via
  /api/module). **Credit now charges ONLY on FULL success** (`failCount===0`) — NOT on a partial/failed build; "charge once,
  only on full success, never on failure/partial" preserved. Verified locally: a forced single-module failure → build still
  reaches done (4/5 ok, 1 stub) and **balance unchanged** (no charge); a clean 5/5 build charges exactly 1.
  (3) **`pollJob` 404 (`public/app.js`).** A Render restart that drops the in-memory job mid-build no longer reverts the UI to
  0%/failed — 404 now reveals the PERSISTED lesson (`/api/artifact/:id`, built modules + self-building stubs) + reloads the
  dashboard. (Modules persist to Postgres incrementally; `runBuildJob` promotes `kind` at the start, so the lesson is already
  in My Lessons.)
  **PART B — latency (all landed):** (a) **prompt caching** — `cache_control:{type:"ephemeral"}` on `MODULE_SYSTEM` (~7k tok,
  byte-identical across module calls) via `@langchain/anthropic` in `runDeepDive` (`nodes.ts`); `runBuildJob` builds **module 1
  first** (writes the cache) THEN fans out modules 2..N which READ it. Verified locally: **`cache_read=8641` on modules 2..N**
  (`[module-cache]` log; `withStructuredOutput(..., {includeRaw:true})`). (b) **`MAX_MODULE_CONCURRENCY` 3→5** (env-overridable).
  (c) **planner Opus 4.8 → Sonnet 4.6** (`nodes.ts` `plannerLLM` — the slow overview leg; env-overridable via
  `ANTHROPIC_MODEL_SONNET`). (d) **honest progress copy** (`app.js` STAGE_TEXT + gen overlay). (e) **per-stage wall-clock
  logging** (`[timing]` in `orchestrator.ts`: profiler/retriever/planner/architect + per-module + totals).
  **MEASURED (local, working key + staging DB):** overview ~75s (profiler 6s · retriever 0.3s · **planner 22s** · **architect
  46s ← now the dominant leg**); build **307s → 5/5 = 100%** (was timing out at **3/5 after >480s** BEFORE; module 1 ~200s incl.
  a transient retry, modules 2-5 ~80-105s in one cached parallel wave). Overview is improved (~82s→~75s) but still over the
  <60s target — the bottleneck is now the **architect** skeleton call (46s), which was NOT in the approved caching scope.
  **LIVE STAGING (2026-06-27, cap raised):** a full build COMPLETED **5/5 = 100%** and **charged exactly once (25→24)** —
  durability + charge-once-on-full-success verified on the real Render host. BUT latency this run was slow (overview ~249s,
  ~160s/module, build ~13 min). **Cause = the under-resourced STAGING Render instance (Starter 512 MB), NOT rate-limiting and
  NOT a code regression** — confirmed: the org is on **Scale tier** (Sonnet 2M OTPM / 10K RPM; the build uses ~4% of OTPM), and
  the 2026-06-25 "🐢 STAGING PERF" note already documents staging module-builds crawling (~1 module / ~7 min) vs **prod
  (Standard 2 GB) doing the whole build in 3.5–6 min**, with "NOT a code/stack problem." The CPU-heavy local ONNX embedder +
  concurrent 16k streams crawl on 512 MB. **Real numbers = local 307s / prod 3.5–6 min.** To get a representative staging
  latency, bump the staging service to Standard (2 GB); longer-term, move RAG embeddings to a hosted API (the one fragile
  CPU-heavy piece). The optimization is sound; it's masked on the small staging box.
  **NO changes to the gate/credit logic, the 7 Blueprint gates, or the overview→build HITL flow.** Changed files (all in
  `bda97ee`): `src/server.ts` · `src/agent/orchestrator.ts` · `src/agent/nodes.ts` · `src/lib/jobs.ts` · `src/render/runtime.ts`
  · `public/app.js`. **PROMOTE TO PROD (after the staging cap resets + a clean 5/5 staging re-QA):** `git checkout origin/staging
  -- src/server.ts src/agent/orchestrator.ts src/agent/nodes.ts src/lib/jobs.ts src/render/runtime.ts public/app.js` into
  `main`. **No DB migration.** ⚠️ `agent/orchestrator.ts` is now shared with the visuals item (#3 above) — promote the current
  file (it contains both). Prod has the SAME Render gateway-timeout exposure, so this should land with/before the other three.
  **⚠️ OPEN — staging Anthropic spend cap:** the staging `ANTHROPIC_API_KEY` hit its specified usage limit during verification
  (`400: regain access 2026-07-01 00:00 UTC`), so a clean 5/5 build on the Render host couldn't be captured. Builds degrade
  gracefully (partial, not charged) meanwhile. Raise the key's limit or re-QA after 2026-07-01. (This is the HANDOFF's
  long-noted "USER-side: Anthropic spend cap".)
- **🩹 Prod-UAT Batch 1 fixes — ON STAGING, AWAITING REVIEW BEFORE PROD (2026-06-26; commit `3ad0e1e`).** Seven UAT items,
  each verified locally (Playwright + curl). **B2** SPA history fallback: a catch-all (`app.get(/.*/)` registered LAST in
  `server.ts`) serves `index.html` for non-API/non-asset GETs so `/pricing /library /community /builder /llm-skills` survive
  refresh/deep-link/share; `routeFromUrl()` (app.js) maps those paths to their tab (NO URL-push — by decision). **B6** load
  401 race: `loadDashboard()` returns early until the Supabase token is attached (`applySession` re-runs it) → 0 boot 401s.
  **B5** stale "Building… X%": `loadDashboard` is now SERVER-AUTHORITATIVE (a completed build absent from `/api/jobs/active`
  can't show a stale badge from a dead local poller); the `X%` itself was reading-progress (working as designed). **B8**
  Library/Community knowledge checks now grade for REAL: `/api/check` resolves the prebuilt/community Blueprint **by slug**
  (`{slug,source}`), and the artifact runtime sends the slug for `/api/lesson/*` + `/api/community/lesson/*` pages (was
  `!ARTIFACT_ID` → "Saved (grading needs the live app)"). **B9** (i) popover: `closePopover()` on vertical module nav +
  a visible `×`. **B4** mobile header (375px): CSS-only — the 9-tab bar becomes a horizontal-scroll strip + reflow (no
  overlap/overflow); also fixed a Home feature-row grid overflow (`minmax(0,1fr)` + `min-width:0`). **Download mid-build:**
  `/api/artifact/:id/full` serves best-available HTML immediately when modules are stubs (no 30s hang); a completed lesson
  downloads full. **B7 (community ♥) needed NO change** — it works; the UAT's "no network call" was the per-browser like
  dedupe on an already-liked lesson (verified: like fires, count 2→3). Files: `server.ts` · `render/{runtime,tokens}.ts` ·
  `public/{app.js,styles.css,home.css}`. NO DB migration. **Still pending (separate sign-off):** B3 latency (plan), B1 DNS.
  **PROMOTE TO PROD (after review):** `checkout origin/staging --` those 6 files into `main` (no migration).
- **📊 Lesson visuals ("Visualize this") — ON STAGING, AWAITING FINAL REVIEW BEFORE PROD (2026-06-26; commit `2a200fe`).**
  A small **"Visualize this"** CTA on a lesson module opens a ~65% popup with a curated, self-contained concept diagram
  (inline SVG; no iframe/external fetch). Additive: a deterministic retrieval post-step + one OPTIONAL `module.visual
  {title,svg}` schema field + a CTA/popup in the renderer — the lesson-gen model output, the 7 gates, and the credit flow
  are UNCHANGED. **Diagram source = `~/Documents/KB - Visuals/custom-html-v5` (129; the high-quality REPLACEMENT for the
  earlier low-quality v3/v4 set — swapped 2026-06-26, commit `2402f53`).** v5 is a pure DATA swap: same `visual_id` /
  `kb_identifier_keys` / `keywords` per concept (so retrieval + schema + renderer are untouched), only the SVG bytes +
  shared CSS changed (now `assets/diagram.css`). **Migration `0018_lesson_visuals.sql` (pgvector 384d + HNSW,
  RLS-on/no-policies) is APPLIED to the STAGING DB**, and the v5 set is ingested (129 rows, all embedded) + backfilled
  (library: 96/100 lessons, 132 visuals) on STAGING. Files: `src/lib/visuals.ts` (retrieveVisual: keyword/identifier match →
  embedding fallback @0.84, symmetric embedPassages; env-tuneable `VISUAL_SIM_THRESHOLD`/`VISUAL_KEYWORD_MIN`),
  `scripts/ingest-visuals.ts` (FOLDERS=`[custom-html-v5]`; reads `assets/diagram.css` per folder; extract `<svg>` + INLINE
  CSS SCOPED under `.viz-svg` so page rules can't leak), `scripts/backfill-visuals.ts` (no regen — re-renders from blueprint;
  now CLEARS a module's stale visual before re-attaching → idempotent across diagram swaps),
  `src/render/{schema,components,tokens,runtime}.ts`, `src/agent/orchestrator.ts` (auto-attach per module on new builds;
  try/catch never fails a build). Verified locally + on the STAGING onrender host (Playwright desktop+mobile): CTA → 65%
  popup with the new clean v5 diagram, ✕/Esc/backdrop close, NO CSS leak, correct concept per unchanged identifiers, 0
  console errors, tsc clean. **TO RE-SWAP a future diagram set:** drop it in a folder, point `FOLDERS` at it, then per env:
  `delete from lesson_visuals;` → `ingest-visuals.ts` → `backfill-visuals.ts`. **MINOR (pre-existing, non-visible):** the
  standalone artifact at 375px reports a ~117px phantom scroll while the viz modal is open (the modal/diagram render fine;
  the artifact is normally iframed) — modal CSS unchanged by the swap; left as-is.
  **PROD: NOT YET — the visuals feature isn't on `main`/prod** (no `0018`, no visuals code on `main`). When the feature is
  promoted: `checkout origin/staging --` the ~11 paths into `main`, then `DATABASE_URL="$PROD_URL" npm run migrate &&
  DATABASE_URL="$PROD_URL" npx tsx scripts/ingest-visuals.ts && DATABASE_URL="$PROD_URL" npx tsx scripts/backfill-visuals.ts`
  (already v5 from the start — no separate prod swap needed).
- **🧩 LLM Skills tab — ON STAGING, AWAITING FINAL REVIEW BEFORE PROD (2026-06-26; commits `e4be14c` + `da61062`).** A new
  top-nav **"LLM Skills"** dropdown (mirrors the Trainer dropdown) with two items: **Build a Skill** and **My Skills**.
  *Build a Skill* turns a free-text brief (LLM interface · task · data sources · access method + 4 optional fields, NO
  dropdowns) + optional file/repo references into an installable **Agent Skill** (`SKILL.md` + scripts), shown IN-TAB as a
  3-module + Sources result (syntax-highlighted preview · per-file download · Download-all .zip). Grounded by the **"Agent
  Skills" KB category** (`retrieve()` gained an additive `category` filter); generates ungrounded (logged) if the KB is
  absent. *My Skills* lists each user's saved skills like My Lessons (open / delete). **FREE in v1**, **Sonnet**
  (`makeLLM("sonnet").withStructuredOutput(SkillPackageSchema)` — model emits STRUCTURED JSON only, app renders escaped).
  Files: `src/lib/skillgen.ts` (schema + detached job + SKILL.md sanitize + persist), `src/rag/retrieve.ts` (category
  filter), `src/server.ts` (`/api/skill/generate` · `/api/skill/job/:id` · `/api/skills` · `/api/skill/saved/:id`),
  `public/skills.js` + `skills.css` (own files; avoid app.js/styles.css contention), `public/index.html` (nav + tab).
  **Migration `0017_generated_skills.sql` is APPLIED to the STAGING DB** (generated_skills, RLS-on/no-policies). Verified
  locally (Playwright desktop): tab/form (no dropdowns, blue band) · upload chip · generate→result · rail switching ·
  SKILL.md frontmatter (kebab `name` + "Use when…" desc) · per-file + zip download · grounded sources · My Skills
  save/list/open/delete · 0 console errors · tsc clean. **PROMOTE TO PROD (after review):** `checkout origin/staging --`
  the 7 paths into `main`, then `DATABASE_URL="$PROD_URL" npm run migrate` to apply `0017` to the PROD DB.
- **🖼️ Catalog thumbnails moved PixelBin CDN → Supabase Storage (2026-06-26, ON STAGING AND PROD; promote `d5cb676`).** The
  Library/Community card covers (`.lib-cover` background `--cov-img`) no longer use `cdn.pixelbin.io`. They now load from each
  environment's OWN **Supabase Storage public bucket `lesson-thumbs`** (CDN-backed, edge-cached) — 10 optimized webp images
  (~5–10KB each), one per category (`agents/rag/llms/frameworks/generative/evaluation/infrastructure/safety/foundations/build`).
  `app.js` `setThumbBase(cfg.supabaseUrl)` (called in `bootAuth` after `/api/config`) builds
  `<supabaseUrl>/storage/v1/object/public/lesson-thumbs/<key>.webp`, so staging + prod each serve from their own project; cards
  fall back to the flat category colour if Supabase is unavailable. **Bucket setup is CONTENT, not a migration** (object bytes
  can't live in SQL): the `lesson-thumbs` bucket (`public=true`) + the 10 webp were created on BOTH Supabase projects. To
  re-create/refresh (e.g. new categories): the `.env` has NO service-role key, so upload as a signed-in user — (1) SQL on the
  target DB: `insert into storage.buckets (id,name,public) values ('lesson-thumbs','lesson-thumbs',true) on conflict (id) do
  update set public=true;` + a TEMP scoped policy `create policy tmp_thumb_upload on storage.objects for all to authenticated
  using (bucket_id='lesson-thumbs' and auth.uid()='<qa-user-id>'::uuid) with check (…same…);` (2) `POST
  <supabaseUrl>/storage/v1/object/lesson-thumbs/<k>.webp` with a fresh QA-user `Bearer` JWT + `Content-Type: image/webp` +
  `x-upsert: true`; (3) `drop policy tmp_thumb_upload on storage.objects;`. QA users: staging `pojidov934@divahd.com`, prod
  `grz1q@web-library.net` (secrets file). NOTE: NO new persisted secret was added; PixelBin can be retired for thumbnails.
- **🏷️ Credit balance unit "lessons" → "credits" (2026-06-26, ON STAGING AND PROD; promote `44af30e`).** Pure terminology: the
  user-facing BALANCE now reads "credits", not "lessons". Changed 3 displays — the nav credit pill (`#credit-count` span in
  `public/index.html`: `&nbsp;Lessons` → `&nbsp;Credits`, + tooltip "Your credits — click to buy more"), the Account "Credits
  remaining" value (`app.js` `set("acct-credits", … credit…)`), and the pricing balance note (`app.js` `loadCredits`: "You have
  X credits"). The pricing page already explains **1 credit = 1 lesson**, so the conversion is clear. UNCHANGED on purpose: the
  **My Lessons** tab name, the Library/Community "lessons", and the "1 credit = 1 generated lesson" pricing copy. No behaviour /
  DB change (the credit ledger + `/api/credits`/`/api/account` already return a numeric `balance`; the unit was always a
  client-side label). Verified: pill renders "5 Credits".
  schema, the 7 gates, or the credit flow. On an ELIGIBLE lesson a `⚡ Get Hands on · Beta` button (after the Concept/Functional/
  Code toggles) opens a new tab (`/hands-on?lesson=…&module=…`) with a JupyterLab page that runs Python ENTIRELY in the browser
  via Pyodide (the server NEVER runs generated code). FREE (no credit spend). Notebooks are generated LAZILY on click and
  CACHED per (lesson, module).
  - **v2 enhancements (owner-requested, 2026-06-26):** (1) every CODE cell carries a `heading` + `explain` (what it does + what
    output to expect), rendered ABOVE the editor; (2) a SECOND Haiku agent verifies/fixes the code (up to 2 passes) so it runs
    error-free + prints output — re-validated for safety, graceful fallback; (3) the button shows a `Beta` tag; (4) code cells
    render as a JupyterLab notebook via CodeMirror 5 (Python syntax colours, `In[n]:`/`Out[n]:` prompts); (5) the gen prompt
    forces every cell to PRINT illustrative output that demonstrates the concept (agent steps, retrieval results, metrics…);
    (6) the notebook spans 80% of the screen width. `SCHEMA_VERSION` bumped to `v2` (invalidated the old cache).
  - **DEPLOY STATE:** code pushed to `staging`; migration `0015` (table `hands_on_notebooks`) **applied to the STAGING Supabase
    only** (`npm run migrate`; durable DB cache verified — survives a server restart). **PROD (`main`) has neither.** Promote to
    prod on owner approval: cherry-pick the Hands-On commits → `main`, then `DATABASE_URL="$PROD_URL" npm run migrate` BEFORE the
    prod deploy (the lib degrades gracefully if the table is missing — in-memory cache only — but the durable cache needs it).
  - **New files:** `src/render/eligibility.ts` (`handsOnEligible(bp, module?)` — deterministic $0 blocker-regex gate, shared by
    renderer + server); `src/lib/handson.ts` (NotebookSchema, server-side code-cell VALIDATION + 1 stricter retry [covers a
    parse-throw OR validation fail] + safe fallback, Haiku gen, DB+memory cache, `resolveBlueprint` [user lessons / Library
    slug / Community slug], in-memory job registry); `public/hands-on.html` (auth via /api/config + getSession; %-progress;
    cells; Pyodide v0.26.4 from CDN, lazy numpy/pandas; Run + Shift+Enter; matches the app's Plus-Jakarta/blue look + mobile);
    `supabase/migrations/0015_handson.sql` (`hands_on_notebooks` cache table, RLS-on/no-policies like 0013/0014, idempotent).
  - **Additive touch-points (Hands-On only):** `components.ts` (gated launch button after `contentToggles`, vertical + horizontal
    headers); `tokens.ts` (`.handson-btn` CSS); `runtime.ts` (`.handson-btn` click → postMessage `als-handson` to parent +
    standalone `window.open` fallback; `HANDSON_LESSON` URL matcher for artifact/lesson/community); `app.js` (`als-handson`
    listener → opens the tab); `server.ts` (`POST /api/hands-on/start` + `GET /api/hands-on/job/:id`, both requireAuth +
    heavyLimiter; `GET /hands-on` page route).
  - **DB / migration NOT applied (per owner guardrail "DO NOT run the migration on any cloud DB until I approve"):** the lib
    degrades gracefully — if `hands_on_notebooks` is missing the DB cache is skipped and an in-process MEMORY cache serves
    repeats (so "second click = instant" works locally without the table). Apply `0015` to **staging** (not prod) on approval to
    make the cache durable: `npm run migrate`.
  - **Verified locally (:5070, tsc clean, Playwright):** button shows on eligible lessons (the-agent-loop, tokenization,
    chunking, rag-eval, llm-as-judge) and is ABSENT on ineligible ones (fine-tuning, rlhf, gpus, deploy/vllm, openai-sdk);
    `/start` returns a cache hit instantly, else a jobId; live Haiku gen produced valid 3–5-cell notebooks (the-agent-loop,
    tokenization, llm-as-judge, chunking — all `source:"live"`, no fallback after the retry fix); 422 on an ineligible lesson,
    404 unknown, 401 unauth; the page renders cells, Pyodide kernel goes ready, Run ▶ AND Shift+Enter execute Python in-browser
    and print output (tokenizer demo printed tokens + count); ineligible → "Not available here" notice; button-click opens the
    correct new tab; mobile (375px) reflows with no overflow. 0 console errors (only an expected 422 network log + favicon 404).
  - **✅ Phase 2 — SELF-GROWING KB (2026-06-26, ON STAGING AND PROD; migration `0016` on BOTH DBs).** Instead of a hand-curated
    template library, the KB is LEARNED from generations: in `src/lib/handson.ts`, every generated notebook's topic text
    (`embedTextFor` = topic + module title + summary) is embedded (bge-small/384d via `src/rag/embed` `embedPassages` —
    SYMMETRIC, NOT the query prefix) and stored on the row; before generating, `searchKB` cosine-matches the nearest prior
    notebook (hnsw index) and REUSES it when `sim >= KB_SIM_THRESHOLD` (0.86) → `source:'retrieved'`, $0, no model call, and it
    re-stores under the new key+embedding so the KB grows around the topic. Fallbacks store no embedding (never reused);
    pre-`0016` rows have NULL embedding (exact-cache only). Migration `0016_handson_kb.sql` = `embed_text` + `embedding(384)` +
    `hands_on_notebooks_embedding_hnsw` (cosine); additive/idempotent; graceful if the embedder/DB is down. Verified: RAG-eval
    metrics↔faithfulness (0.89) → retrieved the same notebook; embeddings/vector-search (<0.67) → fresh; exact re-request still
    instant. (Promote commit `00c2608`.) FUTURE: tune the threshold from real traffic; optional Regenerate (bypass-cache) control.
- **🩹 Lesson toolbar alignment fix (2026-06-26, ON `staging` ONLY — NOT yet on `main`/prod).** In the artifact's inner
  vertical-mode top bar (`.topbar` rendered by `components.ts renderBody` — the toolbar that sits BELOW the host "Ask more"
  viewer bar), a long lesson title in `.tb-center .brand-mini` widened the bar and pushed the Concept/Functional/Code/
  Explain-syntax toggles + progress onto extra rows (see owner screenshot of "Building a Voice-Enabled Customer Support Agent
  with LangChain & LangGraph"). **FIX:** removed the `.tb-center`/`.brand-mini` title element entirely (one-line delete in
  `components.ts`); the lesson title still shows in the HOST viewer bar (`#viewer-title`), so nothing is lost. Now `.tb-left`
  (← Overview) + `.tb-right` (toggles + progress) split the bar and the toolbar stays on ONE row regardless of title length.
  Artifacts RE-RENDER from the stored blueprint, so existing lessons pick it up too. Verified locally (:5070): `tsc --noEmit`
  clean, 0 console errors, all toolbar buttons at the same top offset in BOTH the overview and workbench views.
  **STATUS: pushed to `staging` (origin/staging) — NOT promoted to `main`/prod.** Promote with the usual staging→prod pattern
  once the owner verifies on the staging site.
  - **NOTE — reverted UI restyle:** a separate UI-restyle exploration (Source Sans 3 font + Coursera-style nav/builder/
    my-lessons/trainer redesign across `index.html`/`styles.css`/`app.js`/`tokens.ts`/`runtime.ts`/`index.ts`) was built then
    **REVERTED at the owner's request** (the earlier Plus-Jakarta look is kept). The mockups stay untracked in `public/mockups/`
    (unshipped). The ONLY thing that shipped to staging is the toolbar title-removal above.
- **🩹 "Lesson still building" overview banner (2026-06-26, on `staging`→`main`/prod).** Opening a lesson mid-build (e.g. "Open"
  from My Lessons before the build finishes) landed on the overview with no signal. Added `buildBanner()` in `components.ts`
  (shown in BOTH the vertical + horizontal overview when any module `!isBuilt`; suppressed when `previewOnly`): "Just a little
  bit longer — your trainer is getting your lesson ready." Runtime `updateBuildBanner()` (`runtime.ts`) hides `#build-banner`
  once no `.navitem.building` remain. CSS `.build-banner` in `tokens.ts`. Verified locally w/ Playwright (renders for a building
  blueprint, absent when built/preview, 0 console errors). Re-renders from stored blueprint → applies to existing lessons too.
- **🎨 UI REDESIGN MOCKUPS (2026-06-26, LOOK-AND-FEEL exploration — NOT wired to the app, UNTRACKED, local-only).** Owner wants a
  more professional, Coursera/Udemy-inspired look (visual only, no UX/feature change). Variation 1 (Coursera-inspired) built as
  static mockups in **`public/mockups/`** (`index/home/builder/trainer/my-lessons.html` + `mock.css`) — **Source Sans 3** (Coursera's
  font), professional blue (`--brand:#0b5cff`), catalog cards w/ gradient thumbnails + ratings, clean nav/hero/footer. View at
  `localhost:5070/mockups/index.html` or open the files (relative paths). These are NOT committed/deployed (throwaway). NEXT:
  owner to pick a direction → optionally generate 8–10 real thumbnail/hero images via the **PixelBin connector (nanoBanana)**
  (the MCP gate needs an estimate-prediction-cost confirmation first) → then apply the chosen look to the REAL app
  (`public/index.html`/`styles.css`/`home.css` + the artifact renderer) as a proper styling pass. Possible variations: a
  Udemy-style (darker, denser, purple accent) alternative if requested.
- **🩹 SYNTHESIS "Putting it together" was near-empty (2026-06-26, fix NOW ON `staging` AND `main`/prod — promote `94ff2c7`).** A lesson's
  final Synthesis pane showed only the lone capstone line ("Try it: Apply what you learned to <topic>") — confirmed by data:
  the stored blueprint had `recap`/`buildOrder`/`checklist` all EMPTY (the generic capstone is `coerceSkeleton`'s default,
  `nodes.ts:368`). ROOT CAUSE: the **overview-prose pass (`writeOverviewProse`, `nodes.ts:716`) that fills synthesis during
  the build had failed/produced nothing** for that lesson (errors are caught → `return null` → build completes anyway leaving
  synthesis empty). NOTE: the earlier subagent's "`needSynthesis` is false because buildOrder:[] exists" theory was WRONG —
  `[] && 0` is falsy so `needSynthesis` is already true; the real cause is the LLM pass silently failing. **FIX (renderer-side,
  high-leverage):** `synthesisInner` in `components.ts` now, when synthesis is fully empty, calls new `derivedSynthesis(bp)` to
  build a "throughline" recap (each module's `title` + `summary`) + a "Decisions this lesson raised" checklist (modules'
  `decisionItForces`). Deterministic, $0, and — because artifacts RE-RENDER from the stored blueprint on every view — it fixes
  **every existing thin-synthesis lesson instantly, no regeneration**. (`.synth-lead`/`.recap-list` CSS in tokens.ts.) Verified
  against the real prod lesson "GraphQL as a Data-Fetching Layer for Agents" → 5-item recap + checklist render. (Secondary: the
  generation reliability of `writeOverviewProse` could be hardened with a retry/deterministic-fill, but the renderer fallback
  makes a thin synthesis undisplayable, so not urgent.)
- **✅ COMPLIANCE (India legal pages + complaint/grievance/consent system) — NOW ON `staging` AND `main`/prod (2026-06-26, prod
  promote `31a258e`; migration `0014` applied to BOTH DBs).** Pages live at `/{security,privacy,terms,report-issue,complaint,
  grievance}`. Individual-operator (Anand Pareek, NOT a company; GST/registered-office = N/A) legal pages + a general
  complaint/grievance/data-rights intake. Contact address shows "available on request — findkailash@gmail.com" (swap in a real
  postal address when available). The "not legal advice" disclaimer was removed (owner getting own legal review). STILL: set
  Resend env on Render for live complaint emails (optional — complaints save to `support_requests` regardless); lawyer review
  before payments. **Migration is `0014_compliance_support.sql`** (the spec said 0013, but 0013 is
  credits_billing) — `support_requests` + `consent_events`, RLS-on/no-policies (like 0008/0013), indexed; applied to
  **STAGING only** (`npm run migrate`) — **PROD NEEDS IT before the prod deploy** (`DATABASE_URL="$PROD_URL" npm run migrate`).
  - **Pages** (static, served at pretty URLs via `PAGE_ROUTES` in `server.ts`; NOT nav tabs — linked only from the home
    footer): `public/{security,privacy,terms,report-issue}.html` + shared `public/policy.css`. Routes: `/security` `/privacy`
    `/terms` `/report-issue` (+ `/complaint` `/grievance` → report-issue). "Last updated: 25 June 2026" + the not-legal-advice
    disclaimer on each. `TODO_CONTACT_ADDRESS` placeholder left in Terms (user fills). Forbidden words (company/Pvt Ltd/LLP/
    directors/corporate entity) verified absent; "incorporated"/"registered office" only in the N/A-negation + future-entity uses.
  - **Backend**: `src/lib/support.ts` (saveSupportRequest/saveConsent, **sha256-HASHED ip**, CONSENT_VERSION='2026-06-25',
    SUPPORT_CATEGORIES) · `src/lib/email.ts` (Resend via REST — no SDK dep; **graceful-optional**: complaint is ALWAYS stored
    in DB, email is best-effort + logs payload when `RESEND_API_KEY` unset, so nothing is dropped) · `POST /api/support/complaint`
    (Zod, **5/hr/IP** `supportLimiter`, 503 only if the DB save itself fails) · `POST /api/consent`. `.env.example` adds
    `RESEND_API_KEY`/`SUPPORT_FROM_EMAIL`/`SUPPORT_TO_EMAIL=findkailash@gmail.com` (all optional).
  - **Frontend**: home footer gains Security/Privacy/Terms/Report links (`#tab-home .foot-legal`); the auth PAGE signup mode
    gains a REQUIRED, never-pre-ticked "I agree to the Terms and acknowledge the Privacy Notice" checkbox (`#auth-consent`) →
    `logSignupConsent()` → `/api/consent`. (Existing `/api/community/report` flow untouched.)
  - **Verified locally (:5070):** tsc clean; all 6 routes 200; complaint valid→200+id / missing-consent→400 / bad-category→400;
    consent→200; rows in DB with `ip_hash` 64-char (hashed, not raw); email logs payload (no key); no new nav tabs; footer links
    render; consent checkbox shows only in signup + not pre-checked; browser form submit → success + reference id. Test rows cleaned.
  - **CHECKLIST.md** updated (legal pages PARTIAL/lawyer-review-TODO; complaint+consent DONE; company/GST = N/A for individual beta).
  - **TO RESUME / FINISH (next session):** (1) fill `TODO_CONTACT_ADDRESS` in `terms.html`; (2) run migration `0014` on the
    PROD DB (`PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-); DATABASE_URL="$PROD_URL" npm run migrate`) BEFORE any
    prod promotion (else `/api/support/complaint` 503s on prod); (3) then promote staging→prod (cherry-pick / `checkout
    origin/staging -- public src supabase` pattern); (4) optional: set `RESEND_API_KEY`/`SUPPORT_FROM_EMAIL` on Render for
    real complaint emails (without it, complaints still save to `support_requests`); (5) lawyer review before taking payments/scaling.
  - The "not legal advice" disclaimer was **REMOVED from all 4 pages per the owner's decision** (2026-06-26) — owner will get
    the pages legally reviewed themselves. (`.policy-disclaimer` CSS left in place but unused.)
- **✅ GOOGLE OAUTH ENABLED (2026-06-26) — on BOTH Supabase projects, verified working.** Enabled `external_google`
  on prod (`kdgtlbnlyscdldogxorb`) + staging (`ydgiysthvxhlfpzxyrmy`) via the Supabase **Management API**
  (`PATCH /v1/projects/{ref}/config/auth`, token was user-supplied, NOT persisted). Client ID
  `531095044572-693tek38p9v87qrsat8d4spglck1ppc6.apps.googleusercontent.com` (secret lives only in Supabase).
  Verified end-to-end: GoTrue `/auth/v1/settings` → `google:true` on both; the live prod auth page shows the
  "Continue with Google" button; and Supabase's `/auth/v1/authorize?provider=google` → Google **accepts** the
  redirect (`…supabase.co/auth/v1/callback` is in the Google client's Authorized redirect URIs — no mismatch).
  **APPLE = deferred** (needs the paid Apple Developer account + Services ID/.p8/JWT secret; button stays hidden
  until enabled — no code change needed then; the frontend gates buttons on GoTrue's enabled-providers list).
  - **🩹 SITE-URL FIX (2026-06-26):** after Google sign-in users were bounced to `http://localhost:3000/#access_token=…`
    (ERR_CONNECTION_REFUSED) — the projects still had Supabase's DEFAULT `site_url=http://localhost:3000` and an EMPTY
    `uri_allow_list`, so the OAuth redirect fell back to that dead default. Fixed via Management API `PATCH …/config/auth`:
    **staging** `site_url=https://agentic-learning-studio-1.onrender.com`, allow-list = staging + `localhost:5070`;
    **prod** `site_url=https://prathibhax.com`, allow-list = prathibhax.com + www + `agentic-learning-studio.onrender.com` +
    `localhost:5070` (all with `/**`). Not a custom-domain issue. (`oauthSignIn` sends `redirectTo=origin+"/"`; the client's
    default `detectSessionInUrl` picks up the `#access_token` on return — no code change needed.)
- **✅ ALL "BATCH 2 + SEO + OAuth-gating" WORK IS NOW ON STAGING AND PROD.** `origin/main 9292cb0` == `origin/staging
  d40544c` for `public/`+`src/` (byte-identical; verified `git diff`). Only un-promoted file = `scripts/qa.mjs`
  (a 6-line test-harness tweak, non-runtime). Prod = `agentic-learning-studio.onrender.com`, staging = `…-1.onrender.com`.
- **🆕 BATCH 2 — 3 bugs + 3 improvements (2026-06-26, on `staging` AND `main`/prod — promoted `9292cb0`):**
  - **Bug 1 — dark-mode blue text.** Artifact dark mode (`[data-theme="dark"]` in `tokens.ts`) never overrode `--accent`/
    `--accent-2`, so accent TEXT stayed dark-blue (low contrast). Fix: lift `--accent-2`→`#9db8ff` in the dark block +
    light overrides (`#7aa2ff`) for the `--accent` TEXT selectors (`a`,`.eyebrow`,`.deeper-toggle`,`.hx-see`,`.ov-covers li::before`).
    `--accent` itself stays saturated so filled chips/buttons keep readable white text. (App shell has no dark mode — artifact only.)
  - **Bug 2 — code syntax highlighting (VS Code Dark+).** `components.ts` now has a self-contained, language-agnostic
    single-pass tokenizer `highlightCode()` (no CDN/JS — the artifact is sandboxed); `codeBlock` wraps tokens in
    `<span class="tk-*">` (every token esc()'d → Copy still yields verbatim source). Token CSS in `tokens.ts`
    (`pre.code .tk-c/.tk-s/.tk-k/.tk-n/.tk-f/.tk-t`). Verified: keyword #569cd6, string #ce9178, number #b5cea8, fn #dcdcaa.
  - **Bug 3 — reading a lesson bounced to Overview when a WIP module finished.** Cause: `pollJob` (app.js) `reloadViewer()`s
    the iframe on each new `builtModules`, and the fresh render defaulted to overview. Fix = preserve position: runtime tracks
    `curMod` (set in `showPane`/`enterWorkbench`/`showOverview`), reports it in the `als-progress` postMessage; host stores
    `currentViewModule` + appends `?module=` in `reloadViewer`; `/api/artifact/:id` reads `?module=` → `renderArtifact`
    `opts.currentModuleId` → lesson-config → runtime restores that module on init instead of the overview. (Couldn't repro the
    live build-reload locally w/o spending a credit, but runtime JS is valid — 0 console errors — and the chain is wired end-to-end.)
  - **Imp 1 — Sign in/up is now a dedicated full PAGE** (`#tab-auth`, 50/50 split: product story left, form right) with
    **Google + Apple OAuth** (`sb.auth.signInWithOAuth`) + email/password. The modal (`#auth-overlay`) was removed; `openAuth()`
    now `switchTab("auth")` so every gated-action call site is unchanged; `closeAuth()` returns to Home. ⚠️ **OAuth needs the
    providers ENABLED in Supabase** (Auth→Providers) for staging AND prod projects — Google needs an OAuth client; Apple needs
    an Apple Developer Service ID + key. Until enabled, the buttons show a provider-not-enabled error (email/password works).
  - **Imp 2 — nav polish.** Credit pill is now borderless (no box, matches the nav) with a **graduation-cap** icon (was a star).
    The community share popup + name input were already enlarged in Batch 1 (`.share-card`/`.share-name`).
  - **Imp 3 —** configurator hero "What do you want to understand?" → **"What do you want to learn?"**.
  - **SEO refined with REAL DataforSEO data (done; on `staging` AND prod).** Creds now in `~/.claude/secrets/als-qa-creds` (working).
    US monthly volumes (KD): **what is agentic ai 33,100** · agentic ai (broad) 110,000/KD56 · agentic ai definition/define 14,800 ·
    **agentic ai vs generative ai 4,400/KD11** · **agentic ai course 3,600/KD9** · **agentic ai examples 1,600/KD10** ·
    **agentic ai frameworks 1,000/KD7** · how to build ai agents 1,600 · **ai learning platform 1,000/LOW-comp** · agentic ai
    certification 1,300 · **"interactive ai learning" only 10/mo** (was over-weighted in Batch-1 — now removed). Applied on the
    landing: title/meta/OG/Twitter now lead with "AI learning platform" + "agentic AI course"; kw-chips swapped to
    "Agentic AI course"/"AI learning platform"; hero sub reworded; **2 new FAQ Q&As + matching FAQPage schema** ("What is agentic
    AI?" → the 33k cluster; "How is agentic AI different from generative AI?" → 4,400/KD11) for the big informational + GEO win;
    SoftwareApplication gained a `keywords` field + platform-worded description. Verified: 1 H1, valid JSON-LD (7 FAQ Qs, all
    visible-matched), title 61 chars. **Winnable next targets (low KD): agentic-ai-vs-generative-ai, agentic-ai-examples,
    agentic-ai-frameworks, agentic-ai-course** — candidates for dedicated content pages later.
  - **Verified locally:** `tsc --noEmit` clean; `node --check public/app.js` OK; Playwright — auth page (50/50 + Google/Apple),
    dark-mode accent text light, code = VS Code Dark+, pill borderless, hero text. **Not run:** `npm run qa` (creds in
    `~/.claude/secrets/als-qa-creds`); the live Bug-3 build-reload (needs a paid generation).
- **🆕 3 FIXES (2026-06-26, on `staging` AND `main`/prod — cherry-picked `eef06e7`):**
  - **(1) Account = full PAGE at `/account`** (was the `#acct-overlay` MODAL). New `<section id="tab-account">` full-width
    panel (Profile card: name·email·Account ID(UUID)·plan·credits-remaining + Top-up; Usage card: 3 stat tiles
    lessons-generated·credits-spent·credits-purchased + member-since). `app.js`: `account` in `TAB_PANELS`; `openAccount()`
    → `gotoAccount()` does `switchTab('account')` + `history.pushState('/account')` + `loadAccount()`; `popstate` +
    `routeFromUrl()` (called from `applySession`) deep-link/refresh handling; `switchTab` resets URL→`/` when leaving account
    and never persists `account` to `als-toptab`. Server: **`GET /api/account`** (auth) → `getAccountSummary()` in
    `credits.ts` (credit_ledger spent/purchased + lessons count + getBalance + member-since); **`app.get('/account')` SPA
    fallback** serves index.html (none existed → a direct hit/refresh would 404). The old modal markup/CSS/handlers removed.
  - **(2) Community Share reward = 1 FREE LESSON** (was a 30%-off discount code). `community.ts shareLesson`:
    `addCredits(userId,1,{reason:'grant',planId:'community-share',lsOrderId:'share:<lessonId>'})` — idempotent per shared
    lesson + per-user `SHARE_REWARD_CAP=20`; returns `rewarded`. Discount-code minting + `discountCode()` removed (the
    `discount_codes` table is now unused but left in place; no migration needed). Server share route returns `rewarded`.
    UI: every "Share & save 30%" / "Community Share — 30% off" → "Community Share — 1 Free Lesson"; share-modal popup +
    name input ENLARGED (`.share-card`/`.share-name`); success popup repurposed to "1 free lesson added!" (`#code-sub`,
    dynamic on `rewarded`); `loadCredits()` refreshes the pill after a rewarded share. (`code-box`/`code-hint`/`code-copy` removed.)
  - **(3) Landing SEO** (via `seo-pro` skill; NOTE: the DataforSEO creds the task pointed at DON'T exist —
    `SEO Codex final/.../methodology.json` says "No live DataForSEO credential"; used Google Suggest for keyword grounding).
    Collapsed **2 H1s → 1** (home hero H1 kept, keyword-forward "Learn agentic AI…"; configurator `#hero-title` demoted to
    `<h2 class="hero-title">`, CSS selector broadened so it looks identical). New `<title>`/meta + canonical
    (`https://prathibhax.com/`) + robots meta + OG/Twitter + **JSON-LD `@graph`** (Organization·WebSite·SoftwareApplication·
    FAQPage mirroring the 5 visible Q&As). New **`public/robots.txt` + `public/sitemap.xml`** (served statically; sitemap
    Disallows `/api/`+`/account`). Hero copy enriched for "agentic-AI lessons / interactive AI learning".
  - **Verified:** `tsc --noEmit` clean; local :5070 — 1 `<h1>`, valid JSON-LD (4 types), title/meta/canonical present,
    `/robots.txt`+`/sitemap.xml`+`/account` 200, `/api/account` 401 gated; Playwright eyeball of the account page + share
    modal (0 console errors, correct layout/labels). **NOT run: `npm run qa`** (needs `QA_PASSWORD` — user has the staging
    test acct; run after the staging deploy). **Watch:** the preview tool launches `npm start` from the MAIN repo
    (`agentic-learning-studio`), not this worktree — verify the worktree server directly, not via `preview_start`.
- **🧪 QA PASS (2026-06-25, on staging+prod `main 71cf976`):** parameterized Playwright harness `scripts/qa.mjs`
  (`npm run qa`, env `QA_BASE_URL/QA_EMAIL/QA_PASSWORD`, no committed creds) — auth, rapid nav/state, credit pill,
  generation progress, no-console-errors/no-full-reload guards. 13/13 on staging. Fixes shipped this pass:
  (1) **sign-out resets the workspace → Home** (`resetWorkspace()` in app.js — was leaving the previous user's
  lesson on screen); (2) **`als-progress` source guard** (`e.source === viewerFrame.contentWindow` — stale iframe
  can't mis-attribute progress); (3) **central credit refresh** on focus/visibilitychange; (4) **`GET /api/jobs/active`**
  (exposes `jobs.ts activeJobs()`) merged into `loadDashboard` so a build continuing after a refresh still shows
  progress in My Lessons (light self-poll when no client poller is active). OPEN: lesson-click flicker
  (module→overview) — needs a fully-built lesson to repro; AbortController on loaders (low-impact); nested-control
  click-bubble has no explicit automated assertion yet.
  - **QA TEST ACCOUNTS (throwaway temp-mail, QA-only):** STAGING = `pojidov934@divahd.com`;
    PROD = `grz1q@web-library.net`. Passwords are deliberately NOT committed here (they'd live in git history) — pass
    them via `QA_EMAIL`/`QA_PASSWORD` env to `npm run qa`. The owner holds them; they're in the session prompt that set
    up this work. (Prod password ends in `@1989`, not `#1989`.)
- **🩹 GENERATION FIX (2026-06-25, on staging+prod) — capstone.prompt.** Overviews were FAILING ("Couldn't design
  an overview") on BOTH envs: the skeleton schema requires `synthesis.capstone.prompt`, but the model sometimes
  returns a `capstone` object without it; `coerceSkeleton` (nodes.ts) only defaulted a wholly-missing capstone, so
  a present-but-promptless one failed validation → no blueprint (after ~2 architect retries ≈ the 60s "hang").
  Fix: `coerceSkeleton` now ALWAYS fills `capstone.prompt`. Verified: a skeleton that failed now validates;
  staging overview ~49s. (Watch for OTHER required-but-omitted skeleton fields surfacing similarly.)
- **🐢 STAGING PERF (2026-06-25):** the **staging Render service is under-resourced** vs prod's Standard 2GB —
  `/healthz` ~2.2s, overview ~49s, and **module builds crawl (~1 module / ~7 min)** vs prod's whole build in
  3.5–6 min. NOT a code/stack problem (Anthropic key healthy, all 3 models 200 in ~1.5s). Action: bump the staging
  tier to match prod. Also: the local embedding model (Transformers.js/onnx) crashed with a `mutex lock failed`
  under repeated use locally — the one fragile, CPU-heavy piece (candidate to harden / move to a hosted embed API).
  **Langfuse "no traces" on staging = `LANGFUSE_*` env simply not set on staging Render** (benign; prod has them).
- **💳 BILLING / LESSON CREDITS (2026-06-25) — on STAGING + PROD (code `main dcb62f2`). Awaiting prod LS env.**
  Phase-1 "money path": per-user lesson credits gate `/api/build` (HTTP 402 when balance < 1;
  1 completed build = 1 credit; overview/preview stays free; every signed-in user gets 1 free credit). Lemon
  Squeezy hosted checkout via the Lemon.js overlay + signed webhook `/api/lemonsqueezy/webhook` (raw-body route
  mounted BEFORE `express.json`, HMAC-SHA256 verify, idempotent on `ls_order_id`). Prices + store currency come
  LIVE from LS via `GET /api/pricing` (no hardcoded USD; LS localizes the final charge per country at checkout).
  - Code: `src/lib/credits.ts` (lots model: `getBalance`/`ensureFreeGrant`/`addCredits`/`spendOne`) ·
    `src/lib/lemonsqueezy.ts` (checkout, webhook verify, `fetchPricing`) · routes `/api/credits|checkout|pricing`
    + webhook in `server.ts` · spend in `runBuildJob` (orchestrator.ts, BEFORE `job.status="done"`) ·
    front-end Pricing tab + nav credit pill + profile menu (`public/{index.html,app.js,styles.css}`).
  - **Migration `0013`** (`credit_lots` w/ 12-month `expires_at` + `credit_ledger`, RLS on) applied to **staging DB
    AND prod DB** (verified). LS env set on STAGING Render (test mode, verified end-to-end). **PROD Render still
    needs the LS env** (`LEMONSQUEEZY_API_KEY/_WEBHOOK_SECRET/_STORE_ID=416599/_TRIAL_VARIANT_ID/_PAYG_VARIANT_ID`
    + `APP_URL=https://prathibhax.com`) → until set, `billingEnabled=false` on prod (gate still works on the free
    credit; buying is off). Live webhook URL MUST be the **full path** `…/api/lemonsqueezy/webhook` (a bare-domain
    URL 404s "Cannot POST /" — that was the test-mode bug) and its signing secret must match the env secret.
  - **Verified on staging (test mode):** real LS purchase credited the buyer (idempotent webhook, valid sig). The
    checkout-404 was a pasted `#` in the store id (code now digit-sanitizes all LS ids).
  - **PENDING — Phase 2 (NOT built): discount codes + admin panel.** Admin-defined promo codes (e.g. `WB30` =
    30% off the $0.99/lesson) via an **apply-code box** on Pricing, managed in an **admin panel gated to
    `anandp.pareek6@gmail.com`** (env `ADMIN_EMAILS`). Plan: new `promo_codes` table mirrored to LS native
    discounts · `POST /api/discount/validate` · admin-gated `GET/POST/DELETE /api/admin/codes` + `/api/admin/me`
    probe · an admin tab in the UI shown only to that email. Credits stay = quantity (a discount changes the
    PRICE only, never the credit count). Full spec is in the 2026-06-25 session plan.
- **📦 DEPLOY STATUS (2026-06-23, updated EOD) — what's on PROD vs PENDING:**
  - **ON PROD** (`main` `ecb78cd` → prathibhax.com + prod Supabase `kdgtlbnlyscdldogxorb`):
    - **Wizbit UI** redesign.
    - **KB-curator service** + `documents.curator_change` flag + `kb_curator_runs` run-log (migrations **0010/0011/0012 on prod DB**). Cron NOT armed (needs only the Actions secrets).
    - **`kb/` corpus + `src/rag` pipeline + `kb-build/scripts` + IP/policy docs** on main. **RAG KB DATA: prod = 88 docs / 214 chunks** (backup `kb-build/backups/prod-2026-06-23T05-59-57-353Z.sql`).
    - **Knowledge-check Tier-A retention + Objective control + "Builder" rename** — cherry-picked to main (`97935e8`/`1b7395c`).
    - **Trainer rework (2026-06-23):** multi-tab workspace (≤5) + one-row My Lessons (`b2f3c84`) · horizontal **per-module-tabs** redesign — examples-below-with-"See details" popup + per-module check tab (`9bce078`) · **2-bar chrome consolidation** — Dark on bar 2, tabs as blocks below it (`ecb78cd`). Front-end/renderer only, no DB. ⚠ horizontal is **v1**: the ≤25%-empty FILL is a generation-side tuning item still PENDING (see below).
    - **Library v4-rich lessons (DB only):** per `05d2ab0` the 78 v4-rich lessons were seeded to **staging AND prod** DBs → prod users see v4-rich content. But the prod **git** (`main`) still has the OLD lesson JSONs — see PENDING #1.
  - **PENDING (NOT fully on prod):**
    1. **Library re-enrichment GIT source** — the 98 v4-rich `prebuilt/lessons/*.json` (+ `_exemplar`/`ENHANCE_SPEC`/`ENHANCED`/`scripts/validate-lesson.ts`) are on **staging** (merged `ebf4c2d`), **NOT on `main`**. Prod DB is already v4-rich, but main's JSONs are stale → **a future re-seed of prod from main would OVERWRITE v4-rich with old**. Reconcile: promote the lesson JSONs to main so git matches the DB.
    2. **Horizontal-fill generation tuning** — tune the generation prompt so horizontal lessons paginate to ≤25% empty per tab (concept padding + example-preview length + how many tabs). The renderer frame is shipped; content density is the lever.
    3. **Arm the KB-curator cron** — set repo Actions secrets (`DATABASE_URL` + `ANTHROPIC_API_KEY`); optional `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on prod Render.
  - **Git note:** staging and main diverged via worktree cherry-picks (KB-curator + the app features have DIFFERENT hashes but IDENTICAL content). Do NOT do a plain `staging→main` merge — **cherry-pick the real deltas** (that's how `b2f3c84`/`9bce078`/`ecb78cd` reached main).
- **KB enrichment — MLOps / LLMOps / AI-analytics + role-based course tracks (QUEUED Jun 2026 — do via a SEPARATE Codex run; another session owns the curator, do NOT touch `services/kb-curator` or curator code for this).** Additive KB content (NOT a rebuild): new docs + embeddings pushed to **staging Supabase ONLY** (`DATABASE_URL`=staging; do NOT truncate, do NOT touch prod). Method = the established Codex pattern: dedupe against the LIVE KB first (`documents.title`/`category`), then source-priority cascade (official docs → permissive OSS [MIT/Apache/BSD/CC-BY] → reputable blogs/arXiv), ORIGINAL prose only (no verbatim, ≤1 short attributed quote), `KB_IP_AUDIT.md` (🔴 dropped), Markdown+frontmatter (title/category/url/license/verdict/as_of_date), local bge-small embed via `npm run ingest`. New categories: `MLOps & production ML`, `LLMOps`, `AI analytics`, `Course`.
  - **Topics (skip any already covered):** MLOps overview + lifecycle (train→package→serve→monitor→retrain) · model packaging/containerization (Docker, runtime pinning) · serving & inference at scale (REST/gRPC, dynamic batching, latency↔throughput — cross-link existing vllm/litellm/ai_infrastructure_serving) · model+data versioning & registries (DVC/MLflow/lakeFS) · feature stores (Feast; when you don't need one) · CI/CD + Continuous Training + orchestration (Kubeflow/ZenML/Metaflow/Dagster/Airflow) · experiment tracking & reproducibility (MLflow/W&B) · production monitoring — data/concept drift, perf decay, alerting (Evidently/NannyML) · GPU/CPU config & cost (autoscaling, right-sizing, spot) · serving on K8s + when it's overkill (KServe/Seldon) · ML failure modes (silent degradation, training-serving skew, pipeline breakage, stale features; Hidden Technical Debt / Rules of ML / ML Test Score papers) · **LLMOps** (prompt/version mgmt, eval pipelines, RAG infra, token-cost/latency monitoring; cross-link langfuse/promptfoo) · **AI analytics** (NL-to-SQL, semantic layers, automated insights, forecasting, anomaly detection — dbt semantic layer/Vanna/Prophet).
  - **Course tracks (kind `Course`, original curriculum outlines: who-it's-for · prerequisites · ordered modules mapping to KB · capstone):** AI Product Manager · AI Solution Architect · AI Engineer · ML/MLOps Engineer · AI Data Analyst.
  - **Verify (staging):** retrieval smoke test on ~8 new queries; `count(*) chunks` before/after; report added-vs-skipped-as-dupe. Promote staging→prod only after user OK (same copy pattern as the library promote). The full Codex prompt + topic list lives in the chat the user has.
- **Library content enhancement (IN PROGRESS Jun 2026 — "the hook for new users"):** the 98 prebuilt
  lessons were authored on the OLD prompts and are pedagogically weak (no `mentalMap.structureType`, no
  node `orient` hooks, thin on failure-modes/verify-AI/recall). We're bringing them to the SAME bar a
  freshly-generated lesson hits. **The app Anthropic balance is EMPTY** (the pipeline route
  `rebuild-library.ts` 400s with "credit balance too low" — and that ALSO breaks live generation on
  prod until topped up). So we enhance via **agents** (a Workflow of subagents using the session model —
  ZERO app-API cost), editing each `prebuilt/lessons/<slug>.json` Blueprint in place, then `seed-library.ts`
  validates+renders+upserts. Invariant holds (agents emit Blueprint JSON, renderer makes HTML).
  - **Infra (committed-able, reusable):** `prebuilt/ENHANCE_SPEC.md` (the quality bar + 8 schema gates +
    per-lesson procedure — the agent brief), `scripts/validate-lesson.ts` (validates ONE file: Zod +
    validateBlueprint + render smoke-test; agents self-check with it), `prebuilt/_exemplar.json`
    (`the-agent-loop`, an already-enhanced lesson = the target; throwaway ref, don't seed), `prebuilt/ENHANCED.json`
    (durable progress manifest — `done[]` slugs).
  - **Workflow:** `enhance-library-batch` (run id `wf_4fcea690-47d`) — one agent per lesson, parallel,
    edit-in-place + self-validate loop. Persisted script under the session `workflows/scripts/`.
  - **Batch 1 (this session) = 20 slugs, 2 per category:** ai-vs-ml-vs-deep-learning,
    embeddings-learned-representations, prompt-engineering-foundations, tokenization-context-windows,
    what-is-rag, embeddings-vector-search, tool-use-action-boundaries, planning-and-reflection,
    crewai-role-based-agents, claude-tool-use-agent-patterns, ai-evaluation-foundations, llm-as-judge,
    image-generation-workflows, multimodal-prompting, deployment-patterns-ai-apps, model-gateways-litellm,
    hallucinations-grounding, guardrails-validators, build-document-qa-bot, build-tool-calling-chatbot.
  - **After a batch:** `npx tsx scripts/seed-library.ts` (to `.env`=STAGING; invalid files are skipped +
    logged to `prebuilt/INVALID.md`, old DB row kept) → add slugs to `prebuilt/ENHANCED.json` →
    `update prebuilt_lessons set content_version='v3-agent-2026-06' where slug = any(...)` → verify a few
    render → **promote staging→prod when the user approves** (copy `prebuilt_lessons` staging→prod, same as
    the KB copy pattern). `.env`/local repo currently point at STAGING (`ydgiysthvxhlfpzxyrmy`).
  - **STATUS (Jun 2026): ~96/98 enhanced once the Codex branch merges.**
    - Batch 1 = the 20 above, enhanced + **committed & pushed to `staging`** (`92fc18e`) + tagged
      `content_version='v3-agent-2026-06'` + in `prebuilt/ENHANCED.json done[]`. Plus the 2 prior v2.
    - **Codex batch = 76 lessons on branch `library-rich-codex`** (off staging), enhanced to the v4-rich bar,
      committed there (NOT yet merged/seeded). `git diff --name-only staging..library-rich-codex -- prebuilt/lessons`
      lists them. **Pending: review → merge to staging → seed → tag `v4-rich-2026-06`** (see the LIBRARY REVIEW
      prompt the user has). Prefer a clean **git worktree** for the merge so the uncommitted KB working-tree files
      don't ride along.
    - **2 still pending (skipped by Codex — were dirty):** `browser-computer-use-agents`, `multi-agent-orchestration`
      (currently uncommitted in the working tree — verify/finish + include them).
    - NOT promoted to prod yet (awaits user OK after staging review).
  - **⭐ RICHER BAR (v4-rich-2026-06) is now the standard** — after user feedback, `ENHANCE_SPEC.md` gained a
    "CONTENT RICHNESS" section: a concrete problem-statement anchor, a BIG fully-worked example (esp.
    beginner), real code examples, a case study, two framings per idea, substantial bodies. The hook must be
    genuinely rich, not just structurally sound. **Batch 1's 20 are at the LIGHTER v3-agent bar** (structure +
    hooks + a predict-then-reveal + failure/verify notes) — they likely want a rich top-up pass to v4-rich for
    uniform quality; user to decide after reviewing staging.
  - **RATE-LIMIT lesson (important):** a 20-wide agent fan-out tripped the SHARED model rate limit
    ("Server is temporarily limiting requests — not your usage limit"); 6 agents never started. **Throttle
    every enhancement workflow to ~3 concurrent** (loop slugs in chunks of 3, `parallel()` each chunk).
    Do NOT run multiple enhancement sessions in parallel — single-session, sequential, throttled.
  - **REMAINING: 78 lessons** (stale, NOT in `ENHANCED.json done[]`). Continue ONE session at a time at the
    v4-rich bar — see the self-contained continuation prompt the user was given (it selects the next ~12,
    enhances throttled, seeds, marks `v4-rich-2026-06`, and emits the next prompt). `scripts/validate-lesson.ts`
    + `scripts/_render-sample.ts` are the per-lesson check + eyeball tools.
- **RAG knowledge-base REBUILD (Codex, Jun 2026 — staging done, PROD PENDING):** Codex rebuilt the KB from a
  curated registry. New tooling in **`kb-build/scripts/`**: `sources.mjs` + `fetch_sources.mjs` (curated sources),
  `build_from_registry.mjs`, `audit_kb.mjs` (license/quality audit — expect docs:69, red:0, orange:0),
  `backup_kb.mjs` (dumps `chunks`+`documents` to `kb-build/backups/*.sql`), `replace_kb.mjs` (truncate+reingest;
  gated by `KB_ALLOW_DB_MUTATION=1` + `KB_STAGING_VERIFIED=1` + `KB_ENV_NAME`), `smoke_retrieve.ts` (retrieval check).
  KB content lives in **`kb/`** (10 category dirs + `kb/manifest.yaml`); provenance in **`KB_IP_AUDIT.md`** +
  **`KB_CONTENT_POLICY.md`**; `skipped.log` = excluded sources. `src/rag/{loaders,chunkers,ingest,retrieve}.ts`
  were updated for the new pipeline.
  - **STAGING KB: REPLACED from scratch (not appended) → 69 documents / 179 chunks.** Backup of the *prior* staging
    KB at `kb-build/backups/staging-2026-06-22T15-38-51-498Z.sql`. Verify: `audit_kb.mjs` + `smoke_retrieve.ts` (chunks=179).
  - **PROD KB: NOT touched** (still the older 39 docs / 380 chunks copied earlier). Migration = `backup_kb.mjs`
    on prod → `replace_kb.mjs` with the gates → `smoke_retrieve.ts` on prod. See the KB→PROD prompt the user has.
  - **Prod DB URL is in `.env` as `PROD_DATABASE_URL`** (prod ref `kdgtlbnlyscdldogxorb`, ap-southeast-2) so prod
    migrations don't have to prompt for it. Load it explicitly for the migration commands
    (`PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` then `DATABASE_URL="$PROD_URL" …`). The app +
    all default tooling still use `DATABASE_URL` (STAGING, ref `ydgiysthvxhlfpzxyrmy`) — **NEVER point the app's
    `DATABASE_URL` at prod.**
  - **UNCOMMITTED:** all of the above (`kb/`, `kb-build/`, `KB_*.md`, `src/rag/*`, `.gitignore`) is in the working
    tree, not committed — commit it (its own commit, separate from the library lessons) so it's durable.
  - **Known gotcha:** the ingest can exit nonzero from an ONNX native-teardown crash AFTER a successful run —
    verify by DB counts + smoke retrieval, not exit code.
- **KB CURATOR — daily GitHub Actions job (Jun 2026; PUSHED TO PROD `main` commit `d58084f`; cron PENDING only the Actions secrets):**
  - **Added/modified flag (migration `0011`):** `documents.curator_change` = `'added'` (new documents row) | `'modified'`
    (existing row updated) + `documents.curator_changed_at`. Stamped by `apply.ts` around `upsertSource` (existence
    check before; UPDATE after) — `src/rag/store.ts` untouched. **0010 + 0011 applied to BOTH staging AND prod DBs.**
    (New TOPICS still go to `kb/_pending` and aren't embedded, so DB writes are normally `modified`; `added` is set if/when
    a pending topic is later embedded.)
  - **Daily run-log (migration `0012`):** `kb_curator_runs` — ONE row per non-dry run (a heartbeat so a missing day shows):
    `started_at`, `ok`, `sources_polled`, `added`/`updated`/`skipped`/`dropped`, `chunks`, `items` jsonb (the docs it brought:
    `[{outcome,path,chunks}]`), `errors`, `dry_run`. Written by `writeRunLog` (apply.ts), called every run by index.ts even
    on 0 changes. Applied to staging + prod. **Daily view:** `select started_at, ok, sources_polled, added, updated, dropped,
    chunks, items from kb_curator_runs order by started_at desc;` (the existing per-run `kb_updates` audit row is kept too).
  A SEPARATE additive service (no web-app runtime code touched) that keeps the KB fresh automatically. Path
  **`services/kb-curator/`** (`index.ts` orchestrator + `detect`/`fetch`/`ipgate`/`synthesize`/`apply`/`report` +
  `types.ts` + `sources.yaml`). Run: **`npm run kb:curate -- [--since 24h] [--dry-run] [--only <id>]`**.
  - **What it does:** scans a FIXED license-vetted allowlist (`sources.yaml`, ~28 sources: github/rss/arxiv/sitemap)
    for ONLY last-24h changes (time-gated + content-hash vs `kb_sources.last_hash`), fetches (plain fetch →
    Playwright lazy → Firecrawl behind `KB_FETCHER=firecrawl`), IP/license-gates (`ipgate.ts`: MIT/Apache/BSD/CC-BY/
    official-docs allow; 🔴 non-permissive → DROPPED, never embedded, logged to `KB_IP_AUDIT.md`), synthesizes
    IP-clean notes (deterministic template; OPTIONAL Claude `ANTHROPIC_MODEL_HAIKU` when funded, token-capped),
    embeds LOCALLY (reuses `src/rag/embed` bge-small/384 + `src/rag/store` `upsertSource` — same `documents`/`chunks`/
    `kb_updates` schema), and upserts to `process.env.DATABASE_URL`. NEW topics → `kb/_pending/` (NOT auto-embedded).
  - **State table:** migration **`0010_kb_sources.sql`** (per-source `last_checked`/`last_hash`; RLS on). Applied to staging.
  - **Schedule:** `.github/workflows/kb-curate.yml` — cron `30 15 * * *` (15:30 UTC = **9 PM IST**) + `workflow_dispatch`;
    ubuntu/node20/`npm ci`; HF model cached (`actions/cache` key `hf-bge-small-v1`, `TRANSFORMERS_CACHE=.cache/huggingface`);
    **NO `NODE_EXTRA_CA_CERTS` in CI** (corp-MITM is local-only); secrets `DATABASE_URL`(→staging by default)/
    `ANTHROPIC_API_KEY`/`SLACK_WEBHOOK`?/`FIRECRAWL_API_KEY`? (`GITHUB_TOKEN` auto); concurrency guard; `timeout-minutes:30`;
    fails non-zero on any 🔴-IP item or DB error.
  - **GO-LIVE (user):** (1) set the repo **Actions secrets** (above); (2) **merge the workflow file to `main`** —
    GitHub cron ONLY fires from the default branch (first run = next 15:30 UTC; schedules auto-disable after 60d
    repo inactivity); (3) keep `DATABASE_URL`=staging until trusted, then flip to prod or add a weekly prod-promote.
  - **Verified on staging:** `tsc` clean; `0010` applied (`kb_sources`+RLS); `--dry-run --only langgraph` runs
    end-to-end writing NOTHING to the DB, correct frontmatter/license, and the IP gate drops a planted non-permissive
    fixture + exits non-zero. `package.json` adds `kb:curate` + `js-yaml`/`fast-xml-parser`/`playwright`.
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
