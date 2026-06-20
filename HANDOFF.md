# HANDOFF — Agentic Learning Studio

Last updated: 2026-06-20 (Phase 3/4). Read this first, then `DESIGN_SPEC.md` and
`START_HERE.md`. Companion memory: `~/.claude/projects/-Users-anandpareek-Documents/memory/agentic-learning-studio-project.md`.

---

## ⚡ CURRENT STATE — START HERE (2026-06-20, Phase 4b — proofreader + Opus hybrid)

On branch **`hybrid-opus-skeleton-and-proofreader`** (not yet merged to `main` — review/merge to deploy):

- **Proofreader (a 2nd LLM layer).** `proofreadModule()` (`src/agent/nodes.ts`) runs at the end of
  `runDeepDive` for EVERY built module: a cheap Sonnet critic (`CRITIC_SYSTEM`) reviews the module for
  **MAJOR issues only** (accuracy / coverage / quality) and stays silent otherwise (empty list is the
  normal result). On a hit it logs the issues and runs **ONE repair pass escalated to Opus 4.8**
  (the "Critic-fail → opus escalation"), re-applying the quiz gate + density + `repairBlueprint`.
  Bounded (1 critic + ≤1 repair per module), never blocks on its own failure, and is a no-op when
  `LESSON_PROOFREAD=off`. Proven with `scripts/test-proofread.ts`: a deliberately-wrong "RAG fine-tunes
  the model at query time" module → critic flagged 2 accuracy issues → Opus rewrote it correctly.
- **Cost-controlled Opus hybrid.** The ONE reasoning-heavy step — the architect **skeleton + structure
  classification** (both inside `SKELETON_SYSTEM`) — now runs on **`claude-opus-4-8`** (`skeletonLLM`,
  `nodes.ts`). Everything else (profiler, the ~5 module builds via `moduleLLM`, density-repair, glossary)
  stays on Sonnet/Haiku, so the bulk of tokens stay cheap (~10–15% cost bump, not ~2×). Optional next
  lever noted in-code: `thinking:{type:"adaptive"}` (left off — raises cost/latency).
- **Opus-4.8 `temperature` gotcha fixed** in `makeLLM` (`src/agent/llm.ts`): Opus 4.8 / Opus-4.7+/Fable
  REJECT an explicit `temperature` with a 400 (same class as the `top_p:-1` bug). The factory now drops
  `temperature` from the request for those models (sets it `undefined` on the instance) — covers BOTH the
  skeleton call and the critic's opus-repair escalation. Verified: `makeLLM("opus")` → model
  `claude-opus-4-8`, `temperature: undefined`; `makeLLM("sonnet")` → `claude-sonnet-4-6`, temp kept.
- **Verified:** `npx tsc --noEmit` clean; `scripts/test-structure.ts` → skeleton hits Opus with no 400 and
  still classifies procedural / conceptual / comparative with correct ordered nodes; `scripts/test-proofread.ts`
  → critic+opus-repair fixes a factual error. Module builds confirmed still on `claude-sonnet-4-6`.

---

## ⚡ CURRENT STATE — (2026-06-20, Phase 4 — 4 fixes landed)

Latest session shipped 4 changes (tsc clean; verified in-browser via Playwright on :5070; pushed to `main`):

1. **Sign-up profile fills GAPS, never overrides the subject.** `profiler()` (`src/agent/nodes.ts`)
   now resolves level + industry by explicit precedence — **selection > request-implied >
   profile-inferred > cautious default**. New `inferLevelFromRole()` reads the saved role ONLY as a
   gap-fill: non-technical role → beginner, technical/aspiring-technical → intermediate, **never
   advanced**; an explicit level pick always wins. Industry precedence reordered so a request-implied
   industry beats the saved one. Prompts (`SKELETON_SYSTEM`/architect/module) gained a **SUBJECT
   FIDELITY** rule: role/industry flavor EXAMPLES only — the topic/title/modules are never reframed
   "for <role>s". Proven live with `scripts/test-profiler-gaps.ts` (PM→beginner, sr-eng→intermediate,
   explicit Advanced wins). *Deliberately NOT added: an interactive "clarify industry" round-trip —
   industry is optional and left general when truly absent, which the precedence already handles.*
2. **Knowledge-check questions are GATED.** Quizzes (`selfCheckQuiz` AND `knowledgeCheck`) only appear
   when lessonType includes `knowledge_check`. Deterministic gate in `runDeepDive` strips quiz blocks
   when off (the reliable guarantee); `MODULE_SYSTEM` + `moduleUserPrompt` updated so the model doesn't
   emit them unconditionally. **Plumbing audited end-to-end** (buildPayload → /api/generate → runJob →
   profiler → architect/runDeepDive → prompts): every landing selection (level, coverage=depth,
   examples, density, extras visuals/syntax, lessonType, framework, industry, buildGoal, levels) is
   passed AND consumed — no drops found.
3. **Framework dropdown** = confirmed INTENDED gating (shows only when Examples=Code) and made
   stable/obvious: it now spans the full grid row (no reflow shuffle), carries an accent "· for your
   code examples" label, and gets a one-shot spotlight pulse on reveal (`public/{app.js,styles.css,
   index.html}`).
4. **Reading-mode preference (vertical vs horizontal).** New landing "Reading" dropdown →
   `profile.readingMode` (schema + state + server `/api/generate` & `/api/learn` + orchestrator +
   profiler, persisted in prefs). **Vertical is byte-for-byte untouched.** Horizontal =
   `renderBodyHorizontal()` in `components.ts`: a fixed-viewport paged deck (`.h-track` translateX,
   per-page Next, TOC nav stays left), heavy/expandable blocks (collapsibles + "go deeper") open in a
   **modal** (`#hmodal`) instead of inline, and the **LAST page is a consolidated 4–5 question
   knowledge check** aggregated round-robin across modules (each item keeps its source blockId so
   `/api/check` grading still resolves). Horizontal **implies** knowledge_check (folded in by profiler)
   so the questions exist. CSS in `tokens.ts`, nav/modal/grading in `runtime.ts`. Proven with
   `scripts/test-horizontal.ts` (renders both modes; no credits) + Playwright (paging, modal,
   final-KC, no vertical scroll; vertical confirmed unchanged). *Open-early caveat: a horizontal
   lesson opened mid-build shows its final-KC page from whatever modules existed at render time; the
   orchestrator re-renders after each module so the stored HTML completes — typically opened when done.*

**Prod DB note:** local `/healthz` returns `db:true` — the app code persists correctly. An empty
Render dashboard is the **env**, not the code: the Render `DATABASE_URL` password `@` must be `%40`.

---

## ⚡ CURRENT STATE — (2026-06-20, Phase 3/4)

App runs on **:5070** (`PORT=5070 npm start`, env `NODE_EXTRA_CA_CERTS=…/system-ca-bundle.pem`).
Hosted on **Render** (auto-deploys from `main`). **MIGRATED to a NEW Supabase project**
(`kdgtlbnlyscdldogxorb`) — RE-DERIVE: schema + KB (380 chunks) + 100 prebuilt lessons rebuilt;
real-account lessons copied over (`scripts/copy-user-data.mjs`). Identity now matches by **email**
so lessons survive the project switch. `.env` is the NEW project (auth ON locally now).

### ⚠️ Render env (the #1 thing to verify if prod misbehaves)
Set in Render dashboard — and **URL-encode the password `@` as `%40`** or the DB silently disables:
`DATABASE_URL=postgresql://postgres.kdgtlbnlyscdldogxorb:REDACTED@aws-1-ap-southeast-2.pooler.supabase.com:5432/postgres`,
`SUPABASE_URL=https://kdgtlbnlyscdldogxorb.supabase.co`, `SUPABASE_ANON_KEY=sb_publishable_…`, `ANTHROPIC_API_KEY`.
**Diagnose**: `GET /healthz` runs a LIVE `select 1` → `{db, dbConfigured, dbError, auth}`. If
`db:false` (esp. `dbConfigured:true` + a `dbError`), the DATABASE_URL is reachable-but-wrong —
classic cause: the password `@` left unencoded so the host parses as `2026@aws-…`. A dead DB =
generations render in-memory but never persist → dashboard empty after refresh, and existing
lessons can't be read. (Verified the app CODE is correct: a new auth user id + the same email
sees prior lessons via the email-match in listLessons. So an empty dashboard = DB connectivity.)
Also enable Supabase → Auth → Email → **Confirm email** (so the verify-email message + link work).

### What shipped since Phase 2
- **Background generation jobs** (`src/agent/orchestrator.ts`, `src/lib/jobs.ts`): `POST /api/generate`
  runs DETACHED, registers the artifact at SKELETON-ready (openable early), builds modules in the
  background; `GET /api/job/:id` drives a dashboard progress card; opens at ~overview-ready.
- **Multi-lesson COURSES**: a planner splits broad asks ("teach me everything about X") into 2–5
  lessons; kick-off first, rest with ⏳; lesson-tab strip in the viewer; recap card on lessons 2..N;
  `GET /api/course/:id`; migration `0004_courses.sql`.
- **Library** = public pre-built lessons (migration `0003`, `scripts/seed-library.ts`, `/api/library`
  + `/api/lesson/:slug`). Cards = **book-cover** style (patterned category cover, ~5/row, no icons).
- **GitHub repo grounding**: `POST /api/upload-repo` clones (depth 1) + extracts text/code + embeds
  into the session upload store (`addRepoUpload`), same path as documents.
- **LEVEL = scaffolding, DENSITY = enforced** (`src/agent/calibration.ts` + `src/agent/density.ts`):
  per-tier scaffolding rules + countable density (median/ceiling per sentence, per concept) + gold
  examples in the prompt + a post-gen validator & 1-pass repair (logs residuals). `runDeepDive` runs
  it. Proof: `scripts/test-calibration.ts` → all 9 (level×density) PASS. moduleLLM bumped 8k→16k
  (streaming) so code-heavy modules don't truncate (the persistent "couldn't build this section").
- **Overview = advance organizer by STRUCTURE TYPE** (`mentalMap.structureType`): procedural→ordered
  numbered path w/ "Start here" + connectors; dependency→prereq order; conceptual→relationship grid
  (no fake steps); comparative→options. Detail (what/why/analogy) moved OFF the map INTO the module
  head; a **spine** ("Step N of M", builds-on, Next link) runs through the lesson. Proof:
  `scripts/test-structure.ts`. Renderer: `src/render/components.ts` (mentalMap, moduleInner) + tokens.ts.
- **Landing UI**: Level single-select; "Depth"→"Coverage"; "all optional" note above the dropdowns.
- **Auth**: on-demand modal (Sign in/Sign up buttons); browsing landing + Library is open; Generate/
  Dashboard/Ask-more gated. Sign-up shows a verify-email message (needs Supabase Confirm-email ON).

### Pending / next
- Verify all the above on the live Render URL once env vars are confirmed (`/healthz` → db:true).
- Generation latency: skeleton-first already helps; if courses still hit Anthropic rate limits on long
  builds, consider a tier bump rather than parallel module agents (parallel was tried + reverted).
- DESIGN_SPEC.md not yet updated for Phase 3/4 (this HANDOFF is the source of truth meanwhile).

### Paste-ready resume prompt (give this to a fresh Claude Code session)
> Continue the Agentic Learning Studio at `/Users/anandpareek/Documents/agentic-learning-studio`.
> Read HANDOFF.md "⚡ CURRENT STATE" first, then DESIGN_SPEC.md. Repo: github.com/APareek89/agentic-learning-studio
> (`main`, auto-deploys to Render). Env: PORT=5070, and every Claude/Supabase/HF call needs
> `NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"`.
> Supabase = the NEW project `kdgtlbnlyscdldogxorb` (auth on; `.env` already set; password `@`→`%40`).
> Before anything: `npx tsc --noEmit` clean, restart `:5070`, and `curl localhost:5070/healthz`
> (expect `db:true`). Verify-then-act: the app uses background jobs (`/api/generate`→`/api/job/:id`),
> multi-lesson courses, a public Library, level=scaffolding + code-enforced density, and a
> structure-typed overview (see scripts/test-calibration.ts + test-structure.ts for how to prove
> generation behavior cheaply). Push to `main` after changes (user tests on Render). Do NOT use the
> LLM to hand-edit lesson content — generation is deterministic code + model calls.

---

## PHASE 2 (2026-06-20) — shipped, verified locally E2E, pushed to `main`

Built all at once (user's call). Verified against a real beginner+code+LangGraph+knowledge-check
generation locally + the knowledge-check grading API.

- **Auth gate before landing** + **Dashboard as its own tab** (was inline above the prompt).
  Gate is mandatory when auth is on (defaults to sign-up); local dev bypasses it.
- **Sign-up onboarding** (`#onboard-overlay`): industry / role / aspiring role / goal, one at a
  time, optional. Saved via `POST /api/profile` → `user_preferences.prefs.profile`; flows into
  the agent as `state.userProfile` and personalizes prompts.
- **Framework dropdown** appears when Examples=Code (LangChain/LangGraph · Claude Agent SDK ·
  Other · Framework-agnostic) → `profile.framework` → codeExample blocks use it (verified LangGraph).
- **Suggested topics** under the prompt after the first lesson (`GET /api/suggest`, LLM from context).
- **Lesson workspace** = full-screen lesson; progress shows as a viewer overlay (no chat by
  default). **Ask more** button opens a right-side chat → `POST /api/ask` (RAG, short answer) with
  an "➕ Add this to my lesson in detail" → `POST /api/ask/expand` (appends a new module via
  runDeepDive, re-renders, persists; reload iframe to view).
- **Overview redesign** (`render/components.ts` + `tokens.ts`): node **icons**, **layman analogy**
  cards (gated to beginner/intermediate via `body[data-level]`), **animated current-flow** connectors
  between layers, est-time, "Why it matters here".
- **Level-2 blocks**: colored block types (`.blk-explain/.blk-example/.blk-code/.blk-check`),
  per-block **collapsible** examples/code (less text on landing), explanation→example→code order,
  **"In plain words" analogy** on concept/technical, module **icon + reading time**, **scroll-reveal**
  (IntersectionObserver), key-term hover animation.
- **Knowledge check** = new `knowledgeCheck` block (4–5 Qs). MCQ verified server-side against the
  stored Blueprint ("by DB"); free-text graded by the LLM. `POST /api/check`. Score tracked in-page.
  Emitted when Lesson type includes "Knowledge check".
- New endpoints: `/api/profile`, `/api/suggest`, `/api/ask`, `/api/ask/expand`, `/api/check`.
  New schema: `LearnerProfile.{framework,role,aspiringRole,levels}`, `MapNode.{icon,laymanExplanation}`,
  `Block.analogy`, `knowledgeCheck` block, `state.{framework,userProfile}`.

**Phase 2 caveats:** `/api/ask/expand` adds a module then the user reloads the iframe to see it
(not a live in-place inject — iframe sandbox). Knowledge-check + Ask-more need the live server
(a downloaded offline file can't grade/ask). `/full` eager-build still slow (Phase 1 note).

---

## PHASE 1 (2026-06-20) — shipped, verified locally E2E, pushed to `main`

Deployed on Render (live; URL not stored in repo). Verified against a real generation
locally (credits restored) AND a server restart:

- **Durable artifacts (the Render "Artifact not found" + broken Download fix):** artifacts
  now persist to Supabase `lessons` (migration `0002_users_phase1.sql`) with an in-memory cache
  in front (`src/lib/artifacts.ts`, now async). Verified: GET /api/artifact/:id returns 200 AFTER
  a full restart (hydrates from DB). `/api/module` + `/full` hydrate too.
- **Per-user dashboard:** `GET /api/lessons` (30-day window + days-remaining). Landing shows
  "Your lessons" cards → Open/revise (loads in viewer) + Download. Keyed by Supabase user id
  (or `local-dev` when auth off). `src/lib/lessons.ts`.
- **Ratings:** ★1–5 in the viewer bar → `POST /api/rate` → `lessons.rating`.
- **User preferences:** `user_preferences` table; saved on each generate; `GET /api/preferences`
  pre-fills the landing dropdowns + context fields.
- **Landing redesign:** electric-blue theme, animated neural-network hero canvas, Space Grotesk
  headings + Lexend body + JetBrains Mono code (host app AND artifact `render/tokens.ts`).
- **Form = dropdowns, 2 per row:** Level (MULTI), Depth (Conceptual/Technical), Examples
  (Functional/Code), Text, Extras (multi), Lesson type (Content/Knowledge check, multi). Plus two
  open-text fields (industry, build goal) flowing into the agent. Multi-level → base level =
  least-advanced selected; full set passed as context. `public/{index.html,app.js,styles.css}`.
- **Lesson type "Knowledge check":** lightly wired — emits the existing `selfCheckQuiz` blocks
  (one verified rendered). Richer mode deferred per user.
- **Lesson page chat:** raw node names hidden behind a friendly progress line; a persistent
  composer lets the learner **modify the plan** (re-runs generation with feedback appended, same
  thread for Langfuse).
- **Auth (Phase 1):** Sign in / Sign up buttons in the topbar open a modal (`auth.ts` gained
  `getUser()`). Open by default; require sign-in by setting SUPABASE_URL + SUPABASE_ANON_KEY.

**Carry-over:** `/full` eager-build is slow on a fresh lesson (builds every module → can exceed a
60s client timeout; fine in the browser but watch Render's request limit — consider backgrounding).
MMR retrieval, regular KB-update system, minor KB cleanups, `.env`-in-repo decision still pending.

---

## 0. NEXT SESSION — START HERE (as of 2026-06-19 EOD)

**Where we are:** App is feature-complete and on GitHub (private):
`https://github.com/APareek89/agentic-learning-studio` (branch `main`, 37 files, **no secrets** — `.env` git-ignored). `npx tsc --noEmit` clean. Server runs locally on **:5070** (`PORT=5070 npm start`). KB is rich now: **~380 chunks (127 prose + 253 record)** across the whole AI landscape, deduped, no meta-noise.

**THE ONE BLOCKER:** the app's `ANTHROPIC_API_KEY` has **no credit balance** → every *generation* errors at the first LLM call. Everything non-LLM (UI, upload→parse→embed, RAG retrieval, layout) works. **Top up at console.anthropic.com → Plans & Billing**, then the pending verifications below can run (~6 min total).

### Paste-ready prompt to resume
> Continue the Agentic Learning Studio. Read HANDOFF.md §0 first. Credits are now topped up (confirm by hitting `/api/learn`). Do, in order: (1) restart the server on :5070 and run ONE `POST /api/learn` (prompt "how retrieval augmented generation works", cards `{level:beginner,depth:conceptual_technical,examples:functional_code,density:medium,visuals:on,syntax:on}`) — verify first paint ≈ overview+Module-1 in ~2–3 min, then the background module queue fills (watch `module_cache` grow), then `GET /api/artifact/:id/full` returns 0 stub panels; (2) verify an upload-grounded lesson (POST /api/upload a small .md, then /api/learn with that uploadId + referOnly true) shows the provenance banner + `your document` source tags; (3) verify the new overview layout on a real generated lesson (no-scroll, left-to-right map, "Click for details" pills). Then move to Vercel/hosting per §0 "Hosting".

### Pending steps (carry-over)
1. **Verify generation E2E** (blocked on credits): progressive first-paint + background fill + `/full`; upload-grounded + refer-only; new overview layout on a *real* lesson (only fixture-verified so far). Tasks #12 + the upload generation path.
2. **Hosting** (see below) — repo is up; not yet deployed.
3. **Retrieval diversity (MMR)** — designed, not built: after RRF, drop near-duplicate chunks (>~0.9 cosine to an already-picked chunk) so top-k isn't 3 paraphrases. Code change in `src/rag/retrieve.ts`.
4. **Regular KB-update system** — designed, deferred by user: status-scan → Codex research (tuned add-only broad-AI prompt) → `npm run ingest` → audit. Validation gate already passed (Codex output quality is trustworthy).
5. **Minor KB cleanups:** `repos/*.md` templating glitch ("…relevant to … because use X to…"); low-trust citation in `llms/00_how_llms_work.md` (`framia.converge.ai`).
6. **`.env` in repo:** user opted to commit it but the harness blocked me; it's currently NOT in the repo (git-ignored). If still wanted: `git add -f .env && git commit && git push` then ROTATE all keys. Recommended instead: set env in the host dashboard.

### Hosting (Vercel question — resolved direction)
- **Vercel does NOT use a committed `.env`** — set env vars in its dashboard. But more importantly, **this app is NOT a clean Vercel serverless fit**: long-running Express + multi-minute SSE streams + a **local ONNX embedding model** (native binary, ~128MB) + **in-memory state** (artifacts/uploads/blueprints). Serverless has time limits and no cross-invocation memory.
- **Recommended (zero code change): an always-on Node host — Render / Railway / Fly.io.** Point at the repo, set env vars (`ANTHROPIC_API_KEY` required; `DATABASE_URL` for RAG; rest optional), build `npm install`, start `npm start`. Next session: write `DEPLOY.md` + a `render.yaml`/Railway config.
- **If Vercel is required:** needs a refactor — move embeddings to a hosted embedding API (drop onnxruntime-node), externalize artifact/upload/blueprint state to Postgres (no in-memory Maps), and replace the minutes-long SSE with the progressive `/api/module` polling (already built) so each request is short. Scope this as its own task.

### Sign-up / auth (BUILT 2026-06-19)
Supabase Auth is wired, graceful-optional (`src/lib/auth.ts`, `GET /api/config`, `requireAuth`
on `/api/learn` `/api/upload` `/api/module`; viewer routes stay public). **Open by default**;
to REQUIRE sign-up/login set **`SUPABASE_URL` + `SUPABASE_ANON_KEY`** (Supabase → Project
Settings → API; the anon key is public). Also enable the **Email** provider in Supabase →
Authentication → Providers (and optionally turn off email-confirmation for easy testing).
Front-end = sign-up/login overlay (supabase-js via CDN) + Bearer token on gated calls + Sign out.
Verified: open mode + 401 gating with auth on. **Deploy config ready:** `render.yaml` + `tsx`
moved to deps + `engines node>=20` (so `npm start` works on a prod host).

### Env vars to set in the host (values from local `.env`)
`ANTHROPIC_API_KEY` (required) · `DATABASE_URL` (RAG) · `SUPABASE_URL` + `SUPABASE_ANON_KEY` (to require sign-in) · `ANTHROPIC_MODEL_SONNET/_OPUS/_HAIKU` · `LANGFUSE_PUBLIC_KEY/_SECRET_KEY/_BASEURL` · `TRANSFORMERS_CACHE` · `STALENESS_DAYS` · `PORT`.

---

## 1. What this app is

Tab 1 "Learning" generates, on demand, a **self-contained interactive HTML lesson**
about any agentic-AI topic — mental-map-first, click-a-block-to-go-deeper,
an `(i)` popover on every term, personalized, and RAG-grounded with citations.
Replaces video with structured reading. Tab 2 = "Build a project" = **coming-soon stub**.

Stack: TypeScript · LangGraph.js · LangChain · Claude (ChatAnthropic) ·
Supabase (Postgres + pgvector) · local Transformers.js embeddings · Express + SSE ·
vanilla front-end. Reuses patterns from the sibling `../seo-insights-agent` project.

**Core design invariant:** the model emits a **Blueprint (JSON) only** — never HTML/JS.
A deterministic renderer (`src/render/*`) turns the Blueprint into the page. That's
why the interactivity, (i) terms, and 27 learner variants always work.

---

## 2. Current status — WORKS END TO END ✅

Run it: `cd agentic-learning-studio && npm run dev` → http://localhost:5070
(port 5070; 5060 is Chrome-blocked). Type a prompt, optionally pick the starter
cards (Level / Depth / Examples / **Text density** + **Visuals** / **Explain syntax**),
click **Generate lesson**.

Verified working:
- **Generation pipeline:** `profiler → retriever → architect → seedFirstModule → composer`, streamed over SSE.
- **Lesson layout (2026-06-19):** topbar is now Overview(left) · title(center, 17px bold) · controls(right: toggles+progress+theme) via `.tb-left/.tb-center/.tb-right`. Overview `.shell` widened to `min(1240px,94vw)` and map cards to `flex 1 1 240px` so the mental map fills the screen; workbench `#blockmain` widened to 1000px with prose capped at 760px so wide blocks (matrix/code/viz) use the space but reading stays comfortable. Verified by local render fixture (`renderArtifact` is pure — no LLM needed).
- **Document upload + provenance (2026-06-19):** learner can upload pdf/docx/md/txt/html/json + code files on the landing page. `POST /api/upload` (base64 JSON → tmp file → `loaders.loadSource` → chunk → embed LOCALLY → `lib/uploads.ts` in-memory **session** registry; never written to the shared KB). Front-end keeps docIds for the session (reusable across lessons, cleared on refresh) + a **"Refer only these"** toggle. `/api/learn` takes `{uploadIds, referOnly}`; the `retriever` + `runDeepDive` put upload chunks (`U#`) FIRST, append KB (`S#`) unless referOnly; prompts instruct "prefer [U#]". A **provenance banner** (from `meta.usedUpload/referOnly/uploadTitles`) tells the reader what came from where; Sources tags `your document` vs `knowledge base`. Citation kind gained `"upload"`. New: `lib/uploads.ts`, `/api/upload`, loaders text/code exts, `moduleCacheKey` already combo-keyed. **VERIFIED (no-LLM):** upload→parse→chunk→embed→`retrieveFromUploads` (sim 0.56), provenance banner + tags render. **PENDING (blocked: API credits):** full lesson generation grounded in an upload + refer-only end-to-end.
- **Progressive generation (2026-06-19) — overview + Module 1 first, rest build in background:**
  - `architect` now emits a SKELETON only (`SKELETON_SYSTEM`, `skeletonLLM` maxTokens **16000** — 8000 truncated once what/relevance+glossary+synthesis were added): mental map + module STUBS (`blocks:[]`, `loadState:"stub"`) + glossary + synthesis. New node `seedFirstModule` calls `runDeepDive()` to write Module 1's blocks. `composer` renders Module 1 full + the rest as `is-stub` "🛠 building…" panels and stores the Blueprint with the artifact.
  - `runDeepDive(bp, moduleId)` (in `nodes.ts`, exported): focused `retrieve(title+terms, 6)` → compose blocks (`MODULE_SYSTEM`+`moduleUserPrompt`, `moduleLLM` streaming) → repair → mutate bp (`loadState:"full"`). Used for Module 1 AND lazily.
  - `POST /api/module {artifactId,moduleId}` (server): `module_cache` hit (`moduleCacheKey`, now keyed incl. density/visuals/syntax) → instant; else `runDeepDive` → `renderModuleFragment` → cache → refresh stored html.
  - The artifact's **own runtime** drives a **sequential** background queue over the stub ids (reads artifactId from its `/api/artifact/<id>` URL), injects each fragment + `hydrate(panel)`, flips nav building→ready; clicking a building chapter **reprioritizes** it; failures → "tap to retry".
  - `GET /api/artifact/:id/full` eager-builds every remaining module (bounded re-check loop to beat the browser-queue race on the shared in-memory bp) → complete offline file. The Download button points here.
  - **VERIFIED LIVE (before API credits ran out):** skeleton→Module-1-full + 4 stub panels/nav; `POST /api/module` cold 50s (built+cached) & warm 0s (cache hit); `module_cache` writes. **PENDING re-verify (blocked: Anthropic credit balance exhausted mid-test):** the `/full` bounded-retry fix, the trimmed-skeleton timing, and browser progressive-fill. First paint measured **~216s** before the skeleton trim (slower than the ~75s target — skeleton glossary+synthesis dominate); the trim is in but unmeasured.
- **Generation pipeline (legacy single-call):** was `profiler → retriever → architect → composer`, streamed over SSE.
- **Truncation fix (2026-06-19):** the single architect call was hitting `maxTokens:16000`
  (`stop_reason:"max_tokens"`) → invalid tool JSON → "First draft was incomplete" and a
  failed lesson. Fixed by raising the architect cap to **32000 + `streaming:true`**
  (the Anthropic SDK refuses a *non-streaming* request whose max_tokens could exceed 10 min —
  see Gotchas). `makeLLM` now takes a `streaming` opt. Files: `agent/llm.ts`, `agent/nodes.ts`.
- **6 lesson-experience controls (2026-06-19):**
  - **Text density** (Low/Med/High) — landing card → `profile.density` → architect prose sizing.
  - **Visuals & demos** (landing toggle) → `profile.visualsRequested`; when on, architect adds
    interactive **data-only** blocks: `interactiveScatter` / `interactiveSlider` / `steppedFlow`
    (renderer+runtime own the SVG/JS, generalized from `~/Documents/rag-explained.html`).
  - **Explain syntax** (landing toggle) → `profile.explainSyntax`; codeExample blocks carry a
    `syntax[]` breakdown, revealed by the in-lesson "Explain syntax" toggle.
  - **In-lesson toggles** (artifact top bar, instant CSS show/hide, no regen): Concept / Functional
    / Code (`body.hide-*` + `b-concept/b-funcex/b-code` classes) + Explain-syntax (`body.show-syntax`).
    Each renders only if that content exists.
  - **Richer mental map:** each MapNode now carries `what` + `relevance`, rendered as info cards.
  - Files: `render/schema.ts` (profile fields, `codeExample.syntax`, MapNode `what`/`relevance`,
    3 new block kinds), `agent/prompts.ts` (DENSITY/VISUALS/SYNTAX/mental-map rules + VISUAL
    REPRESENTATION GUIDE), `agent/nodes.ts`+`agent/state.ts` (card→profile wiring),
    `render/components.ts` + `render/tokens.ts` + `render/runtime.ts` (render+CSS+hydration),
    `public/{index.html,app.js,styles.css}` (landing controls). Verified heavy (all on, 86KB,
    all 3 visuals) + light (low, opt-outs honored) E2E, no truncation.
- **Fix 1 (scope/intent fidelity):** "overview of agentic frameworks" now produces a
  FRAMEWORK COMPARISON (LangGraph/CrewAI/AutoGen/LangChain/OpenAI SDK/LlamaIndex +
  a head-to-head decision matrix), not generic agent concepts. Done via prompt
  (Profiler extracts `learningGoal`/`lessonFocus`/`mustCover`; Architect mirrors the ask). **RAG did NOT fix this — the prompt did.**
- **Fix 2 (layout):** the artifact shows an OVERVIEW (hero + clickable mental map of
  broad blocks) first; clicking a block enters the WORKBENCH = left nav of block
  buttons + right content panel, with "← Overview".
- **Fix 3 (RAG):** hybrid vector+keyword retrieval over Supabase, grounded + cited,
  with graceful fallback to the model's own knowledge. KB already ingested
  (247 framework records → 260 chunks).
- **Robustness:** `repairBlueprint()` deterministically fixes mechanical gate failures
  (no slow LLM repair loop); decision-matrix cells are an ARRAY (model-reliable).

### KNOWN ISSUE — latency ~3–4 min (the #1 next task)
Generating a full rich lesson in one Sonnet call is ~13k output tokens (~230s).
Clients can time out (use `--max-time 280`+ when testing via curl).

---

## 2b. Knowledge base / RAG corpus (state as of 2026-06-19)

The KB lives in Supabase (`chunks` table) and is grown from the folder
`/Users/anandpareek/Documents/AI Knowledge base` via `npm run ingest -- "<that path>"`
(idempotent, embeds LOCALLY with bge-small — **no Anthropic credits needed**).

- **Current corpus: ~405 chunks (139 prose + 266 record).** Was 260 (catalog-heavy, almost no prose) at the start of the day.
- **Expanded today (broad AI, not just agentic):** a first hand-built batch of 6 cited docs, then a large Codex research batch (~35 files) — domain docs across `foundations/ classic-ml/ deep-learning/ llms/ generative/ rag/ agentic/ eval/ safety/ infra/ ecosystem/`, 18 `repos/*.md` deep-dives, and `catalog/ai_tools.json` (19 records). All carry `Last updated` + a `## Sources` section with real primary-source URLs. Retrieval verified across new domains (coverage 0.83–0.90).
- **Validation done (gate before automating updates):** structure + citations + spot-checked accuracy all hold up; Codex respected add-only (left the 6 hand-built docs untouched, logged in `catalog/2026-06-19_expansion_manifest.json`).
- **Open items:** (1) `CONFIG_Research_Plan_for_AI_Knowledge_Base.docx` is a PLANNING artifact, not learning content — its 11 ingested chunks are retrieval noise; **recommend excluding** (delete-by-source_id + add to ingest ignore-list). (2) `repos/*.md` have a cosmetic templating glitch ("…relevant to … because use X to…"). (3) `llms/00_how_llms_work.md` cites a low-trust source (`framia.converge.ai`) for a model context-window claim — swap for an official source.
- **To grow the KB:** the tuned, add-only, broad-AI **Codex prompt** is the generation step; then `npm run ingest`. A recurring "regular update" system (status scan → Codex research → ingest → audit) is DESIGNED but NOT built — deferred by the user ("plan it later"); validation of this first set was the gate to green-light it.

---

## 3. ~~THE NEXT TASK: lazy per-module deep-dive~~ ✅ DONE (2026-06-19)
This is now BUILT (see §0 + §2b): architect emits a skeleton, `seedFirstModule` writes Module 1,
the artifact runtime builds the rest in the background via `POST /api/module` (cached in
`module_cache`), and `GET /api/artifact/:id/full` eager-builds for offline download. Only the
live timing re-verification is pending (credits). Original design notes kept below for reference.

### (original plan, for reference)

Goal: overview appears in ~20s; each block's content generates **on click** instead
of all up front. Plan (also in DESIGN_SPEC §2.2):
1. Architect produces only the **skeleton** (meta, mentalMap, module stubs with
   summary/objectives/decisionItForces/termIds, glossary, synthesis, citations,
   `blocks:[]`, `loadState:"stub"`). Fast (~30–50s).
   - NOTE: a two-phase "skeleton + parallel module bodies" was tried and REVERTED —
     the parallel module calls got rate-limited/serialized and were SLOWER, plus a
     bad block dropped a whole module. If you re-attempt parallel, cap concurrency
     and parse blocks resiliently (don't lose a module on one bad block).
2. New `POST /api/module` route + a `deepDive(moduleId)` sub-graph: retrieve focused
   chunks for that module, generate its `blocks[]` (small fast call), cache in the
   `module_cache` table keyed by `moduleCacheKey()` (already in `src/lib/hash.ts`).
3. Front-end: the artifact's runtime fetches block content on first open of a nav
   item. BUT a downloaded standalone HTML can't call the server — so add a
   **"Generate full lesson for download"** button that eagerly fills all modules,
   preserving the offline-complete artifact.

After that: optional LLM critic, web-search + daily-scan stubs (Step 10), and more
KB docs as Codex fills `~/Documents/AI Knowledge base`.

---

## 4. File map (what's where)

```
src/
  server.ts                 Express + SSE. POST /api/learn (runs the graph),
                            GET /api/artifact/:id (+/download). Boot logs env status.
  agent/
    state.ts                GraphState (Annotation.Root) + Intent + RetrievedSource types
    llm.ts                  makeLLM(tier, temp, {maxTokens}) — sonnet/opus/haiku + top_p fix
    prompts.ts              PROFILER_SYSTEM, ARCHITECT_SYSTEM (intent-fidelity + grounding),
                            architectUserPrompt(). (SKELETON_SYSTEM/MODULE_SYSTEM exist but
                            are UNUSED right now — leftovers from the reverted two-phase.)
    nodes.ts                profiler, retriever, architect (single call), composer
    graph.ts                START→profiler→retriever→architect⟲(repair)→composer→END
  rag/
    embed.ts                bge-small-en-v1.5 local (384-dim); embedQuery vs embedPassages
    loaders.ts              pdf/docx/md/txt/html/json(catalog or prose)/csv loaders
    chunkers.ts             record chunker (1/repo) + prose chunker (~320 words, 60 overlap)
    store.ts                idempotent embed+upsert (content_hash skip)
    retrieve.ts             hybrid vector+tsvector RRF + coverage score (+ date→string coercion)
    ingest.ts               CLI: npm run ingest -- "<path>"
    embed.test.ts           npm run embed:test (verifies the local model)
  render/
    schema.ts               Blueprint Zod + validateBlueprint() (7 gates, gate2=warning)
                            + repairBlueprint() (deterministic mechanical fixes)
    components.ts           renderBody(): overview + workbench; all block renderers
    tokens.ts               ARTIFACT_CSS (light+dark, workbench/nav/panel, 27-combo gates)
    runtime.ts              RUNTIME_JS (overview↔workbench, (i) popovers, quiz, theme, progress)
    index.ts                renderArtifact(bp) → one self-contained HTML string
  lib/
    db.ts                   pg pool + dbEnabled()/ragEnabled()/query()/rawPool()
    artifacts.ts            in-memory artifact store (id → html)
    langfuse.ts             makeLangfuseHandler() (null when keys absent)
    hash.ts                 sha256, contentHash, topicHash, moduleCacheKey
  types/declarations.d.ts   ambient decl for pdf-parse
supabase/migrations/0001_rag.sql   documents, chunks(vector(384)+HNSW+tsvector), glossary,
                                    generations, module_cache, kb_updates
scripts/migrate.mjs         npm run migrate (globs migrations/*.sql)
public/{index.html,styles.css,app.js}   tabbed shell, landing (icon cards), 30/70 + iframe viewer
```

---

## 5. Gotchas (all hit + resolved — don't re-discover these)

- **Port 5070**, not 5060 (Chrome blocks 5060 = SIP → ERR_UNSAFE_PORT).
- **Corp MITM:** Claude API + Hugging Face model download need
  `NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"`.
- **Supabase = same project as seo-insights-agent** (`kchrkdatcdxwyugurmws`). Connection
  string is the **Session pooler** (IPv4); the direct `db.<ref>` host is IPv6-only and
  won't resolve here. `.env` already has the working DATABASE_URL (copied from the SEO project).
- **`.env` already populated** (ANTHROPIC_API_KEY, DATABASE_URL, LANGFUSE_*). Only
  ANTHROPIC_API_KEY is strictly required; everything else is graceful-optional.
- **pdf-parse:** import `"pdf-parse/lib/pdf-parse.js"` (not `"pdf-parse"`) to skip its debug self-test.
- **onnxruntime-node** prints a benign `mutex lock failed` on forced `process.exit()` in
  CLI scripts (embed.test, ingest). Harmless; never affects the long-running server.
- **pg returns `date` columns as JS Date objects** → must coerce to YYYY-MM-DD strings
  (CitationSchema wants a string). Done in retrieve.ts.
- **decisionMatrix cells = ARRAY** of `{criterion,text,rating}`, NOT a record. A
  record-keyed-by-dynamic-criterion shape malforms and (because blocks parse
  all-or-nothing) drops the whole module. Keep it an array.
- **Architect latency + token cap:** single call, now **maxTokens 32000 + streaming:true**.
  A grounded beginner·both·both·high lesson runs ~18–22k output tokens; below ~16k it
  truncates (`stop_reason:"max_tokens"` → invalid tool JSON → "First draft was incomplete").
  Two-phase parallel was slower — see §3.
- **Anthropic SDK "Streaming is required":** a NON-streaming request whose `max_tokens` is
  large enough to possibly exceed 10 min is rejected up front by the SDK. So the big architect
  call MUST set `streaming:true` (via `makeLLM(..., {streaming:true})`). `withStructuredOutput`
  still aggregates the streamed tool-call into one parsed object — node logic unchanged.
- **`grep syntax-panel` over an artifact counts CSS selectors too** (8 in `tokens.ts`), so real
  syntax panels = matches − 8. Don't mistake the CSS for rendered panels when verifying opt-out.
- **Restarting:** kill stale servers by port first: `lsof -ti tcp:5070 | xargs kill -9`.

---

## 6. Quick verification recipe

```bash
cd /Users/anandpareek/Documents/agentic-learning-studio
export NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"
npx tsc --noEmit                      # must be clean
lsof -ti tcp:5070 | xargs kill -9 2>/dev/null
PORT=5070 npm start > /tmp/als.log 2>&1 &   # then open http://localhost:5070
# CLI smoke test (give it time — generation is slow):
curl -s -N -X POST http://localhost:5070/api/learn -H 'Content-Type: application/json' \
  -d '{"prompt":"compare agentic frameworks","cards":{"level":"intermediate","depth":"conceptual_technical","examples":"functional_code"}}' \
  --max-time 300
# Inspect: the streamed `artifact` event has an id; GET /api/artifact/<id> is the lesson HTML.
```
Expect: Profiler says "I'll compare the options", Retriever pulls ~8 notes (~86%),
Architect builds 5 modules, Composer returns an artifact. The HTML should contain
`class="dm"` (decision matrix), `class="term-chip"` (i-terms), `class="quiz"`.

---

## 7. Decisions already locked (don't re-litigate)
Stack = continue TS/LangGraph/Claude/Supabase. Embeddings = free local bge-small
(384-dim), pluggable. Web search = stubbed (add later). Output = Blueprint→template
(covers all 27 combos via body[data-*] CSS). Supabase = reuse existing project.
Single-user/local for now. Example to beat: `../agentic-architect-trainer/index.html`.
