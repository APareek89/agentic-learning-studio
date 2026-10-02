# Agentic Learning Studio

Explore agentic AI through interactive lesson maps, worked examples, knowledge checks, and Python notebooks. Create lessons from a topic, uploaded documents, or a public repository; save and revisit them from your account.

**Live app:** [agentic.3-6-183-210.sslip.io](https://agentic.3-6-183-210.sslip.io). Verified on 30 September 2026: account access, saved lessons, knowledge checks, runnable notebooks, private uploads, and an OpenAI follow-up response.

## Try the live app

1. Open the app, choose **Sign up**, and create an account with your email and a password of at least 12 characters.
2. Skip optional onboarding if you prefer, then choose **Try with an example** in the lesson builder. It saves a cached Agent Memory lesson to your account without a model call.
3. Explore its modules and knowledge check. Choose **Get Hands on** to open the Python notebook, then **Run all** to see the example execute in your browser.

## Three-step local quickstart

1. Install Node.js22 or newer, clone this repository, and run `npm ci --ignore-scripts`.
2. Run `npm run demo`. It uses bundled fixtures, drops inherited credentials, and makes no paid calls.
3. Open [localhost:5070](http://127.0.0.1:5070). Browse **Library**, or choose **Try Agent Memory** in the demo banner, load the overview, build the cached lesson, and download it.

The standalone demo does not require a database or account. It identifies itself on screen, serves100 bundled lessons, and resets its in-memory progress on restart. Uploads and new model generation are disabled there.

## Main application

The deployed app uses Express, Auth.js Credentials with bcrypt, PostgreSQL/pgvector, and private S3 storage. Existing lesson and user IDs survive migration. Private lessons, uploads, jobs, skills, and notebooks are scoped to the signed-in user. The shared UI uses Inter, Roboto Mono, Lucide, and the Lovable light/dark token system.

Production explicitly selects OpenAI as the primary provider: GPT-5.5 for larger tasks and GPT-5.4 Mini for smaller tasks. This applies to lessons, follow-up questions, notebooks, skills, and grading. Anthropic remains configurable; its account credit limit blocked the initial live attempts. No Anthropic request is made in OpenAI primary mode.

For real local authentication and persistence, configure the empty placeholders in `.env.example`, prepare the canonical database schema, and start with `ALS_MOCK_MODE=1 npm start`. PostgreSQL, `AUTH_SECRET`, and `APP_URL` are required. **Try with an example** opens a saved cached lesson and runnable notebook without a model call. New paid generation stays disabled in mock mode.

See [authentication and deployment](docs/auth-and-launch.md) for verified database TLS, runtime secrets, one-time setup for imported passwordless accounts, and Docker configuration. Email password reset and Google sign-in are not enabled. Historical SQL and the legacy Render blueprint are retained as references, not as deployment instructions.

Repository input supports public repositories; private repository PAT/OAuth access is not implemented. Live paid verification covers one successful follow-up response. Full new-lesson and skill generation were not exercised live; their provider and structured-output paths are covered by offline SDK tests.

## Checks

`npm run check` type-checks the app. With the standalone demo running, `npm run test:demo` verifies all100 fixtures and its cached learning loop. `npm run test:auth` uses only a disposable loopback `*_test` PostgreSQL database and checks real password sessions, CSRF, account isolation, claims, quizzes, notebooks, progress, and downloads. It supplies no provider credentials.

`npm run test:provider-wire` verifies both provider integrations with mocked SDK responses, including streaming structured output and failure handling. `npm run test:embedding-batches` verifies bounded local embedding batches and concurrent account context without downloading a model.

Production uses the included Dockerfile on AWS in ap-south-1. Secrets come from SSM at boot; none belong in source control. `/healthz` returns503 when PostgreSQL is unavailable. The approved production model tiers were confirmed by a read-only model-list request; no generation is needed to verify availability.

### Follow-up model selection

Authenticated `POST /api/ask` accepts an optional `modelTier`: `haiku` uses the configured smaller model; `sonnet` uses the configured main model. Omitting it retains `sonnet`. Raw model IDs and other values are rejected. Both choices keep the same owned-lesson check, 500-token output limit and zero SDK retries. This selects one follow-up response, not a new lesson build.


### Local free QA and session migration

The October2 review is documented in [the FMEA report](docs/qa/2026-10-02/REPORT.md). Updated authentication requires the additive `0022_revocable_sessions.sql` migration before deployment; sign-out revokes a durable session, including copied cookies. Old sessions require a new sign-in. Document-only generation stops if its uploaded sources are unavailable. Detached generation errors use safe messages, and a failed coverage-brief step is not automatically repeated by the overview driver. No live model-quality claim is made by the fixture suite.

Authoring model attempts now have zero automatic SDK/helper retries and no automatic cross-provider fallback. Failed sections remain explicit Retry module actions; automatic polling never repurchases them. Known-output editorial repairs are bounded and emit separate usage receipts. See the FMEA report for their limits and the remaining whole-lesson billing limitation. Prepared examples remain free, cannot be republished as original work, and use the responsive mobile lesson viewer.
