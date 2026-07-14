---
title: "Build a Multi-Agent Workflow (End to End)"
category: "Agent frameworks"
url: "https://langchain-ai.github.io/langgraph/concepts/multi_agent/"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-07-14"
sources:
  - {url: "https://langchain-ai.github.io/langgraph/concepts/multi_agent/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.crewai.com/", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

A multi-agent workflow splits a job across several specialized agents that coordinate — a planner that decomposes the task, workers that each own a sub-task (research, draft, price, review), and often a supervisor that routes and merges. This is the end-to-end build recipe: how to decide the topology, define each agent's role and tools, pass state between them, and stop cleanly — the applied shape behind "build a multi-agent app for shopping / research / content."

## Why it exists / when to reach for it

One agent with many tools and a giant prompt gets confused: it loses track of the goal, mixes concerns, and its context bloats. Splitting into focused agents keeps each prompt small and each role sharp, and lets sub-tasks run in parallel. Reach for multi-agent when a task has genuinely distinct sub-jobs (gather vs. analyze vs. write), when steps can run concurrently, or when different steps want different tools/models. Do *not* reach for it when a single tool-using loop already does the job — extra agents add latency, cost, and failure surface.

## The moving parts

- Topology: supervisor/router (a lead delegates to workers), pipeline (fixed hand-off chain), or network (peers hand off freely).
- Roles: each agent's goal, its allowed tools, and its output contract (what it returns to whom).
- Shared state: the object passed between agents (task, intermediate results, scratchpad) — the coordination substrate.
- Hand-off protocol: how control transfers (a supervisor decides next; or an agent emits a "route to X").
- Termination: an explicit done condition so the system converges instead of ping-ponging.
- Merge/synthesis: a final step that combines worker outputs into the answer.

## How it works

Model the workflow as a graph of agent nodes over a shared state. A supervisor node inspects the state and routes to the worker best suited to the next sub-task; each worker reads the state, does its focused job with its own tools, writes results back, and returns control. The loop continues until the termination condition (all sub-tasks done, or the supervisor says finish), then a synthesis step assembles the final output. In LangGraph you make this explicit — nodes, edges, and a state schema you fully own and can inspect. In CrewAI you declare agents (role + goal + tools) and tasks, and the crew runs them sequentially or hierarchically. Keep each agent's context minimal (only the state slice it needs) and pin shared constants (schemas, ids) so parallel workers don't diverge.

## When to use vs alternatives

Multi-agent for parallelizable, multi-skill jobs. A single agent for a focused loop — most tasks. A deterministic pipeline (plain code calling the model at fixed steps) when the flow never branches and you don't need agent autonomy. Prefer the simplest thing that works; add agents only when a single one demonstrably struggles.

## Failure modes & gotchas

- Over-decomposition: five agents where one loop suffices multiplies latency, cost, and bugs.
- No termination condition → agents hand off forever; always define "done."
- State divergence: parallel workers each mutate a full copy and clobber each other — pass scoped slices and merge deliberately.
- Lost context at hand-off: the receiving agent lacks what it needs → thread the relevant state, not the whole history.
- Unclear ownership: two agents both "responsible" for an output produce duplicates or gaps — one owner per sub-task.
- Debuggability: without tracing, a wrong final answer is hard to attribute — log each agent's input/output.

## Minimal code shape (what you write)

```python
# supervisor routes; workers own sub-tasks; state is the shared object
def supervisor(state):
    return "research" if not state.facts else "write" if not state.draft else "DONE"

graph = {
  "research": lambda s: s.update(facts=research_agent(s.task)),
  "write":    lambda s: s.update(draft=writer_agent(s.task, s.facts)),
}
state = State(task="compare 3 laptops under $1000 and recommend one")
while (node := supervisor(state)) != "DONE":
    graph[node](state)
answer = synthesize(state)     # merge worker outputs
```

## Key links

- LangGraph multi-agent concepts — https://langchain-ai.github.io/langgraph/concepts/multi_agent/
- CrewAI docs — https://docs.crewai.com/
