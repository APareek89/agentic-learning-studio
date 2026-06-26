-- ============================================================================
-- Hands-On notebooks: a SEPARATE, ADDITIVE cache for the "Get Hands on" feature
-- (browser-run Pyodide practice notebooks). NOTHING else reads or writes this
-- table — it is a pure cache keyed per (lesson, module). Dropping it (or the
-- Hands-On commits) leaves the rest of the app untouched.
--
-- notebook  = the structured NotebookSchema JSON (NO HTML/JS) the page renders.
-- source    = 'template' (Phase 2 curated library) | 'live' (Haiku) | 'fallback'.
-- cache_key = sha256(lessonId + "|" + (moduleId||"") + "|" + SCHEMA_VERSION).
--
-- RLS: enabled with NO policies (anon/authenticated denied), same posture as
-- 0008_rls_lockdown.sql / 0013 / 0014. The server connects as postgres
-- (rolbypassrls) and all access flows through /api/hands-on/*. Idempotent.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists hands_on_notebooks (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   text,
  module_id   text,
  cache_key   text not null unique,
  notebook    jsonb not null,
  source      text not null,                 -- 'template' | 'live' | 'fallback'
  model       text,
  created_at  timestamptz not null default now()
);

create index if not exists hands_on_notebooks_cache_idx  on hands_on_notebooks (cache_key);
create index if not exists hands_on_notebooks_lesson_idx on hands_on_notebooks (lesson_id);

alter table hands_on_notebooks enable row level security;
