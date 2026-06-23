---
title: "Eval Frameworks: promptfoo, DeepEval, Ragas, OpenAI Evals"
category: "Evaluation & observability"
url: https://www.promptfoo.dev/docs/intro/
license: MIT
verdict: Choose promptfoo for prompt/model matrices and CI, DeepEval for pytest-like Python app tests, Ragas for RAG and agent metrics, and OpenAI Evals for OpenAI-native eval workflows.
as_of_date: 2026-06-22
sources:
  - {url: "https://www.promptfoo.dev/docs/intro/", license: "MIT", kind: "official_docs"}
  - {url: "https://github.com/promptfoo/promptfoo", license: "MIT", kind: "oss_repo"}
  - {url: "https://deepeval.com/docs/getting-started", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/confident-ai/deepeval", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/explodinggradients/ragas", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://github.com/openai/evals", license: "MIT with dataset-specific exceptions", kind: "oss_repo"}
---

## What it is

Eval frameworks provide reusable machinery for running LLM quality tests: datasets, model/provider adapters, prompt variants, scorers, reports, traces, and CI hooks. They make evaluation repeatable enough to become part of normal software delivery instead of a notebook a single person runs by hand.

promptfoo, DeepEval, Ragas, and OpenAI Evals overlap, but they optimize for different working styles. promptfoo is declarative and matrix-oriented. DeepEval feels close to Python unit testing. Ragas is specialized for RAG, agent, and metric-driven workflows. OpenAI Evals is a reference framework and registry for evaluating LLM systems, especially when using OpenAI's eval tooling and conventions.

## Why it exists / when to reach for it

As soon as prompts and agents become product logic, teams need change control. A framework helps compare two prompts, catch a model-routing regression, validate a RAG update, or run the same checks in a pull request. The main benefit is not the library itself; it is the habit of storing cases, scorers, and results in a form that can be rerun.

## The moving parts

- Test cases: inputs, expected outputs or references, metadata, and fixtures.
- Providers: model APIs, local models, custom HTTP targets, or the full app.
- Assertions and metrics: exact checks, semantic similarity, rubric judges, RAG metrics, tool-use checks.
- Reports: pass/fail tables, score distributions, traces, and diff views.
- Integration layer: CLI, pytest, SDK, CI workflow, experiment tracker, or hosted dashboard.
- Versioning: prompt IDs, model names, dataset versions, scorer versions, and thresholds.

## How it works

Pick a framework that matches the team's natural loop. In promptfoo, define prompts, providers, and assertions in config, then run a matrix across test cases. In DeepEval, write Python tests around app outputs or traces and attach metrics. In Ragas, pass datasets containing questions, contexts, responses, references, and tool traces into metrics such as faithfulness, context precision, response relevancy, and agent goal accuracy. In OpenAI Evals, define evaluation logic and datasets in a repeatable format and use the eval run outputs to compare models or prompts.

The strongest setup often combines tools: promptfoo for fast prompt comparisons, Ragas for RAG diagnostics, and a tracking platform for long-term experiment history.

## When to use vs alternatives

Use promptfoo when you want a developer-friendly CLI, declarative prompt tests, provider comparisons, red-team checks, and CI integration. Use DeepEval when your application is Python-based and you want evals to look like unit tests with ready-made LLM metrics and tracing support. Use Ragas when grounded RAG quality, retrieval context, answer faithfulness, or agent/tool metrics are the center of the problem. Use OpenAI Evals when you need an OpenAI-aligned reference framework or want to contribute/share benchmark-style evals. Use a small custom harness when you only need a dozen deterministic checks and no reporting infrastructure yet.

## Failure modes & gotchas

- A framework can make weak metrics look official.
- Provider adapters can test a prompt path that differs from production orchestration.
- Hosted dashboards are useful, but raw datasets and scorer code should remain exportable.
- RAG metrics need the right fields; missing references or contexts can make scores misleading.
- LLM-judge metrics vary with judge model, prompt, and temperature.
- CI evals need budget controls, caching, and stable model versions where possible.
- OpenAI Evals includes dataset-specific license notices; avoid reusing bundled data without checking rights.

## Minimal code shape

```yaml
# eval.yaml
prompts:
  - file://prompts/lesson_v3.txt
  - file://prompts/lesson_v4.txt
providers:
  - openai:gpt-5.5
tests:
  - vars: {topic: "tool calling", learner: "beginner"}
    assert:
      - type: contains-json
      - type: llm-rubric
        value: "Grounded, age-appropriate, includes one concrete exercise."
      - type: javascript
        value: "output.sources.length >= 2"
```

## Key links

- [promptfoo docs](https://www.promptfoo.dev/docs/intro/)
- [promptfoo repository](https://github.com/promptfoo/promptfoo)
- [DeepEval docs](https://deepeval.com/docs/getting-started)
- [Ragas metrics](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/)
- [OpenAI Evals repository](https://github.com/openai/evals)
