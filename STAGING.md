# STAGING — test changes safely before production

**One repo. Two branches. Two Render services. Two Supabase projects.** The code is the
same everywhere — what differs is *which branch deploys where* and *which keys/database the
running server points at* (the environment variables). You do **not** need a second copy of
the repo on your laptop.

```
            CODE (one repo)                ENV VARS decide the rest
  local laptop  ──push──▶  staging branch ──auto-deploy──▶  staging Render ──▶ staging Supabase
       │                        │                                                   ▲
       │                        └── merge when happy ──▶ main branch ──▶ prod Render ──▶ prod Supabase
       └── your .env points at STAGING (never prod)
```

Three "lanes": **local → staging → production.** Each has its own database, so testing never
touches real users' data or production spend.

---

## What you already have
- **Production**: `main` branch → Render service `agentic-learning-studio` → **prod** Supabase
  (`kdgtlbnlyscdldogxorb`) → live at **https://prathibhax.com**.
- **Staging Supabase project**: you just created it. Grab its 3 values (below). It starts
  **empty** — no tables, no Library, no users — so we run migrations into it first.

---

## 📋 The paste-map — which value goes where
Get these from your **staging** Supabase project:
- `DATABASE_URL` → Supabase → **Connect** → **Session pooler** URI. ⚠️ write the password's `@` as `%40`.
- `SUPABASE_URL` → Settings → **API** → Project URL (e.g. `https://<staging-ref>.supabase.co`).
- `SUPABASE_ANON_KEY` → Settings → **API** → the **anon / public** key (NEVER the `service_role` key).

| Value | Paste into LOCAL `.env` | Paste into STAGING Render env | Paste into PROD Render env |
|---|---|---|---|
| `DATABASE_URL` | **staging** pooler URI | **staging** pooler URI | prod (already set) |
| `SUPABASE_URL` | **staging** URL | **staging** URL | prod (already set) |
| `SUPABASE_ANON_KEY` | **staging** anon key | **staging** anon key | prod (already set) |
| `ANTHROPIC_API_KEY` | your key (or a 2nd staging key) | same | prod (already set) |
| `LANGFUSE_*` | optional | optional | as set |
| `TRANSFORMERS_CACHE` | (default) | `/opt/render/project/src/.transformers-cache` | same |
| `EXTRA_ORIGINS` | — | *(optional)* the staging site's own URL | — |

> **Key rule:** your **local `.env` should point at STAGING, not production.** That's the fix for
> the current setup where local testing wrote to the prod database.

---

## Step 1 — point local at staging + create its tables
1. Edit your local **`.env`**: set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` to the **staging** values from the table above.
2. Create all tables in the staging DB (runs migrations `0001`→`0009`):
   ```bash
   NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem" \
     npm run migrate
   ```
   (It reads `DATABASE_URL` from your `.env`.) You should see `✓ All migrations applied.`
3. Run locally and confirm it's pointing at staging:
   ```bash
   NODE_EXTRA_CA_CERTS=".../system-ca-bundle.pem" PORT=5070 npm start
   # then: curl localhost:5070/healthz  → {"db":true,"auth":true}
   ```

## Step 2 (optional) — populate staging
A fresh staging DB has no Library and an empty knowledge base. For most testing that's fine
(generation still works from Claude's own knowledge). If you want the Library populated:
```bash
NODE_EXTRA_CA_CERTS=".../system-ca-bundle.pem" npx tsx scripts/seed-library.ts   # ~free, from prebuilt/*.json
```
(The RAG knowledge base stays empty unless you run an ingest — optional for staging.)

## Step 3 — create the staging Render service
In **dashboard.render.com → New + → Web Service**:
- **Repo**: `APareek89/agentic-learning-studio`  ·  **Branch**: **`staging`**
- **Build**: `npm install`  ·  **Start**: `npm start`  ·  **Health check**: `/healthz`
- **Instance**: **Starter (512 MB)** is fine for UI/flow testing to save money; use **Standard (2 GB)**
  if you'll test many *full* generations (the embedding model needs RAM). Add a 1 GB disk at
  `/opt/render/project/src/.transformers-cache` if you want to avoid re-downloading the model.
- **Env vars**: paste the **staging** column from the table above.
- It deploys to a URL like `https://agentic-learning-studio-staging.onrender.com`. (The site
  calls its own API same-origin, so no CORS change is needed; set `EXTRA_ORIGINS` only if you
  ever call it from a different origin.)

## Step 4 — the everyday workflow
1. **Code locally** (your `.env` → staging) and test at `localhost:5070`.
2. `git push origin staging` → Render auto-deploys the **staging URL** → click around / run a real lesson.
3. When happy: **merge `staging` → `main`** → production deploys to prathibhax.com.
4. **Migrations:** if a change adds a `supabase/migrations/00NN_*.sql`, run it against **staging first**
   (Step 1.2), verify, then against **production** by passing the prod URL inline (without editing `.env`):
   ```bash
   DATABASE_URL="<PROD pooler URI>" NODE_EXTRA_CA_CERTS=".../system-ca-bundle.pem" npm run migrate
   ```
   (Render does **not** auto-run migrations — it's this manual step.)

---

## Gotchas
- **Never put prod keys in your local `.env`** again — keep local on staging.
- A migration must be run on **each** database separately (staging, then prod) — they're now separate projects.
- Staging Supabase free tier may **pause when idle** — just open its dashboard to wake it.
- Production env on Render is unchanged; do not edit it while setting up staging.
