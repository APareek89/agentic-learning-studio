# Learning notes

## 2026-10-01 — bounded follow-up model selection

The quick-question endpoint always selected the main tier, so a smallest-model check could not use the already configured mini model. The request contract exposed no tier choice; environment changes would affect all users. Added only an optional `haiku`/`sonnet` allowlist, keeping the existing default, ownership checks, 500-token cap and zero retries. An actual Express/SDK offline regression rejects invalid tiers without dispatch and checks both configured mappings. No live model request or deployment was made by this change.
