---
title: "AutoGen and AG2"
category: "Agent frameworks"
url: "https://microsoft.github.io/autogen/stable/"
license: "CC-BY-4.0 / MIT / Apache-2.0"
verdict: "Best for conversational multi-agent experiments, legacy AutoGen literacy, or AG2 systems that need active continuation of the classic AutoGen style."
as_of_date: 2026-06-22
sources:
  - {url: "https://microsoft.github.io/autogen/stable/", license: "CC-BY-4.0 docs; MIT code", kind: "official_docs"}
  - {url: "https://github.com/microsoft/autogen", license: "CC-BY-4.0 docs; MIT code", kind: "oss_repo"}
  - {url: "https://docs.ag2.ai/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/ag2ai/ag2", license: "Apache-2.0 plus original MIT code", kind: "oss_repo"}
---

## What it is

AutoGen is Microsoft's multi-agent framework for applications built from message-passing agents, tool use, human participation, and teams. Its current Microsoft repo is in maintenance mode, and Microsoft points new production agent work toward Microsoft Agent Framework.

AG2 is the community-led continuation that evolved from AutoGen. It keeps the familiar `autogen` package lineage while moving under AG2 governance, Apache-2.0 licensing for new work, and an active roadmap toward a cleaned-up v1 API.

Together, they are best understood as the conversational-agent family of frameworks: agents speak to each other, call tools, ask humans for input, and stop when a termination rule or workflow condition is satisfied.

## Why it exists / when to reach for it

Use this topic to teach how multi-agent systems can be organized as conversations rather than as a fixed graph or task list. It is a good fit for lessons on user-proxy agents, assistant agents, group chat, code execution, tool registration, human-in-the-loop review, and teams of specialist agents that negotiate or critique one another.

For new Microsoft-aligned production systems, evaluate Microsoft Agent Framework first. For projects that already use AutoGen-style APIs, AG2 may be the more active path.

## The moving parts

- AutoGen Core: lower-level event-driven agents, message passing, runtimes, and distributed patterns.
- AutoGen AgentChat: a higher-level API with preset agents and team patterns for fast prototypes.
- AutoGen Extensions: model clients, MCP workbenches, code executors, OpenAI/Azure integrations, and other adapters.
- AutoGen Studio: a UI for prototyping; useful for exploration, not a complete production app by itself.
- AG2 ConversableAgent: the central abstraction for sending, receiving, and generating replies.
- AG2 UserProxyAgent: a way to represent human review, approval, or task initiation.
- Tools and executors: functions, code execution, external APIs, retrieval, and integrations.
- Termination logic: explicit conditions, max turns, keywords, approvals, or workflow state that end a conversation.

## How it works

In AutoGen AgentChat, you define agents with model clients, instructions, tools, and optional reflection behavior. A single agent can answer directly, or a team can route work through round-robin, selector, swarm, or custom patterns. AutoGen Core gives lower-level control over events and runtimes when AgentChat is too opinionated.

In AG2, `ConversableAgent` instances exchange messages. Tools are registered so one agent can ask another or an executor to perform work. Human participation is represented as another participant in the conversation, often through a user proxy. The conversation continues until a termination condition fires.

## When to use vs alternatives

Use AutoGen or AG2 when the interesting part of the lesson is the conversation protocol: who speaks next, when humans intervene, how agents critique one another, and how a chat terminates.

Use CrewAI when role/task readability is the priority. Use LangGraph when you need explicit state transitions, durable checkpoints, or graph-shaped control. Use OpenAI Agents SDK when OpenAI-native tools, handoffs, tracing, and sessions should be the default runtime. Use Microsoft Agent Framework for new Microsoft ecosystem production work.

## Failure modes & gotchas

Version naming is a trap. AutoGen 0.2-era tutorials, AutoGen stable docs, AG2 docs, and Microsoft Agent Framework docs can describe different APIs. Pin the package and cite the version family in teaching material.

Open conversations can run long, repeat themselves, or conceal authority. Give every team an owner, a termination rule, and a clear answer contract.

Human-in-the-loop is not automatic governance. Decide which actions require approval, what the human is approving, and how the system records that decision.

Code execution examples need sandboxing. A code executor is a security boundary only if the surrounding runtime actually isolates files, network, secrets, and processes.

AutoGen maintenance mode matters. For greenfield Microsoft projects, treating AutoGen as the default can send learners toward an older path.

## Minimal code shape (pseudocode/short snippet you write)

```python
planner = AssistantAgent("planner", model_client=model, system_message="Break the task down.")
executor = AssistantAgent("executor", model_client=model, tools=[run_report_query])

team = RoundRobinGroupChat(
    participants=[planner, executor],
    termination_condition=contains_text("FINAL")
)

result = await team.run(task="Compare weekly activation by product.")
```

## Key links

- https://microsoft.github.io/autogen/stable/
- https://github.com/microsoft/autogen
- https://docs.ag2.ai/
- https://docs.ag2.ai/latest/docs/home/quickstart/
- https://github.com/ag2ai/ag2
- https://learn.microsoft.com/en-us/agent-framework/overview/
