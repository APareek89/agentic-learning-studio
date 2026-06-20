-- ============================================================================
-- Phase 1 — durable artifacts, per-user lessons, preferences, ratings.
--
-- Idempotent (IF NOT EXISTS). Sent as ONE query over the Session pooler.
--
-- WHY: artifacts used to live only in an in-memory Map, so every Render restart
-- lost them → "Artifact not found" + broken Download. We now persist each
-- generated lesson (HTML + Blueprint) here, keyed by the artifact id, scoped to a
-- user, with a 30-day expiry the dashboard surfaces ("X days remaining").
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- lessons: one row per generated learning artifact (durable replacement for the
-- in-memory artifact store). `id` is the artifact id used in /api/artifact/:id.
-- ----------------------------------------------------------------------------
create table if not exists lessons (
  id            text primary key,                 -- artifact id (uuid string)
  user_id       text,                             -- Supabase auth user id (or 'local-dev')
  user_email    text,                             -- convenience for the dashboard
  kind          text default 'learning-artifact',
  title         text,
  prompt        text,                             -- the learner's original ask
  cards         jsonb default '{}'::jsonb,        -- the raw landing selections
  profile       jsonb,                            -- resolved LearnerProfile
  blueprint     jsonb,                            -- full Blueprint (drives /api/module + /full)
  html          text,                             -- rendered self-contained lesson
  upload_ids    jsonb default '[]'::jsonb,
  refer_only    boolean default false,
  rating        int,                              -- 1..5 (null = unrated)
  rating_comment text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  expires_at    timestamptz default (now() + interval '30 days')
);
create index if not exists lessons_user_idx on lessons (user_id, created_at desc);
create index if not exists lessons_expires_idx on lessons (expires_at);

-- ----------------------------------------------------------------------------
-- user_preferences: last-used / preferred landing selections per user, so the
-- form can pre-fill and the agent gets the learner's standing context.
-- ----------------------------------------------------------------------------
create table if not exists user_preferences (
  user_id     text primary key,                   -- Supabase auth user id (or 'local-dev')
  user_email  text,
  prefs       jsonb default '{}'::jsonb,          -- { levels, depth, examples, density, visuals,
                                                  --   syntax, lessonTypes, industry, buildGoal }
  updated_at  timestamptz default now()
);
