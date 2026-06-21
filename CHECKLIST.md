# GO-LIVE CHECKLIST — Agentic Learning Studio

Everything needed to take the app public so users can **sign up → pay → generate lessons**.
Status tags: `[DONE]` already in the app · `[PARTIAL]` started, needs finishing · `[TODO]` not built.
> Not legal advice. The Compliance/Legal items need a real lawyer — this lists *what* you need, not a substitute for counsel.

---

## 0. CRITICAL BLOCKERS — do these first, nothing else matters until they're green
- [ ] **`[PARTIAL]` Fix prod env on Render.** `DATABASE_URL` + `SUPABASE_URL`/`SUPABASE_ANON_KEY` must be the **new** project `kdgtlbnlyscdldogxorb`, password `@`→`%40`. A wrong/old value = empty dashboard, failed downloads, 401s on every gated route. Verify: `GET /healthz` → `db:true`. (See HANDOFF §2.)
- [ ] **`[TODO]` Per-user spend cap / credit metering (THE money risk).** One lesson = an Opus skeleton + ~5 Sonnet module builds = a meaningful Anthropic bill. With open signups and no cap, a handful of users (or one abuser) can run your API spend to the moon. **Do not open signups until generation is metered and gated by a credit/quota the user has paid for or been granted.** (See §2 + §3.)
- [ ] **`[TODO]` Lock down the database surface.** The app talks to Postgres via a server pool, but Supabase also auto-exposes a PostgREST API on the **anon key** (which is shipped to the browser). Enable **Row-Level Security on every table** (`lessons`, `user_preferences`, `prebuilt_lessons`, `chunks`, `module_cache`, `documents`, …) or confirm PostgREST is disabled — otherwise anyone with the public anon key can read/modify rows. This is the single most common Supabase leak.
- [ ] **`[TODO]` Rate-limit the public + expensive routes.** `/api/generate` (spend), `/api/upload` + `/api/upload-repo` (now public; CPU + repo-clone), `/api/module` + `/api/check` (public). Add per-IP + per-user rate limits and a global concurrency cap so one client can't fan out.
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

## 2. Cost control & abuse prevention `[TODO]`
- [ ] **Hard budget alarms on the Anthropic key.** Set spend alerts/limits in the Anthropic console; consider separate keys per environment.
- [ ] **Per-user generation quota** (ties to §1 credits) enforced server-side, not just in the UI.
- [ ] **Throttle background jobs.** Cap concurrent `runJob`s globally and per user (a course can be 5 lessons × 6 model calls).
- [ ] **Abuse bounds on uploads/repo clone** (already: ≤400 files / ≤4MB / 90s) — keep, and add per-user/day limits.
- [ ] **Input caps.** Max prompt length, max uploads per session, max repo size — reject early with a clear message.
- [ ] **Bot/signup abuse.** CAPTCHA or email-verification gate on signup so bots can't farm free generations.

## 3. Auth & account management
- [ ] **`[DONE]` Email/password auth** (Supabase, on-demand modal).
- [ ] **`[PARTIAL]` Email verification ON** (Supabase → Auth → confirm email) so the verify-email flow + link work; required before granting credits.
- [ ] **`[TODO]` Password reset** (Supabase reset email + a reset page).
- [ ] **`[TODO]` Account deletion + data export** (GDPR/CCPA "right to erasure / portability"): a user can delete their account and download their data.
- [ ] **`[TODO]` Session/security basics.** Token expiry handling in the UI (re-auth on 401), sign-out everywhere.
- [ ] **`[TODO]` (Optional) OAuth** (Google) to reduce signup friction.

## 4. Security & data protection
- [ ] **`[DONE]` Secrets out of git** (`.env` git-ignored; Render env `sync:false`). Add a **key-rotation** plan + least-privilege keys (anon key is public by design; never ship the service-role key).
- [ ] **`[TODO]` RLS on all tables** (see §0) — the load-bearing one.
- [ ] **`[TODO]` HTTPS + secure headers.** Render gives TLS; add `helmet` (CSP, HSTS, X-Frame-Options) on the Express app. Note generated lessons inline JS — set a CSP that still allows the artifact runtime, or sandbox the iframe.
- [ ] **`[TODO]` CORS lockdown.** Restrict `/api/*` to your own origin (currently open).
- [ ] **`[TODO]` Input validation everywhere** (already partial via Zod on the Blueprint; validate all request bodies — filenames, repoUrl already regex-checked, base64 size, etc.).
- [ ] **`[TODO]` Dependency + supply-chain audit.** `npm audit`, pin versions, enable Dependabot; the artifact runs inline JS so XSS in lesson content must stay impossible (renderer escapes — keep it that way; never interpolate unescaped model text).
- [ ] **`[TODO]` PII minimization.** You store email + lesson prompts (may contain user context). Document what's stored, encrypt at rest (Supabase does), and set retention (§5).
- [ ] **`[TODO]` Content moderation.** Users type free-text prompts and upload docs → run prompts/outputs through a moderation check (Anthropic's safety + your own policy) so the product can't be used to generate disallowed content; log + block.

## 5. Compliance & legal `[TODO]` (lawyer-reviewed)
- [ ] **Terms of Service** (incl. acceptable use, no-warranty on AI output, liability cap).
- [ ] **Privacy Policy** (what you collect — email, prompts, uploads, usage; processors — Anthropic, Supabase, Render, billing provider; data location; retention; user rights).
- [ ] **AI-content disclosure** — lessons are AI-generated; say so, and that they may contain errors (you already have a separate content-validation step elsewhere — reference it).
- [ ] **DPA / sub-processor list** (Anthropic, Supabase, Render, Paddle/Stripe). Anthropic API data is not trained on by default — cite that in your privacy stance.
- [ ] **GDPR/CCPA**: consent for analytics/cookies, data-subject request process, deletion/export (§3).
- [ ] **Refund/cancellation policy** (your MoR may mandate one).
- [ ] **Data retention policy** — the app already keeps generated lessons 30 days; document it and apply consistently (uploads are in-memory/session — note that).

## 6. Infrastructure & reliability
- [ ] **`[PARTIAL]` Hosting plan sized right.** Render `standard` (2GB) — the local ONNX embedding model (~128MB) loads in memory; `starter` (512MB) may OOM. Confirm the plan + a persistent disk for `TRANSFORMERS_CACHE` so the model doesn't re-download each cold start.
- [ ] **`[TODO]` DB backups + restore drill.** Confirm Supabase automated backups for your plan; do one test restore.
- [ ] **`[TODO]` Health checks + auto-restart** (`/healthz` exists — wire Render's health check + an external uptime monitor).
- [ ] **`[TODO]` Graceful degradation.** Anthropic 429/529 and timeouts → user-facing retry, not a hang; background jobs already isolate failures — verify the UI surfaces them.
- [ ] **`[TODO]` Scaling note.** Artifacts + uploads use in-memory caches/Maps; a second instance won't share them. Either pin to one instance or move that state to the DB/Redis before scaling horizontally.

## 7. Observability & ops `[TODO]`
- [ ] **Error tracking** (Sentry or similar) on server + client.
- [ ] **LLM tracing** — Langfuse is already wired (optional keys); turn it on in prod to watch cost/latency/failures per generation.
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
```
