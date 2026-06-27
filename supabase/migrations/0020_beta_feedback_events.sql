-- Beta launch (one-week traction check): free-text feedback + lightweight product events.
-- Additive + idempotent (the runner re-applies every file). RLS enabled with NO policy, matching
-- the rest of the schema — access only via the server's `postgres` role (rolbypassrls); the
-- anon/authenticated browser roles get no direct access.

-- ---- User feedback (the "Help us improve before full launch" popup) ----
create table if not exists feedback (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  user_id     text,                 -- null for anonymous
  user_email  text,                 -- null for anonymous
  message     text not null,
  user_agent  text,
  ip_hash     text                  -- sha256 of the IP — never the raw IP
);
alter table feedback enable row level security;
create index if not exists feedback_created_idx on feedback (created_at);

-- ---- Lightweight product events (signups, lessons generated/completed, library opens, skills) ----
create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null,        -- e.g. 'signup' | 'lesson_generated' | 'library_lesson_opened' | 'lesson_completed' | 'skill_generated'
  user_id     text,
  user_email  text,
  ref         text,                 -- optional subject: lesson slug / artifact id / skill id
  props       jsonb not null default '{}'::jsonb
);
alter table events enable row level security;
create index if not exists events_name_created_idx on events (name, created_at);
create index if not exists events_created_idx on events (created_at);
