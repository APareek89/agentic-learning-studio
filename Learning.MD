# Learning notes

## 2026-10-01 — bounded follow-up model selection

The quick-question endpoint always selected the main tier, so a smallest-model check could not use the already configured mini model. The request contract exposed no tier choice; environment changes would affect all users. Added only an optional `haiku`/`sonnet` allowlist, keeping the existing default, ownership checks, 500-token cap and zero retries. An actual Express/SDK offline regression rejects invalid tiers without dispatch and checks both configured mappings. The root operator subsequently deployed the isolated image update and verified one ordinary owned-lesson follow-up using gpt-5.4-mini: 193 input and 50 output tokens, estimated USD0.00036975. The saved lesson hash remained unchanged. This checks the follow-up path, not a complete new lesson generation.
