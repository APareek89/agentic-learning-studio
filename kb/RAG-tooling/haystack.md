---
title: Haystack
category: RAG tooling
url: https://docs.haystack.deepset.ai/docs/intro
license: Apache-2.0
verdict: Best for explicit, production-oriented RAG/search pipelines with component-level control and agent support.
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.haystack.deepset.ai/docs/intro", license: Apache-2.0, kind: official_docs}
  - {url: "https://docs.haystack.deepset.ai/docs/concepts-overview", license: Apache-2.0, kind: official_docs}
  - {url: "https://docs.haystack.deepset.ai/docs/pipelines", license: Apache-2.0, kind: official_docs}
  - {url: "https://docs.haystack.deepset.ai/docs/agent", license: Apache-2.0, kind: official_docs}
  - {url: "https://github.com/deepset-ai/haystack", license: Apache-2.0, kind: oss_repo}
---

## What it is

Haystack is an open source Python framework for building RAG applications, AI search systems, multimodal pipelines, and tool-using agents. Its core design is component oriented: each component has typed inputs and outputs, and pipelines connect components into an executable graph.

It belongs in RAG tooling for this KB because its strongest center of gravity is inspectable search and generation pipelines, even though it also supports agents.

## Why it exists / when to reach for it

Reach for Haystack when you want the retrieval pipeline to be explicit, testable, and replaceable. It is useful when a team needs to choose document stores, retrievers, rankers, prompt builders, generators, routers, and evaluators as separate parts rather than hiding them behind one agent abstraction.

It is a good fit for production RAG where debugging the pipeline is as important as the final answer.

## The moving parts

- Components: Python classes with declared inputs, outputs, and `run()` behavior.
- Pipelines: directed multigraphs connecting components.
- Document stores: storage interfaces for documents and metadata.
- Data classes: `Document`, `Answer`, chat messages, and related payloads.
- Retrievers: components that select documents from a store.
- Generators: LLM-backed text or chat generation components.
- Routers, rankers, converters, embedders, and prompt builders: pipeline utilities.
- Agent component: a loop-based chat generator plus tools, state schema, exit conditions, and optional human confirmation.
- Serialization: saving and loading pipeline definitions, commonly for sharing or deployment.

## How it works

An indexing pipeline might convert files, clean text, split documents, embed chunks, and write them into a document store. A query pipeline might embed a question, retrieve documents, rerank candidates, build a prompt, call a generator, and return an answer.

Haystack validates many component connections before execution. Pipelines can branch, loop, run independent work asynchronously, and wrap subgraphs as reusable supercomponents. The Agent component uses a tool-capable chat generator, runs tool calls iteratively, updates state, and exits when configured conditions are met.

## When to use vs alternatives

Use Haystack when RAG/search architecture needs to be a first-class graph. Use LlamaIndex when data connectors, indexing patterns, and query engines are the primary concern. Use LangChain when a broad model/tool integration layer and agent middleware are more important. Use LangGraph when the main challenge is stateful agent orchestration rather than retrieval plumbing.

For a small proof of concept, custom code or a lightweight provider SDK may be faster. For production search quality work, Haystack's explicit components make failures easier to isolate.

## Failure modes & gotchas

Type validation catches wiring mistakes, not poor retrieval. A pipeline can be valid and still retrieve irrelevant documents. Document store settings, embedding models, chunking, and metadata filters need their own evaluation.

Loops and agents need hard caps, especially when a validator routes back to a generator or a tool failure is fed to the model for recovery. Pipeline serialization should not leak secrets. Component and integration versions should be pinned, particularly when using external document stores.

## Minimal code shape (pseudocode/short snippet you write)

```python
pipeline = Pipeline()
pipeline.add_component("embed_query", query_embedder)
pipeline.add_component("retrieve", document_retriever)
pipeline.add_component("build_prompt", prompt_builder)
pipeline.add_component("generate", chat_generator)

pipeline.connect("embed_query.embedding", "retrieve.query_embedding")
pipeline.connect("retrieve.documents", "build_prompt.documents")
pipeline.connect("build_prompt.prompt", "generate.messages")

result = pipeline.run({
    "embed_query": {"text": question},
    "build_prompt": {"question": question},
})
```

## Key links

- Haystack introduction: https://docs.haystack.deepset.ai/docs/intro
- Haystack concepts: https://docs.haystack.deepset.ai/docs/concepts-overview
- Haystack pipelines: https://docs.haystack.deepset.ai/docs/pipelines
- Haystack Agent component: https://docs.haystack.deepset.ai/docs/agent
- Haystack repository: https://github.com/deepset-ai/haystack
