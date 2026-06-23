---
title: Agent Loop, ReAct, Planning, and Reflection
category: Agent frameworks
url: https://arxiv.org/abs/2210.03629
license: Research paper; facts only
verdict: Best when the next action depends on observations that cannot be fully predicted in advance.
as_of_date: 2026-06-22
sources:
  - {url: "https://arxiv.org/abs/2210.03629", license: "Research paper; facts only", kind: "paper"}
  - {url: "https://www.anthropic.com/engineering/building-effective-agents", license: "Official engineering note; original synthesis only", kind: "official_engineering_blog"}
---

## What it is

An agent loop is the control pattern behind an LLM system that can pursue a goal over multiple steps. Instead of answering once, the model reads the current state, chooses an action, receives an observation, updates its working context, and decides whether to continue.

ReAct is the classic prompting pattern that made this loop concrete for LLMs: the model alternates between internal reasoning and external actions. Planning adds an explicit decomposition step before acting. Reflection adds a review step after one or more actions, so the system can detect gaps, retry, or stop.

## Why it exists / when to reach for it

Use an agent loop when the path to the answer depends on information discovered during execution: search results, tool errors, code output, user approval, database state, browser state, or partial task results.

It exists because a single prompt cannot safely encode every branch of an open-ended task. The loop lets the model adapt, while the runtime keeps authority over tools, budgets, permissions, and stopping rules.

## The moving parts

- Goal: the task, user constraints, and success criteria.
- State: messages, scratch notes, tool results, plan, errors, and budget.
- Policy or planner: the model call that decides the next action.
- Tool registry: names, schemas, descriptions, and permission boundaries.
- Executor: application code that validates and runs approved tool calls.
- Observation parser: the layer that turns tool output into usable state.
- Evaluator or reflector: checks whether the task is done or needs repair.
- Stop conditions: success, failure, human decision, iteration cap, cost cap, or timeout.

## How it works

The runtime gives the model the goal, relevant state, and available tool schemas. The model either asks to finish or proposes a tool call. The application validates that call, executes it, records the observation, and asks the model again with the new state.

Planning can happen once at the beginning or repeatedly as observations change. Reflection can be a separate model call, a structured checklist, or deterministic tests. In production, the useful pattern is not unlimited autonomy; it is a bounded loop with explicit checkpoints.

## When to use vs alternatives

Use prompt chaining when the steps are known and sequential. Use routing when the first decision is mostly classification. Use parallelization when subtasks are independent. Use an orchestrator-worker pattern when subtasks are dynamic but can be delegated.

Use a full agent loop when the system needs to inspect the world, recover from errors, and decide the next step at runtime. Use LangGraph or another explicit state machine when the loop needs durable state, human review, or testable branches.

## Failure modes & gotchas

Unbounded loops can burn tokens without improving results. Reflection can become persuasive self-justification unless it is tied to concrete evidence or tests. Tool descriptions are part of the prompt surface, so vague schemas cause wrong tool calls. Tool outputs are untrusted input and can contain prompt injection. A model should never be treated as the authorization layer for side effects.

The loop also needs memory discipline. Appending every observation eventually hides the important facts. Summaries can help, but they can also erase constraints, so preserve exact user requirements and irreversible decisions.

## Minimal code shape (pseudocode/short snippet you write)

```python
state = {"goal": goal, "steps": [], "budget": 12}

while state["budget"] > 0:
    decision = model_decide(goal, state, tool_schemas)
    if decision.kind == "finish":
        return verify_or_return(decision.answer, state)

    call = authorize(decision.tool, decision.args, user_policy)
    observation = run_tool(call)
    state["steps"].append({"call": call, "observation": observation})
    state["budget"] -= 1

    if evaluator_says_done(goal, state):
        return synthesize_answer(goal, state)

raise RuntimeError("agent stopped by budget")
```

## Key links

- ReAct paper: https://arxiv.org/abs/2210.03629
- Anthropic, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
