---
title: LangGraph
category: Agent frameworks
url: https://docs.langchain.com/oss/python/langgraph/overview
license: MIT
verdict: Best when you need explicit, resumable control flow over multi-step agents and workflows.
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.langchain.com/oss/python/langgraph/overview", license: MIT, kind: official_docs}
  - {url: "https://docs.langchain.com/oss/python/langgraph/persistence", license: MIT, kind: official_docs}
  - {url: "https://docs.langchain.com/oss/python/langgraph/interrupts", license: MIT, kind: official_docs}
  - {url: "https://github.com/langchain-ai/langgraph", license: MIT, kind: oss_repo}
---

## What it is

LangGraph is a low-level orchestration framework and runtime for stateful agents. It represents an application as a graph: nodes read and update shared state, edges decide where execution goes next, and the compiled graph runs the workflow.

It is designed for agent systems that need cycles, branching, streaming, persistence, human approval, and recovery from interruptions.

## Why it exists / when to reach for it

Reach for LangGraph when a plain agent loop is too opaque and a fixed chain is too rigid. It gives developers a concrete place to model state transitions, tool steps, review gates, retries, and termination logic.

It is useful for tutoring agents, coding agents, research agents, and operational workflows where intermediate state matters and needs to be inspected or resumed.

## The moving parts

- State schema: the typed shape of the data carried through the graph.
- Nodes: functions or runnables that transform state.
- Edges: direct or conditional routes between nodes.
- START and END: graph entry and termination markers.
- Checkpointers: persistence for thread-scoped graph checkpoints.
- Stores: long-term cross-thread data such as preferences or durable facts.
- Interrupts: dynamic pauses that wait for external input before continuing.
- Commands and streaming: runtime controls and visibility into step-by-step execution.

## How it works

You define a state schema, add nodes, connect them with edges, and compile the graph. Each node returns a partial state update. The runtime merges that update, chooses the next edge, and continues until it reaches an end condition.

With a checkpointer, each run can be associated with a `thread_id`. That thread ID becomes the cursor for resuming state later. Interrupts use the same persistence layer: a node can pause, surface a JSON-serializable request to the caller, and continue when the graph is invoked again with a resume command.

## When to use vs alternatives

Use LangChain agents when you want a ready agent harness and do not need to design the whole topology. Use LangGraph when you need a known control structure around model calls: approval before a tool, route by classifier, fan out work, retry a node, or resume a paused run.

Use Temporal, Inngest, Restate, or another workflow engine when the main challenge is long-running external orchestration across days or services. LangGraph can still sit inside those systems as the LLM control layer.

## Failure modes & gotchas

Graph state can become a junk drawer. Keep state small, typed, and intentionally merged. Conditional edges need tests because a wrong route can silently skip safeguards. Interrupts may re-run code before the pause point when resumed, so avoid non-idempotent side effects before an interrupt.

Persistence is application data. Store prompts, tool results, and user context with the same privacy and retention discipline as other product records.

## Minimal code shape (pseudocode/short snippet you write)

```python
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt

def plan(state):
    return {"plan": model_make_plan(state["goal"])}

def act(state):
    call = model_choose_tool(state)
    if call.risky:
        approved = interrupt({"tool": call.name, "args": call.args})
        if not approved:
            return {"status": "cancelled"}
    return {"observation": run_tool(call)}

def route(state):
    return END if done(state) else "act"

graph = StateGraph(State)
graph.add_node("plan", plan)
graph.add_node("act", act)
graph.add_edge(START, "plan")
graph.add_edge("plan", "act")
graph.add_conditional_edges("act", route)
app = graph.compile(checkpointer=durable_checkpointer)
```

## Key links

- LangGraph overview: https://docs.langchain.com/oss/python/langgraph/overview
- Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- Interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts
- LangGraph repository: https://github.com/langchain-ai/langgraph
