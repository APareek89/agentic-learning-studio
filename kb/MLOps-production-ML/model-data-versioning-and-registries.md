---
title: "Model and Data Versioning with Registries"
category: "MLOps & production ML"
url: "https://mlflow.org/docs/latest/ml/model-registry/"
license: "Apache-2.0"
verdict: "If you cannot name the exact data, code, and artifact behind a prediction, you cannot debug it."
as_of_date: 2026-06-23
sources:
  - {url: "https://mlflow.org/docs/latest/ml/model-registry/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://dvc.org/doc", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.lakefs.io/", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

Versioning gives every important ML input and output a stable identity: code commit, data snapshot, feature definition, parameters, metrics, model artifact, and deployment stage. A registry is the system of record for model versions and their promotion state.

This is the difference between "we deployed the churn model last week" and "production is serving churn-model version 42, trained from dataset snapshot 2026-06-18, code commit abc123, approved after metric gate G-17."

## Why it exists / when it matters

ML bugs are often historical. You need to know what a model saw during training, what code produced it, what metrics justified deployment, and which version answered a user request. Without lineage, rollback and root-cause analysis become archaeology.

## The moving parts

- Dataset version: immutable snapshot, partition, or table commit.
- Feature definition: transformation code and online/offline serving contract.
- Training run: code, parameters, environment, metrics, artifacts, and random seed.
- Model registry: version, stage, alias, owner, approval status, lineage, and deployment metadata.
- Serving metadata: model version attached to every prediction log.
- Retention policy: what to keep for audit, reproducibility, and cost control.

## How it works

DVC tracks data and pipeline outputs alongside Git-like code workflows. lakeFS brings branch/commit patterns to object-store data lakes. MLflow Model Registry tracks model versions and lifecycle stages. In practice, teams often combine these: data snapshots in a lake, experiments in MLflow, and a deployment system that reads an approved registry alias.

The core operating rule is immutability at the boundary. Training can create new versions; production should consume named versions. Mutable paths such as `models/current.pkl` are convenient until they erase the evidence needed for debugging.

## When to use vs alternatives

Use formal versioning when a model can be retrained, audited, rolled back, or compared over time. Use a lighter manifest file for a small internal model if the team can tolerate manual tracking. Use warehouse-native table versioning or lakehouse commits when the data platform already provides strong snapshot semantics.

## Failure modes & gotchas

- Versioning the model artifact but not the data or preprocessing code.
- Overwriting registry stages without approval history.
- Logging only aggregate metrics, not the evaluation slice breakdowns that explain risk.
- No link from prediction logs back to model version.
- Treating a registry as quality control; it records status, but tests and reviews define status.
- Keeping everything forever without storage and privacy retention rules.

## Minimal example (pseudocode you author)

```text
run = start_training_run(code_commit)
dataset_ref = data.snapshot("transactions", date="2026-06-23")
model, metrics = train(dataset_ref, params)
if metrics["auc"] >= gate and slice_checks.pass:
  registry.register(
    name="fraud-risk",
    version=next_version(),
    artifact=model.path,
    lineage={code_commit, dataset_ref, run_id: run.id},
    stage="staging"
  )
```

## Key links

- MLflow Model Registry: https://mlflow.org/docs/latest/ml/model-registry/
- DVC docs: https://dvc.org/doc
- lakeFS docs: https://docs.lakefs.io/

