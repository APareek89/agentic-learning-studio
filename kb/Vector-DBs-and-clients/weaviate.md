---
title: Weaviate
category: Vector DBs and clients
url: https://docs.weaviate.io/weaviate
license: BSD-3-Clause
verdict: Best when schemaful objects, vector search, and hybrid search should live in one retrieval platform.
as_of_date: 2026-06-22
sources:
  - {url: https://docs.weaviate.io/weaviate, license: BSD-3-Clause, kind: official_docs}
  - {url: https://github.com/weaviate/weaviate, license: BSD-3-Clause, kind: oss_repo}
  - {url: https://github.com/weaviate/weaviate-python-client, license: BSD-3-Clause, kind: oss_repo}
---

## What it is

Weaviate is an open-source vector database for AI applications. It stores objects with properties and vectors, supports semantic and keyword search, and can run self-hosted or as a managed cloud service. Its retrieval model is object-oriented: collections describe the shape of data, and queries return objects plus similarity scores and metadata.

## Why it exists / when to reach for it

Reach for Weaviate when the retrieval corpus is more than anonymous chunks. It works well when the application benefits from typed collections, rich object properties, named vectors, hybrid BM25-plus-vector search, filters, and optional model-provider integrations for vectorization or generation.

For agentic systems, Weaviate is appealing when memory, documents, tools, and knowledge entities need a searchable object store rather than a bare vector index.

## The moving parts

- Collections: schema definitions for object types and properties.
- Objects: stored records with IDs, properties, metadata, and one or more vectors.
- Vectorization: bring your own embeddings or configure integrations that vectorize selected properties.
- Search modes: vector search, keyword search, hybrid search, filters, grouping, and reranking patterns.
- Hybrid controls: an alpha-like balance between lexical and semantic signals plus fusion behavior.
- Clients: modern language clients expose collection-oriented APIs; GraphQL-style querying also appears in the ecosystem.

## How it works

Define a collection for the object type you want to retrieve, such as `KbChunk` or `LessonConcept`. Insert objects with text, source metadata, and either supplied vectors or a configured vectorizer. Query with semantic search, keyword search, or hybrid search. For RAG, return the best objects, their source fields, and enough text to ground the answer.

## When to use vs alternatives

Use Weaviate when schema, hybrid retrieval, and object-level APIs matter. It is more opinionated than Qdrant and often friendlier for teams that want retrieval concepts expressed as collections and properties.

Use Qdrant for a lean vector-first service with strong payload filtering. Use pgvector when SQL locality is the biggest win. Use Milvus for large distributed vector infrastructure. Use Pinecone when managed operations dominate the decision. Use Chroma when local developer speed matters more than platform breadth.

## Failure modes & gotchas

Schema design directly affects retrieval quality. Automatic vectorization is convenient but can hide embedding model changes unless versioned carefully. Hybrid search needs evaluation; a single lexical/semantic balance rarely fits all queries. Filters depend on property typing and tokenization choices. Client versions and query styles have evolved, so keep examples aligned with the installed client.

## Minimal code shape (pseudocode/short snippet you write)

```python
chunks = client.collections.get("KbChunk")

chunks.data.insert(
    properties={
        "title": title,
        "content": content,
        "category": category,
        "source_url": source_url,
    },
    vector=embedding,
)

results = chunks.query.hybrid(
    query=user_question,
    vector=query_embedding,
    alpha=0.5,
    filters=Filter.by_property("category").equal("RAG tooling"),
    limit=8,
)
```

## Key links

- https://docs.weaviate.io/weaviate
- https://docs.weaviate.io/weaviate/search/hybrid
- https://github.com/weaviate/weaviate
- https://github.com/weaviate/weaviate-python-client
