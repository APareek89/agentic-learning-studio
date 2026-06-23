---
title: "CI/CD, Continuous Training, and Orchestration"
category: "MLOps & production ML"
url: "https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning"
license: "CC-BY-4.0"
verdict: "Automate the repeatable path, but keep human approval where model risk is product risk."
as_of_date: 2026-06-23
sources:
  - {url: "https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning", license: "CC-BY-4.0", kind: "official_docs"}
  - {url: "https://www.kubeflow.org/docs/components/pipelines/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.zenml.io/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.metaflow.org/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.dagster.io/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://airflow.apache.org/docs/", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

ML CI/CD applies software delivery discipline to data and model changes. Continuous training adds automated retraining when new data, code, or performance signals justify a new candidate. Orchestration coordinates the multi-step workflow: extract data, validate it, train, evaluate, register, deploy, and monitor.

## Why it exists / when it matters

Models depend on data, and data changes even when code does not. A deployment process that only tests source code misses schema breaks, label drift, feature leakage, and quality regressions. ML delivery needs tests around the pipeline and the candidate model, not just the application service.

## The moving parts

- CI checks: lint, unit tests, data schema tests, feature transform tests, and pipeline compilation.
- Pipeline orchestrator: Airflow, Dagster, Kubeflow Pipelines, Metaflow, ZenML, or managed equivalents.
- Training trigger: schedule, data arrival, code merge, drift alert, or manual request.
- Evaluation gate: metric thresholds, slice tests, fairness/privacy checks, cost and latency checks.
- Deployment gate: staging test, shadow/canary, approval, rollback.
- Metadata store: run history, artifacts, lineage, and decisions.

## How it works

The pipeline should be idempotent and parameterized. A run consumes explicit versions, writes artifacts to known locations, and records enough metadata to reproduce or compare it. CI validates that pipeline code and feature logic can run. Continuous training creates candidates, but promotion is usually gated by quality and risk policies.

Kubeflow Pipelines focuses on Kubernetes-native ML workflows. Airflow is common for scheduled DAGs. Dagster emphasizes typed assets and software-defined data pipelines. Metaflow provides a Python-friendly path for data science workflows. ZenML abstracts stacks across orchestrators and artifact stores.

## When to use vs alternatives

Use a pipeline orchestrator when training has dependencies, retries, scheduling, or multiple owners. Use a script plus cron for a small low-risk model. Use managed AutoML or platform pipelines when the organization wants standardization and can accept platform constraints.

## Failure modes & gotchas

- Treating retraining as always good; it can amplify bad labels or feedback loops.
- No separate gates for data validity, model quality, and deployment safety.
- Pipelines are not idempotent, so reruns change results unpredictably.
- Secrets and production credentials leak into training jobs.
- Only aggregate metrics are checked; vulnerable slices regress.
- Orchestration becomes a platform project before the team has stable ML contracts.

## Minimal example (pseudocode you author)

```text
on daily_data_arrival:
  validate_schema()
  validate_label_distribution()
  train_candidate(dataset_version)
  evaluate(candidate, global_metrics, slice_metrics)
  if gates.pass:
    register(candidate, stage="candidate")
    deploy_shadow(candidate)
  else:
    notify_owner(reason=gates.failures)
```

## Key links

- Google MLOps pipelines: https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning
- Kubeflow Pipelines: https://www.kubeflow.org/docs/components/pipelines/
- ZenML: https://docs.zenml.io/
- Metaflow: https://docs.metaflow.org/
- Dagster: https://docs.dagster.io/
- Airflow: https://airflow.apache.org/docs/

