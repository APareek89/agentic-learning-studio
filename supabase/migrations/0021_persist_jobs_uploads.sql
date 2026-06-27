-- Horizontal-scaling groundwork: persist generation-job progress + uploaded-doc grounding so any
-- instance can serve a poll / a build (in-memory stays the fast path; these are write-through +
-- cross-instance fallback). Additive + idempotent. RLS enabled with NO policy (server-role only),
-- matching the rest of the schema. Text PKs (ids are app-generated UUID strings).

-- ---- Generation job progress (read cross-instance by GET /api/job/:id when not in local memory) ----
create table if not exists gen_jobs (
  id          text primary key,
  user_id     text,
  status      text,
  stage       text,
  error       text,
  data        jsonb not null default '{}'::jsonb,   -- the full Job tracker (lessons[], percent, …)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table gen_jobs enable row level security;
create index if not exists gen_jobs_user_updated_idx on gen_jobs (user_id, updated_at);

-- ---- Uploaded docs/repos (chunks + local embeddings) so a build on another instance can hydrate ----
create table if not exists upload_docs (
  id           text primary key,
  title        text,
  source_type  text,
  chunks       jsonb not null default '[]'::jsonb,  -- [{content, title, embedding:number[]}] (bge-small 384d)
  created_at   timestamptz not null default now()
);
alter table upload_docs enable row level security;
create index if not exists upload_docs_created_idx on upload_docs (created_at);
