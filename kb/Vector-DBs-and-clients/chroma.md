---
title: Chroma
category: Vector DBs and clients
url: https://docs.trychroma.com/
license: Apache-2.0
verdict: Best for fast local or app-integrated retrieval when developer speed matters most.
as_of_date: 2026-06-22
sources:
  - {url: https://docs.trychroma.com/, license: Apache-2.0, kind: official_docs}
  - {url: https://github.com/chroma-core/chroma, license: Apache-2.0, kind: oss_repo}
---

## What it is

Chroma is an open-source embeddings database for AI applications. It gives developers a compact API for collections, documents, embeddings, metadata, and queries. It can be used locally during prototyping, persisted for small applications, run in client/server form, or consumed through hosted Chroma Cloud.

## Why it exists / when to reach for it

Reach for Chroma when the goal is to build and test retrieval quickly. It is common in notebooks, prototypes, demos, local agents, and early RAG systems where the team wants to add documents, embed them, query them, and inspect results without first designing a full database platform.

Chroma is also useful as a teaching tool because its core concepts map cleanly to RAG: collection, document, embedding, metadata, query, and result.

## The moving parts

- Client: local, persistent, HTTP, or cloud-backed connection depending on deployment.
- Collections: named groups of documents and embeddings.
- Documents: text payloads that can be stored with IDs and metadata.
- Embeddings: supplied by the application or produced by an embedding function.
- Metadata filters: constraints over document attributes.
- Query API: nearest-neighbor retrieval by text or vector, with optional returned documents, distances, and metadata.

## How it works

Create or open a collection, add chunks with stable IDs, metadata, and embeddings, then query the collection with a user question or precomputed query vector. The collection returns nearest records; the application still owns prompt packing, citation formatting, refresh policies, and evaluation.

## When to use vs alternatives

Use Chroma when local iteration, minimal setup, and direct developer ergonomics are more important than advanced operations. It is a fine first retrieval layer for experiments and internal tools.

Use pgvector when the production system already depends on Postgres. Use Qdrant or Weaviate when dedicated vector service behavior, filtering, and operations matter. Use Pinecone for managed vector hosting. Use Milvus for very large vector infrastructure. Use Redis when retrieval belongs in a low-latency cache or session system.

## Failure modes & gotchas

Prototype defaults can leak into production if durability, backups, and tenancy are not revisited. Embedding-function changes require re-embedding, even if the collection name stays the same. Duplicate or unstable IDs make KB refreshes messy. Metadata is still important; a vector-only Chroma collection is hard to govern, filter, or cite.

## Minimal code shape (pseudocode/short snippet you write)

```python
client = chromadb.PersistentClient(path="./kb-chroma")
collection = client.get_or_create_collection("kb_chunks")

collection.add(
    ids=chunk_ids,
    documents=chunk_texts,
    embeddings=chunk_vectors,
    metadatas=[{"title": t, "category": c, "source_url": u} for t, c, u in meta],
)

results = collection.query(
    query_embeddings=[query_embedding],
    n_results=8,
    where={"category": "Vector DBs and clients"},
)
```

## Key links

- https://docs.trychroma.com/
- https://github.com/chroma-core/chroma
