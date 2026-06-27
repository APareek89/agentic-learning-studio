# Staging Audit — 2026-06-27 (Wizbit / Agentic Learning Studio)
_Audited commit: origin/staging HEAD. Read-only audit; no code changed._

## Executive summary

1. **An unauthenticated, unmetered model-spend faucet exists.** `POST /api/module` (`src/server.ts:722`) has no `requireAuth`, no `heavyLimiter`, and no credit accounting. For any artifact with stub modules it calls `ensureModuleBuild()` (`src/server.ts:694`), which runs real ~16k-token Sonnet calls (`src/server.ts:705`) — **for free** (the credit is only charged in `runBuildJob`, `src/agent/orchestrator.ts:262`). Anyone who knows one artifact UUID (Library/Community slugs are effectively public) can drive unlimited paid generation at zero cost. There is a second, similar backdoor: `POST /api/learn` (`src/server.ts:536`) is authenticated but takes **no gen slot and no credit gate**.

2. **The whole system is pinned to exactly one Render instance, but `render.yaml` auto-deploys from staging on every push** (`render.yaml:16`). All coordination state — job progress, the concurrency counter, in-flight module dedupe, parsed uploads — lives only in process memory. Adding a second instance silently multiplies the Anthropic concurrency cap by N, duplicates paid Claude calls, and breaks job polling. A deploy mid-build orphans in-flight work.

3. **The `jobs` Map never gets pruned** (`src/lib/jobs.ts:40`) — every `/api/overview` and `/api/build` leaves a permanent entry (the sibling `skillgen.ts`/`handson.ts` maps both sweep; this one does not). On a 2GB instance that already holds a ~128MB ONNX model, this grows until OOM → restart → in-flight builds and uploads lost. This is the one finding that bites at *current* load.

4. **The credit-spend guarantee depends on the process surviving the entire build.** The single credit is charged only at the very end of `runBuildJob` (`src/agent/orchestrator.ts:261-267`), after modules are persisted. A restart/deploy in that window — or recovery via `/api/module` after a crash — delivers a full lesson **for free**. The charge is also not idempotent and not tied to an artifact id, so it can't be reconciled and a retry would double-charge.

5. **A real money bug: a build that produces zero modules still charges a credit.** `const fullSuccess = failCount === 0` (`src/agent/orchestrator.ts:261`) is `true` when the pending set is empty (re-run / double-click / retry on an already-complete lesson), so the user is charged for building nothing.

6. **No per-resource authorization.** `requireAuth` only proves *some* valid user exists (`src/server.ts:178`); endpoints acting on an `artifactId` do not check ownership. `POST /api/build` charges the artifact's stored owner, not the caller (`src/agent/orchestrator.ts:262`), so user A can spend user B's credit; `POST /api/ask/expand` lets any authed user edit any lesson.

7. **The lesson iframe sandbox is effectively disabled.** `sandbox="allow-scripts allow-same-origin …"` on a same-origin `src` (`public/index.html:754`) is not a sandbox — framed lesson scripts can reach `window.parent`, same-origin storage, and the authenticated API. CSP is off (`src/server.ts:77`). The public security page advertises isolation that does not exist.

8. **The DB connection skips TLS certificate validation in production** — `ssl: { rejectUnauthorized: false }` (`src/lib/db.ts:50`) — exposing the Render↔Supabase path to MITM. Supabase RLS is also fully bypassed (trust-the-server model), which makes every missing ownership check a cross-user read/write.

9. **Backups/PITR are undefined anywhere in the repo.** All durable state (lessons, credits, module cache) has exactly one home in Supabase Postgres, with no documented backup cadence, no PITR confirmation, and no restore drill. This is the single biggest unmitigated data-loss risk.

10. **Migrations are manual and untracked.** Render's deploy runs only `npm install` / `npm start` (`render.yaml:13-14`) — it never runs `npm run migrate`. Combined with auto-deploy, schema-dependent code can ship to prod before the schema exists. `migrate.mjs` re-runs every file every time (`scripts/migrate.mjs:39-42`) with no `schema_migrations` ledger and no per-file transaction.

---

## Generation pipeline map (input -> agents -> output -> user context)

The **live** flow is a two-stage, human-in-the-loop split. It does NOT use the compiled LangGraph (`src/agent/graph.ts`); the orchestrator calls node functions directly. The compiled graph is reachable only via the legacy SSE route `/api/learn` (see P1 "legacy graph backdoor").

### INPUT (entry points)

`POST /api/overview` (`src/server.ts:367`) and `POST /api/build` (`src/server.ts:405`) — both `requireAuth`, `heavyLimiter`, and take a gen slot (`acquireGenSlot`, cap 4, `src/lib/jobs.ts:46`).

User-provided fields enter at `/api/overview` (`src/server.ts:368-397`) and flow into `GenerateInput` (`src/agent/orchestrator.ts:33-48`):
- `prompt` (≤5000 chars, validated `src/server.ts:370-371`)
- `cards` → `{ level, depth, examples, density, visuals, syntax }`
- `lessonTypes`, `levels` (multi-select), `industry`, `buildGoal`, `objective`, `framework`, `readingMode`
- `uploadIds`, `referOnly`
- `userProfile` (loaded server-side from `getPreferences(user.id).profile` at `src/server.ts:376-377`: `role`/`aspiringRole`/`personalGoal`/`industry`)

`/api/build` takes only `artifactId`; it re-loads the persisted draft and its blueprint.

### AGENTS / NODES (live path, in order)

**Stage 1 — `runOverviewJob` (free preview):**

| # | Node | Model + tier | System prompt | Key inputs | Output | Failure / repair |
|---|------|-------------|---------------|-----------|--------|------------------|
| 1 | **profiler** (`src/agent/nodes.ts:110`) | `profilerLLM` = Sonnet, temp 0, structured output (`InferenceSchema`) | `PROFILER_SYSTEM` | `userPrompt` only (NOT cards/profile) | `topic`, `industry`, `buildGoal`, `level`, `depth`, `examples`, `learningGoal`, `lessonFocus`, `mustCover[]` → assembled into full `LearnerProfile` + `Intent` in code | `withOverloadRetry` (6 attempts, ~84s); throws bubble to orchestrator catch → job error |
| 1.5 | **retriever** (`src/agent/nodes.ts:224`) | none (RAG) | — | `topic + learningGoal + mustCover + userPrompt`; `uploadIds`, `referOnly` | `retrieved[]` (U# uploads first, then S# KB), `coverage` | both upload + KB retrieval wrapped in try/catch → degrade to model knowledge |
| 1.7 | **planner** (`src/agent/nodes.ts:381`) | `plannerLLM` = **Sonnet** temp 0.2, maxTokens 9000, RAW (not structured) | `PLANNER_SYSTEM` | profile + intent + sources | `plan` (structure only: modules/order/spine/structureType/glossary term list) parsed via `extractJsonObject` | on any throw → `plan = null` (graceful: architect plans+writes in one call) |
| 2 | **architect** (`src/agent/nodes.ts:429`) | `skeletonLLM` = Sonnet temp 0.3, maxTokens 16000, streaming, RAW | `SKELETON_SYSTEM` | profile, intent, sources, `state.plan`, `repairErrors`, `userProfile.personalGoal` | `Blueprint` skeleton via `coerceSkeleton` → `repairBlueprint` → `validateBlueprint`; **all modules forced to stub, blocks=[]** (`src/agent/nodes.ts:510-513`) | parse throw → `validation.ok=false` + reviseCount++ (one repair retry, `routeAfterArchitect`); orchestrator additionally re-runs architect once if `!blueprint` (`src/agent/orchestrator.ts:102`) |
| — | **registerArtifact** (overview) | — | — | blueprint → `renderArtifact(bp, {previewOnly:true})` | DRAFT (`OVERVIEW_DRAFT_KIND`), hidden from My Lessons | — |

**Stage 2 — `runBuildJob` (on approval):**

| # | Node | Model + tier | System prompt | Inputs | Output | Failure |
|---|------|-------------|---------------|--------|--------|---------|
| 3 | **runDeepDive** per module (`src/agent/nodes.ts:542`) | `moduleLLM` = Sonnet temp 0.3, maxTokens 16000, streaming, structured (`ModuleBlocksSchema`), `includeRaw` | `MODULE_SYSTEM` (**cache_control: ephemeral**, `src/agent/nodes.ts:587`) | module title/summary/objectives, full profile (`calibrationDirective`), `priorModules` (spaced retrieval), focused sources, glossary ids | fills `module.blocks` + `nodeMeta`; `loadState="full"`; `repairBlueprint`; conditional `repairDensity` | 6-attempt backoff loop (`src/agent/nodes.ts:632`); no blocks → `ok=false` → kept as stub, build continues (skip-and-continue) |
| 4 | **writeOverviewProse** (`src/agent/nodes.ts:731`) | `moduleLLM` (Sonnet), structured (`OverviewProseSchema`) | `OVERVIEW_PROSE_SYSTEM` | deferred glossary terms + module spine | fills empty `laymanDefinition`, `acronymExpansion`, synthesis (recap/buildOrder/checklist/capstone) | `withOverloadRetry` + `.catch → null`; runs in parallel with module bodies |
| — | **attachVisual** (`src/agent/orchestrator.ts:170`) | none (deterministic `retrieveVisual`) | — | topic + module title/summary | one curated SVG per module, max | try/catch — never fails a build |

**Build orchestration** (`src/agent/orchestrator.ts:240-252`): module 1 built alone first (warms the prompt cache), then `MODULE_CONCURRENCY=5` workers fan out + the prose task; persist serially in completion order (`persistChain`, `src/agent/orchestrator.ts:191-197`) → incremental render via `updateArtifact`. Credit charged **only on full success** (`failCount===0`, `src/agent/orchestrator.ts:261-264`).

### OUTPUT
`Blueprint → renderArtifact` (`src/render/index.ts:21`) → one self-contained HTML (inline CSS/JS/glossary). Drafts render `previewOnly`. Persisted to Postgres `lessons` (`src/lib/artifacts.ts`). Per-module fragments cached in `module_cache` keyed by `moduleCacheKey` (`src/lib/hash.ts:39`, combo-safe). On-demand stub builds via `POST /api/module` (202 + `ensureModuleBuild`, `src/server.ts:694`).

### USER CONTEXT FLOW
`LearnerProfile` is resolved once in the profiler with explicit precedence (selection > request-implied > profile-inferred > cautious default, `src/agent/nodes.ts:130-135`), stored authoritatively on `bp.learnerProfile`, and re-read by every later node. `calibrationDirective(level, density)` (`src/agent/calibration.ts:149`) injects the coupled level×density spec (scaffolding + per-sentence ceiling + GOLD example + `densityBuys`) into the architect and module prompts. The `module_cache` key reads the resolved `lessonTypes` off `bp.learnerProfile` (the post-profiler `finalLessonTypes`), so it is consistent with the resolved profile — but it omits `uploadIds`/`referOnly` (see P1 cache-key finding).

---

## Findings by severity

### P0 — blockers / security-critical / data-loss

**P0-1 — Unmetered model-spend faucet: unauthenticated `/api/module` + `ensureModuleBuild` synthesize lessons for free**
`src/server.ts:722` (`POST /api/module`, no `requireAuth`/`heavyLimiter`), `src/server.ts:694` (`ensureModuleBuild`), `src/server.ts:705` (~16k-token Sonnet call), `src/agent/orchestrator.ts:262` (credit charged only in `runBuildJob`, never here).
Issue: For any artifact with stub modules, this endpoint runs real paid Sonnet calls with no auth, no credit, and no global concurrency slot (it bypasses `MAX_CONCURRENT_GENERATIONS`, `src/lib/jobs.ts:46`). The dedupe key `artifactId:moduleId` (`src/server.ts:695`) lets an attacker fan out N concurrent builds across distinct module ids. Knowing/guessing one artifact UUID (Library/Community slugs are public) = an open faucet on model spend at zero cost. The unguessable-UUID rationale (`src/server.ts:671`) protects reads, not the cost asymmetry.
Fix: Add `heavyLimiter` + auth (or a signed token) to `/api/module`; only allow off-request synthesis when `hasActiveBuildForArtifact` is true OR behind a dedicated global token-bucket with a known $/hour ceiling; route `ensureModuleBuild` through `acquireGenSlot` (or a shared queue) so it counts against the global cap; charge or pre-pay before synthesis.

**P0-2 — Unauthenticated, CPU/disk-expensive `/api/upload` and `/api/upload-repo`**
`src/server.ts:914` (`/api/upload`, base64 ≤~35MB in a 40MB JSON body, `src/server.ts:132`/`:921`, local ONNX embedding), `src/server.ts:1106` (`/api/upload-repo`, `git clone` with 90s timeout/32MB buffer, ≤4MB/400 files, embeds them). Only guard is `heavyLimiter` (40/hr/IP, `src/server.ts:158`).
Issue: On a single 2GB instance, rotating IPs can saturate CPU (embedding) and fill `tmpdir`, a DoS against legitimate users mid-generation. Uploads accumulate forever in the in-memory `uploads` Map (`src/lib/uploads.ts:31`) with no TTL/eviction → unbounded memory leak → OOM.
Fix: Require auth (or a lightweight session token) before the expensive parse+embed; cap resident uploads with LRU + TTL; lower the per-IP cap; reject before allocating the temp file when over a global concurrency budget; move embedding off the request path if possible.

**P0-3 — `jobs` Map never deleted → unbounded memory growth → OOM → restart**
`src/lib/jobs.ts:40` (`const jobs = new Map()`). Compare `src/lib/skillgen.ts:190` and `src/lib/handson.ts:417`, which both sweep on a cutoff; the lesson `jobs` Map has no sweep/TTL/delete anywhere. `activeJobs()` (`src/lib/jobs.ts:70`) filters by a 30-min cutoff but never removes entries.
Issue: Every `/api/overview` and `/api/build` (`src/server.ts:388,419`) leaves a permanent entry. On a 2GB instance already holding the ~128MB ONNX model plus the upload Map and per-build blueprints, sustained traffic grows until OOM. OOM → restart → all in-flight build progress and credit-spend state lost (cascades into P0-4). This is the one finding that bites at *current* load, not just 10x.
Fix: Add the same lazy sweep used in `skillgen.ts`/`handson.ts` on each `createJob` (drop terminal entries older than ~30–60 min). Better: move job state to Postgres/Redis.

**P0-4 — Credit-spend guarantee depends on the process surviving the whole build; restart/recovery delivers free lessons; charge is non-idempotent**
`src/agent/orchestrator.ts:261-267` (charge fires only at the very end of `runBuildJob`, after `updateArtifact` persisted modules at `src/agent/orchestrator.ts:194`); `src/server.ts:694-720` (`ensureModuleBuild` recovery path has no credit logic); `src/lib/credits.ts:191-193` (`spendOne` writes a bare `-1` ledger row with no artifact/job id). Build wall-clock = sum of multiple ~16k-token Sonnet calls plus up to ~84s overload backoff each (`src/agent/llm.ts:104`). Deploy/SIGTERM at `src/server.ts:1273-1275`.
Issue: A deploy/restart (or OOM from P0-3) between "modules persisted" and `spendOne` leaves a fully/partially built lesson **uncharged**. The pollJob-404 recovery path then completes remaining modules via `ensureModuleBuild` **for free**. Conversely a restart after `spendOne` but mid-persist can charge for a partial lesson. Because the spend row carries no artifact id, it can't be reconciled, and any retry of `runBuildJob` on the same artifact would double-charge. With auto-deploy from staging (`render.yaml:16`), deploys land during active builds routinely → revenue leak + data-consistency loss on every deploy.
Fix: Persist a build-state row (status, modules built, charged-bool) with a UNIQUE constraint on `artifactId`; make charging idempotent and decoupled (charge-on-promote with refund-on-total-failure, or charge per-module-completion atomically); add `artifact_id` to the spend + ledger row; gate the charge on "no prior generation row for this artifact." Credit lots/ledger are already durable + idempotent — only the trigger lives in volatile memory.

**P0-5 — Credit charged for a build that produced ZERO modules (empty-pending edge)**
`src/agent/orchestrator.ts:161-267`. When every module is already built (re-run, double-click, retry, or `/api/build` on a completed `learning-artifact`), `pending=[]` → `successCount=0, failCount=0` → `const fullSuccess = failCount === 0` is **true** (`src/agent/orchestrator.ts:261`) → `spendOne` deducts a credit for building nothing. `/api/build` (`src/server.ts:405-422`) has no guard against rebuilding an already-complete lesson; the only gate is the balance check.
Issue: Real-money double-charge / charge-for-nothing on any re-run.
Fix: `const fullSuccess = pending.length > 0 && failCount === 0;`. Better: short-circuit at the top of `runBuildJob` when `pending.length === 0` and the artifact is already a lesson (mark done, return, no charge); optionally have `/api/build` reject already-built artifacts.

**P0-6 — Backups / PITR are undefined and unverified anywhere in the repo**
All durable state (lessons, credit lots/ledger, module cache) lives only in Supabase Postgres. No backup cadence, no PITR confirmation, no restore drill is documented. On Supabase Free tier, backups are limited and PITR is not included.
Issue: "Durable in Postgres" may mean "durable until the only copy is lost." This is the single biggest unmitigated data-loss risk.
Fix: Confirm the Supabase tier; enable PITR (target RPO ≤5 min); take weekly off-Supabase `pg_dump` of the irreplaceable tables; run a quarterly restore drill. See runbook.

### P1 — important

**P1-1 — No per-resource authorization; `/api/build` charges the wrong user**
`src/server.ts:178` (`requireAuth` only proves a valid user exists). Endpoints acting on an `artifactId` don't verify ownership:
- `POST /api/build` (`src/server.ts:405`) loads `getArtifact(artifactId)` and charges the artifact's stored `userId` (`src/agent/orchestrator.ts:262`), not the caller → user A can pass user B's draft id and spend **B's** credit (and promote B's draft).
- `POST /api/ask/expand` (`src/server.ts:832`) mutates any artifact's blueprint for any `artifactId` → any authed user can edit another user's lesson.
- `POST /api/rate` / `POST /api/progress` (`src/server.ts:334,352`) accept any `artifactId`/`lessonId` (lower impact).
Only `shareLesson` does an ownership check (`src/lib/community.ts:152`).
Fix: In `/api/build`, `/api/ask/expand` (and `/api/module` per P0-1), require `art.userId === req.user.id` before acting; charge the authenticated caller, never the stored owner.

**P1-2 — Legacy `/api/learn` graph is a divergent, planner-less, unmetered backdoor**
`src/agent/graph.ts:14-32` wires `profiler→retriever→architect→seedFirstModule→composer` with **no planner**; `seedFirstModule`/`composer` are used only here. `/api/learn` (`src/server.ts:536`) is mounted and `requireAuth` but takes **no gen slot** (bypasses `MAX_CONCURRENT_GENERATIONS`) and **no credit gate** (`composer` charges nothing). The architect always runs the slower plan+write fallback there (`state.plan === null`).
Issue: A free, uncapped full-lesson generation endpoint — an unmetered backdoor to the most expensive operation, plus ~150 lines of dead-but-live code implying a pipeline that no longer runs.
Fix: Delete `/api/learn` + the compiled graph + `seedFirstModule`/`composer`, or gate it behind `acquireGenSlot()` + credit checks and feed it through the planner.

**P1-3 — `module_cache` key omits `uploadIds`/`referOnly` → cross-user upload-grounded content leak**
`buildModuleCacheKey` (`src/server.ts:677`) / `moduleCacheKey` (`src/lib/hash.ts:39`) key on topic + profile but not on `uploadIds` (sorted) or `referOnly`.
Issue: Two lessons on the same topic+profile — one grounded in user A's uploaded doc, one not — produce the **same cache key**. A fragment built from A's upload can be served to user B (or a non-upload lesson) — upload-grounded content leak + wrong/stale bodies. Uploads also live in the process-global in-memory Map (`src/lib/uploads.ts:31`), so ids dangle after restart while the cache persists.
Fix: Add a stable hash of sorted `uploadIds` + `referOnly` to the cache key; consider skipping `module_cache` entirely for upload-grounded / `referOnly` modules.

**P1-4 — `runBuildJob` ⇄ `ensureModuleBuild` last-write-wins clobber of the blueprint row**
Both writers do read-modify-write of the whole blueprint: `runBuildJob → persist() → updateArtifact(... blueprint, html …)` (`src/agent/orchestrator.ts:194`) and `ensureModuleBuild → updateArtifact(...)` (`src/server.ts:713`). The only guard is `if (!hasActiveBuildForArtifact)` (`src/server.ts:752`), which is per-process and timing-racy. After a cache miss (post-restart/eviction) `ensureModuleBuild`'s `getArtifact` hydrates a **fresh** object from DB (`src/lib/artifacts.ts:108`), diverging from `runBuildJob`'s in-flight reference; the two then clobber each other's modules — a built module can be reverted to a stub, triggering a wasted Claude re-build or a built/stub flicker.
Fix: Make module persistence additive at the SQL level (`jsonb_set` on `blueprint->'modules'`), or write fragments only to `module_cache` and rebuild `html` from cache, or take a per-artifact in-process async mutex around all `updateArtifact` writes.

**P1-5 — Lesson iframe sandbox is effectively disabled; no CSP; advertised isolation absent**
`public/index.html:754` renders the lesson in an iframe with `sandbox="allow-scripts allow-same-origin allow-popups allow-downloads"` over a same-origin `src` (`/api/artifact/:id`). CSP is intentionally off (`helmet({ contentSecurityPolicy: false })`, `src/server.ts:77`).
Issue: `allow-scripts` + `allow-same-origin` together is not a sandbox — the framed lesson can script `window.parent`, read same-origin storage, and call the authenticated `/api/*` with the user's session. The renderer's HTML-escaping (`src/render/components.ts:18`, `src/render/index.ts:17`) is the real defense, so any XSS gap in the large LLM-fed renderer becomes full same-origin account compromise. The public security page advertises "sandboxed lessons" (`public/security.html:36`) — that isolation does not exist.
Fix: Serve artifacts from a separate origin and drop `allow-same-origin`, or render via `srcdoc` with `sandbox="allow-scripts"` only and relay progress/theme via `postMessage`; add a CSP allowlisting first-party scripts on the host page.

**P1-6 — DB connection skips TLS certificate validation in production**
`src/lib/db.ts:50` — `ssl: { rejectUnauthorized: false }`. The comment says "skip local CA setup," but this ships to prod.
Issue: A MITM on the Render↔Supabase path could intercept/alter all data and credentials. Compounds the RLS-bypass model (`src/lib/db.ts` header: "no row-level security … full access"), under which every missing ownership check is a cross-user read/write.
Fix: Use the Supabase CA (`ssl: { ca: ... }` / `sslmode=verify-full`) in prod; keep RLS-bypass but add an app-layer ownership guard helper used by every artifact/lesson mutation.

**P1-7 — Uploaded-doc grounding silently lost on restart-mid-build**
Recovery re-grounds via `art.uploadIds` (`src/server.ts:705`), but those ids point into the in-memory `uploads` Map (`src/lib/uploads.ts:31`), empty after restart. `retrieveFromUploads` returns `[]` (`src/lib/uploads.ts:104`) → remaining modules build **ungrounded**, with no error and no user-visible signal. Same for any second lesson generated from an upload after a restart.
Fix: Persist upload chunks + embeddings to a Postgres table keyed by upload id (mirror `module_cache`); at minimum surface "source no longer available" instead of silently degrading. (The chunks are already embedded for pgvector.)

**P1-8 — Migrations are NOT run on deploy and are untracked**
`render.yaml:13-14` — `buildCommand: npm install`, `startCommand: npm start`; nothing invokes `npm run migrate`. With auto-deploy from staging (`render.yaml:16`), schema-dependent code can ship before the schema exists (e.g. a missing column the instant it deploys). `scripts/migrate.mjs:39-42` re-runs **every** file on every invocation (relying entirely on `if not exists` idempotency), with no `schema_migrations` ledger; each file is one un-wrapped `client.query(sql)` (`scripts/migrate.mjs:42`), so a multi-statement file that fails halfway leaves a partial migration.
Fix: Add a `schema_migrations` tracking table, wrap each file in `BEGIN; … COMMIT;`, and run migrate in a Render preDeploy/`prestart` hook.

**P1-9 — `withOverloadRetry` double-stacks with the SDK's own `maxRetries: 4`**
`src/agent/llm.ts:63` sets `maxRetries: 4` on every client; `withOverloadRetry` (`src/agent/llm.ts:101-120`) adds 6 more attempts; `runDeepDive` has its own 6-attempt loop (`src/agent/nodes.ts:632`).
Issue: A sustained 529 does up to 4×6 = 24 underlying requests with two independent backoff schedules; the inner SDK backoff runs inside each outer attempt, so a stuck module hangs for minutes and (with concurrency 5) holds slots, starving new `/api/build` requests (which then 429 the user, `src/server.ts:418`). This undermines the very overload resilience the change was meant to add.
Fix: Set `maxRetries: 0` (or 1) on clients used under `withOverloadRetry`/the `runDeepDive` loop so there is exactly one backoff authority.

**P1-10 — Citation-id collision across modules corrupts the Sources list**
`src/agent/nodes.ts:562,570,681-684`. Each module's focused retrieval re-numbers sources from `S1`/`U1`; in `runBuildJob` they all write into the same `bp.citations` keyed by sid. Module 3's `S1` overwrites Module 1's `S1`, so a `[S1]` reference in Module 1's prose resolves to Module 3's source — wrong attribution, not cosmetic. Concurrent writes (concurrency 5, `src/agent/orchestrator.ts:186`) also mean `repairBlueprint(bp)` (`src/agent/nodes.ts:697`) can walk a sibling module's `blocks` mid-write (raising concurrency 3→5 widens the window).
Fix: Namespace per-module sids (e.g. `m{order}:S1`) before merging, or merge by content/url identity rather than positional sid; scope `repairBlueprint` to the single module just written, or serialize the post-write repair.

**P1-11 — Acronym/validation gate is never run on the built lesson**
`validateBlueprint` runs on the overview skeleton (architect) but not after the build. `writeOverviewProse` fills glossary definitions and `acronymExpansion` late (`src/agent/nodes.ts:766-771`), and the deterministic acronym policy (`expandAcronymsOnFirstUse`, set for non-advanced at `src/agent/nodes.ts:186`) is only enforced by `validateBlueprint`.
Issue: A beginner lesson can ship with an ALL-CAPS term whose `acronymExpansion` the model omitted, with nothing catching it post-build.
Fix: Run `validateBlueprint` (warnings-only is fine) after the build in `runBuildJob`, or deterministically backfill `acronymExpansion` for ALL-CAPS labels in `writeOverviewProse`/`repairBlueprint`.

**P1-12 — Empty glossary definitions on never-built drafts**
Glossary `laymanDefinition` is only filled during build by `writeOverviewProse` (`src/agent/nodes.ts:735-738`). A user who edits an overview ("Edit overview") and never builds keeps `laymanDefinition = ""` permanently; any consumer rendering glossary popovers on a draft shows empty definitions.
Fix: Ensure draft rendering hides/omits empty-definition popovers (verify in `src/render/components.ts`), or lazily fill on first draft open.

**P1-13 — Checkout/pricing/webhook responses leak upstream detail**
`/api/checkout` returns the raw Lemon Squeezy error `detail` to the client (`src/server.ts:248`); `/api/pricing` does the same (`src/server.ts:264`) — can expose store/variant/config internals. The code flags it: "TODO: hide `detail` once billing is stable."
Fix: Log detail server-side, return a generic message to the client.

### P2 — worth doing

**P2-1 — `fullSuccess` progress vs. credit signals disagree on partial builds**
`src/agent/orchestrator.ts:205-261`. `jl.builtModules++` (`src/agent/orchestrator.ts:218`) runs regardless of success, so `jl.percent` reaches 100% even when stubs remain, while the charge fires only on full success. The learner sees a "complete" lesson that is actually partial-and-free, then hits "Couldn't build this section" stubs.
Fix: Track `builtOk` separately from `attempted` for the percent.

**P2-2 — pg pool `max: 6` is undersized; no timeouts**
`src/lib/db.ts:48-52` — `max: 6`, comment "plenty for a single-user app" (now false). Per generation: serial persist chain (`src/agent/orchestrator.ts:191-197`), `Promise.all` `attachVisual` (`src/agent/orchestrator.ts:177`), overlapping `getPreferences`/`getArtifact`, and `spendOne`/`addCredits` each holding a dedicated client for a transaction (`src/lib/credits.ts:63,171`). With cap 4 plus normal API traffic, 6 connections exhaust → queries queue → `for update skip locked` spend can't get a connection and stalls. `idleTimeoutMillis`/`connectionTimeoutMillis` are unset → an exhausted pool waits forever.
Fix: Raise `max` to ~15–20 (env-driven), set idle/connection timeouts, and size against the Supabase pooler ceiling.

**P2-3 — Concurrency math vs. Anthropic limits**
`MAX_CONCURRENT_GENERATIONS=4` (`src/lib/jobs.ts:46`) × `MAX_MODULE_CONCURRENCY=5` (`src/agent/orchestrator.ts:186`) = up to 20 concurrent large Sonnet calls per instance, plus prose + per-module visuals + overview-stage calls. Under 429 backoff (stacked retries, P1-9) those 20 slots stay occupied ~84s each.
Fix: Gate on a global token/ITPM budget, not just a request count; consider a shared (Redis) queue so the cap is org-wide.

**P2-4 — Gen-slot covers only 3 of 4+ detached job types**
`acquireGenSlot` is taken by `/api/overview`, `/api/build`, `/api/skill/generate` (`src/server.ts:387,418,474`) but NOT `/api/hands-on/start` (`src/server.ts:982`), `ensureModuleBuild` (`src/server.ts:694`), or `/api/ask/expand` (`src/server.ts:832`). So the "global cap protects RAM + the bill" invariant (`src/lib/jobs.ts:42`) is leaky — these run outside the cap.
Fix: Route all detached Claude-calling work through the same slot accounting (or a shared queue).

**P2-5 — `module_cache` table grows without eviction**
`ensureModuleBuild`/`/api/module` upsert into `module_cache` keyed by content hash (`src/server.ts:709,739`) with no TTL/eviction; profile is part of the key (`src/server.ts:679-683`) so keys fan out per learner-profile-variant. Grows monotonically.
Fix: Add `created_at` + periodic eviction of stale rows, or an LRU cap.

**P2-6 — In-memory upload store is single-instance & non-durable**
`addUpload`/`addRepoUpload` keep parsed+embedded docs in process memory (`src/lib/uploads.ts`). On restart or a second instance, `uploadIds` resolve to nothing → grounding silently drops (also see P1-7).
Fix: Persist uploads (already chunked/embedded) to Postgres + pgvector keyed by id.

**P2-7 — 202-poll loop storm hits the undersized pool**
`/api/module` returns `202 {building:true}` (`src/server.ts:753`) and the iframe polls; each in-progress module across every open tab generates a steady poll stream hitting `getArtifact` (a DB read) + `hasActiveBuildForArtifact` (an O(jobs) scan, `src/lib/jobs.ts:82`) per call. `apiLimiter` is 600/15min/IP (`src/server.ts:161`); `/api/module` is unauthenticated so poll volume isn't bounded by sign-in. The linear scan degrades as the never-pruned Map (P0-3) grows.
Fix: Add exponential backoff / max-poll cap on the client pump; return `Retry-After`; cache `getArtifact` briefly; replace the O(jobs) scan with a `Set<artifactId>` index.

**P2-8 — Prompt-cache 5-min TTL won't survive load**
The build warms `MODULE_SYSTEM` by building module 1 alone, then fans out (`src/agent/orchestrator.ts:236-250`); the `cache_control: ephemeral` TTL is 5 min from last use. When the cap is saturated or a module rides out >5 min of 429 backoff, fan-out/on-demand `/api/module` builds are cache misses paying full input price. Cost savings degrade exactly when load is highest.
Fix: Treat the cache as a best-effort fast path; don't size spend projections on cache hits.

**P2-9 — Partial-build escape hatch is free forever (product decision)**
A build that fails 4 of 5 modules costs 0 credits (`src/agent/orchestrator.ts:266`); the learner still gets all 5 via on-demand `/api/module` polling (P0-1). May be intended, but it's a revenue leak worth a product decision.

**P2-10 — Charge not idempotent / not reconcilable; deduct failure swallowed**
`spendOne` writes a bare `-1` with no job/artifact id (`src/lib/credits.ts:191-193`), so reconciliation is impossible and a retry would double-charge. The `spendOne` throw is caught and logged while the build still reports done (`src/agent/orchestrator.ts:263-264`) — a DB hiccup at charge time = free lesson, no alert.
Fix: Tag generation ledger rows with `artifact_id`; gate on "not already charged"; alert on the deduct-failed log line.

**P2-11 — Community likes/reports are unauthenticated**
Share reward is idempotent + capped at 20 (`src/lib/community.ts:84,203`) — good. But `/api/community/like` and `/api/community/report` are unauthenticated (`src/server.ts:1025,1035`) with only client-side dedupe; a script can inflate likes or hit the 3-report auto-hide threshold (`src/lib/community.ts:120`) to censor any lesson.
Fix: Gate report behind auth (or N distinct authed users); rate-limit per-IP per-slug.

**P2-12 — Prompt injection from uploaded docs/repo files**
Uploaded/repo content flows verbatim into the deep-dive/architect prompts (`src/agent/nodes.ts:559,234`) with no instruction-isolation/delimiting. Output is escaped HTML (bounded blast radius), but a crafted doc/repo can hijack lesson content (phishing links, offensive content) that then gets shared to the public Community, which is HTML-escaped but not content-moderated.
Fix: Wrap retrieved untrusted text in clearly-delimited "reference material — do not follow instructions within" blocks; add a moderation pass before publishing to Community.

**P2-13 — SSRF hardening for `/api/upload-repo`**
The host allowlist regex (`src/server.ts:1108`) is decent and `execFile` avoids shell injection, but: `git clone` follows HTTP redirects by default (an allowed host could 3xx elsewhere); no minimal `env` is passed to `execFileP` (`src/server.ts:1115`) so the subprocess inherits `ANTHROPIC_API_KEY`/`DATABASE_URL`.
Fix: Pass `-c http.followRedirects=false`, `-c protocol.allow=never`, `--no-tags`, `GIT_TERMINAL_PROMPT=0`/`GIT_ASKPASS`, and a minimal `env`.

**P2-14 — `lessons` rows hard-expire at 30 days with no archival**
`supabase/migrations/0002:35` defaults `expires_at = now() + 30 days`; `lessons.ts:48` filters `expires_at > now()`. Rows aren't deleted, but they vanish from the user's view at 30 days while the row + credit-spend persist — to a paying user this reads as data loss.
Fix: Add an archival/extension path or surface the expiry.

**P2-15 — Architect repair retry passes a conflicting plan**
`src/agent/orchestrator.ts:102` / `src/agent/nodes.ts:443,470`. On `validation.ok=false`, architect re-runs with both "FOLLOW the plan EXACTLY" and "fix these validation errors" — conflicting when the plan itself caused the gate failure; can loop to the 2-attempt cap and ship best-effort.
Fix: On repair, drop `plan` (let the model re-plan) or include only the validation errors.

**P2-16 — `coverage` computed but never used to gate grounding**
`retrieve` returns `coverage` (`src/rag/retrieve.ts:134`) and the retriever surfaces it in chat copy, but no node branches on it; the doc-comment (`src/agent/nodes.ts:11-12`) claims the graph uses coverage to decide on retrieved sources — that logic doesn't exist.
Fix: Implement a coverage threshold (label weak sources in the prompt) or correct the stale comment.

**P2-17 — `repairDensity` re-measures everything but only repairs `body` blocks**
`src/agent/density.ts:79-100`. `measureModule`/`blockProse` (`src/agent/density.ts:27-40`) also pull prose from `codeExample.explain` and `walkthrough.steps[].detail`, but the repair only rewrites `body` — so an over-ceiling sentence in those block types triggers the extra Sonnet call but is never fixed (a wasted LLM call).
Fix: Either include walkthrough/codeExample bodies in the repair payload, or exclude them from the trigger measurement.

**P2-18 — Cache warm-up races the prose task**
`src/agent/orchestrator.ts:227-234,240-250`. `proseTask` starts concurrently with the module-1 warm-up build and uses `OVERVIEW_PROSE_SYSTEM` (not the cached `MODULE_SYSTEM` prefix, `src/agent/nodes.ts:743`), so it's a cache miss racing the warm-up, partially defeating the "lighter on the rate limit" goal.
Fix: Start `proseTask` after the warm-up await.

**P2-19 — `ensureModuleBuild` ⇄ `runBuildJob` duplicate-build window**
`hasActiveBuildForArtifact` (`src/lib/jobs.ts:81`) only returns true once `job.lessons[0].artifactId` is set (after status flips at `src/agent/orchestrator.ts:153-155`); a poll in the `createJob`→running window kicks a duplicate `ensureModuleBuild`. Both upsert the same `module_cache` key (idempotent) so it's wasteful, not corrupting.
Fix: Set `job.lessons[0].artifactId` before the status flip, or dedupe by artifactId regardless of stub.

**P2-20 — Webhook signature & order-item edge cases**
`src/lib/lemonsqueezy.ts:202` verifies HMAC over the raw body with `timingSafeEqual` — good. Residual: a non-hex `signature` is silently dropped by `Buffer.from(sig,"hex")` (safe but worth an explicit hex check); `lessonsForOrder` reads only `first_order_item.quantity` (`src/lib/lemonsqueezy.ts:243`) — fine for single-line checkouts but add a guard against multi-line orders.

**P2-21 — Unbounded in-memory maps cause slow OOM**
`artifacts.cache` (`src/lib/artifacts.ts:46`, comment claims "LRU-ish" but there is no eviction), `jobs` (P0-3), and `uploads` (`src/lib/uploads.ts:31`) all grow without eviction. On a 2GB instance with the model resident, a long-lived instance OOM-restarts → triggers all the restart-mid-build paths.
Fix: Cap the maps (true LRU) + TTL-evict the jobs Map.

**P2-22 — DB-outage path runs free + ephemeral with no signal**
The app is graceful-optional on DB (`src/lib/db.ts`): during an outage it keeps generating but persists nothing and charges nothing; everything created is lost on restart and free.
Fix: Add a health-gate that 503s `/api/build` when `dbEnabled()` is true but the pool is unreachable.

### P3 — nits

- **P3-1 — Dead code: compiled graph + nodes.** `src/agent/graph.ts` (entire), `seedFirstModule` (`src/agent/nodes.ts:790-807`), `composer` (`src/agent/nodes.ts:812-855`) are unused by the live flow; `routeAfterArchitect` retry logic is duplicated between graph and orchestrator (divergence risk). Delete or document. (Overlaps P1-2.)
- **P3-2 — Stale model/tier comments.** `src/agent/llm.ts:8-12,80-86` and `src/agent/nodes.ts:38-52` still describe the planner as Opus and a "Critic" tier that no longer exist (planner is Sonnet, `src/agent/nodes.ts:53`); `state.ts` doc omits retriever/planner. Documentation drift.
- **P3-3 — `coerceSkeleton` is `any`-typed and `stripNulls` is fragile.** `src/agent/nodes.ts:297-376` — `stripNulls` mutates in place and doesn't consistently reattach filtered nested arrays; works today only because top-level fields are re-normalized. Make `stripNulls` purely functional and type input as `unknown`.
- **P3-4 — Cache telemetry field path may be wrong.** `src/agent/nodes.ts:638-641` reads `response_metadata?.usage` for `cache_read_input_tokens`; depending on `@langchain/anthropic` version this may live under `usage_metadata`. If wrong, it silently logs `cache_read=0` forever — the very mechanism meant to verify caching works. Confirm against the installed SDK version.
- **P3-5 — `releaseGenSlot` has no double-release guard.** `src/lib/jobs.ts:55` only floors at 0; an extra release would silently let an extra job past the cap. No double-release path exists today; consider a one-shot release handle.
- **P3-6 — Duplicated backoff constants/regexes.** `src/agent/nodes.ts:651` vs `src/agent/llm.ts:114` — near-identical `OVERLOAD_BACKOFF_MS` arrays and `isOverloadOrRate` regexes; consolidate to prevent drift.
- **P3-7 — `architectUserPrompt` embeds `JSON.stringify(args.plan)` raw, uncapped** (`src/agent/prompts.ts:443`) — a verbose plan inflates the second-most-expensive call's input tokens. Trim/assert plan size.
- **P3-8 — CORS allows null-origin with credentials.** `src/server.ts:90-91` allows requests with no Origin and `credentials:true`; moot under bearer-token auth, but revisit before migrating to cookie sessions.
- **P3-9 — Minor defensive/cosmetic.** `lessonPercent` 0-module guard (`src/lib/jobs.ts:93`, unreachable via schema `.min(1)`); dead `?.`/`??` on non-optional `userPrompt` (`src/agent/orchestrator.ts:62`); `readingMinutes` counts stub summaries (`src/render/components.ts:294`); density "median" uses upper-middle element (`src/agent/density.ts:59`, logging only); `showPane(undefined)` safe-returns in preview (`src/render/runtime.ts:516`).

---

## Scalability — what breaks at scale

The architecture is correct **for exactly one Render instance and a process that never restarts mid-build**. Both assumptions are false in production: `render.yaml:16` auto-deploys from staging on every push, and the process also restarts on OOM and Render recycling. Every coordination primitive lives on one process's heap. Treat `numInstances: 1` as a hard invariant until the items below move to a shared store; adding a second instance today multiplies the Anthropic cap, duplicates paid Claude calls, and breaks job polling.

**Order to do it:**

1. **Ship the `jobs` Map sweep now (P0-3).** Prevents OOM at *current* load — copy the lazy cutoff sweep already in `src/lib/skillgen.ts:190` / `src/lib/handson.ts:417`. Lowest effort, highest immediate payoff.
2. **Make the build→charge idempotent and decoupled (P0-4/P0-5).** Persist a build-state row with a UNIQUE constraint on `artifactId`; charge-on-promote with refund-on-total-failure; add `artifact_id` to the spend. Stops revenue leak on every deploy.
3. **Raise the pg pool + add timeouts (P2-2).** `max` ~15–20 env-driven, set idle/connection timeouts, size against the Supabase pooler ceiling.
4. **Then, before any second instance, move these to a shared store:**

| State | Current location | Why it breaks at >1 instance / on restart | Move to |
|---|---|---|---|
| Job progress (`jobs` Map) | `src/lib/jobs.ts:40` | poll routed to wrong instance → 404; lost on restart; never pruned → OOM | Postgres `gen_jobs` table (or Redis hash) |
| Generation concurrency counter (`activeGenerations`) | `src/lib/jobs.ts:47` | per-instance → real cap = N×4, blows the Anthropic budget | Redis counter / distributed semaphore |
| In-flight module dedupe (`moduleBuildsInFlight`) | `src/server.ts:687` | duplicate synthesis + cache-write race across instances | Redis SET w/ TTL, or a Postgres advisory lock on `artifactId:moduleId` |
| Build→charge trigger | implicit in `runBuildJob` | restart between persist and `spendOne` → free or double-charged lessons | Postgres build-state row + idempotent charge (UNIQUE on `artifactId`) |
| Uploaded-doc store | in-memory (`src/lib/uploads.ts`) | `uploadIds` dangle after restart / on other instance | Postgres + pgvector (already embedded) |

5. **Route all detached Claude work through the shared slot/queue (P2-4):** `ensureModuleBuild`, `/api/hands-on/start`, `/api/ask/expand`, and `/api/learn` (or delete `/api/learn`, P1-2). Gate on a global token/ITPM budget, not a request count (P2-3).
6. **Tame the poll storm (P2-7):** client backoff + `Retry-After`, brief `getArtifact` cache, and replace `hasActiveBuildForArtifact`'s O(jobs) scan with a `Set<artifactId>` index.
7. **For scale-out, enable the optional disk** (`render.yaml:46`) so the ~128MB ONNX model isn't re-downloaded per cold start (`render.yaml:5`).

Already durable and safe (no change needed): credit lots + ledger (`src/lib/credits.ts`, transactional, FIFO `for update skip locked`, idempotent via `ls_order_id`), artifacts/lessons, and `module_cache` content (correctness-wise; growth aside).

---

## Operational runbook — keep it running + avoid data loss

### TOP data-loss / integrity risks (RANKED, with mitigations)

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | **Supabase backups/PITR unverified** — all durable state has one home, backup posture undefined (P0-6) | **P0** | Confirm Supabase tier supports daily backups + PITR; enable PITR (RPO ≤5 min); weekly off-Supabase `pg_dump` of `lessons`/`credit_lots`/`credit_ledger`/`module_cache`; quarterly restore drill |
| 2 | **`jobs` Map OOM → restart cascade** (P0-3) | **P0** | Lazy sweep on `createJob` (copy `skillgen.ts`/`handson.ts`); then move job state to Postgres/Redis |
| 3 | **Restart-recovered builds finish free; charge non-idempotent** (P0-4) | **P0/P1** | Build-state row + UNIQUE on `artifactId`; charge-on-promote + refund-on-total-fail; add `artifact_id` to the spend |
| 4 | **Zero-module build still charges** (P0-5) | **P0** | `fullSuccess = pending.length > 0 && failCount === 0`; reject already-built artifacts in `/api/build` |
| 5 | **Migrations manual + auto-deploy → schema/code skew** (P1-8) | **P1** | `schema_migrations` table; wrap files in txns; run migrate in a Render preDeploy hook |
| 6 | **`runBuildJob` ⇄ `ensureModuleBuild` last-write-wins clobber** (P1-4) | **P1** | Per-artifact write mutex, or additive `jsonb_set` per module / fragments-only-to-`module_cache` |
| 7 | **Uploaded-doc grounding silently lost on restart** (P1-7) | **P1** | Persist upload chunks+embeddings to Postgres; surface "source unavailable" instead of degrading |
| 8 | **Charge not reconcilable / deduct failure swallowed** (P2-10) | **P2** | Tag ledger rows with `artifact_id`; gate on "not already charged"; alert on the deduct-failed log line |
| 9 | **Unbounded in-memory maps → OOM** (P2-21) | **P2** | True LRU eviction + TTL on the jobs/uploads/artifacts maps |

### Backups / PITR
- Verify the Supabase project tier; if Free, upgrade to Pro for daily backups + 7-day PITR — "durable in Postgres" is meaningless without it.
- Enable PITR; record RPO (target ≤5 min) and RTO.
- Weekly `pg_dump` of `lessons`, `credit_lots`, `credit_ledger`, `module_cache` to off-Supabase storage (the irreplaceable tables; KB/`chunks` are re-ingestable).
- Quarterly restore drill into a scratch project; confirm a lesson + credit balance round-trips.

### Monitoring / alerting
- Alert on log lines: `[runBuildJob] credit deduct failed` (`src/agent/orchestrator.ts:264`), `[artifacts] persist failed` / `update failed` (`src/lib/artifacts.ts:86,132`), `[ensureModuleBuild]` errors (`src/server.ts:715`).
- Alert on every Render instance restart/OOM (each drops all in-flight jobs + uploads).
- Daily reconciliation query: count `lessons` with `kind='learning-artifact'` per user vs. count of `delta=-1, reason='generation'` ledger rows — divergence = free builds (the P0-4 leak). (Becomes tractable once P2-10 tags spends with `artifact_id`.)
- Track pg connection-pool saturation (`max:6`, `src/lib/db.ts:51`) — exhaustion blocks `spendOne`/persist.
- Watch model-spend $/hour for the P0-1 faucet until `/api/module` is gated.

### Restart safety (current behavior to rely on)
- Lessons + built modules + credits survive restart (durable). In-flight job tracking does not — the pollJob-404 path (`public/app.js:1504`) + on-demand `/api/module` finish the rest. This works **except**: uploads-grounded lessons degrade silently (P1-7), and the recovered build is uncharged (P0-4).
- After any deploy that touches `supabase/migrations/`, **manually run `npm run migrate` against the prod `DATABASE_URL` before relying on the new code** (until P1-8 is fixed).

### Incident response
- "Lesson shows stubs forever after deploy": confirm `/api/artifact/:id` returns the persisted blueprint; the runtime should re-kick `/api/module`. If a module won't build, check the clobber race (P1-4) — two writers may be reverting it; a restart clears in-flight state.
- "User charged but no lesson" / "lesson but no charge": reconcile `credit_ledger` (not yet tied to artifact id — fix P2-10 to make this tractable).
- "Out of credits but I paid": check `credit_lots` for the `ls_order_id`; webhook idempotency means a missing lot = the webhook never arrived, not a double-spend.
- DB outage: the app keeps generating but persists nothing and charges nothing (P2-22) — everything created during the outage is lost on restart and free. Add a health-gate that 503s `/api/build` when the pool is unreachable.

### Secrets posture — OK
`.env` is gitignored (`.gitignore` has `.env`, `.env.*`); only `.env.example` is tracked. `render.yaml` uses `sync:false` for all secrets (`render.yaml:23-43`). No API keys are logged or returned (boot log only prints "set/MISSING", `src/server.ts:1248`). The Supabase anon key is correctly the only key sent to the browser (`src/server.ts:198`).
