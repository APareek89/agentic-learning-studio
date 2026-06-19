-- ============================================================================
-- Agentic Learning Studio — RAG + generations schema
--
-- Runs in the EXISTING Supabase Postgres (shared with the SEO agent's audits
-- tables; no name collisions). All statements are idempotent (IF NOT EXISTS), so
-- re-running is safe. We send this whole file as ONE simple query over the
-- Session pooler (which dislikes multi-statement prepared batches).
--
-- "vector" = the pgvector extension (lets Postgres store embedding vectors and
-- find nearest neighbours). "HNSW" = the index type that makes that search fast.
-- "tsvector" = Postgres's built-in full-text (keyword) search type.
-- ============================================================================

create extension if not exists vector;     -- embeddings + nearest-neighbour search
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- documents: one row per ingested SOURCE (a file or URL). content_hash + mtime
-- let ingestion skip unchanged sources (idempotent re-runs).
-- ----------------------------------------------------------------------------
create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  source_id     text unique not null,    -- stable id for the source (e.g. file path)
  title         text,
  source_type   text,                    -- json|csv|docx|pdf|md|html|url
  category      text,
  content_hash  text,                     -- fingerprint of the whole source
  mtime         timestamptz,             -- source last-modified (skip-if-unchanged)
  meta          jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- chunks: one embedding each. A "chunk" is a small searchable slice of a source.
-- content_hash is UNIQUE → idempotent upsert (ON CONFLICT DO NOTHING / UPDATE).
-- ----------------------------------------------------------------------------
create table if not exists chunks (
  id            bigserial primary key,
  document_id   uuid references documents(id) on delete cascade,
  source_id     text not null,
  chunk_index   int default 0,
  content_kind  text default 'prose',     -- record | prose | code | table
  title         text,
  category      text,
  url           text,
  content       text not null,
  token_count   int,
  license       text,                     -- governance (for catalog records)
  verdict       text,                     -- governance (kept/dropped candidate, etc.)
  as_of_date    date,                     -- recency, for the staleness gate
  content_tsv   tsvector generated always as (to_tsvector('english', content)) stored,
  embedding     vector(384),              -- bge-small-en-v1.5 dimension
  content_hash  text unique not null,
  created_at    timestamptz default now()
);

-- Approximate-nearest-neighbour index (cosine). HNSW handles incremental inserts
-- gracefully (no centroid retraining), which suits a KB that grows over time.
create index if not exists chunks_embedding_hnsw
  on chunks using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
-- Keyword search + common filters.
create index if not exists chunks_tsv_gin on chunks using gin (content_tsv);
create index if not exists chunks_category_idx on chunks (category);
create index if not exists chunks_verdict_idx on chunks (verdict);
create index if not exists chunks_asof_idx on chunks (as_of_date desc);

-- ----------------------------------------------------------------------------
-- glossary: cached layman definitions for the (i) popovers (per learner level).
-- ----------------------------------------------------------------------------
create table if not exists glossary (
  id                bigserial primary key,
  term              text not null,
  level             text not null default 'beginner',  -- beginner|intermediate|advanced
  acronym_expansion text,
  definition        text not null,
  source_ids        text[],
  updated_at        timestamptz default now(),
  unique (term, level)
);

-- ----------------------------------------------------------------------------
-- generations: saved learning artifacts. The UNIQUE index over the combo fields
-- makes the whole-artifact cache combo-safe (level/depth/examples/industry).
-- ----------------------------------------------------------------------------
create table if not exists generations (
  id          uuid primary key default gen_random_uuid(),
  topic_hash  text not null,
  prompt      text,
  cards       jsonb,
  profile     jsonb,
  blueprint   jsonb,
  html        text,
  citations   jsonb,
  coverage    real,
  created_at  timestamptz default now()
);
create unique index if not exists generations_combo_uidx
  on generations (topic_hash, (cards->>'level'), (cards->>'depth'), (cards->>'examples'), (profile->>'industry'));

-- ----------------------------------------------------------------------------
-- module_cache: lazily-generated deep-dive fragments, keyed by the full combo.
-- ----------------------------------------------------------------------------
create table if not exists module_cache (
  cache_key     text primary key,         -- sha256(topic|module|level|depth|examples|industry)
  fragment_html text not null,
  sources       jsonb,
  created_at    timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- kb_updates: an audit row per ingestion / daily-scan run (provenance).
-- ----------------------------------------------------------------------------
create table if not exists kb_updates (
  id        bigserial primary key,
  run_at    timestamptz default now(),
  source    text,                          -- 'ingest' | 'daily-scan'
  added     int default 0,
  updated   int default 0,
  skipped   int default 0,
  errors    jsonb default '[]'::jsonb,
  note      text
);
