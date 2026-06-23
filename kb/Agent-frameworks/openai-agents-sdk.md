---
title: "OpenAI Agents SDK"
category: "Agent frameworks"
url: "https://developers.openai.com/api/docs/libraries#use-the-agents-sdk"
license: "MIT"
verdict: "Best for code-first OpenAI-native agent apps that need tools, handoffs, sessions, guardrails, tracing, and Python or TypeScript SDK support."
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.openai.com/api/docs/libraries#use-the-agents-sdk", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://developers.openai.com/api/docs/guides/agents/quickstart", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://openai.github.io/openai-agents-python/", license: "MIT", kind: "official_docs"}
  - {url: "https://github.com/openai/openai-agents-python", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/openai/openai-agents-js", license: "MIT", kind: "oss_repo"}
---

## What it is

The OpenAI Agents SDK is an open-source framework for building agentic applications in Python and TypeScript. It wraps the model loop with primitives for agents, runs, tools, handoffs, sessions, guardrails, tracing, and, in Python, sandbox and realtime/voice-oriented capabilities.

It is not just a thin API client. The ordinary OpenAI SDKs are for direct API calls; the Agents SDK is for applications where code owns orchestration and the model may need to call tools, delegate to specialists, continue across turns, or expose a trace of what happened.

## Why it exists / when to reach for it

Use it when an app is already centered on OpenAI APIs and needs a supported path from simple tool calling to multi-agent workflows. It is a strong fit for product agents, support triage, research assistants, coding/workspace agents, voice agents, and internal automation where observability and guardrails matter.

For a single model call plus a few application-owned tool calls, the Responses API may be enough. Move to the Agents SDK when repeated runs, delegated specialists, sessions, or trace inspection become part of the product surface.

## The moving parts

- Agent: name, instructions, model, tools, guardrails, handoffs, and optional output shape.
- Runner or `run`: executes the loop, handles tool calls, handoffs, and final output.
- Function tools: ordinary code exposed with a schema so the model can request work.
- Hosted tools and MCP tools: provider-hosted capabilities or tools supplied by MCP servers.
- Agents as tools: a manager agent calls a specialist while keeping control.
- Handoffs: a specialist agent takes over the conversation or task.
- Sessions and continuation: app-managed history, SDK-managed sessions, or OpenAI server-managed continuation IDs.
- Tracing: inspection of model calls, tools, handoffs, guardrails, and run steps.
- Guardrails and approvals: validation or blocking logic around inputs, outputs, and sensitive actions.

## How it works

You define an agent with focused instructions and optional tools. A runner sends the user input to the model, interprets tool requests, calls your code or hosted tools, returns tool results, and repeats until the agent produces final output or hands off. For multi-agent designs, the first agent can either call specialists as tools or hand the active run to another agent.

The SDK encourages incremental growth: start with one agent, add one tool, then add specialists only when a routing boundary is real.

## When to use vs alternatives

Use OpenAI Agents SDK over LangGraph when you want batteries-included OpenAI orchestration rather than explicit graph state. Use LangGraph when checkpoints, custom state transitions, provider neutrality, and graph debugging are the lesson.

Use it over CrewAI when handoffs, sessions, tracing, and guardrails matter more than role/task team modeling. Use CrewAI when a non-OpenAI team abstraction is easier to explain.

Use it over Pydantic AI when OpenAI-native runtime features are central. Use Pydantic AI when Python data contracts, dependency injection, and provider-flexible structured outputs are the primary concern.

## Failure modes & gotchas

Pin the model. SDK defaults can change, and implicit model choices can change cost, reasoning behavior, and output style.

Trace payloads can include prompts, outputs, and tool data. Treat traces as production telemetry, not harmless logs.

Tools are application authority. The SDK can route and call them, but the app must still handle permissions, approvals, idempotency, secrets, and audit trails.

Choose one conversation state strategy per flow. Mixing explicit message history, sessions, and server-managed continuation IDs can create confusing replay or context bugs.

Handoffs need clear ownership. If a specialist takes over, decide whether later turns should stay with that specialist or return to a triage agent.

## Minimal code shape (pseudocode/short snippet you write)

```python
from agents import Agent, Runner, function_tool

@function_tool
def search_kb(query: str) -> str:
    return retrieve_relevant_notes(query)

tutor = Agent(
    name="Agentic AI tutor",
    instructions="Answer from the KB and ask for clarification when the task is underspecified.",
    tools=[search_kb],
    handoffs=[quiz_writer],
)

result = await Runner.run(tutor, "Teach me when to use LangGraph.")
```

## Key links

- https://developers.openai.com/api/docs/libraries#use-the-agents-sdk
- https://developers.openai.com/api/docs/guides/agents/quickstart
- https://openai.github.io/openai-agents-python/
- https://openai.github.io/openai-agents-js/
- https://github.com/openai/openai-agents-python
- https://github.com/openai/openai-agents-js
