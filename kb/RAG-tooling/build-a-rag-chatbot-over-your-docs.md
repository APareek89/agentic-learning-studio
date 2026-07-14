---
title: "Build a RAG Chatbot Over Your Documents (End to End)"
category: "RAG tooling"
url: "https://python.langchain.com/docs/tutorials/rag/"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-07-14"
sources:
  - {url: "https://python.langchain.com/docs/tutorials/rag/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.llamaindex.ai/en/stable/understanding/rag/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/pgvector/pgvector", license: "PostgreSQL", kind: "oss_repo"}
---

## What it is

A RAG chatbot answers questions from *your* corpus (internal docs, a handbook, a codebase) by retrieving the most relevant passages at query time and passing them to the model as grounding, instead of relying on the model's parametric memory. This doc is the end-to-end build recipe — ingest → chunk → embed → store → retrieve → generate → cite — that stitches the RAG concepts (chunking, embeddings, vector search, reranking) into a working application.

## Why it exists / when to reach for it

Reach for a RAG chatbot when answers must come from a specific, changing body of text the base model has never seen or cannot be trusted to recall exactly: company policies, product docs, contracts, tickets. RAG beats fine-tuning here because the corpus updates without retraining, and it beats a giant prompt-stuffing because you only pay for the passages that matter and you get citations. Build it when users keep asking "what does *our* doc say about X."

## The moving parts

- Ingestion: load the source files (PDF, HTML, Markdown, DB rows) and normalize to text.
- Chunking: split into retrieval units (~200–800 tokens) on semantic boundaries, with a little overlap.
- Embeddings: encode each chunk to a vector with an embedding model; encode the query the same way.
- Vector store: pgvector, Qdrant, Pinecone, Chroma, etc., holding vectors + metadata + source pointers.
- Retriever: top-k by cosine similarity, ideally *hybrid* (vector + keyword) fused with RRF, optionally reranked.
- Generator: the chat model, prompted to answer *only* from the retrieved context and to cite it.
- Chat memory: prior turns, so follow-ups ("and for enterprise?") resolve.

## How it works

Offline, you ingest and chunk the corpus, embed every chunk, and upsert vectors + metadata (title, url, source id) into the store — re-running is idempotent when you key on a content hash. Online, a question is embedded, the store returns the top-k nearest chunks (hybrid search rescues exact names embeddings blur), an optional reranker reorders them, and you build a prompt: system instruction ("answer only from context; if it's not there, say so"), the retrieved passages with their ids, the chat history, and the question. The model answers and you render citations from the chunk metadata. For multi-turn, rewrite the follow-up into a standalone query before retrieving so pronouns resolve.

## When to use vs alternatives

RAG when the knowledge is large, changing, or must be cited. Long-context prompt-stuffing when the corpus is tiny and static. Fine-tuning when you need a *behavior/format* change, not fresh facts — and often RAG + light fine-tuning together. A tool-calling agent instead of plain RAG when answering requires actions (query an API, run a calc), not just retrieval.

## Failure modes & gotchas

- Bad chunking (splitting mid-idea, or chunks too big) wrecks retrieval quality more than model choice does.
- Query/document embedding mismatch: some models need a query prefix — encode queries and documents the way the model expects.
- No "I don't know" path → the model invents policy; instruct it to refuse when context is thin and gate on citation presence.
- Dimension/model drift: re-embedding with a different model than the stored vectors returns garbage — pin the embedding model.
- Retrieval that ignores metadata/recency serves stale or wrong-tenant chunks; filter by source/date/tenant.
- Skipping evals: measure retrieval hit-rate and answer faithfulness, or regressions go unnoticed.

## Minimal code shape (what you write)

```python
# offline: ingest
chunks = chunk(load("handbook/"))                 # ~500-token windows, small overlap
store.upsert([(c.id, embed(c.text), c.meta) for c in chunks])

# online: answer
def answer(q, history):
    qs = rewrite_standalone(q, history)            # resolve "and for X?"
    hits = store.hybrid_search(embed(qs), qs, k=6) # vector + keyword, RRF
    ctx = "\n\n".join(f"[{h.id}] {h.text}" for h in hits)
    return llm(system="Answer ONLY from context; cite [ids]; say you don't know if absent.",
               user=f"{ctx}\n\nQ: {q}")
```

## Key links

- LangChain RAG tutorial — https://python.langchain.com/docs/tutorials/rag/
- LlamaIndex RAG — https://docs.llamaindex.ai/en/stable/understanding/rag/
- pgvector — https://github.com/pgvector/pgvector
