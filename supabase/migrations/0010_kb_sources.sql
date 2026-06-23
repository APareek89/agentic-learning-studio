-- ============================================================================
-- kb_sources — the curator's per-source STATE table (provenance + change cursor).
--
-- The KB Curator (services/kb-curator/*) polls a license-vetted ALLOWLIST of
-- upstream sources (GitHub releases, RSS/sitemaps, arXiv queries) and only
-- synthesizes a KB note when something changed. This table is that change
-- cursor: one row per source id, holding when we last checked it and a hash of
-- the last item we saw, so a re-run does no work for unchanged sources.
--
-- The actual learning content still lands in `documents` / `chunks` (via
-- src/rag/store.ts) and every run writes a `kb_updates` audit row — this table
-- is curator bookkeeping only, NOT learning content.
--
-- RLS: enabled with NO policy (matches 0008_rls_lockdown.sql). The anon/
-- authenticated PostgREST roles are therefore DENIED all rows; the server
-- connects as `postgres` (rolbypassrls) and bypasses it. Idempotent.
-- ============================================================================

create table if not exists kb_sources (
  id           text primary key,        -- stable source id (matches sources.yaml `id`)
  type         text,                    -- 'github' | 'rss' | 'arxiv' | 'sitemap'
  url          text,                    -- the polled URL (releases atom, feed, query, sitemap)
  repo         text,                    -- owner/name for github sources (nullable)
  category     text,                    -- KB category bucket (matches kb/ folders)
  license      text,                    -- vetted license (MIT/Apache-2.0/CC-BY/official-docs/…)
  last_checked timestamptz,             -- when the curator last polled this source
  last_hash    text,                    -- fingerprint of the newest item we've already seen
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table kb_sources enable row level security;
