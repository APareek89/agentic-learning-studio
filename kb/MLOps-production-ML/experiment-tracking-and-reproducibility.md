---
title: "Experiment Tracking and Reproducibility"
category: "MLOps & production ML"
url: "https://mlflow.org/docs/latest/ml/tracking/"
license: "Apache-2.0"
verdict: "Track experiments to make decisions explainable, not to create a graveyard of unused runs."
as_of_date: 2026-06-23
sources:
  - {url: "https://mlflow.org/docs/latest/ml/tracking/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.wandb.ai/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://aimstack.readthedocs.io/", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

Experiment tracking records the evidence behind model development: parameters, code version, dataset reference, metrics, artifacts, plots, notes, and comparisons. Reproducibility is the ability to rerun or understand an experiment well enough to trust, debug, or improve it.

## Why it exists / when it matters

ML work produces many plausible candidates. Without tracking, teams pick models from memory, screenshots, or notebook cells. That breaks down when an old model must be compared, a metric regresses, or an auditor asks why a version was promoted.

## The moving parts

- Run metadata: code commit, user, start/end time, environment, and tags.
- Parameters: model choices, feature sets, hyperparameters, seeds, and training budget.
- Metrics: training/validation/test values, slice metrics, latency, cost, and calibration.
- Artifacts: model files, plots, confusion matrices, predictions, and explanations.
- Dataset references: immutable data versions, not just table names.
- Comparison UI/API: rank, filter, group, and promote runs.

## How it works

The training job opens a run, logs parameters and data references, streams metrics, saves artifacts, and closes with status. A reviewer compares candidate runs against baselines and promotion gates. The best run can be connected to a model registry so its lineage follows the artifact into staging and production.

MLflow Tracking is common in open-source stacks and integrates with MLflow Models and Registry. Weights & Biases provides a hosted experiment and model-development workflow. Aim is an open-source experiment tracker designed for high-volume run comparison.

## When to use vs alternatives

Use experiment tracking whenever model choice depends on empirical comparison. Use a simple CSV or notebook report only for a short-lived prototype. Use a broader ML platform when tracking must integrate with governance, approvals, feature lineage, and deployments.

## Failure modes & gotchas

- Logging thousands of runs with no naming, tags, or decision notes.
- Tracking parameters but not data versions.
- Comparing validation metrics from different splits or leakage-prone pipelines.
- No baseline run, so improvement is hard to interpret.
- Metrics are logged but deployment decisions happen outside the system.
- Reproducibility is assumed despite nondeterministic hardware, missing seeds, or floating dependencies.

## Minimal example (pseudocode you author)

```text
with experiment_run("ranking-v5") as run:
  run.log_param("code_commit", git.sha)
  run.log_param("dataset", "clicks:2026-06-23")
  run.log_params(model_config)
  model = train(model_config)
  metrics = evaluate(model, slices=["new_users", "mobile", "high_value"])
  run.log_metrics(metrics)
  run.log_artifact(model)
  if gates.pass(metrics):
    promote_to_registry(run, name="ranking-model")
```

## Key links

- MLflow Tracking: https://mlflow.org/docs/latest/ml/tracking/
- W&B docs: https://docs.wandb.ai/
- Aim docs: https://aimstack.readthedocs.io/

