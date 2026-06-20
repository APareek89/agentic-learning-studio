-- ============================================================================
-- Pre-built lesson library — a curated, pre-rendered course catalog.
--
-- Idempotent (IF NOT EXISTS). Sent as ONE query over the Session pooler.
--
-- These lessons are produced offline (Codex → prebuilt/lessons/*.json), validated
-- with the app's own validateBlueprint(), rendered with renderArtifact(), and
-- seeded here. They are served PUBLICLY (no auth, no generation) at
-- GET /api/lesson/:slug — instant, zero-credit browsing for any visitor.
-- ============================================================================

create table if not exists prebuilt_lessons (
  slug         text primary key,
  title        text not null,
  description  text,
  category     text,
  level        text,
  est_minutes  int,
  blueprint    jsonb,
  html         text not null,
  created_at   timestamptz default now()
);
create index if not exists prebuilt_category_idx on prebuilt_lessons (category);
create index if not exists prebuilt_level_idx on prebuilt_lessons (level);
