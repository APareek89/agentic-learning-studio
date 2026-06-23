---
title: LLM Evaluation
category: "Evaluation & observability"
url: https://platform.openai.com/docs/guides/evals
license: Official docs; original synthesis only
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://platform.openai.com/docs/guides/evals", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/openai/evals", license: "MIT with dataset-specific exceptions", kind: "oss_repo"}
  - {url: "https://www.braintrust.dev/docs/evaluate", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/braintrustdata/braintrust-sdk", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

LLM evaluation is the practice of turning product expectations into repeatable measurements. It covers offline test suites, human review, model-graded rubrics, retrieval checks, production scoring, and release gates. For agentic systems, evaluation must measure more than final text: it should also inspect tool calls, retrieved evidence, intermediate decisions, latency, cost, and whether the system refuses or asks for clarification when it should.

## Why it exists / when to reach for it

LLM behavior changes when prompts, models, retrieval corpora, tools, context windows, or routing rules change. Manual demos catch obvious failures, but they do not tell you whether a release improved a high-risk slice or merely passed a happy path. Reach for evals when a workflow starts serving users, when a model is upgraded, when a prompt is edited, when a KB is rebuilt, or when production traces reveal a new failure pattern.

## The moving parts

- Dataset: representative inputs, metadata, and expected outcomes.
- Task runner: the exact app path under test, not a simplified prompt when the real system uses retrieval or tools.
- Scorers: deterministic checks, reference comparisons, LLM judges, human labels, or business metrics.
- Slices: categories such as learner level, topic, language, tool path, safety sensitivity, and known edge cases.
- Baseline: the current production behavior or prior accepted run.
- Thresholds: pass/fail rules for critical cases and acceptable aggregate movement.
- Review loop: a process for turning failures into fixes, new cases, or updated rubrics.

## How it works

Start with a small suite that reflects real user jobs. For each case, record the user input, relevant context or fixtures, expected properties, and why the case matters. Run the current system and any candidate system against the same cases. Score both exact requirements, such as JSON validity or citation presence, and softer qualities, such as usefulness or groundedness.

Treat evaluation as a diagnostic workflow, not a single leaderboard. If a candidate improves average quality but fails a critical safety or grounding slice, it should not ship. If a case fails because the expected answer became stale, update the dataset with a note instead of quietly lowering the threshold. Production scoring should feed the offline set: high-friction traces, user corrections, and support tickets are often the best new eval cases.

## When to use vs alternatives

Use unit-style evals for deterministic requirements: schema, required sections, citation format, tool arguments, and banned actions. Use retrieval evals when the main uncertainty is whether the right evidence appears in context. Use LLM-as-judge or human review for nuanced dimensions like pedagogical quality, tone, and answer completeness. Use online analytics to discover real-world issues, but do not rely on analytics alone because they detect regressions after users have already seen them.

## Failure modes & gotchas

- Overfitting to a tiny eval set can make the app brittle.
- Aggregate scores can hide failures in rare but important slices.
- Model graders need calibration against human labels and deterministic checks.
- Test cases rot when products, policies, or source content change.
- Running evals through a simplified harness can miss orchestration failures.
- Online evals without sampling and privacy rules can leak sensitive content into logs.
- A pass threshold should reflect user risk, not the score a team hopes to see.

## Minimal code shape

```ts
const report = await runEvalSuite({
  dataset: "lesson-generation-regression-v4",
  task: (item) => app.generateLesson(item.request, item.profile),
  scorers: [
    schemaValid(),
    citesRetrievedSources(),
    rubricJudge("age-appropriate, grounded, actionable"),
    toolTraceMatchesPlan(),
  ],
  slices: ["topic", "learner_level", "retrieval_mode"],
});

assert(report.slice("critical").passRate >= 0.98);
assert(report.delta("groundedness").p50 >= -0.02);
```

## Key links

- [OpenAI evals guide](https://platform.openai.com/docs/guides/evals)
- [OpenAI Evals repository](https://github.com/openai/evals)
- [Braintrust evaluation guide](https://www.braintrust.dev/docs/evaluate)
- [Braintrust experiments](https://www.braintrust.dev/docs/evaluate/run-evaluations)
