---
title: Qdrant
category: Vector DBs and clients
url: https://qdrant.tech/documentation/
license: Apache-2.0
verdict: Best when filtered vector search is a first-class service, not a Postgres add-on.
as_of_date: 2026-06-22
sources:
  - {url: https://qdrant.tech/documentation/, license: Apache-2.0, kind: official_docs}
  - {url: https://github.com/qdrant/qdrant, license: Apache-2.0, kind: oss_repo}
  - {url: https://github.com/qdrant/qdrant-client, license: Apache-2.0, kind: oss_repo}
---

## What it is

Qdrant is an open-source vector database and search engine focused on nearest-neighbor retrieval with payload filtering. It stores vectors as points inside collections, attaches JSON-like metadata payloads, and exposes APIs and client libraries for search, upsert, filtering, scrolling, snapshots, and operations.

## Why it exists / when to reach for it

Reach for Qdrant when vector search deserves its own operational boundary. It is well suited for RAG systems, semantic search, recommendations, agent memory, and multi-tenant retrieval where filtered vector search must stay fast as the corpus grows.

It is especially attractive when metadata filters are not optional. Examples include "only this tenant," "only fresh docs," "only approved sources," or "only lessons in this category." Qdrant's payload model lets those filters sit next to the vectors rather than being bolted on after retrieval.

## The moving parts

- Collections: logical indexes with vector size, distance function, storage, and optimizer settings.
- Points: records with an ID, one or more vectors, and a payload.
- Payload indexes: optional indexes that make metadata filters efficient.
- Search APIs: nearest-neighbor search, recommendation-style queries, scrolling, and batched operations.
- Vector modes: dense vectors, sparse vectors, and hybrid patterns depending on configuration.
- Operations: snapshots, quantization, sharding/replication options, and managed Qdrant Cloud.

## How it works

Create a collection for a specific embedding model and distance metric. Upsert each chunk as a point with a stable ID, vector, and payload such as source URL, category, title, content hash, tenant, and timestamp. At query time, embed the question, send the vector plus filters, and ask Qdrant for the top matches. Payload indexes help Qdrant avoid wasting work on candidates that cannot pass the filter.

## When to use vs alternatives

Use Qdrant over pgvector when you want a dedicated retrieval service with richer vector operations, clearer collection boundaries, and operational separation from app transactions. It is often simpler than Milvus for mid-sized systems and more self-hostable than Pinecone.

Choose Weaviate when schemaful objects and built-in hybrid/object APIs are the priority. Choose Milvus when the central requirement is very large distributed vector infrastructure. Choose Redis vector search when the retrieval layer is part of a real-time cache or session system.

## Failure modes & gotchas

Changing embedding models usually means a new collection or full reindex. Payload fields need schema discipline; inconsistent names or types weaken filters. ANN recall should be tested against known queries. High-cardinality filters may need payload indexes. Backups and snapshots must be part of the KB refresh plan, not an afterthought.

## Minimal code shape (pseudocode/short snippet you write)

```python
client.create_collection(
    "kb_chunks",
    vectors_config={"size": 384, "distance": "Cosine"},
)

client.upsert(
    "kb_chunks",
    points=[
        {"id": chunk_id, "vector": embedding, "payload": {
            "title": title,
            "category": category,
            "source_url": source_url,
        }}
    ],
)

hits = client.search(
    "kb_chunks",
    query_vector=query_embedding,
    query_filter={"must": [{"key": "category", "match": {"value": "RAG tooling"}}]},
    limit=8,
)
```

## Key links

- https://qdrant.tech/documentation/
- https://github.com/qdrant/qdrant
- https://github.com/qdrant/qdrant-client
