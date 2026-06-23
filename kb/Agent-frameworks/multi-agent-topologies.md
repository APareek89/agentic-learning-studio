---
title: "Multi-Agent Topologies"
category: "Agent frameworks"
url: "https://www.anthropic.com/engineering/multi-agent-research-system"
license: "Official engineering note; original synthesis only"
verdict: "Best when breadth, specialization, or independent verification beats the cost of coordination."
as_of_date: 2026-06-22
sources:
  - {url: "https://www.anthropic.com/engineering/multi-agent-research-system", license: "Official engineering note; original synthesis only", kind: "official_docs"}
---

## What it is

Multi-agent topology is the control pattern for more than one LLM agent working on the same goal. It defines who plans, who acts, how agents communicate, what state they share, and who decides when the work is done.

Common shapes include supervisor-worker, hierarchical teams, peer swarms, debate or critic loops, blackboard-style shared workspaces, and pipelines where each agent owns one stage.

## Why it exists / when to reach for it

Use multiple agents when the task has real substructure: broad research, many independent leads, specialized tools, parallel document review, cross-checking, or long tasks that exceed one context window. Anthropic's research-system note is useful because it frames multi-agent work as a way to spend more focused context on the problem, not as magic intelligence by committee.

Do not start with a team if one agent with good tools can do the job. Multi-agent systems add prompts, budgets, routing rules, failure states, and harder evaluation.

## The moving parts

- Lead agent or coordinator: owns the goal, budget, decomposition, and final synthesis.
- Worker agents: run bounded subtasks with their own instructions and tool access.
- Delegation protocol: task brief, expected output format, evidence requirements, and stop rules.
- Shared state: plan, findings, citations, intermediate artifacts, and unresolved questions.
- Merge step: deduplicates results, resolves conflicts, and checks evidence.
- Safety boundary: tool permissions, data access, human approvals, and escalation rules.
- Observability: per-agent traces, token use, tool calls, intermediate answers, and failure labels.

## How it works

A coordinator reads the user goal, decides whether decomposition is useful, and emits work packets. Each worker receives a narrow task and a limited context. Workers search, compute, call tools, or critique. They return compact findings with provenance and confidence. The coordinator merges results, asks follow-up workers for gaps, or finalizes the answer.

Hierarchical teams repeat this pattern at several levels. Swarms reduce central control and let agents broadcast findings or pick tasks from a queue. Debate systems send candidate answers to critics. Blackboard systems let agents write to a shared workspace while a controller arbitrates.

## When to use vs alternatives

Use a single agent for short tool-use tasks, low-risk chat, or tightly scoped retrieval. Use deterministic workflows when the steps are known and repeatable. Use LangGraph, AutoGen, CrewAI, or similar frameworks when you need reusable team structure. Use Temporal, Inngest, or Restate underneath when agents must survive crashes, timers, approvals, or multi-day waits.

Multi-agent is most compelling for breadth-first work: many sources, many independent hypotheses, or separate areas of expertise that can be investigated in parallel and compressed before final reasoning.

## Failure modes & gotchas

Coordination can consume more tokens than the task. Workers can duplicate effort, inherit a flawed plan, fabricate evidence, or reinforce each other's mistakes. A weak coordinator may accept confident but unsupported summaries. Broad tool access can leak authority across agents: a research worker should not automatically get production write access.

Evaluation must cover the topology, not only the final model. Compare single-agent, parallel workers, critic loops, and deterministic baselines on the same tasks. Track budget, latency, recall, citation quality, and safety interventions.

## Minimal code shape (pseudocode/short snippet you write)

```text
goal = read_user_goal()
plan = coordinator.plan(goal, budget, available_workers)

for packet in plan.work_packets.parallel():
  result = worker(packet.role).run(
    task=packet.task,
    tools=packet.allowed_tools,
    output_schema=Finding
  )
  workspace.add(result)

review = coordinator.merge(workspace.findings)
while review.has_gaps and budget.remaining():
  workspace.add(worker("follow_up").run(review.next_gap))
  review = coordinator.merge(workspace.findings)

return coordinator.answer(review.evidence)
```

## Key links

- Anthropic multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
