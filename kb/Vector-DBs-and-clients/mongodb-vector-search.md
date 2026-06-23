---
title: MongoDB Vector Search
category: Vector DBs and clients
url: https://www.mongodb.com/docs/vector-search/
license: Official docs; original synthesis only
verdict: Best when embeddings should be queried alongside operational MongoDB documents.
as_of_date: 2026-06-22
sources:
  - {url: https://www.mongodb.com/docs/vector-search/, license: Official docs; original synthesis only, kind: official_docs}
  - {url: https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/, license: Official docs; original synthesis only, kind: official_docs}
  - {url: https://github.com/mongodb/node-mongodb-native, license: Apache-2.0, kind: oss_repo}
  - {url: https://github.com/mongodb/mongo-python-driver, license: Apache-2.0, kind: oss_repo}
---

## What it is

MongoDB Vector Search is MongoDB's vector indexing and query capability for documents that contain embeddings. It lets applications store vectors alongside normal document fields, create vector search indexes, and query through aggregation pipelines using the `$vectorSearch` stage.

## Why it exists / when to reach for it

Reach for MongoDB Vector Search when the source records already live in MongoDB or Atlas and the application wants semantic retrieval without syncing every document into a separate vector database. It is a strong fit for product catalogs, support articles, user-generated content, document search, and RAG systems that need document filters in the same data model as the content.

The key advantage is locality: operational fields, metadata, text, and embedding vectors can move through the same driver, collection, security model, and aggregation pipeline.

## The moving parts

- Collections: MongoDB documents that include text, metadata, and vector fields.
- Vector Search indexes: definitions that identify vector fields, dimensions, similarity metric, and filter fields.
- `$vectorSearch`: an aggregation stage for ANN or exact nearest-neighbor retrieval.
- Query controls: query vector or supported automatic embedding flow, path, limit, candidate count, filters, and projected score.
- Hybrid patterns: combine vector search with full-text search or later aggregation stages.
- Drivers: normal MongoDB drivers run the aggregation; no special vector-only client is required.

## How it works

Add an embedding field to each document or to a chunk collection. Create a vector search index over that field and any metadata fields that need pre-filtering. At query time, embed the user question, run an aggregation beginning with `$vectorSearch`, request a candidate pool and final limit, then project text, metadata, and the vector score for prompt assembly.

## When to use vs alternatives

Use MongoDB Vector Search when MongoDB is already the document source of truth and retrieval needs document filters, aggregation, and existing driver workflows. It avoids a separate sync path for many RAG systems.

Use pgvector for Postgres-native apps. Use Qdrant, Weaviate, or Milvus when a dedicated vector database is preferred. Use Pinecone when managed vector operations should be outsourced. Use Redis when vector retrieval is tied to cache, session, or semantic-memory latency.

## Failure modes & gotchas

The `$vectorSearch` stage has placement and compatibility rules, so check the target MongoDB or Atlas environment. ANN search requires candidate-count tuning; too few candidates can miss relevant records, while too many increases latency. Filters should be represented in the vector index when they are used for pre-filtering. Embedding dimension and similarity metric must match the index. Hybrid search needs evaluation because vector and text scores do not mean the same thing.

## Minimal code shape (pseudocode/short snippet you write)

```javascript
const pipeline = [
  {
    $vectorSearch: {
      index: "kb_embedding_index",
      path: "embedding",
      queryVector: queryEmbedding,
      numCandidates: 160,
      limit: 8,
      filter: { category: "Vector DBs and clients" }
    }
  },
  {
    $project: {
      _id: 0,
      title: 1,
      content: 1,
      source_url: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
];

const hits = await db.collection("kb_chunks").aggregate(pipeline).toArray();
```

## Key links

- https://www.mongodb.com/docs/vector-search/
- https://www.mongodb.com/docs/vector-search/query/aggregation-stages/vector-search-stage/
- https://www.mongodb.com/docs/drivers/node/current/atlas-vector-search/
