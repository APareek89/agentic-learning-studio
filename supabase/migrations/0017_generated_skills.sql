-- ============================================================================
-- Generated skills: persist each user's generated Agent Skills so they show up in
-- the "My Skills" view (mirrors My Lessons). The full SkillPackage is stored as
-- JSON — self-contained; the app re-renders it deterministically (escaped). The
-- in-memory job map stays the live path; this table is the durable history.
--
-- Upsert key is (user_id, slug): regenerating the same skill UPDATES its row
-- (no duplicate clutter); distinct briefs (distinct slugs) get their own rows.
--
-- RLS: enabled with NO policies (anon/authenticated denied), same posture as
-- 0008 / 0013 / 0014 / 0015. The server connects as postgres (rolbypassrls) and
-- all access flows through /api/skill[s]/*. Additive + idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists generated_skills (
  id            uuid primary key default gen_random_uuid(),
  user_id       text,
  user_email    text,
  slug          text,
  name          text not null,
  task          text,
  llm_interface text,
  grounded      boolean not null default false,
  skill         jsonb not null,                 -- the full SkillPackage
  created_at    timestamptz not null default now()
);

-- One row per (user, slug) → a re-generation refreshes rather than duplicates.
create unique index if not exists generated_skills_user_slug_uniq on generated_skills (user_id, slug);
create index if not exists generated_skills_user_idx on generated_skills (user_id, created_at desc);

alter table generated_skills enable row level security;
