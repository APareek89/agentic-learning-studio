---
title: "smolagents"
category: "Agent frameworks"
url: "https://huggingface.co/docs/smolagents/en/index"
license: "Apache-2.0"
verdict: "Best for compact educational agents, code-action workflows, and Hugging Face or open-model demos where sandboxing is handled deliberately."
as_of_date: 2026-06-22
sources:
  - {url: "https://huggingface.co/docs/smolagents/en/index", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/smolagents", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

smolagents is Hugging Face's lightweight Python library for building agents with a small abstraction surface. Its signature idea is the `CodeAgent`: instead of emitting a JSON object that names a tool, the model writes Python code snippets that call tools and compute intermediate results. The library also includes `ToolCallingAgent` for the more conventional tool-call style.

The project is intentionally compact and model-agnostic. It can run against Hugging Face inference providers, local or hosted models, LiteLLM-compatible providers, OpenAI-compatible endpoints, and other integrations.

## Why it exists / when to reach for it

Use smolagents when you want learners to see an agent loop without a heavy framework around it. It is a good fit for notebooks, tutorials, open-model experiments, small research assistants, and demos where code execution is central to the agent's reasoning.

It is also useful when the Hugging Face ecosystem is already part of the lesson: Hub-hosted tools, Spaces as tools, model comparisons, open-model agent benchmarks, or sharing agents and tools through the Hub.

## The moving parts

- CodeAgent: a multi-step agent that writes Python actions and calls tools as functions.
- ToolCallingAgent: a classic tool-calling agent that uses structured tool calls instead of code snippets.
- MultiStepAgent behavior: repeated thought/action/observation steps until a final answer.
- Tools: Python functions, default tools, MCP tool collections, LangChain tools, Hub Spaces, or custom `Tool` classes.
- Models: InferenceClientModel, LiteLLMModel, OpenAI-compatible models, local transformers models, Ollama, Azure/OpenAI-compatible endpoints, and other providers.
- Executors: local Python execution or sandboxed execution through managed services or containers.
- Managed agents: manager-style multi-agent patterns where one agent can call another.
- Hub sharing: push or pull agents and tools, with explicit trust decisions for remote code.

## How it works

A `CodeAgent` receives a task, asks the model for the next code action, executes the code in its configured executor, stores the execution logs as memory, and repeats until the code calls a final-answer path. A `ToolCallingAgent` follows the more common pattern where the model emits tool-call requests and the framework executes them.

The key educational difference is that code actions can combine tool outputs, loops, filtering, arithmetic, and small transformations in one step. That can reduce awkward chains of single tool calls, but it raises the stakes for sandboxing.

## When to use vs alternatives

Use smolagents over CrewAI when the goal is to show a minimal agent loop or code-action behavior, not a role-and-task team structure.

Use it over OpenAI Agents SDK when provider neutrality, open-model experimentation, or Hugging Face Hub workflows matter more than OpenAI-native tracing, sessions, handoffs, and hosted tools.

Use it over LangGraph when you do not need explicit durable state. Use LangGraph if the workflow must be resumed, inspected as a graph, or governed by deterministic transitions.

Use it alongside Pydantic AI carefully: smolagents is lighter and code-centric; Pydantic AI is stronger when typed outputs and dependency injection are the product boundary.

## Failure modes & gotchas

Code execution is the big one. Treat model-written code as untrusted. The built-in local executor is useful for development but should not be treated as a security boundary for arbitrary tasks.

Remote tools and Hub-loaded agents can execute code. Require explicit trust, pin versions, and review what the tool can access.

Code-action agents can be harder to constrain than schema-first tool callers. Limit imports, network, filesystem access, execution time, and secrets.

Small abstractions mean fewer enterprise guardrails. You own approvals, audit trails, tenant boundaries, persistence, evals, and monitoring.

Open models vary widely in tool-use reliability. Test with the exact model and tool set that will run in production.

## Minimal code shape (pseudocode/short snippet you write)

```python
from smolagents import CodeAgent, InferenceClientModel, tool

@tool
def search_kb(query: str) -> str:
    """Return short KB notes for a learner query."""
    return retrieve(query)

model = InferenceClientModel(model_id="Qwen/Qwen3-Next-80B-A3B-Thinking")
agent = CodeAgent(
    tools=[search_kb],
    model=model,
    additional_authorized_imports=["statistics"],
    executor=sandbox_executor,
)

answer = agent.run("Compare CodeAgent with ordinary tool calling.")
```

## Key links

- https://huggingface.co/docs/smolagents/en/index
- https://huggingface.co/docs/smolagents/en/guided_tour
- https://github.com/huggingface/smolagents
