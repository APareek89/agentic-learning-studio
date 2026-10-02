# Free workflow FMEA — 2 October 2026

The reviewed runtime is deployed; the root release and normal-auth receipts are recorded below. Normal Auth.js sign-in, owner-scoped PostgreSQL repositories, cached lesson/notebook flow, and an authored overview→approved five-module lesson driver were checked without real provider calls. See `docs/qa/2026-10-02/REPORT.md`, `fmea.json`, and `validation.json` for evidence boundaries.

Reproduced fixes: durable sign-out revocation; verified database TLS protected from URL overrides; cached artifact deep-copy isolation; document-only requests fail before planning when uploads are unavailable; safe detached-job provider errors; and removal of the outer coverage-brief retry that duplicated definitive rejections.

**Release prerequisite satisfied:** root applied additive `supabase/migrations/0022_revocable_sessions.sql` before activation. The admin-owned table grants runtime DML without TRUNCATE or public privileges; existing user/lesson counts and original schema remain unchanged. The directory name is historical; this is not a Supabase deployment. Existing sessions without a durable session ID must sign in again. See `auth-migration.json`.

SDK and helper retries and automatic cross-provider fallback are disabled. Failed module polls are read-only; starting a new attempt requires the explicit Retry module action. A failed notebook generation uses a labelled provider-free fallback. The SDK callback records known tokens before application parsing; unknown usage stays unknown. These operational receipts are not an atomic spend ledger or invoice reconciliation.

Known-output editorial passes remain bounded: at most one density pass, one code-length pass and one code-gate repair per module, plus at most two notebook verification passes (the second only after a completed review requests correction). Every pass uses the same no-transport-retry factory and emits its own usage receipt. No automatic repeat follows a transport or parse failure. Synthetic lesson text proves orchestration and validation, not live teaching quality.

Prepared examples are identified in server-owned metadata, with conservative recognition of historical cached examples. They cannot be published as original community work and never trigger the share nudge. Mobile lessons use the remaining viewport; the module rail overlays the canvas and closes on selection. Root visually accepted the prepared390×844flow:670.5pxiframe, no horizontal overflow, working module2navigation and no share popup. This is cached-flow evidence, not paid generation.

Scores prioritize review (Severity × Occurrence × Detection); they are judgments, not measured production failure rates. Each row records its own evidence level. Local fixture passes do not imply provider quality, deployed behavior, or screenshot acceptance. Existing live receipts remain unchanged.

## Root release and live authentication verification

Root activated image `d9692b8d4dc0` with authentication enabled, mock mode disabled, and environment/mounts/runtime bounds preserved. Nine live checks passed through an existing synthetic account: owned lesson reads work, normal sign-out succeeds, and a copied former cookie cannot read lessons (401) or recover a signed-in session. No provider request, new user or business-data write was made. See `aws-release.json` and `live-auth.json`. The first verifier attempt wrongly treated the valid signed-out null response as an object; its retained receipt records that harness-only correction (`live-auth-first-attempt.json`). This is live auth acceptance, not full paid lesson authoring or billing reconciliation.
