---
title: Redis Vector Search
category: Vector DBs and clients
url: https://redis.io/docs/latest/develop/ai/search-and-query/vectors/
license: Official docs; original synthesis only
verdict: Best when vector retrieval must sit inside a low-latency Redis data path.
as_of_date: 2026-06-22
sources:
  - {url: https://redis.io/docs/latest/develop/ai/search-and-query/vectors/, license: Official docs; original synthesis only, kind: official_docs}
  - {url: https://redis.io/docs/latest/develop/ai/redisvl/, license: Official docs; original synthesis only, kind: official_docs}
  - {url: https://github.com/redis/redis-vl-python, license: MIT, kind: oss_repo}
---

## What it is

Redis Vector Search is Redis search/query functionality for indexing vector fields stored in Redis data structures such as hashes or JSON documents. It supports nearest-neighbor lookup with vector indexes and can combine vector similarity with metadata, text, numeric, tag, and geo filters. RedisVL is a Python library that wraps these Redis capabilities for AI applications.

## Why it exists / when to reach for it

Reach for Redis vector search when retrieval belongs in a real-time path: semantic cache, session memory, personalization, routing, feature lookup, or low-latency application search. Redis is often already present as an operational cache, so adding vector search can keep short-lived or high-throughput retrieval close to the rest of the application state.

It is not only for RAG documents. Agent memory, conversation snippets, semantic cache entries, tool traces, and user preference vectors can all benefit from Redis-style fast reads and time-aware lifecycle policies.

## The moving parts

- Redis data: hashes or JSON documents containing text, metadata, and vector bytes.
- Search indexes: vector fields plus text, tag, numeric, or geo fields.
- Index algorithms: flat search for exact or small collections, HNSW for approximate search at larger scale.
- Query syntax: KNN or range-style vector matching combined with filters.
- RedisVL: schema management, index creation, vector queries, hybrid queries, vectorizers, caching helpers, and memory utilities.
- Operations: persistence, eviction policy, memory sizing, clustering, and Redis version/distribution support.

## How it works

Define an index schema that marks one field as a vector and other fields as filterable metadata. Store each item as a Redis record with an ID, vector, text, and metadata. Query with a vector plus optional filters, returning IDs, distances, and selected fields. RedisVL can generate the underlying schema and query objects so application code does not hand-build every search expression.

## When to use vs alternatives

Use Redis vector search when latency and co-location with cache/session data matter more than deep vector database features. It is a good fit for semantic caching and agent memory.

Use pgvector when the data belongs in Postgres. Use Qdrant or Weaviate when a dedicated vector service with richer retrieval operations is needed. Use Milvus for large vector infrastructure. Use Pinecone for managed hosting. Use MongoDB Vector Search when documents already live in MongoDB and aggregation pipelines are central.

## Failure modes & gotchas

Vectors consume memory quickly, and Redis deployments must be sized with persistence and eviction behavior in mind. Binary encoding, vector dimensions, and distance metrics must match the embedding model. Hybrid search depends on correct field types and query syntax. Validate the Redis product/version and license posture for the intended deployment. Treat Redis as a retrieval index unless the durability configuration truly makes it a source of truth.

## Minimal code shape (pseudocode/short snippet you write)

```python
schema = {
    "index": {"name": "kb_chunks", "prefix": "chunk:"},
    "fields": [
        {"name": "content", "type": "text"},
        {"name": "category", "type": "tag"},
        {"name": "embedding", "type": "vector", "attrs": {
            "dims": 384,
            "distance_metric": "COSINE",
            "algorithm": "HNSW",
        }},
    ],
}

index = SearchIndex.from_dict(schema, redis_url=REDIS_URL)
index.create(overwrite=False)
index.load([{"id": chunk_id, "content": text, "category": category, "embedding": vector}])

query = VectorQuery(query_vector, "embedding", num_results=8, filter_expression=Tag("category") == "RAG")
hits = index.query(query)
```

## Key links

- https://redis.io/docs/latest/develop/ai/search-and-query/vectors/
- https://redis.io/docs/latest/develop/ai/redisvl/
- https://github.com/redis/redis-vl-python
