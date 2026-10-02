# Free workflow FMEA — 2 October 2026

Current changes are local and unreleased. Normal Auth.js sign-in, owner-scoped PostgreSQL repositories, cached lesson/notebook flow, and an authored overview→approved five-module lesson driver were checked without real provider calls. See `docs/qa/2026-10-02/REPORT.md`, `fmea.json`, and `validation.json` for evidence boundaries.

Reproduced fixes: durable sign-out revocation; verified database TLS protected from URL overrides; cached artifact deep-copy isolation; document-only requests fail before planning when uploads are unavailable; safe detached-job provider errors; and removal of the outer coverage-brief retry that duplicated definitive rejections.

**Release prerequisite:** apply `supabase/migrations/0022_revocable_sessions.sql` to the app PostgreSQL database and grant the existing runtime role DML access before deploying the updated authentication. The directory name is historical; this is not a Supabase deployment. Existing sessions without a durable session ID must sign in again. No migration or code was deployed by this audit.

SDK and helper retries and automatic cross-provider fallback are disabled. Failed module polls are read-only; starting a new attempt requires the explicit Retry module action. A failed notebook generation uses a labelled provider-free fallback. The SDK callback records known tokens before application parsing; unknown usage stays unknown. These operational receipts are not an atomic spend ledger or invoice reconciliation.

Known-output editorial passes remain bounded: at most one density pass, one code-length pass and one code-gate repair per module, plus at most two notebook verification passes (the second only after a completed review requests correction). Every pass uses the same no-transport-retry factory and emits its own usage receipt. No automatic repeat follows a transport or parse failure. Synthetic lesson text proves orchestration and validation, not live teaching quality.

Prepared examples are identified in server-owned metadata, with conservative recognition of historical cached examples. They cannot be published as original community work and never trigger the share nudge. Mobile lessons use the remaining viewport; the module rail overlays the canvas and closes on selection. Root visually accepted the prepared390×844flow:670.5pxiframe, no horizontal overflow, working module2navigation and no share popup. This is cached-flow evidence, not paid generation.

Scores prioritize review (Severity × Occurrence × Detection); they are judgments, not measured production failure rates. Each row records its own evidence level. Local fixture passes do not imply provider quality, deployed behavior, or screenshot acceptance. Existing live receipts remain unchanged.
