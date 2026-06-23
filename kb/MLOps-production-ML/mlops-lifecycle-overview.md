---
title: "MLOps Lifecycle Overview"
category: "MLOps & production ML"
url: "https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning"
license: "CC-BY-4.0"
verdict: "Use MLOps when the model is part of a repeatable product system, not a one-off notebook."
as_of_date: 2026-06-23
sources:
  - {url: "https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning", license: "CC-BY-4.0", kind: "official_docs"}
  - {url: "https://ml-ops.org/content/mlops-principles", license: "Facts only; original synthesis only", kind: "community_reference"}
  - {url: "https://madewithml.com/", license: "MIT", kind: "educational_repo"}
---

## What it is

MLOps is the operating system around a machine-learning product: how data is prepared, models are trained, artifacts are packaged, deployments are rolled out, predictions are monitored, and retraining decisions are made. It turns "a model worked in a notebook" into "a model can be changed safely while users depend on it."

The lifecycle is usually: define the problem, build datasets and features, train and evaluate candidates, package the winning artifact, serve it, monitor its behavior, then retrain or roll back when the product or data shifts.

## Why it exists / when it matters

It matters when the model is not the product by itself. A production model depends on data contracts, feature freshness, runtime capacity, evaluation thresholds, ownership, and a rollback path. Without those, the model can silently degrade even if the code still deploys.

Reach for a disciplined MLOps loop when predictions affect customers, money, compliance, operations, or product trust. A one-off analysis or classroom demo can be lighter; a fraud model, recommender, ranking model, forecasting system, or embedded LLM workflow needs the full loop.

## The moving parts

- Data pipeline: ingestion, validation, labeling, joins, privacy handling, and training/serving splits.
- Feature and dataset versioning: stable references to what the model learned from.
- Training pipeline: reproducible code, parameters, environment, and metrics.
- Registry: model versions, approval status, metadata, and deployment targets.
- Serving layer: batch, streaming, online REST/gRPC, or embedded runtime.
- Monitoring: data drift, prediction drift, model quality, latency, errors, and cost.
- Retraining policy: scheduled, event-driven, or manually approved.
- Governance: ownership, audit trail, access control, rollback, and review gates.

## How it works

A mature MLOps system treats each stage as a typed handoff. Training code consumes a named dataset version and emits a versioned model with metrics. The registry records whether the model passed tests. Deployment promotes a model version to staging or production. Monitoring compares live traffic to expected behavior and produces alerts or retraining candidates.

The key design choice is not tooling first; it is the contract between stages. A small team can start with Git, a model registry, a simple pipeline runner, and dashboards. A larger platform may standardize orchestration, feature stores, Kubernetes serving, model governance, and automated retraining.

## When to use vs alternatives

Use MLOps when the model needs change control, repeatable training, production monitoring, or multiple teams. Use ordinary software delivery plus a saved artifact when the model is static and low-risk. Use analytics engineering practices when the output is a dashboard or report rather than a predictive service.

LLMOps overlaps with MLOps but adds prompt versions, retrieval indexes, token cost, hallucination checks, guardrail policies, and provider routing. Pair this doc with the KB's LLMOps operating-loop doc for generative systems.

## Failure modes & gotchas

- Optimizing a model metric that is not tied to product impact.
- Training-serving skew: features or preprocessing differ between offline training and online inference.
- Manual promotion with no record of dataset, code, and parameters.
- Monitoring only uptime while ignoring prediction quality.
- Retraining automatically on bad labels or shifted feedback loops.
- Starting with Kubernetes and platform complexity before the team has stable data and evaluation contracts.

## Minimal example (pseudocode you author)

```text
on every model candidate:
  dataset = load_versioned_dataset("churn:v42")
  model = train(code_commit, dataset, params)
  metrics = evaluate(model, holdout="churn:v42_holdout")
  if metrics.pass_gate and bias_checks.pass:
    register(model, stage="candidate")
    deploy_to_staging(model)
    run_shadow_test(model, live_traffic_sample)
    promote_only_with_approval(model)
```

## Key links

- Google MLOps pipelines: https://cloud.google.com/architecture/mlops-continuous-delivery-and-automation-pipelines-in-machine-learning
- MLOps principles: https://ml-ops.org/content/mlops-principles
- Made With ML: https://madewithml.com/

