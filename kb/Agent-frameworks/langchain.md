---
title: LangChain
category: Agent frameworks
url: https://docs.langchain.com/oss/python/langchain/overview
license: MIT
verdict: Best as a configurable integration layer for models, prompts, tools, middleware, and agent harnesses.
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.langchain.com/oss/python/langchain/overview", license: MIT, kind: official_docs}
  - {url: "https://docs.langchain.com/oss/python/langchain/agents", license: MIT, kind: official_docs}
  - {url: "https://docs.langchain.com/oss/python/langchain/middleware/overview", license: MIT, kind: official_docs}
  - {url: "https://github.com/langchain-ai/langchain", license: MIT, kind: oss_repo}
---

## What it is

LangChain is an open source framework and integration ecosystem for building LLM applications. Its current agent story centers on `create_agent`: a harness around the model loop that combines a model, tools, prompts, state, and middleware.

It is not only an agent framework. It also provides model interfaces, prompt utilities, structured output helpers, retrievers, document loaders, tool abstractions, and runnable composition patterns.

## Why it exists / when to reach for it

Reach for LangChain when you want a common application layer across model providers, tool definitions, retrieval components, and agent behavior. It is especially useful when the product is moving quickly and you need standard building blocks before deciding which parts deserve custom code.

For agentic apps, LangChain is a good fit when you want a customizable model-plus-tools loop without designing a whole state graph by hand.

## The moving parts

- Model interfaces: provider-backed chat and completion models.
- Tools: Python callables, LangChain tools, or tool dictionaries exposed to the model.
- System prompt: standing behavior and task constraints.
- Structured output: schema-backed results returned by the agent.
- Middleware: hooks for summarization, retries, rate limits, human review, PII handling, guardrails, and custom behavior.
- Runtime config: thread IDs, context objects, callbacks, and per-run settings.
- LangGraph substrate: LangChain agents compile to graph-backed execution, so they can be embedded into larger graph workflows.

## How it works

An app creates an agent by selecting a model, registering tools, and supplying instructions. At runtime, the agent receives messages, calls the model, executes requested tools through application code, and loops until the model stops requesting tools or another stop condition fires.

Middleware wraps that loop. It can alter prompts, filter tools, summarize long histories, retry failed model or tool calls, interrupt risky actions for approval, or emit trace data. This lets teams add production concerns without rewriting the core loop.

## When to use vs alternatives

Use provider SDKs directly for thin one-model applications where portability and middleware do not matter. Use LangGraph when the control flow itself is the main product surface: branching, resuming, interrupts, and state transitions. Use LlamaIndex when the hard part is data ingestion, indexing, and query engines. Use Haystack when you want explicit search/RAG pipelines with component-level wiring.

LangChain pairs well with LangGraph: LangChain supplies agent and integration primitives, while LangGraph supplies lower-level orchestration.

## Failure modes & gotchas

Abstractions can hide provider-specific behavior, especially around tool calls, streaming, context windows, and structured output. Fast-moving APIs reward version pinning and small compatibility tests. Middleware can become a second hidden application if each concern mutates state in a different place.

Treat tool results as untrusted input, test dynamic prompts, and trace representative runs. A successful local demo does not prove that retries, human approval, or context summarization behave correctly under long conversations.

## Minimal code shape (pseudocode/short snippet you write)

```python
from langchain.agents import create_agent

def search_kb(query: str) -> str:
    """Return relevant KB notes for a learner question."""
    return retrieve_from_kb(query)

agent = create_agent(
    model="provider:model-name",
    tools=[search_kb],
    system_prompt="Answer as a careful AI tutor. Cite retrieved notes.",
    middleware=[summarize_history, require_approval_for_side_effects],
)

result = agent.invoke(
    {"messages": [{"role": "user", "content": question}]},
    config={"configurable": {"thread_id": lesson_id}},
)
```

## Key links

- LangChain overview: https://docs.langchain.com/oss/python/langchain/overview
- LangChain agents: https://docs.langchain.com/oss/python/langchain/agents
- LangChain middleware: https://docs.langchain.com/oss/python/langchain/middleware/overview
- LangChain repository: https://github.com/langchain-ai/langchain
