---
title: "Semantic Kernel and Microsoft Agent Framework"
category: "Agent frameworks"
url: "https://learn.microsoft.com/en-us/agent-framework/overview/"
license: "MIT"
verdict: "Best for Microsoft ecosystem teams that want production-grade .NET/Python agents, workflows, middleware, telemetry, and Azure or Foundry integration."
as_of_date: 2026-06-22
sources:
  - {url: "https://learn.microsoft.com/en-us/agent-framework/overview/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/microsoft/agent-framework", license: "MIT", kind: "oss_repo"}
  - {url: "https://learn.microsoft.com/en-us/semantic-kernel/overview/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/microsoft/semantic-kernel", license: "MIT", kind: "oss_repo"}
---

## What it is

Semantic Kernel is Microsoft's earlier SDK for connecting models, plugins, functions, memory, planners, and agents in application code. Microsoft Agent Framework is the newer production-focused successor for agent and multi-agent workloads, combining ideas from Semantic Kernel and AutoGen with workflows, state, middleware, telemetry, and .NET/Python support.

For a KB lesson, the important current framing is migration-aware: Semantic Kernel remains important because many Microsoft examples and applications use its kernel/plugin model, but Microsoft positions Agent Framework as the next-generation path for new production agent systems.

## Why it exists / when to reach for it

Use this stack when the surrounding system is already Microsoft-heavy: Azure OpenAI, Foundry, Microsoft 365, .NET services, enterprise identity, OpenTelemetry, durable hosting, or teams that need consistent Python and .NET agent patterns.

Use Semantic Kernel when explaining kernels, plugins, function choice, and existing SK agent apps. Use Microsoft Agent Framework when teaching new production agents, graph-based workflows, middleware, state management, A2A/MCP interop, human-in-the-loop paths, and cloud deployment.

## The moving parts

- Semantic Kernel kernel: the dependency container for model services, plugins, prompt/function settings, and invocation.
- Plugins/functions: native code functions, prompt functions, OpenAPI functions, MCP tools, and other callable capabilities.
- Semantic Kernel agents: `ChatCompletionAgent`, OpenAI/Azure agent types, threads, and agent orchestration packages.
- Microsoft Agent Framework Agent: a .NET/Python abstraction configured with model clients, instructions, tools, and middleware.
- Workflows: graph-based orchestration with sequential, concurrent, branching, handoff, and group collaboration patterns.
- State and checkpoints: support for long-running, interruptible, human-reviewed, or replayable workflows.
- Middleware and filters: request/response processing, exception handling, policy, and custom pipelines.
- Observability and hosting: telemetry, DevUI, Foundry hosted agents, Azure Functions, Durable Task, A2A, MCP, and M365 integration paths.

## How it works

In Semantic Kernel, application code registers model services and plugins with a kernel. Agents or prompts then invoke functions automatically or explicitly, using the kernel as the coordination layer.

In Microsoft Agent Framework, the app defines agents and workflows more directly. A basic agent can run a model-backed task, while workflows coordinate multiple agents or functions through graph steps, state, checkpoints, streaming, and human approval points. Middleware and telemetry make the runtime look more like production application infrastructure than a notebook-only agent loop.

## When to use vs alternatives

Use Microsoft Agent Framework over AutoGen for new Microsoft production work; AutoGen is now primarily a maintenance-mode or legacy-learning topic in the Microsoft ecosystem.

Use it over OpenAI Agents SDK when enterprise Microsoft integration, .NET parity, workflow graphs, Azure hosting, or cross-runtime patterns matter more than OpenAI-native simplicity.

Use it over LangGraph when Microsoft platform integration is the deciding factor. Use LangGraph when you want a provider-neutral graph-first runtime with a broad LangChain ecosystem.

Use Semantic Kernel rather than Agent Framework mainly for existing SK codebases, plugin examples, or lessons about the kernel/function abstraction.

## Failure modes & gotchas

Microsoft agent naming has shifted. Distinguish Semantic Kernel, AutoGen, Microsoft Agent Framework, Microsoft 365 Agents SDK, and Foundry agents instead of treating them as one product.

Docs and samples can be language-specific. A .NET pattern may not map line-for-line to Python, and preview packages may differ from stable packages.

Azure examples often imply Azure-specific auth, hosting, and operational assumptions. Call that out when teaching provider-neutral agent concepts.

Third-party tools, agents, code, and non-Azure models carry their own costs and terms. The app still owns responsible AI mitigations, filtering, testing, reliability, and security.

Migration deserves its own plan. Do not casually rewrite SK or AutoGen systems into Agent Framework without checking feature parity, state shape, observability, and deployment assumptions.

## Minimal code shape (pseudocode/short snippet you write)

```python
from agent_framework import Agent, Workflow

researcher = Agent(name="researcher", model=foundry_model, tools=[search_kb])
reviewer = Agent(name="reviewer", model=foundry_model, instructions="Check for unsupported claims.")

workflow = Workflow()
notes = workflow.step("research", researcher)
checked = workflow.step("review", reviewer, input_from=notes)
workflow.require_human_approval(checked, when="publishing")

result = await workflow.run("Prepare a lesson on agent handoffs.")
```

## Key links

- https://learn.microsoft.com/en-us/agent-framework/overview/
- https://github.com/microsoft/agent-framework
- https://learn.microsoft.com/en-us/semantic-kernel/overview/
- https://learn.microsoft.com/en-us/semantic-kernel/frameworks/agent/
- https://github.com/microsoft/semantic-kernel
