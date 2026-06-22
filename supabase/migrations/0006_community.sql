-- ============================================================================
-- Community Courses + sharing + server-side progress.
--
-- Idempotent (IF NOT EXISTS). Multiple statements run as ONE simple query over
-- the Session pooler (same as the other migrations).
--
-- - community_lessons: a learner's lesson, SNAPSHOTTED public (user lessons expire
--   in 30 days; community shares must NOT, so we copy blueprint+html here).
--   Served browse-anywhere at /api/community/lesson/:slug (re-renders from blueprint).
-- - discount_codes: generated when a learner shares to the community (30% off their
--   next purchase). Functionality only — checkout redemption is wired to billing later.
-- - lesson_progress: per-user % completed for a lesson (drives My Lessons % + the
--   Trainer "share & save" popup after 2 modules). The artifact iframe is
--   unauthenticated, so the HOST relays progress to POST /api/progress (authed).
-- ============================================================================

create table if not exists community_lessons (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  source_lesson_id  text,
  title             text not null,
  description       text,
  category          text,
  level             text,
  est_minutes       int,
  blueprint         jsonb,
  html              text not null,
  submitter_name    text,
  submitter_user_id text,
  submitter_email   text,
  likes             int default 0,
  created_at        timestamptz default now()
);
create index if not exists community_likes_idx on community_lessons (likes desc);
create index if not exists community_created_idx on community_lessons (created_at desc);

create table if not exists discount_codes (
  code        text primary key,
  user_id     text,
  user_email  text,
  lesson_id   text,
  percent     int default 30,
  source      text default 'community_share',
  redeemed    boolean default false,
  created_at  timestamptz default now()
);

create table if not exists lesson_progress (
  lesson_id   text not null,
  user_id     text not null,
  user_email  text,
  percent     int default 0,
  visited     int default 0,
  total       int default 0,
  updated_at  timestamptz default now(),
  primary key (lesson_id, user_id)
);
