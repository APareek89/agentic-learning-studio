---
title: Pinecone
category: Vector DBs and clients
url: https://docs.pinecone.io/
license: Official docs; original synthesis only
verdict: Best when the team wants managed vector infrastructure instead of operating a vector database.
as_of_date: 2026-06-22
sources:
  - {url: https://docs.pinecone.io/, license: Official docs; original synthesis only, kind: official_docs}
  - {url: https://github.com/pinecone-io/pinecone-python-client, license: Apache-2.0, kind: oss_repo}
---

## What it is

Pinecone is a managed vector database for similarity search and retrieval applications. It exposes hosted indexes, namespaces, records, metadata filters, and SDKs so applications can upsert embeddings and query nearest neighbors without running their own vector storage service.

## Why it exists / when to reach for it

Reach for Pinecone when operational simplicity is more valuable than owning the storage layer. It fits teams that want a clean API for semantic search, RAG, recommendations, and agent memory while delegating scaling, availability, index serving, and infrastructure maintenance to a managed provider.

It is also useful when retrieval needs to move quickly across languages and services. A product can treat Pinecone as a network service: embed content, upsert records, query top matches, and manage partitions with namespaces.

## The moving parts

- Indexes: hosted vector stores configured for dimensions, metric, and deployment style.
- Records: IDs with dense vector values or integrated text-to-vector workflows, plus metadata.
- Namespaces: logical partitions inside an index, commonly used for tenants, environments, or corpora.
- Metadata filters: constraints applied during search so retrieval can respect product boundaries.
- SDKs and APIs: client libraries for create, upsert, search/query, fetch, list, and delete operations.
- Operational controls: backups, deletion, monitoring, and provider-specific limits/pricing.

## How it works

Create an index that matches the embedding model's dimensionality and similarity metric. Upsert each KB chunk as a record with a stable ID, vector, and metadata. Query by vector or by supported integrated inference flow, request top-k matches, and include metadata so the generation layer can cite sources. Use namespaces or metadata filters to prevent unrelated corpora from mixing.

## When to use vs alternatives

Use Pinecone over pgvector, Qdrant, Weaviate, or Milvus when managed operations are the deciding factor. It is a good choice for teams that do not want to tune HNSW parameters, run clusters, manage snapshots, or size storage nodes.

Use pgvector when Postgres locality and SQL joins matter. Use Qdrant or Weaviate when open-source self-hosting is important. Use Milvus when very large distributed vector infrastructure is a core platform need. Use MongoDB Vector Search when the source documents already live in MongoDB.

## Failure modes & gotchas

Managed does not remove data modeling work. Bad IDs, weak metadata, or mixed embedding dimensions still break retrieval. Cost depends on index size, traffic, and provider configuration, so smoke-test realistic query volume. Namespaces are useful but can hide duplicate corpora if refresh jobs are sloppy. Embedding model migrations require new records or a new index, not just a client change.

## Minimal code shape (pseudocode/short snippet you write)

```python
index = pinecone.Index(host=index_host)

index.upsert(
    vectors=[{
        "id": chunk_id,
        "values": embedding,
        "metadata": {
            "title": title,
            "category": category,
            "source_url": source_url,
        },
    }],
    namespace="kb-2026-06-22",
)

matches = index.query(
    vector=query_embedding,
    top_k=8,
    namespace="kb-2026-06-22",
    filter={"category": {"$eq": "Vector DBs and clients"}},
    include_metadata=True,
)
```

## Key links

- https://docs.pinecone.io/
- https://docs.pinecone.io/guides/search/semantic-search
- https://github.com/pinecone-io/pinecone-python-client
