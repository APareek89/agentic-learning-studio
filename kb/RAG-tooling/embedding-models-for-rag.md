---
title: Embedding Models for RAG
category: RAG tooling
url: https://www.sbert.net/
license: Apache-2.0
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://www.sbert.net/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/sentence-transformers", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://huggingface.co/BAAI/bge-small-en-v1.5", license: "MIT", kind: "official_model_card"}
  - {url: "https://github.com/FlagOpen/FlagEmbedding", license: "MIT", kind: "oss_repo"}
---

## What it is

An embedding model maps text into a numeric vector so that related texts land near each other in vector space. In RAG, documents are embedded during indexing and user questions are embedded at query time. The retriever compares the query vector with stored chunk vectors and returns nearby candidates.

Sentence Transformers is a widely used open-source library for embedding, reranking, sparse encoding, and training retrieval models. BGE models from BAAI/FlagEmbedding are common retrieval models, including small variants that are practical for local, low-latency systems.

## Why it exists / when to reach for it

Embedding models exist because keyword matching alone misses paraphrases. A learner might ask "how do I cite sources in RAG?" while a source says "provenance." Dense embeddings can connect those meanings.

Reach for local embedding models when data should stay inside your environment, cost needs to be predictable, or the app can accept the quality-speed tradeoff of a smaller model. Reach for larger or hosted models when multilingual quality, domain breadth, or top benchmark performance matters more than local control.

## The moving parts

- A tokenizer and encoder model.
- Pooling logic that turns token states into one vector.
- Vector dimensionality, which must match the database column and index.
- Similarity function such as cosine, dot product, or L2 distance.
- Query and passage instructions or prefixes, if the model expects them.
- Normalization, batching, and device placement.
- Evaluation data for model choice and migration.

## How it works

During ingestion, each chunk is passed through the passage side of the embedding model. The output vector is stored with chunk text and metadata. At query time, the same model family embeds the user question, and the vector index returns chunks with close vectors.

For symmetric models, the same encode call is often used for documents and queries. For retrieval-tuned models, query and passage formatting can differ. BGE-style models have historically used query instructions for some variants and are commonly used through Sentence Transformers or FlagEmbedding wrappers. The important rule is consistency: the query path, document path, vector dimension, normalization, and distance metric must be intentionally paired.

## When to use vs alternatives

Use dense embeddings for semantic recall over prose. Use sparse keyword search for exact symbols, product names, error codes, legal clauses, and identifiers. Use hybrid retrieval when you need both. Use rerankers when candidate recall is good but top results are noisy. Use fine-tuned embeddings when the domain vocabulary or relevance definition is unusual enough that off-the-shelf models underperform.

## Failure modes & gotchas

- Mixing embedding models breaks index quality and can break inserts if dimensions differ.
- A model can retrieve semantically similar but factually wrong chunks.
- Short queries with acronyms or IDs often need lexical search too.
- Truncation can remove the only relevant part of a long chunk.
- Normalized vectors with the wrong distance metric can distort ranking.
- Embedding migrations require re-embedding the corpus, not only swapping query code.

## Minimal code shape

```ts
const model = await loadEmbeddingModel("BAAI/bge-small-en-v1.5");

const chunkRows = chunks.map((chunk) => ({
  id: chunk.id,
  text: chunk.text,
  embedding: model.encodePassage(chunk.text),
  metadata: chunk.metadata,
}));
await vectorStore.upsert(chunkRows);

const queryVector = model.encodeQuery(userQuestion);
const matches = await vectorStore.nearest(queryVector, { topK: 20 });
```

## Key links

- [Sentence Transformers docs](https://www.sbert.net/)
- [Sentence Transformers repository](https://github.com/huggingface/sentence-transformers)
- [BAAI bge-small-en-v1.5 model card](https://huggingface.co/BAAI/bge-small-en-v1.5)
- [FlagEmbedding repository](https://github.com/FlagOpen/FlagEmbedding)
