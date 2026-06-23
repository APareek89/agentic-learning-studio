---
title: "Temporal"
category: "Durable execution / orchestration"
url: "https://docs.temporal.io/"
license: "MIT"
verdict: "Best when agent workflows need replayable state, long timers, strong retries, and operational depth."
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.temporal.io/temporal", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.temporal.io/develop/python/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/temporalio/temporal", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/temporalio/sdk-python", license: "MIT", kind: "oss_repo"}
---

## What it is

Temporal is a durable execution platform. Developers write workflow code, and Temporal records the workflow's event history so the application can resume after worker crashes, deploys, outages, timers, and retries.

For agentic systems, Temporal is not the LLM framework. It is the reliability layer underneath long-running plans, approvals, tool calls, and background jobs.

## Why it exists / when to reach for it

LLM workflows often wait on humans, call unreliable services, run expensive tools, and need exact recovery semantics. A normal queue can retry a job, but it does not automatically know which steps already completed. Temporal solves that by making workflow progress durable.

Reach for it when the process may run for minutes to months, side effects matter, or an operator must inspect and recover stuck work.

## The moving parts

- Workflow: deterministic orchestration code that owns durable control flow.
- Activity: side-effecting code such as model calls, database writes, email, or API calls.
- Worker: process that polls task queues and runs workflow/activity code.
- Task queue: routing boundary between Temporal and workers.
- Event history: append-only record used to replay workflow decisions.
- Timers, signals, queries, and updates: ways to wait, receive messages, inspect state, or mutate a running workflow.
- Retry and timeout policies: explicit failure behavior for activities and workflow tasks.

## How it works

The workflow schedules activities, starts timers, waits for signals, and decides the next step. Temporal persists these decisions. If a worker dies, another worker replays the recorded history and rebuilds the workflow state, then continues from the next unfinished command.

The determinism rule is central: workflow code must make the same decisions when replayed from the same history. Side effects belong in activities, where retries and idempotency can be managed explicitly.

## When to use vs alternatives

Use Temporal for complex durable workflows, high reliability requirements, or organizations ready to operate a workflow platform. Use Inngest when the app is event-driven and you want a lighter product-web developer experience. Use Restate when durable service handlers, stateful service calls, or virtual objects are the main abstraction. Use LangGraph for agent control flow, often inside a Temporal activity or workflow.

Queues are enough for simple fire-and-forget background jobs.

## Failure modes & gotchas

Non-deterministic workflow code causes replay failures. Activities must be idempotent because retries can happen after partial external success. Large prompts, model responses, secrets, and PII can bloat or contaminate histories. Long-lived workflows require versioning discipline when code changes. Debugging requires understanding whether a failure happened in workflow replay, an activity, a worker, or the service.

Do not hide all model behavior inside one giant activity if operators need step-level recovery.

## Minimal code shape (pseudocode/short snippet you write)

```python
@workflow.defn
class BuildLesson:
    @workflow.run
    async def run(self, topic: str) -> LessonResult:
        plan = await workflow.execute_activity(
            plan_with_agent,
            topic,
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(maximum_attempts=3),
        )
        await workflow.wait_condition(lambda: self.approved)
        return await workflow.execute_activity(render_lesson, plan)

    @workflow.signal
    def approve(self) -> None:
        self.approved = True
```

## Key links

- Temporal overview: https://docs.temporal.io/temporal
- Python SDK guide: https://docs.temporal.io/develop/python/
- Temporal server repository: https://github.com/temporalio/temporal
- Temporal Python SDK: https://github.com/temporalio/sdk-python
