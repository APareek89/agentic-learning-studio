---
title: "Restate"
category: "Durable execution / orchestration"
url: "https://docs.restate.dev/"
license: "Official docs; original synthesis only"
verdict: "Best when durable services, stateful handlers, and reliable calls matter more than a separate workflow DSL."
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.restate.dev/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.restate.dev/concepts", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/restatedev/restate", license: "BSL-1.1; license check only", kind: "oss_repo"}
---

## What it is

Restate is a runtime for building resilient backend services, workflows, and AI agents. It wraps service handlers with durable execution so completed steps, state changes, calls, promises, and timers can survive failures.

The design feels service-first: developers write handlers and workflows in familiar application code while Restate records enough progress to resume safely.

## Why it exists / when to reach for it

Agentic applications are often backend systems, not only chat loops. They call tools, wait for users, update state, trigger other services, and recover from infrastructure failures. Restate exists to make those service interactions reliable without scattering retry state through the application database.

Reach for it when your agent needs durable tool use, stateful entities, reliable service-to-service calls, or long waits embedded in backend handlers.

## The moving parts

- Service handlers: entry points invoked through Restate.
- Workflows: long-running processes expressed as code.
- Virtual objects or stateful entities: isolated state scoped to an ID.
- Durable execution log: records progress and completed operations.
- Durable timers and promises: waits that survive process exits.
- Reliable communication: sync, async, scheduled, and one-way calls.
- Introspection: UI, CLI, logs, and traces for inspecting running services.

## How it works

Requests enter through Restate. Handler code runs and uses the Restate context for durable calls, state, timers, or side-effect boundaries. If the process crashes, Restate uses recorded progress to avoid repeating completed work and continues from the next unfinished operation.

For AI agents, a handler might store conversation state, call a model, run a tool, wait for approval, and schedule a follow-up. The important design habit is to place external effects behind durable boundaries with clear idempotency.

## When to use vs alternatives

Use Restate when the natural abstraction is a durable service or stateful object. Use Temporal when you want a mature workflow platform with explicit workflow/activity semantics and deep ecosystem support. Use Inngest when product events and function steps are the main shape. Use LangGraph for in-memory agent control flow, possibly hosted inside a Restate handler.

Simple queues remain better for short, idempotent background jobs.

## Failure modes & gotchas

Durability does not remove the need to design side effects. Any call to an external API, model provider, payment system, or database still needs an idempotency strategy. Long-running handlers can accumulate sensitive state if prompts and tool outputs are logged without retention rules.

The main Restate repository is Business Source License 1.1 as checked on 2026-06-22, so do not copy repo prose or assume permissive redistribution terms. Use official docs for learning notes and review licensing before embedding self-hosted artifacts in a product.

## Minimal code shape (pseudocode/short snippet you write)

```ts
const lessonService = restate.service({
  name: "LessonService",
  handlers: {
    build: async (ctx, req) => {
      const plan = await ctx.run("plan", () => callModel(req.topic));
      const approved = await ctx.promise("approval").wait();
      if (!approved) return { status: "cancelled" };

      const lesson = await ctx.run("render", () => renderLesson(plan));
      await ctx.run("save", () => saveLesson(req.lessonId, lesson));
      return { status: "ready" };
    },
  },
});
```

## Key links

- Restate docs: https://docs.restate.dev/
- Restate concepts: https://docs.restate.dev/concepts
- Restate repository: https://github.com/restatedev/restate
