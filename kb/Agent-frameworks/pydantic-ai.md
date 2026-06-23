---
title: "Pydantic AI"
category: "Agent frameworks"
url: "https://ai.pydantic.dev/"
license: "MIT"
verdict: "Best for Python agent apps where typed dependencies, validated structured output, provider flexibility, and testable contracts matter."
as_of_date: 2026-06-22
sources:
  - {url: "https://ai.pydantic.dev/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/pydantic/pydantic-ai", license: "MIT", kind: "oss_repo"}
---

## What it is

Pydantic AI is a Python framework for building agents with the same bias that made Pydantic useful in web backends: explicit types, validation, clear data boundaries, and predictable failure handling. An agent can receive typed dependencies, call tools, produce structured output, stream partial results, and work across many model providers.

The framework is broader than "Pydantic for JSON." It includes model abstraction, function tools, toolsets, capabilities, MCP integration, Agent2Agent support, UI event streams, evals, and graph-style workflows through the Pydantic ecosystem.

## Why it exists / when to reach for it

Reach for Pydantic AI when an agent's output must become application data. Examples include support decisions, lesson blueprints, invoice checks, structured research notes, moderation decisions, or any workflow where downstream code needs a validated object rather than a best-effort paragraph.

It also fits teams that want dependency injection for agents. Database clients, tenant settings, retrievers, permissions, or user context can be passed as typed dependencies and used by instructions or tools without hiding them in globals.

## The moving parts

- Agent: generic over dependency type and output type.
- Model abstraction: provider integrations for OpenAI, Anthropic, Gemini, local or gateway-backed models, and custom models.
- Dependencies: data and services passed into a run through `RunContext`.
- Function tools: Python functions registered through decorators or constructor arguments.
- Output type: a Pydantic model, dataclass, primitive, union, or other supported schema that validates final output.
- Validation and retries: structured output failures can be surfaced back to the model for another attempt.
- Capabilities: reusable bundles of tools, hooks, instructions, and model settings.
- Graph support: explicit workflow composition when a single agent loop is not enough.
- Observability and testing: Logfire integration, usage data, test models, eval tooling, and message inspection.

## How it works

You declare an agent with a model, instructions, dependency type, and output type. Tools can receive `RunContext[Deps]`, giving them typed access to runtime resources. During a run, the model requests tool calls, the framework executes them, and the final answer is parsed and validated into the requested output type. If validation fails, the framework can retry with structured feedback.

This shifts the teaching emphasis from "the model said something" to "the agent either produced a valid object or failed in a known way."

## When to use vs alternatives

Use Pydantic AI over OpenAI Agents SDK when provider flexibility and Python data contracts matter more than OpenAI-native tracing, sessions, handoffs, or hosted tools.

Use it over CrewAI when the hard part is typed input/output and dependency injection rather than role-based multi-agent storytelling. Use CrewAI when a business user can understand the system as a crew of named collaborators.

Use it over Instructor when you need a full agent loop with tools, dependencies, and workflows. Use Instructor or provider structured-output APIs when the job is only extraction into a schema.

Use LangGraph when you need explicit state-machine control and durable orchestration across many nodes.

## Failure modes & gotchas

Validation is not truth. A response can satisfy a schema while still being factually wrong, stale, or unsafe.

Large schemas increase prompt weight and failure surface. Prefer small output types that map to real product decisions.

Retries can hide a confused task. If the same field fails repeatedly, improve the instructions or split the task instead of allowing endless repair attempts.

Provider differences still matter. A schema or tool pattern that works cleanly with one model can behave differently with another.

Typed dependencies are powerful but can become invisible coupling. Keep security decisions, tenant scope, and tool permissions explicit in code review.

## Minimal code shape (pseudocode/short snippet you write)

```python
from dataclasses import dataclass
from pydantic import BaseModel
from pydantic_ai import Agent, RunContext

@dataclass
class Deps:
    retriever: object
    user_id: str

class LessonPlan(BaseModel):
    title: str
    objectives: list[str]
    risks: list[str]

agent = Agent("openai:gpt-5.5", deps_type=Deps, output_type=LessonPlan)

@agent.tool
async def search_kb(ctx: RunContext[Deps], query: str) -> str:
    return await ctx.deps.retriever.search(query)

plan = await agent.run("Create a lesson on tool safety.", deps=Deps(retriever, user_id))
```

## Key links

- https://ai.pydantic.dev/
- https://ai.pydantic.dev/agents/
- https://ai.pydantic.dev/tools/
- https://ai.pydantic.dev/output/
- https://github.com/pydantic/pydantic-ai
