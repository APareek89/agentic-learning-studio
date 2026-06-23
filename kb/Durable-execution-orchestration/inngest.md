---
title: "Inngest"
category: "Durable execution / orchestration"
url: "https://www.inngest.com/docs"
license: "Official docs; original synthesis only"
verdict: "Best for event-driven durable functions and AI jobs in product web stacks."
as_of_date: 2026-06-22
sources:
  - {url: "https://www.inngest.com/docs", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://www.inngest.com/docs/features/inngest-functions", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://www.inngest.com/docs/features/inngest-functions/steps-workflows", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/inngest/inngest", license: "SSPL-1.0 / Apache-2.0 future; license check only", kind: "oss_repo"}
  - {url: "https://github.com/inngest/inngest-js", license: "GPL-3.0; license check only", kind: "oss_repo"}
---

## What it is

Inngest is an event-driven platform for durable functions, background jobs, scheduled work, and step-based workflows. Product code sends events; Inngest invokes registered functions and persists progress across steps.

For agentic AI, it is a practical way to run model jobs that should retry, wait, rate-limit, or continue after deploys without building a custom queue and state machine.

## Why it exists / when to reach for it

Modern web apps need background work tied to product events: generate a lesson after upload, evaluate an answer, refresh embeddings, send notifications, or wait for another event. Inngest gives developers a function-shaped workflow abstraction rather than forcing them to combine queues, cron, retry tables, and ad hoc state.

Reach for it when events are already the natural trigger and when step-level retry is enough for the process.

## The moving parts

- Event: the trigger payload, usually emitted by the application.
- Function: durable background logic registered with an ID and trigger.
- Step: a named unit of work whose result or failure can be persisted.
- Sleep and wait primitives: durable pauses or waits for later events.
- Flow control: concurrency, throttling, debouncing, rate limits, batching, and prioritization.
- Executor and state store: platform pieces that schedule work, store run state, and retry failures.
- Dashboard and logs: operational view of events, runs, and failures.

## How it works

The app emits an event. Inngest matches the event to one or more functions. The function executes until it reaches a step boundary. If a step succeeds, its output can be reused on retry. If a step fails, the platform retries according to policy instead of rerunning unrelated completed work.

This fits LLM work well because model calls, retrieval, rendering, and notifications can be split into independently retriable steps.

## When to use vs alternatives

Use Inngest for web-product workflows, serverless-friendly background tasks, and event-driven AI jobs. Use Temporal when workflows are deeply stateful, long-lived, or need mature multi-language workflow semantics. Use Restate when durable service-to-service calls and stateful handlers are the core design. Use a queue when a single idempotent worker job is enough.

LangGraph can sit inside an Inngest step when the LLM control flow is complex but the product trigger is event-based.

## Failure modes & gotchas

Choose step boundaries carefully. A step should be idempotent or have a safe external idempotency key. Event schemas need versioning, because old events may be replayed or inspected later. Flow-control limits protect downstream services, but bad keys can serialize too much work or allow noisy users to dominate.

Agent jobs need explicit timeouts and retry budgets. Repeatedly retrying a failing model call can create surprising cost. The upstream repo license check is not permissive for copying source prose, so use official docs for product facts and verify licensing before redistributing self-hosted components.

## Minimal code shape (pseudocode/short snippet you write)

```ts
export const buildLesson = inngest.createFunction(
  { id: "build-lesson", concurrency: { limit: 3, key: "event.data.userId" } },
  { event: "lesson/build.requested" },
  async ({ event, step }) => {
    const plan = await step.run("plan", () => callPlanner(event.data.topic));
    const draft = await step.run("render", () => renderLesson(plan));
    await step.run("store", () => saveLesson(event.data.lessonId, draft));
    return { lessonId: event.data.lessonId };
  }
);
```

## Key links

- Inngest docs: https://www.inngest.com/docs
- Inngest functions: https://www.inngest.com/docs/features/inngest-functions
- Steps and workflows: https://www.inngest.com/docs/features/inngest-functions/steps-workflows
- Inngest repository: https://github.com/inngest/inngest
