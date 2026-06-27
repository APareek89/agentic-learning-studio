-- ============================================================================
-- Lesson visuals: a curated library of concept diagrams (self-contained inline
-- SVG, v3.css inlined + scoped) that a lesson MODULE can attach via a "Visualize
-- this" CTA + popup. Retrieval is keyword/identifier match first, embedding
-- fallback second (bge-small / 384d, same model as the RAG `chunks` table).
--
-- Mirrors the Hands-On KB pattern (0015/0016): pgvector + HNSW cosine index.
-- `embed_text` = title + category + scenario + keywords (the semantic identifier);
-- `embedding` = its vector. Additive + idempotent.
--
-- RLS: enabled with NO policies (anon/authenticated denied), same posture as
-- 0008 / 0013 / 0014 / 0015. The server connects as postgres (rolbypassrls) and
-- all access flows through the renderer/retriever — never the browser directly.
-- ============================================================================

create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists lesson_visuals (
  id              uuid primary key default gen_random_uuid(),
  visual_id       text not null unique,
  title           text not null,
  category        text,
  diagram_type    text,
  scenario        text,
  identifier_keys text[] not null default '{}',
  keywords        text[] not null default '{}',
  svg             text not null,                 -- self-contained (v3.css inlined + scoped)
  embed_text      text,
  embedding       vector(384),
  created_at      timestamptz not null default now()
);

-- HNSW cosine index for fast nearest-neighbour retrieval (matches chunks/hands_on).
create index if not exists lesson_visuals_embedding_hnsw
  on lesson_visuals using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
create index if not exists lesson_visuals_category_idx on lesson_visuals (category);

alter table lesson_visuals enable row level security;
