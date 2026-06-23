---
title: "Production Model Monitoring"
category: "MLOps & production ML"
url: "https://docs.evidentlyai.com/"
license: "Apache-2.0"
verdict: "Monitor the data, predictions, decisions, and business outcome, not just the endpoint."
as_of_date: 2026-06-23
sources:
  - {url: "https://docs.evidentlyai.com/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/evidentlyai/evidently", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://nannyml.readthedocs.io/", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

Production model monitoring watches whether a deployed model is still useful and safe. It covers system health, input data quality, data drift, prediction drift, delayed ground-truth performance, calibration, slice-level behavior, and user or business impact.

Data drift means the input distribution changed. Concept drift means the relationship between inputs and target changed. Prediction drift means output distributions changed. Performance decay is what matters to users, but it is often observed late because labels arrive after predictions.

## Why it exists / when it matters

Software can be healthy while the model is wrong. A recommender can return responses quickly while user preferences shifted. A risk model can pass uptime checks while fraud behavior changed. Monitoring gives owners an early warning system and evidence for retraining, rollback, or investigation.

## The moving parts

- Reference data: training baseline, recent stable production window, or approved benchmark.
- Data quality checks: missingness, ranges, schema, cardinality, freshness, and invalid values.
- Drift checks: feature distribution, prediction distribution, embeddings, or text statistics.
- Performance checks: accuracy, precision/recall, calibration, ranking metrics, or forecast error when labels arrive.
- Slices: cohorts, regions, products, devices, and protected or sensitive groups where allowed.
- Alerts and playbooks: severity, owner, threshold, and action.

## How it works

Log prediction requests with model version, features or feature summaries, prediction, decision, latency, and later labels when available. Compare live windows against a reference. Alert on severe quality or drift signals, but route alerts through a playbook so teams do not retrain blindly.

Evidently is often used for drift, data quality, and monitoring reports. NannyML focuses on post-deployment performance estimation and drift monitoring where labels are delayed.

## When to use vs alternatives

Use monitoring for any model that affects users repeatedly. Use lightweight logs plus dashboard checks for low-risk internal tools. Use formal monitoring and alerting when models affect money, safety, compliance, or user trust. For LLM apps, add trace quality, retrieval quality, cost, latency, guardrail actions, and hallucination/eval signals.

## Failure modes & gotchas

- Alerting on every statistical difference instead of product-relevant movement.
- No ground-truth join, so performance is never measured after deployment.
- Aggregate metrics hide a failing cohort.
- Reference data is stale or already biased.
- Retraining is triggered by drift even when business impact is unchanged.
- Monitoring payloads leak sensitive raw features or user text.

## Minimal example (pseudocode you author)

```text
every hour:
  live = load_prediction_logs(window="1h", model="churn:v42")
  reference = load_reference_window("last_good_7d")
  checks = [
    schema_check(live),
    drift_check(live.features, reference.features),
    prediction_shift(live.predictions, reference.predictions),
    latency_slo(live.latency_ms),
  ]
  alert_if(checks.severity >= "high", owner="ml-platform")
```

## Key links

- Evidently docs: https://docs.evidentlyai.com/
- Evidently repository: https://github.com/evidentlyai/evidently
- NannyML docs: https://nannyml.readthedocs.io/
- Existing KB: LLM observability: ../Evaluation-observability/llm-observability.md

