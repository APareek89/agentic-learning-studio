---
title: "Feature Stores and When Not to Use One"
category: "MLOps & production ML"
url: "https://docs.feast.dev/"
license: "Apache-2.0"
verdict: "A feature store is valuable when feature reuse and online/offline consistency are real pains, not because every ML stack needs one."
as_of_date: 2026-06-23
sources:
  - {url: "https://docs.feast.dev/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/feast-dev/feast", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://docs.hopsworks.ai/", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

A feature store manages reusable ML features and serves them consistently to training and inference. It usually has an offline store for historical training data, an online store for low-latency inference features, a registry of feature definitions, and tooling to materialize fresh values.

The main promise is not "a database for features." It is reducing training-serving skew and duplicated feature logic across teams.

## Why it exists / when it matters

Feature stores matter when multiple models reuse the same entities and signals, online predictions need low-latency feature lookup, and offline training must reproduce what would have been available at a point in time.

They are less useful when models are batch-only, features are computed inside a single training pipeline, or the team has not yet stabilized feature definitions. A premature feature store can become a complex cache with unclear ownership.

## The moving parts

- Entity: the business key, such as user, merchant, device, account, or document.
- Feature view: a named group of features with transformation logic and freshness rules.
- Offline store: historical data used for training and backfills.
- Online store: low-latency key-value access for serving.
- Materialization: jobs that move computed features into the online store.
- Point-in-time correctness: training joins that avoid leaking future information.
- Registry: metadata, owners, schemas, and discoverability.

## How it works

Define feature views in code, register them, backfill historical values, and materialize recent values to an online store. During training, the system creates point-in-time joins so the model sees only features available at each event time. During serving, the application requests current feature values for an entity and passes them to the model.

Feast is a common open-source option. Hopsworks offers a broader feature platform. Some teams also build a lighter pattern with warehouse tables, dbt models, Redis, and strict schema tests.

## When to use vs alternatives

Use a feature store when you have repeated feature reuse, online inference, point-in-time training needs, and multiple model teams. Use plain warehouse tables and batch snapshots when models are offline or low-risk. Use a simple application cache when only one online feature set exists and the transformation logic is stable.

## Failure modes & gotchas

- Feature freshness is assumed but not monitored.
- Online and offline transformations drift because one path is manually patched.
- A feature leaks future information into training data.
- The feature registry fills with abandoned features and unclear owners.
- Low-latency lookups become a hidden production dependency with no SLO.
- The team adopts a feature store before solving data quality and schema ownership.

## Minimal example (pseudocode you author)

```text
define entity user_id
define feature_view user_activity_7d:
  source = warehouse.table("user_events")
  features = count_clicks_7d, sessions_7d, spend_7d
  freshness = "1 hour"

train_rows = point_in_time_join(labels, features=["user_activity_7d"])
online.materialize("user_activity_7d", since=last_hour)
prediction_features = online.get(user_id, ["user_activity_7d"])
```

## Key links

- Feast docs: https://docs.feast.dev/
- Feast repository: https://github.com/feast-dev/feast
- Hopsworks docs: https://docs.hopsworks.ai/

