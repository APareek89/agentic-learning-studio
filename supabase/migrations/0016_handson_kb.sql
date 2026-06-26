-- ============================================================================
-- Hands-On KB: turn the hands_on_notebooks cache into a SELF-GROWING knowledge
-- base. Every generated notebook is embedded (bge-small / 384d, the same model
-- the RAG `chunks` table uses) and indexed, so a NEW lesson on a SIMILAR topic can
-- RETRIEVE a prior example by cosine similarity instead of regenerating.
--
-- Additive + idempotent. `embed_text` = the topic/module text that was embedded
-- (the semantic identifier); `embedding` = its vector. Rows generated before this
-- migration simply have NULL embedding (exact-cache only, not retrievable) — the KB
-- fills organically as new notebooks are generated.
-- ============================================================================

create extension if not exists vector;

alter table hands_on_notebooks add column if not exists embed_text text;
alter table hands_on_notebooks add column if not exists embedding vector(384);

-- HNSW cosine index for fast nearest-neighbour retrieval (matches chunks_embedding_hnsw).
create index if not exists hands_on_notebooks_embedding_hnsw
  on hands_on_notebooks using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);
