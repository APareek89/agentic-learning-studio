---
title: "ML Failure Modes and Production Testing"
category: "MLOps & production ML"
url: "https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/"
license: "Research paper; original synthesis only"
verdict: "The dangerous ML failures are quiet: the service stays up while the decision quality decays."
as_of_date: 2026-06-23
sources:
  - {url: "https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/", license: "Research paper; original synthesis only", kind: "research_paper"}
  - {url: "https://developers.google.com/machine-learning/guides/rules-of-ml", license: "CC-BY-4.0", kind: "official_docs"}
  - {url: "https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/", license: "Research paper; original synthesis only", kind: "research_paper"}
---

## What it is

ML failure modes are ways a model system can produce bad outcomes even when code runs and infrastructure looks healthy. Production testing is the set of checks that catches those failures before, during, and after deployment.

Common failures include training-serving skew, data leakage, silent degradation, stale features, broken pipelines, delayed labels, feedback loops, underspecified objectives, and evaluation that misses important slices.

## Why it exists / when it matters

ML systems behave differently from deterministic software because their correctness depends on data distributions and product context. A unit test can pass while the model learns from leaked labels. An endpoint can be healthy while its predictions are no longer useful.

## The moving parts

- Data tests: schema, ranges, missingness, freshness, cardinality, and leakage checks.
- Feature tests: transformation parity, point-in-time correctness, online/offline consistency.
- Model tests: metric gates, slice metrics, calibration, robustness, and bias checks.
- Pipeline tests: reproducibility, idempotence, dependency failure, and retry behavior.
- Deployment tests: canary, shadow, rollback, load, and latency.
- Monitoring tests: alert routing, label joins, dashboard freshness, and owner response.

## How it works

Treat the model as one component inside a sociotechnical system. Before training, test data contracts. During training, compare to baselines and evaluate important slices. Before deployment, verify package contracts and runtime behavior. After deployment, monitor quality proxies and delayed labels. Periodically test whether alerts still fire and whether rollback still works.

The "Hidden Technical Debt" framing is useful because it warns that ML complexity accumulates in glue code, configuration, data dependencies, and feedback paths, not only in model code.

## When to use vs alternatives

Use production-readiness testing for any model that can affect users or business decisions. Use lighter exploratory evaluation for research prototypes. For LLM systems, adapt the same pattern to prompts, retrieval, tools, safety policies, and traces.

## Failure modes & gotchas

- A training set includes information that would not exist at prediction time.
- A feature has the same name online and offline but different logic.
- The model optimizes a proxy that creates a bad product incentive.
- Labels arrive late or are biased by the previous model's decisions.
- A retraining pipeline uses stale or corrupt data and publishes a worse model.
- Metrics are global only; one high-risk cohort regresses.

## Minimal example (pseudocode you author)

```text
before promote(model):
  assert data_schema.current == data_schema.training
  assert no_future_features(training_rows)
  assert metric(model, holdout) > metric(baseline, holdout)
  assert all(slice_metrics(model).above_thresholds)
  assert package_contract_tests.pass
  assert rollback_plan.exists(model.previous_version)
```

## Key links

- Hidden Technical Debt in ML Systems: https://research.google/pubs/hidden-technical-debt-in-machine-learning-systems/
- Rules of ML: https://developers.google.com/machine-learning/guides/rules-of-ml
- The ML Test Score: https://research.google/pubs/the-ml-test-score-a-rubric-for-ml-production-readiness-and-technical-debt-reduction/

