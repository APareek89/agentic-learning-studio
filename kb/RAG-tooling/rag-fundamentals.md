---
title: RAG Fundamentals
category: RAG tooling
url: https://arxiv.org/abs/2005.11401
license: "arXiv non-exclusive distribution license; facts only"
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://arxiv.org/abs/2005.11401", license: "arXiv non-exclusive distribution license; facts only", kind: "paper"}
  - {url: "https://docs.langchain.com/oss/python/langchain/rag", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.langchain.com/oss/python/langchain/retrieval", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://developers.llamaindex.ai/python/framework/understanding/rag/", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Retrieval-augmented generation, or RAG, is a pattern for answering with an LLM plus external evidence. The model still writes the response, but the facts come from an index built over documents, APIs, databases, or other knowledge sources. The original RAG paper framed this as combining a parametric model with non-parametric memory. In product systems, it usually means: load source data, split it into retrievable units, index those units, retrieve evidence for a user question, then generate an answer with citations or source links.

## Why it exists / when to reach for it

Reach for RAG when the answer depends on knowledge that is private, recent, specialized, or too large to put directly into every prompt. It is especially useful for product documentation, internal policies, support knowledge bases, codebases, legal references, and lesson generation from curated source material. It avoids retraining for every content update and gives the application a way to show provenance.

RAG is not just a hallucination cure. It is a controllable context-supply system. If retrieval is poor, the generator can still be fluent and wrong.

## The moving parts

- Source connectors load files, web pages, database rows, or API payloads.
- Parsers normalize text, tables, metadata, and document structure.
- Chunkers create search-sized passages.
- Embedding or lexical indexes make chunks findable.
- Retrievers select candidate evidence at query time.
- Optional rerankers reorder candidates with a stronger relevance model.
- Prompt assembly packs the question, evidence, instructions, and citation rules.
- Evaluation checks retrieval relevance, groundedness, and user-visible answer quality.

## How it works

Most RAG systems have two paths. The indexing path runs offline or in the background: ingest sources, preserve metadata, chunk the content, compute representations, and store the results. The query path runs when a user asks something: rewrite or classify the query if needed, retrieve candidates, rerank or filter them, fit the best evidence into the model context, and ask the LLM to answer using only that evidence.

There are two common orchestration styles. In 2-step RAG, retrieval always happens before generation, which makes latency and behavior predictable. In agentic RAG, retrieval is exposed as a tool and the agent decides when to search, which can help multi-step research tasks but adds more failure modes.

## When to use vs alternatives

Use RAG for factual grounding over text-heavy, changing knowledge. Use a SQL or analytics query when the answer is structured and exact. Use fine-tuning when the goal is style, task format, domain vocabulary, or repeated behavior rather than fresh facts. Use long-context prompting when the corpus is small enough to include directly and the extra cost is acceptable. Use knowledge graph retrieval when relationship traversal is central to the question.

## Failure modes & gotchas

- The retriever can miss the decisive evidence because chunks are too small, too large, or poorly labeled.
- Embedding search can blur exact identifiers, version numbers, and code symbols.
- The generator may overstate evidence or merge incompatible sources.
- Stale indexes silently preserve old facts after source updates.
- Citation links can be present but not actually support the sentence.
- Prompt injection can ride in retrieved text and conflict with system instructions.

## Minimal code shape

```ts
const documents = await loadSources(sourceList);
const chunks = splitIntoChunks(documents, { targetTokens: 450, overlap: 80 });
await index.upsert(chunks.map((chunk) => ({
  id: stableChunkId(chunk),
  vector: embedPassage(chunk.text),
  text: chunk.text,
  metadata: chunk.metadata,
})));

const candidates = await index.search(embedQuery(question), { topK: 20 });
const evidence = await rerank(question, candidates, { topK: 6 });
return generateAnswer({ question, evidence, requireCitations: true });
```

## Key links

- [RAG paper](https://arxiv.org/abs/2005.11401)
- [LangChain RAG tutorial](https://docs.langchain.com/oss/python/langchain/rag)
- [LangChain retrieval concepts](https://docs.langchain.com/oss/python/langchain/retrieval)
- [LlamaIndex introduction to RAG](https://developers.llamaindex.ai/python/framework/understanding/rag/)
