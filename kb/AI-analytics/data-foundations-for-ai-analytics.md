---
title: "Data Foundations for AI Analytics"
category: "AI analytics"
url: "https://docs.getdbt.com/docs/build/semantic-models"
license: "Official docs; original synthesis only"
verdict: "AI analytics quality is mostly data modeling quality with a language interface on top."
as_of_date: 2026-06-23
sources:
  - {url: "https://docs.getdbt.com/docs/build/semantic-models", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.greatexpectations.io/docs/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://datahubproject.io/docs/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://duckdb.org/docs/", license: "MIT", kind: "official_docs"}
---

## What it is

Data foundations for AI analytics are the structures that make natural-language analysis safe and useful: clean warehouse models, metric definitions, semantic entities, lineage, tests, permissions, documentation, and representative examples of approved analysis.

The language model is an interface. The foundation decides whether the answer is grounded.

## Why it exists / when it matters

AI analytics systems fail when table names are cryptic, metrics disagree across dashboards, joins duplicate rows, timestamps are inconsistent, and sensitive columns are exposed to prompt context. Strong foundations let the AI assistant retrieve the right context, generate safer queries, and explain results in business language.

## The moving parts

- Modeled tables: facts, dimensions, slowly changing dimensions, snapshots, and aggregates.
- Semantic models: entities, measures, dimensions, time grains, filters, and metric ownership.
- Data tests: uniqueness, not-null, accepted values, referential integrity, freshness, and anomaly checks.
- Catalog and lineage: what data exists, where it came from, who owns it, and how it is used.
- Permissions: row/column access, PII masking, tenant boundaries, and audit logging.
- Query examples: approved SQL, business questions, and interpretation notes.

## How it works

Start by defining the business entities and metrics people actually ask about. Add tests so the data model fails loudly when assumptions break. Document joins and grain. Expose only governed context to the AI system. Teach the assistant from approved examples, not from every historical query. Log generated queries and user feedback so analysts can improve the semantic layer.

Tools such as dbt semantic models, Great Expectations, DataHub, and local analytical engines like DuckDB can all play a role, depending on scale and stack.

## When to use vs alternatives

Invest in foundations before broad self-serve AI analytics. For a single analyst workflow, a notebook and curated schema prompt may be enough. For company-wide natural-language BI, the semantic layer and permissions model are not optional.

## Failure modes & gotchas

- Metrics with the same name mean different things in different teams.
- The AI assistant sees raw warehouse tables with no grain or join guidance.
- Data tests exist but are not tied to assistant availability.
- PII columns leak into retrieval context or generated SQL.
- Lineage is missing, so users cannot trust where a number came from.
- The assistant optimizes for answering quickly rather than saying "the metric is undefined."

## Minimal example (pseudocode you author)

```text
define metric paid_conversion_rate:
  numerator = count(users where plan_started)
  denominator = count(users where signup_completed)
  grain = day
  owner = "growth-analytics"
  allowed_dimensions = ["plan", "country", "channel"]

assistant_context = retrieve(metric_defs, table_docs, approved_examples)
deny_query_if(metric_not_defined or pii_requested)
```

## Key links

- dbt semantic models: https://docs.getdbt.com/docs/build/semantic-models
- Great Expectations docs: https://docs.greatexpectations.io/docs/
- DataHub docs: https://datahubproject.io/docs/
- DuckDB docs: https://duckdb.org/docs/

