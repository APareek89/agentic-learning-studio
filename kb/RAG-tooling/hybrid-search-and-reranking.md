---
title: Hybrid Search and Reranking
category: RAG tooling
url: https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html
license: Apache-2.0
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/sentence-transformers", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://docs.langchain.com/oss/python/langchain/retrieval", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Hybrid search combines more than one retrieval signal, usually lexical search plus dense vector search. Reranking is a second-stage scoring step that reads the query and candidate passage together and reorders the short list. Together, they form a practical RAG stack: retrieve broadly, fuse candidates, then spend heavier compute on the few passages most likely to be useful.

## Why it exists / when to reach for it

Pure vector search is good at paraphrase and weak at exactness. Pure keyword search is good at literal tokens and weak at semantic matches. RAG knowledge bases often need both: "bge-small-en-v1.5", "MCP", "HNSW", "KV cache", and "GraphRAG" are exact terms, while learner questions may phrase the same concepts in ordinary language.

Reach for hybrid search when support questions contain identifiers, product names, versions, stack traces, API names, or abbreviations. Add reranking when the right passage appears somewhere in the candidate set but not reliably in the top few.

## The moving parts

- A lexical retriever, often BM25 or full-text search.
- A dense retriever over embeddings.
- Optional filters for category, freshness, tenant, permissions, or source type.
- A fusion strategy such as reciprocal rank fusion or weighted score merging.
- A reranker, often a cross-encoder or LLM-based scorer.
- A final context budget policy that chooses what reaches the generator.

## How it works

At query time, run sparse and dense retrieval against the same corpus. The sparse path catches exact words and rare identifiers. The dense path catches paraphrases and related concepts. Merge the result lists without assuming their raw scores mean the same thing. Rank-based fusion is often easier to reason about than score math across different systems.

Then rerank the merged candidates. A bi-encoder embeds the query and passage separately, which is fast enough for large search. A cross-encoder reads them together, which is slower but usually more precise for the final candidate set. After reranking, keep only the evidence that fits the model context and supports the answer.

## When to use vs alternatives

Use vector-only retrieval for small, clean, prose-heavy KBs where paraphrase is the dominant problem. Use keyword-only retrieval for logs, code symbols, and exact lookup. Use hybrid retrieval for mixed knowledge bases. Use reranking when precision matters and latency budget allows it. Use agentic retrieval when the system must decide among multiple search tools or run follow-up searches.

## Failure modes & gotchas

- Rerankers cannot rescue evidence that was never retrieved.
- Fusion can bury an exact match if dense results dominate.
- Cross-encoders add latency and cost per candidate.
- Lexical indexes need analyzers tuned for code, punctuation, and casing.
- Deduplication is needed when the same source appears through both paths.
- Final context packing can undo reranking if it reorders or trims evidence poorly.

## Minimal code shape

```ts
const denseHits = await vectorStore.search(embedQuery(query), { topK: 40 });
const sparseHits = await fullTextSearch(query, { topK: 40 });

const fused = reciprocalRankFusion([denseHits, sparseHits], {
  dedupeBy: "chunkId",
  limit: 50,
});

const reranked = await crossEncoder.scorePairs(query, fused);
const evidence = reranked.sortByScoreDesc().slice(0, 8);
return answerWithEvidence(query, evidence);
```

## Key links

- [Sentence Transformers retrieve and rerank](https://www.sbert.net/examples/sentence_transformer/applications/retrieve_rerank/README.html)
- [Sentence Transformers repository](https://github.com/huggingface/sentence-transformers)
- [LangChain retrieval overview](https://docs.langchain.com/oss/python/langchain/retrieval)
