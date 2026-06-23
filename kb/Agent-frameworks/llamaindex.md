---
title: LlamaIndex
category: Agent frameworks
url: https://developers.llamaindex.ai/python/framework/
license: MIT
verdict: Best for data-centric RAG and agent workflows where indexing, retrieval, and query engines are central.
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.llamaindex.ai/python/framework/", license: MIT, kind: official_docs}
  - {url: "https://developers.llamaindex.ai/python/framework/understanding/agent/", license: MIT, kind: official_docs}
  - {url: "https://github.com/run-llama/llama_index", license: MIT, kind: oss_repo}
---

## What it is

LlamaIndex is an open source framework for context-augmented LLM applications: systems that connect models to private, external, or structured data. It supports classic RAG, document understanding, chat over data, extraction, and agents that use retrieval tools.

In agentic use cases, LlamaIndex agents can call ordinary functions, query engines, or other tools. Its workflows layer supports multi-step processes that combine agents, data connectors, and tool calls.

## Why it exists / when to reach for it

Reach for LlamaIndex when the hard part is not just calling a model, but preparing and retrieving the right data. It gives teams a vocabulary for ingestion, parsing, nodes, indexes, retrievers, query engines, chat engines, and evaluation loops.

It is a strong fit for document-heavy products: knowledge assistants, research tools, enterprise search, extraction pipelines, and RAG-backed agents.

## The moving parts

- Readers and connectors: load files, APIs, databases, and document sources.
- Nodes: parsed text or data units with metadata for retrieval.
- Indexes: structures that make nodes searchable or queryable.
- Retrievers and rerankers: select and order candidate context.
- Query engines: answer a question over indexed data.
- Chat engines: maintain conversational interaction over data.
- Tools: functions or query engines exposed to an agent.
- Agents and workflows: tool-using loops or event-driven multi-step processes.
- Observability and evaluation integrations: measure retrieval and answer quality.

## How it works

A typical LlamaIndex app loads data, parses it into nodes, builds an index, and exposes a query engine. The query engine retrieves relevant nodes and synthesizes an answer with a model.

An agent can treat that query engine as a tool. For example, one tool can query a product manual, another can run a calculation, and another can call an internal API. The agent chooses tools step by step and stops when it can return a result.

## When to use vs alternatives

Use LlamaIndex over a general agent framework when retrieval quality, source connectors, parsing, and indexing choices dominate the product. Use LangChain when broad model/tool integrations and agent middleware are the main need. Use LangGraph when explicit graph control and durable execution are the center of the design. Use Haystack when you prefer a typed component pipeline for RAG/search.

For a small app with one model call and one database query, a provider SDK plus custom SQL may be clearer.

## Failure modes & gotchas

Index choice changes behavior. A vector index, keyword retriever, router, or reranker can produce very different evidence. Connector convenience does not remove source licensing, privacy, or freshness checks. Document parsing quality often sets the ceiling for answer quality.

Agents also depend on model tool-use reliability. Function names, docstrings, type hints, and tool boundaries should be tested with realistic questions. Citation checks are still needed because retrieved context can be incomplete or misread.

## Minimal code shape (pseudocode/short snippet you write)

```python
documents = reader.load_data(source="kb/")
index = VectorStoreIndex.from_documents(documents)
kb_query = index.as_query_engine(similarity_top_k=8)

def search_kb(question: str) -> str:
    return str(kb_query.query(question))

agent = FunctionAgent(
    tools=[search_kb, calculate_score],
    llm=model,
    system_prompt="Use tools before answering KB-specific questions.",
)

answer = await agent.run(user_msg=learner_question)
```

## Key links

- LlamaIndex framework docs: https://developers.llamaindex.ai/python/framework/
- Building an agent: https://developers.llamaindex.ai/python/framework/understanding/agent/
- LlamaIndex repository: https://github.com/run-llama/llama_index
