---
title: Regression Testing for Agentic Systems
category: "Evaluation & observability"
url: https://www.promptfoo.dev/docs/intro/
license: MIT
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://www.promptfoo.dev/docs/intro/", license: "MIT", kind: "official_docs"}
  - {url: "https://github.com/promptfoo/promptfoo", license: "MIT", kind: "oss_repo"}
  - {url: "https://deepeval.com/docs/metrics-introduction", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/confident-ai/deepeval", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://www.braintrust.dev/docs/evaluate/run-evaluations", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://langfuse.com/docs/evaluation/overview", license: "MIT Expat except EE folders", kind: "official_docs"}
  - {url: "https://github.com/open-telemetry/semantic-conventions-genai", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

Regression testing for agentic systems checks that a change did not break behaviors that previously worked. It combines ordinary software tests with LLM evals, trace assertions, tool-use checks, retrieval checks, and production-derived cases. The target is not bit-for-bit determinism; the target is preserving critical capabilities and known safety boundaries while allowing acceptable variation.

## Why it exists / when to reach for it

Agents are sensitive to small changes. A new model may call tools more often. A prompt cleanup may remove a guardrail. A retrieval rebuild may make the right source rank lower. A timeout adjustment may cause partial answers. Regression suites catch these shifts before they reach users, especially when they run automatically in pull requests, model upgrade experiments, and KB rebuilds.

## The moving parts

- Golden tasks: representative workflows with expected outcomes, tool traces, and evidence requirements.
- Deterministic guards: schema validation, allowed tools, argument checks, timeouts, and policy assertions.
- Semantic scorers: LLM judges or specialized metrics for groundedness, helpfulness, and task completion.
- Trace assertions: expectations about which spans exist, which tools ran, and whether errors were handled.
- Baseline comparisons: current production, last release, or a known-good candidate.
- Slices and severity: critical, high, medium, exploratory, and production-watch cases.
- Promotion policy: rules for when a candidate is blocked, manually reviewed, or allowed with notes.

## How it works

Build the suite from real workflows. Each test should state the user goal, setup data, allowed resources, expected success conditions, and what kind of failure it protects against. Run the full application path whenever possible: router, retriever, agent loop, tools, model, renderer, and logging. Capture traces so failures can be inspected after the run.

Separate three classes of assertions. Hard assertions fail immediately for broken contracts: invalid JSON, unauthorized tool use, missing citation, unsafe action, or unhandled exception. Soft assertions compare scores against thresholds: groundedness, usefulness, completeness, and style. Drift assertions compare candidate behavior to the baseline: cost, latency, tool count, retrieval rank, refusal rate, or pass rate by slice.

Keep the suite alive. When production incidents occur, add a minimal case that would have caught the issue. When a product decision changes, update the expected behavior with a dated rationale. When a case is flaky, fix the scoring or quarantine it; do not let noisy tests train the team to ignore failures.

## When to use vs alternatives

Use regression tests for release control and model/prompt/KB changes. Use exploratory red teaming to find new classes of failures. Use offline RAG evaluation for index and retrieval tuning. Use production monitors for live drift, but feed those findings back into the offline suite. Use human review for high-severity changes or when automated scorers disagree.

## Failure modes & gotchas

- Snapshotting exact prose creates brittle tests that reject harmless variation.
- A suite with only happy paths misses tool misuse, refusals, and partial failures.
- Random seeds and low temperature help, but they do not make hosted LLM behavior fully deterministic.
- Tool mocks can hide integration bugs if they diverge from real tool behavior.
- Cost limits are part of correctness; a passing agent that takes 30 tool calls may still regress.
- Baselines can preserve bad behavior if no one reviews whether the old answer was actually right.
- Privacy rules still apply to production traces reused as regression fixtures.

## Minimal code shape

```ts
for (const task of regressionSuite) {
  const run = await agent.run(task.input, { fixtures: task.fixtures });

  assert(validSchema(run.final));
  assert(onlyAllowedTools(run.trace, task.allowedTools));
  assert(retrievedExpectedSource(run.trace, task.expectedSources));

  const scores = await scoreRun(run, task.rubric);
  compareToBaseline({
    taskId: task.id,
    scores,
    trace: run.trace,
    maxCostDelta: 0.15,
    minGroundedness: 0.9,
  });
}
```

## Key links

- [promptfoo docs](https://www.promptfoo.dev/docs/intro/)
- [DeepEval metrics](https://deepeval.com/docs/metrics-introduction)
- [Braintrust experiments](https://www.braintrust.dev/docs/evaluate/run-evaluations)
- [Langfuse evaluation overview](https://langfuse.com/docs/evaluation/overview)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
