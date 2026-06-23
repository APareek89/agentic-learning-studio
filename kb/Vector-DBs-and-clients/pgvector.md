---
title: pgvector
category: Vector DBs and clients
url: https://github.com/pgvector/pgvector
license: PostgreSQL
verdict: Best when embeddings should live beside relational app data in Postgres.
as_of_date: 2026-06-22
sources:
  - {url: https://github.com/pgvector/pgvector, license: PostgreSQL, kind: oss_repo}
  - {url: https://github.com/pgvector/pgvector-python, license: MIT, kind: oss_repo}
---

## What it is

pgvector is a PostgreSQL extension for storing and searching embedding vectors inside Postgres. It adds vector-oriented data types, distance operators, and approximate nearest-neighbor indexes while keeping normal SQL, joins, transactions, backups, access controls, and metadata tables in the same database.

## Why it exists / when to reach for it

Reach for pgvector when the product already runs on Postgres and retrieval data belongs close to application records. It is a strong fit for RAG knowledge bases, document chunks, user memory, recommendations, and semantic search where relational filters such as tenant, category, date, owner, or source status matter as much as vector similarity.

For Agentic Learning Studio, pgvector is the natural baseline because Supabase Postgres already stores documents and chunks. The operational story stays simple: one database boundary, one migration system, one backup path, and SQL-based inspection when retrieval behaves strangely.

## The moving parts

- Extension install: `CREATE EXTENSION vector`.
- Column types: fixed-length vectors plus smaller or specialized forms such as half-precision, binary, and sparse vectors.
- Distance operators: L2, inner product, cosine, L1, Hamming, and Jaccard depending on the vector type.
- Indexes: HNSW for graph-based ANN search and IVFFlat for list-based ANN search.
- Metadata: ordinary Postgres columns for filters, lifecycle flags, source URLs, hashes, and tenancy.
- Clients: any Postgres driver can write vectors; `pgvector-python` adds convenience adapters for Python stacks.

## How it works

Each chunk row stores text, source metadata, and an embedding with the same dimensionality as the embedding model. Query time embeds the user question, orders rows by distance to that query vector, applies SQL filters, and returns the top candidates. Without an ANN index, Postgres can run exact search by scanning candidate rows; with HNSW or IVFFlat, it trades some recall for lower latency at larger scale.

## When to use vs alternatives

Use pgvector before adding a separate vector database when Postgres is already central and the vector corpus is not the only scaling problem. It beats many dedicated stores on simplicity, transactional updates, and metadata joins.

Use Qdrant, Weaviate, Milvus, Pinecone, or MongoDB Vector Search when the retrieval layer needs independent scaling, specialized vector operations, managed vector infrastructure, or a document/object data model outside Postgres. Use Redis vector search when ultra-low-latency cache-like access is the main need.

## Failure modes & gotchas

Embedding dimensions must match the vector column. ANN indexes need measured recall, not blind trust. HNSW can increase write cost and index size. IVFFlat needs representative data before indexing and careful probe settings. A busy OLTP database can be harmed by large vector scans, so set query limits, filters, and indexes deliberately. Embedding model migrations usually require a new column, table, or full re-embedding pass.

## Minimal code shape (pseudocode/short snippet you write)

```sql
create extension if not exists vector;

create table kb_chunks (
  id bigserial primary key,
  source_url text not null,
  category text not null,
  content text not null,
  embedding vector(384) not null
);

create index kb_chunks_embedding_hnsw
  on kb_chunks using hnsw (embedding vector_cosine_ops);

select id, source_url, content
from kb_chunks
where category = 'RAG tooling'
order by embedding <=> $1::vector
limit 8;
```

## Key links

- https://github.com/pgvector/pgvector
- https://github.com/pgvector/pgvector-python
