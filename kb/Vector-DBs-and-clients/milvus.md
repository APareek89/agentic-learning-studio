---
title: Milvus
category: Vector DBs and clients
url: https://milvus.io/docs
license: Apache-2.0
verdict: Best for large-scale vector search deployments that need a dedicated distributed database.
as_of_date: 2026-06-22
sources:
  - {url: https://milvus.io/docs, license: Apache-2.0, kind: official_docs}
  - {url: https://github.com/milvus-io/milvus, license: Apache-2.0, kind: oss_repo}
  - {url: https://github.com/milvus-io/pymilvus, license: Apache-2.0, kind: oss_repo}
---

## What it is

Milvus is an open-source vector database designed for high-scale similarity search over embeddings. It stores vectors with scalar fields, supports multiple index families, and can run in lightweight, standalone, or distributed modes. PyMilvus is the main Python client for application code and local experimentation.

## Why it exists / when to reach for it

Reach for Milvus when vector search is a platform concern: many vectors, heavy query traffic, large indexes, multiple index strategies, or a need to separate storage and query serving. It is common in image, video, recommendation, RAG, and multimodal retrieval systems where the vector corpus can grow beyond what an application database should own.

Milvus Lite is useful for local trials. Standalone mode fits simpler deployments. Distributed Milvus is the serious option when scale, isolation, and operational tuning justify the extra moving parts.

## The moving parts

- Collections and schemas: vector fields plus scalar metadata fields.
- Entities: rows inserted into a collection.
- Indexes: choices such as FLAT, IVF variants, HNSW, DiskANN-style paths, sparse indexes, and hardware-aware options depending on deployment.
- Search parameters: metric, candidate counts, index-specific knobs, output fields, and filters.
- Deployment modes: Lite, standalone, and distributed services.
- PyMilvus: client APIs for schema creation, insert, index build, load, search, query, and management.

## How it works

Define a collection with a vector dimension and metadata fields. Insert batches of chunk embeddings with source metadata. Build an index suited to the workload, load the collection or partitions for serving, and search with query vectors plus scalar filters. Retrieval systems usually wrap Milvus with an ingestion job, metadata conventions, and a reranking or citation layer.

## When to use vs alternatives

Use Milvus when scale and index flexibility matter more than minimal operations. It is more infrastructure-heavy than Chroma, pgvector, or Qdrant, but better aligned with very large vector collections and specialized serving requirements.

Use pgvector for Postgres-native KBs. Use Qdrant for a simpler dedicated vector service. Use Weaviate when schemaful object retrieval and hybrid search are first-order. Use Pinecone when managed hosting is preferred. Use Redis when vectors are part of a real-time cache or memory layer.

## Failure modes & gotchas

Index choice affects latency, recall, memory, and build time. Distributed deployments require real operational ownership: sizing, compaction, load state, backups, monitoring, and upgrades. Scalar filters should be modeled before ingestion. Re-embedding a corpus is a data migration, not a small config change. Always evaluate recall against exact or trusted baselines before tuning for speed.

## Minimal code shape (pseudocode/short snippet you write)

```python
client.create_collection(
    collection_name="kb_chunks",
    dimension=384,
    metric_type="COSINE",
)

client.insert(
    collection_name="kb_chunks",
    data=[
        {"id": chunk_id, "vector": embedding, "category": category, "text": content}
    ],
)

client.create_index(
    collection_name="kb_chunks",
    field_name="vector",
    index_params={"index_type": "HNSW", "metric_type": "COSINE"},
)

hits = client.search(
    collection_name="kb_chunks",
    data=[query_embedding],
    filter='category == "Vector DBs and clients"',
    limit=8,
    output_fields=["text", "category"],
)
```

## Key links

- https://milvus.io/docs
- https://github.com/milvus-io/milvus
- https://github.com/milvus-io/pymilvus
