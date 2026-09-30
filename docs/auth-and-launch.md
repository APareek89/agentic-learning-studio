# Authentication and deployment

The main server requires PostgreSQL and `AUTH_SECRET` (at least 32 random characters). Set `APP_URL` to the deployed HTTPS origin. Auth.js uses host-only encrypted HttpOnly cookies. Proxy forwarding must come through the one trusted reverse proxy.

Required runtime configuration:

- `DATABASE_URL`, `DATABASE_SSL_CA_FILE`: private PostgreSQL with verified TLS. `DATABASE_SSL=disable` is accepted only for loopback development connections.
- `AUTH_SECRET`, `APP_URL`, `PORT` (5070 by default).
- `ALS_MOCK_MODE=1`: real authentication, database, cached reading and notebooks; generation fails closed. Use for smoke tests and UI review.
- `STORAGE_BUCKET`, AWS region/instance-role credentials, `MEDIA_PUBLIC_BASE_URL=/media`: data worker's private storage and allowlisted thumbnail proxy. Private upload JSON has no public route.
- Provider keys/model IDs are supplied only at runtime by the infra owner's SSM flow. Do not put them in this repository or Docker image.
- `ALS_PRIMARY_PROVIDER=anthropic|openai` selects the provider for every generation feature. Default is `anthropic`; the deployment can select `openai` with verified `gpt-5.5` / `gpt-5.4-mini` IDs. OpenAI primary makes no Anthropic calls and has no secondary-provider fallback. A missing selected-provider key fails closed; it never silently switches providers. Mock mode blocks both providers.

Build the included Dockerfile. It runs as `node`, exposes5070, and checks `/healthz`; database loss makes health return503. Restore/migrate the schema before starting; the migration workstream supplies canonical users/ownership columns. The old migration command is retired. Apply the reviewed `migrations/20260930_data_ownership.sql` only after the verified one-time restore. The restore must not be rerun after account/example seeding.

For an imported passwordless account, verify the owner out of band, then run `npm run auth:claim -- USER_UUID /private/absolute/output-file` with privileged database access and the correct APP_URL. The file must be new and outside this repository. It contains a one-use link expiring in24hours. Deliver it privately. Issuing another token invalidates the previous token. Passwords already present cannot be replaced by this tool. Tokens are never printed by the tool or generated automatically during import. Email-only reset and Google OAuth are not enabled.

Local integration: create a disposable loopback `*_test` PostgreSQL database and set `TEST_DATABASE_URL`; run `npm run test:auth`. It refuses remote databases, supplies no provider keys, and seeds synthetic data only. `KEEP_AUTH_PREVIEW=1` retains the app at5072 after checks. `npm run demo` remains the separate database-free fixture preview at5070.

For a controlled paid proof, root can use `/api/ask` on its own cached lesson after mock review. That path disables retries/fallback and caps generated tokens at500. With GPT-5.5 it explicitly sets `reasoning_effort=none`; `max_completion_tokens` includes hidden formatting and any reasoning tokens, so the cap is not a promise of500 visible words or tokens. Safe logs include provider/model/request identifiers, total input/output tokens, cached input, reasoning tokens, and fixed error categories. All other generation paths remain untouched during that proof.

OpenAI structured output uses function calling to preserve the existing optional schema fields. Anthropic cache-control fields are removed before OpenAI requests. `npm run test:provider-wire` exercises the real SDK with mocked JSON/SSE responses and no provider calls. Model metadata access proves availability, not account balance. [GPT-5.5 settings](https://developers.openai.com/api/docs/models/gpt-5.5) and [token accounting](https://developers.openai.com/api/docs/guides/token-counting) were checked on2026-09-30.

Admin access requires explicit `ADMIN_EMAILS` plus a preserved verified-email record. Fresh, unverified signups cannot gain admin access just by choosing an allowlisted email.

Repository input currently accepts public repository URLs only. Private repository PAT/OAuth access is not implemented; upload relevant private source files as content instead.
