---
title: "Agent Memory"
category: "Memory"
url: "https://docs.langchain.com/oss/python/langgraph/memory"
license: "MIT"
verdict: "Best treated as explicit product state with provenance, retention, and correction paths."
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.langchain.com/oss/python/langgraph/memory", license: "MIT", kind: "official_docs"}
  - {url: "https://github.com/langchain-ai/langgraph", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/mem0ai/mem0", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://github.com/getzep/zep", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

Agent memory is persisted information that changes how an agent behaves after the current prompt is gone. It is not the same as a context window, a transcript, a vector database, or workflow state, though it may use all of them.

The useful split is short-term memory for the current thread and long-term memory for information that should affect later sessions.

## Why it exists / when to reach for it

Memory exists because agents need continuity: user preferences, project facts, previous decisions, learned procedures, unresolved tasks, and domain context. Without memory, every session starts cold or depends on stuffing old transcripts into the prompt.

Reach for memory when personalization or continuity improves the product. Avoid it when the information is better represented as a normal database record, a retrieved document, or a temporary checkpoint.

## The moving parts

- Short-term thread state: messages, tool results, plans, and checkpoints for one conversation or run.
- Semantic memories: durable facts such as "the team uses Postgres."
- Episodic memories: event-like records of what happened and when.
- Procedural memories: instructions, preferences, or policies that shape future behavior.
- Extractor: turns conversations or tool events into candidate memories.
- Store: key-value, document, graph, or vector-backed persistence, usually scoped by namespace.
- Retriever: selects relevant memories for the current task.
- Governance: consent, inspection, deletion, correction, and retention.

## How it works

A memory pipeline usually observes a turn, proposes candidate memories, filters them through policy, writes accepted items with source metadata, and retrieves relevant items later. LangGraph separates thread-scoped persistence from long-term stores. mem0 and Zep are examples of memory-oriented systems that focus on extraction, retrieval, and maintaining a more compact user or entity history.

Good memory systems store provenance. The agent should know whether a memory came from a user statement, an inferred pattern, a tool result, or an administrator rule.

## When to use vs alternatives

Use short-term memory when a multi-step agent needs to resume a thread or keep state between graph nodes. Use RAG when the source of truth is a document corpus. Use the application database for canonical records such as billing plan, account owner, or lesson status. Use workflow engines for durable progress through external side effects.

Long-term agent memory is most valuable for preferences, recurring tasks, personal context, and accumulated interaction history that is too broad to retrieve from one document.

## Failure modes & gotchas

Bad memories become durable bugs. A mistaken preference can bias every future answer. Memory extraction can overfit to jokes, temporary constraints, or one-off statements. Retrieval can leak context across users if namespaces are wrong. Summaries can remove the evidence needed to correct a memory later.

Treat memory as user data. Provide visibility, deletion, and correction. Filter sensitive information. Prefer small, typed memories over opaque transcript dumps. Add expiration for facts likely to drift.

## Minimal code shape (pseudocode/short snippet you write)

```text
turn = collect_messages_and_tool_results()
candidate = memory_extractor.propose(turn)

if policy.accepts(candidate, user_id):
  memory_store.put(
    namespace=("user", user_id),
    key=candidate.stable_id,
    value=candidate.fact,
    metadata={source: turn.id, confidence: candidate.confidence}
  )

memories = memory_store.search(
  namespace=("user", user_id),
  query=current_task,
  filters={status: "active"}
)
prompt.context.memory = summarize_for_prompt(memories)
```

## Key links

- LangGraph memory: https://docs.langchain.com/oss/python/langgraph/memory
- LangGraph repository: https://github.com/langchain-ai/langgraph
- mem0 repository: https://github.com/mem0ai/mem0
- Zep repository: https://github.com/getzep/zep
