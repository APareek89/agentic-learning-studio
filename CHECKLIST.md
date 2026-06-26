# GO-LIVE CHECKLIST — Agentic Learning Studio

Everything needed to take the app public so users can **sign up → pay → generate lessons**.
Status tags: `[DONE]` already in the app · `[PARTIAL]` started, needs finishing · `[TODO]` not built.
> Not legal advice. The Compliance/Legal items need a real lawyer — this lists *what* you need, not a substitute for counsel.

> **NEXT UP (deferred by decision, Jun 2026 — the big remaining build items):**
> 1. **Billing + per-user credit metering** (§0 credit cap + §1) — gate `/api/overview`+`/api/build` on a paid/granted credit balance; wire Paddle. *This is the #1 money risk still open.*
> 2. **Account basics** (§3) — enforce email-verified before generating, password-reset page, account deletion + data export.
> Hardening shipped this round: RLS (§0/§4), rate-limits + global gen-cap (§0/§2), CORS + helmet + iframe-sandbox (§4), Claude retry + UI retry (§6), input caps (§2), community report/auto-hide + discount anti-farm (§1/§3-community), lesson retention 30d→1yr (§5). Still on the user: Anthropic spend cap (§2), Render=Standard 2GB, (Supabase Pro + confirm-email + prod env — DONE).

---

## 0. CRITICAL BLOCKERS — do these first, nothing else matters until they're green
- [ ] **`[PARTIAL]` Fix prod env on Render.** `DATABASE_URL` + `SUPABASE_URL`/`SUPABASE_ANON_KEY` must be the **new** project `kdgtlbnlyscdldogxorb`, password `@`→`%40`. A wrong/old value = empty dashboard, failed downloads, 401s on every gated route. Verify: `GET /healthz` → `db:true`. (See HANDOFF §2.)
- [ ] **`[TODO]` Per-user spend cap / credit metering (THE money risk).** One lesson = an Opus skeleton + ~5 Sonnet module builds = a meaningful Anthropic bill. With open signups and no cap, a handful of users (or one abuser) can run your API spend to the moon. **Do not open signups until generation is metered and gated by a credit/quota the user has paid for or been granted.** (See §2 + §3.)
- [x] **`[DONE]` Lock down the database surface.** Migration `0008_rls_lockdown.sql` enables **Row-Level Security on all 13 public tables** with no public policies → the anon/browser key is denied all rows; the server (role `postgres`, `rolbypassrls=true`) is unaffected and the browser uses Supabase only for auth. Verified RLS on 13/13 + app still reads.
- [x] **`[PARTIAL→mostly DONE]` Rate-limit the public + expensive routes.** `express-rate-limit` per-IP: 600/15min on all `/api/*`, **40/hr** on `/api/overview` `/api/build` `/api/upload` `/api/upload-repo`; plus a **global concurrent-generation cap** (`MAX_CONCURRENT_GENERATIONS`, default 4) → over-cap returns 429. `trust proxy` set so limits key on the real client IP. Remaining: per-**user** (not just per-IP) limits once billing/quota lands.
- [ ] **`[TODO]` Legal pages live + linked.** Terms of Service, Privacy Policy, Acceptable Use, AI-content disclosure, Refund policy. You cannot legally take payments or PII without these.

---

## 1. Billing & monetization `[TODO]`
- [ ] **Pick a billing platform.** Recommend a **Merchant of Record** (Paddle or Lemon Squeezy) over raw Stripe — they handle global sales tax/VAT, invoicing, and fraud, which matters the moment you sell internationally. (You already know Paddle.) Stripe Billing is fine if you'll handle tax via Stripe Tax + an accountant.
- [ ] **Pricing model that matches cost.** Generation cost is real and variable, so price on **credits/usage** (e.g. N lesson-generations per plan, or a credit balance) rather than flat "unlimited." A flat unlimited plan + Opus/Sonnet generation is how you lose money per power user.
- [ ] **Plans + entitlements.** Define tiers (Free trial / Pro / etc.), what each unlocks (generations/month, courses, downloads, horizontal mode, library), and store entitlement per user.
- [ ] **Checkout flow + customer portal.** Hosted checkout, plan upgrade/downgrade, cancel, update card, view invoices — use the provider's portal; don't build payment UI yourself.
- [ ] **Webhooks → entitlement sync.** Subscription created/updated/cancelled/payment-failed webhooks update the user's plan + credit balance in your DB. Verify webhook signatures. Handle dunning (failed payment → grace period → downgrade).
- [ ] **Gate generation by entitlement.** `/api/generate` checks the user's remaining credits/plan BEFORE kicking off a job; decrement on success; surface "out of credits → upgrade" in the UI.
- [ ] **Free trial / freemium boundary.** Decide what's free (browse Library? 1–2 generations?) and where the paywall sits. The Library is already public; generation should be the paid action.
- [ ] **`[PARTIAL]` Discount codes (Community Share → 30% off).** When a learner shares a lesson to **Community courses** (My Lessons row or the Trainer 2-module popup), the server mints a 30%-off code into the `discount_codes` table (`code, user_id, lesson_id, percent=30, source='community_share', redeemed=false`) and shows it in a popup. **Built: code generation + storage + UI + anti-farm** (server now caps to **one unredeemed code per user** and won't re-publish the same source lesson). `[TODO]` to wire at billing: (1) validate/apply the code at checkout, (2) enforce one-use (`redeemed`) + expiry, (3) decide the discount's scope (next purchase only) and stacking rules.

## 2. Cost control & abuse prevention `[TODO]`
- [ ] **Hard budget alarms on the Anthropic key.** Set spend alerts/limits in the Anthropic console; consider separate keys per environment.
- [ ] **Per-user generation quota** (ties to §1 credits) enforced server-side, not just in the UI.
- [x] **`[DONE, global]` Throttle background jobs.** Global concurrent-generation cap (`MAX_CONCURRENT_GENERATIONS`, default 4) in `jobs.ts`; `/api/overview` + `/api/build` take a slot (429 if full), released in the job's `finally`. Per-**user** cap still TODO (ties to credits).
- [ ] **Abuse bounds on uploads/repo clone** (already: ≤400 files / ≤4MB / 90s) — keep, and add per-user/day limits.
- [x] **`[PARTIAL]` Input caps.** Prompt capped at 5000 chars (`/api/overview`); per-file upload cap ~10MB (`/api/upload`, 413); repo clone already bounded (≤400 files/≤4MB/90s). Remaining: max uploads-per-session cap.
- [ ] **Bot/signup abuse.** CAPTCHA or email-verification gate on signup so bots can't farm free generations.

## 3. Auth & account management
- [ ] **`[DONE]` Email/password auth** (Supabase, on-demand modal).
- [x] **`[PARTIAL]` Email verification.** Supabase "confirm email" toggle is **ON** (done by user). Remaining (B2): enforce *in code* — block generation / credit grants until `email_confirmed`, and surface "please verify your email."
- [ ] **`[TODO]` Password reset** (Supabase reset email + a reset page).
- [ ] **`[TODO]` Account deletion + data export** (GDPR/CCPA "right to erasure / portability"): a user can delete their account and download their data.
- [ ] **`[TODO]` Session/security basics.** Token expiry handling in the UI (re-auth on 401), sign-out everywhere.
- [ ] **`[TODO]` (Optional) OAuth** (Google) to reduce signup friction.

## 4. Security & data protection
- [ ] **`[DONE]` Secrets out of git** (`.env` git-ignored; Render env `sync:false`). Add a **key-rotation** plan + least-privilege keys (anon key is public by design; never ship the service-role key).
- [x] **`[DONE]` RLS on all tables** (migration `0008`, see §0) — the load-bearing one.
- [x] **`[PARTIAL]` HTTPS + secure headers.** `helmet` added (HSTS, X-Content-Type-Options, X-Frame-Options SAMEORIGIN, Referrer-Policy); Render provides TLS. The lesson **iframe is sandboxed** (`allow-scripts allow-same-origin allow-popups allow-downloads` — blocks top-nav/forms; verified the runtime still works). **CSP still OFF** (lessons + host inline JS/CSS); remaining: a tight CSP with nonces.
- [x] **`[DONE]` CORS lockdown.** `/api/*` restricted to `prathibhax.com` / `www.prathibhax.com` / the onrender URL / localhost (+ `EXTRA_ORIGINS`); foreign origins blocked, same-origin/no-origin allowed.
- [ ] **`[TODO]` Input validation everywhere** (already partial via Zod on the Blueprint; validate all request bodies — filenames, repoUrl already regex-checked, base64 size, etc.).
- [ ] **`[PARTIAL]` Dependency + supply-chain audit.** Reviewed Jun 2026: `npm audit fix` (non-breaking) resolves nothing; the **12 remaining (11 moderate, 1 high) are all langchain-ecosystem transitive** (`@langchain/*`, `langchain`, `langsmith`, `fast-xml-parser`, `uuid`) and need a **breaking** upgrade → **deferred** (force-upgrading risks the generation pipeline; do it deliberately + re-run a full generation test). Still TODO: enable Dependabot. (XSS stays impossible — renderer escapes all model text.)
- [ ] **`[TODO]` PII minimization.** You store email + lesson prompts (may contain user context). Document what's stored, encrypt at rest (Supabase does), and set retention (§5).
- [ ] **`[TODO]` Content moderation.** Users type free-text prompts and upload docs → run prompts/outputs through a moderation check (Anthropic's safety + your own policy) so the product can't be used to generate disallowed content; log + block.
- [x] **`[PARTIAL]` Contributor course moderation + abuse.** DONE: a **"report" path** on every community tile (`/api/community/report`) that **auto-hides** a lesson after ≥3 reports (`hidden` column, migration `0009`, filtered from all listings). Contributor courses still **auto-publish with no pre-review** (v1). Remaining: (1) an admin review/approval queue + manual unpublish/ban UI, (2) publish rate-limits / require verified email, (3) IP/originality check on uploaded content (§9), (4) legal review of the contributor agreement copy.

## 5. Compliance & legal `[TODO]` (lawyer-reviewed)
- [x] **`[PARTIAL]` India-ready compliance pages live** (footer-linked, pretty URLs `/security` `/privacy` `/terms` `/report-issue`, + `/complaint` `/grievance` aliases). Individual-operator language throughout (Anand Pareek, an individual resident in India — NOT a company; GST/registered-office = N/A). Covers DPDP, IT Intermediary Rules, Consumer Protection E-Commerce Rules, CERT-In, RBI tokenisation refs. **Still TODO: lawyer review** before taking payments/scaling; fill `TODO_CONTACT_ADDRESS`.
- [x] **`[DONE]` Complaint / grievance / data-rights form** at `/report-issue` → `POST /api/support/complaint` (Zod, 5/hr/IP rate limit, stored in `support_requests` with HASHED ip, best-effort Resend email to findkailash@gmail.com). Categories: privacy/data-request, consent-withdrawal, account-deletion, correction/access, security-vuln, community-content, billing/refund, technical, grievance, other.
- [x] **`[DONE]` Consent capture** — required (never pre-ticked) "I agree to the Terms and acknowledge the Privacy Notice" checkbox on sign-up → `POST /api/consent` → `consent_events` audit log (migration `0014`).
- [x] **`[DONE]` AI-content disclosure** — Terms §2 + Privacy state lessons are AI-generated and may contain errors; no professional advice; no warranty on accuracy.
- [ ] **`[N/A — individual-operator beta]` Company registration / GSTIN** — not applicable while operated by an individual; revisit if the app moves to a registered entity.
- [ ] **DPA / sub-processor list** (Anthropic, Supabase, Render, Paddle/Stripe). Anthropic API data is not trained on by default — cite that in your privacy stance.
- [ ] **GDPR/CCPA**: consent for analytics/cookies, data-subject request process, deletion/export (§3).
- [ ] **Refund/cancellation policy** (your MoR may mandate one).
- [x] **`[PARTIAL]` Data retention policy** — lesson expiry extended **30 days → 1 year** (migration `0009`; "Saved · Download to keep a permanent copy" wording; the countdown badge only shows when ≤30 days remain). Remaining: tie retention to plan (paid = keep while active) once billing lands; uploads stay in-memory/session — document it.

## 6. Infrastructure & reliability
- [ ] **`[PARTIAL]` Hosting plan sized right.** Render `standard` (2GB) — the local ONNX embedding model (~128MB) loads in memory; `starter` (512MB) may OOM. Confirm the plan + a persistent disk for `TRANSFORMERS_CACHE` so the model doesn't re-download each cold start.
- [ ] **`[TODO]` DB backups + restore drill.** Confirm Supabase automated backups for your plan; do one test restore.
- [ ] **`[TODO]` Health checks + auto-restart** (`/healthz` exists — wire Render's health check + an external uptime monitor).
- [x] **`[DONE]` Graceful degradation.** Anthropic 429/529/5xx **auto-retry with backoff** (`maxRetries` in `llm.ts`); background jobs isolate failures; and the UI now shows a **"⚠️ the AI was busy — Try again"** button on a final overview/build failure (`showGenError` in `app.js`).
- [ ] **`[TODO]` Scaling note.** Artifacts + uploads use in-memory caches/Maps; a second instance won't share them. Either pin to one instance or move that state to the DB/Redis before scaling horizontally.

## 7. Observability & ops `[TODO]`
- [ ] **Error tracking** (Sentry or similar) on server + client.
- [x] **`[DONE]` LLM tracing (Langfuse) — live path.** Wired into BOTH `runOverviewJob` and `runBuildJob` in `orchestrator.ts`: per-job `makeLangfuseHandler()` → `config = {callbacks, runName:"lesson:…", metadata:{langfuseTags,stage}}` passed to `profiler`/`architect`/`runDeepDive` (`retriever` takes no config), `flushAsync()` in each `finally`. Legacy `/api/learn` unchanged. Verified live: traces named `lesson:…` with `ChatAnthropic` GENERATION observations (model + tokens) land in Langfuse. CAVEAT: `langfuseTags` doesn't populate trace `tags` in the installed lib version (filter by `name`). **Set `LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY`(+`LANGFUSE_BASEURL`) in Render to trace prod.**
- [ ] **Product analytics** (signups, activation = first lesson, conversion to paid, churn).
- [ ] **Logging + alerting** on error rate, spend spikes, job failures.
- [ ] **Status page / incident runbook** (what to do when Anthropic is down, DB is down, spend spikes).

## 8. Product gaps for a paid product `[TODO]`
- [ ] **Pricing page + upgrade CTA** in the app.
- [ ] **Account/billing UI** (plan, credits remaining, invoices, manage subscription).
- [ ] **Onboarding** (first-run guidance; you have the sign-up profile + suggested topics — extend into a clear "generate your first lesson" path).
- [ ] **Transactional email** (verify, reset, receipt, "your lesson is ready", failed-payment) — pick a provider (Supabase handles auth emails; add the rest via Resend/Postmark).
- [ ] **Support channel** (help email / docs / FAQ) + a feedback loop (ratings already exist — route low ratings somewhere you'll see).
- [ ] **Empty/error states** reviewed for a paying user (no dead ends).

## 9. IP & content (the part most AI-content products under-think)
- [ ] **`[TODO]` Knowledge-base IP audit** — the RAG corpus (`~/Documents/AI Knowledge base` + the `chunks` table) must not contain substantial **verbatim copyrighted/paywalled** text. Citation handles *attribution*, not *copyright* — facts/ideas aren't copyrightable, but reproducing protected *expression* needs a license or fair use. Audit + quarantine/remove what can't be used. **(Use the IP-check prompt the user holds.)**
- [ ] **`[TODO]` Output IP stance.** Decide + state who owns a generated lesson (typically: the user owns their output; you grant a license), and that AI output isn't itself copyrightable in some jurisdictions. Put it in the ToS.
- [ ] **`[TODO]` Trademarks/logos.** Lessons name tools (LangChain, etc.) — nominative use of names is fine; don't reproduce logos/branding as if endorsed. The KB catalog/links should point to official sources, not host their assets.
- [ ] **`[TODO]` Third-party code snippets.** If lessons emit code copied from license-restricted repos (GPL, etc.), that's a license issue — prefer original/pseudocode (the prompts already lean this way; keep verifying).
- [ ] **`[TODO]` Continuous content refinement.** The KB drives quality; set a recurring **ingest → audit → refresh** loop (a regular-update system was designed but deferred). Track source freshness (`Last updated`), prune stale/low-trust sources, and re-run the IP audit on every KB addition. Add a "report this lesson" path so users flag bad/biased/infringing content and you can correct + re-generate.

## 10. Go-live smoke test (run end-to-end before flipping signups on)
- [ ] New user signs up → verifies email → sees pricing.
- [ ] Pays (test mode) → credits/entitlement granted → webhook synced.
- [ ] Generates a lesson → credit decremented → lesson opens in Trainer → downloads.
- [ ] Runs out of credits → blocked with an upgrade CTA (no silent free generation).
- [ ] Signed-out user can browse Library but cannot generate.
- [ ] `/healthz` `db:true`; error tracking receives a test error; spend shows in Anthropic + Langfuse.
- [ ] Account deletion works; data export works.
- [ ] Legal pages reachable from footer + checkout.

---

# DEFERRED MEDIA FEATURES (look into later)
Both honor the app's core invariant — **the model emits DATA, a deterministic engine renders the
media** — so they're correct, cheap, and theme-consistent. Both are **expensive per unit**, so each
must run as a **background, credit-gated job** (never inline) with **content-hash caching** so
re-plays are free. Neither should touch the core text-generation path.

## 11. Audio narration (TTS, no actor) `[TODO / later]`
**Goal:** let a learner *listen* to a lesson or a module — accessibility + a "watch-free" mode.

**Tiered approach (ship cheapest first):**
- **Tier A — FREE, zero-infra (MVP): browser Web Speech API (`speechSynthesis`).** A "🔊 Listen"
  button in the artifact runtime reads the visible lesson/module text aloud using the user's OS
  voices. $0, no API, no storage, no server load; play/pause/per-section. Quality varies by OS and
  it's not a downloadable file — fine for a first version. (Add in `src/render/runtime.ts`.)
- **Tier B — OSS, real audio files, ~$0 marginal: run a local model like the embedder.** Use
  **Kokoro-82M** (Apache-2.0, tiny, good quality, ONNX/`kokoro-js`) or **Piper** (MIT) **in the Node
  server** — exactly the pattern as the bge-small embedding model in `src/rag/embed.ts`. Produces an
  MP3/WAV you can store and replay. Consistent voice, downloadable, works offline. This is the
  recommended "real" tier.
- **Tier C — paid (only if a premium voice becomes a selling point):** OpenAI TTS / Google Cloud TTS
  / Deepgram Aura / ElevenLabs. Recurring per-character cost — avoid until justified.

**How it plugs in:**
- **Narration text ≠ raw prose.** Add an optional `narration` (a spoken-friendly script) per module,
  or a small LLM step that turns a built module into a listenable script (short sentences, no code
  dumps read aloud). Keep DATA-only: the script is a field; the renderer/engine makes the audio.
- **Player UI** in the artifact runtime (per-module play, optional highlight-follow).
- **Storage:** audio files in object storage (Supabase Storage / S3); URL referenced from the
  blueprint/lesson. **Cache by content hash** so the same module isn't re-synthesized.
- **Cost/gating:** Tier A is free → keep ungated. Tier B/C file generation = a **background job,
  credit-gated**, cached.
- **Compliance:** Kokoro (Apache) / Piper (MIT) licenses are fine; **disclose AI voice**; never clone
  a real/celebrity voice. Add the TTS provider to the privacy sub-processor list (§5) if using a
  hosted one.

**Build outline (for a future session):** add `narration?` to the schema → a `narrate` step
(Kokoro via transformers.js, mirroring `embed.ts`) → object-storage upload + content-hash cache → a
player in `runtime.ts` → a background, credit-gated job. Verify locally with one module before commit.

## 12. AI explainer videos (no actor — "board" that draws diagrams / types code) `[TODO / later]`
**Goal:** short explainer clips where a diagram is *drawn* and code is *typed on a board* with
narration — for beginners who can't visualize from code/prose. **No actor.**

**Do NOT use generative video models (Veo / Sora / Kling) for this** — they make cinematic b-roll but
**cannot render correct code, accurate diagrams, or legible labels** (they hallucinate garbled text).
This is **programmatic animation + TTS**, not generative video.

**Pipeline:** LLM authors a **storyboard** (ordered scenes: `draw-diagram | type-code | reveal-step |
highlight`, each with narration) → a **code-driven animation engine** renders it to video → **TTS**
(reuse §11 Kokoro/Piper) makes the voiceover → **ffmpeg** muxes audio+video → MP4. The LLM only
emits the storyboard DATA; the engine owns the pixels, so code/diagrams are always correct.

**Engine options (pick one):**
- **Motion Canvas** (TypeScript, MIT) — purpose-built for code+diagram explainer videos (typewriter
  code, highlighting, draw-on diagrams). Best fit: TS, and it can **reuse the diagram template
  library** (§ the diagrams work just added in `src/render/diagrams.ts`).
- **Remotion** (React → MP4 via headless Chrome) — reuse the existing SVG/diagram components as React
  compositions. ⚠️ **Check Remotion's license** — it requires a company license above a small-team
  threshold.
- **Manim** (Python, MIT) — the polished 3Blue1Brown "board" look; `manim-voiceover` syncs narration.
  Separate Python sidecar.
- **Lowest-new-tech:** a "presentation mode" that animates the EXISTING diagram/code/scroll-reveal
  components step-by-step, **screen-recorded headlessly** (Playwright `recordVideo`, or headless
  Chrome + ffmpeg), with the TTS track overlaid. Reuses everything already built.

**Storyboard schema (model emits DATA):** `videoStoryboard = { scenes: [{ visual: <diagram-template |
code | highlight | callout>, data, narration, durationHint }] }`. Reuse the diagram templates +
codeExample shapes — the model picks a template per scene, supplies data + narration.

**Operational (critical):** video rendering is **CPU/GPU-heavy and slow** (seconds–minutes per clip).
Run it as a **background job on a worker**, **never inline in a request**; **cache by content hash**;
store the MP4 in object storage; expose a **"🎬 Make explainer video"** button per lesson/module. It is
**far pricier than a text lesson**, so make it a **premium / opt-in, heavily-metered** action.

**Compliance:** AI-generated (disclose); voice-model license (§11); render our own visuals so no
third-party logos and no SynthID/watermark concerns.

**Build outline (for a future session):** `videoStoryboard` schema + an LLM storyboard step (reuse the
diagram templates) → a Motion-Canvas (or presentation-mode + Playwright-record) renderer → Kokoro
narration → ffmpeg mux → object storage + content-hash cache → a background, credit-gated job → the
"Make explainer video" button. Verify with one short clip locally before committing.

