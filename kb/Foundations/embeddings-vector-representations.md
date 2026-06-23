---
title: Embeddings and Vector Representations
category: Foundations
url: https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html
license: Apache-2.0
as_of_date: 2026-06-22
sources:
  - {url: https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html, license: Apache-2.0, kind: official_docs}
  - {url: https://www.sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html, license: Apache-2.0, kind: official_docs}
  - {url: https://github.com/UKPLab/sentence-transformers, license: Apache-2.0, kind: oss_repo}
  - {url: https://huggingface.co/BAAI/bge-small-en-v1.5, license: MIT, kind: model_card}
---

## What it is

An embedding is a dense vector representation of an input such as text, an image, audio, or a user action. For language systems, an embedding model maps a sentence, query, passage, or document chunk into a fixed-length list of numbers. Nearby vectors are intended to represent related meaning, not identical wording.

Embeddings are the connective tissue behind semantic search, RAG, clustering, deduplication, recommendations, semantic caches, and many routing systems.

## Why it exists / when to reach for it

Keyword search works well when users and documents share exact terms. Embeddings exist for cases where meaning matters even when wording differs: "reset password" should find "account recovery", and "KV cache memory" should find "stored keys and values during decoding".

Reach for embeddings when unstructured content needs to be compared, grouped, retrieved, or routed quickly. In an agentic lesson system, embeddings let the app retrieve source notes that are semantically related to a learner's goal.

## The moving parts

- Encoder model: turns the input into a vector.
- Pooling strategy: compresses token-level vectors into one vector for the whole text.
- Dimensionality: the vector length, which must match the index schema.
- Normalization: often used so cosine similarity and dot product behave predictably.
- Similarity metric: cosine, dot product, Euclidean distance, or another ranking function.
- Vector index: stores embeddings plus metadata for nearest-neighbor search.
- Query/passsage conventions: some models expect different prompts or prefixes for query and document encoding.
- Evaluation set: representative queries and judged relevant results.

## How it works

A bi-encoder embedding system encodes documents independently ahead of time. The application chunks documents, embeds each chunk, and stores the vector with metadata such as title, source URL, category, and timestamp. At query time, it embeds the query with the same compatible model family and searches for nearby vectors.

Some embedding models are trained symmetrically, where both sides are similar kinds of text. Others are asymmetric, where a short query should retrieve longer passages. Retrieval results are candidates, not final truth. High-quality RAG often follows vector retrieval with filters, keyword search, reranking, source freshness checks, or answer-time citation requirements.

## When to use vs alternatives

Use embeddings for semantic similarity, fuzzy retrieval, clustering, and first-stage candidate generation. Use keyword or full-text search for exact identifiers, rare names, log messages, code symbols, and legal or policy terms where spelling matters. Use a cross-encoder reranker when you can afford slower but more precise pairwise scoring. Use a structured database query when the answer depends on exact fields, counts, or permissions.

## Failure modes & gotchas

- Stored vectors and query vectors must use compatible models, dimensions, and normalization.
- Changing the embedding model requires re-embedding the corpus.
- Semantic similarity can surface plausible but wrong candidates.
- Domain-specific language, multilingual text, and code may need a model chosen for that domain.
- Chunking quality strongly affects retrieval quality.
- Approximate indexes can trade recall for speed.
- Embeddings can leak sensitive source material through retrieval results, so metadata filters and access controls matter.

## Minimal code shape

```pseudo
chunks = split_documents(source_docs)
for chunk in chunks:
  vector = embed_document(chunk.text)
  vector_index.upsert(id=chunk.id, vector=vector, metadata=chunk.metadata)

query_vector = embed_query(user_question)
candidates = vector_index.nearest(query_vector, top_k=20, filters=policy_filters)
evidence = rerank(user_question, candidates).take(6)
```

## Key links

- https://www.sbert.net/examples/sentence_transformer/applications/semantic-search/README.html
- https://www.sbert.net/docs/sentence_transformer/usage/semantic_textual_similarity.html
- https://github.com/UKPLab/sentence-transformers
- https://huggingface.co/BAAI/bge-small-en-v1.5
