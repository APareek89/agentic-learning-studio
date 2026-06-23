---
title: "AI Analytics and Natural Language BI"
category: "AI analytics"
url: "https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl"
license: "Official docs; original synthesis only"
verdict: "AI analytics is useful when it narrows the path from question to verified metric, not when it bypasses the data model."
as_of_date: 2026-06-23
sources:
  - {url: "https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/vanna-ai/vanna", license: "MIT", kind: "oss_repo"}
  - {url: "https://facebook.github.io/prophet/", license: "MIT", kind: "official_docs"}
  - {url: "https://nixtlaverse.nixtla.io/", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

AI analytics uses language models and forecasting/anomaly methods to help people ask questions, generate SQL, explain metric movement, surface anomalies, forecast trends, and summarize dashboard context. Natural-language BI is the familiar interface: "Why did revenue drop last week?" or "Show retention by plan for new users."

The useful version is grounded in a semantic layer, metric definitions, permissions, and query validation. The risky version turns vague language directly into unreviewed SQL over messy warehouse tables.

## Why it exists / when it matters

Analysts are scarce, business questions are frequent, and dashboards rarely answer the exact follow-up. AI can compress the loop from question to candidate query, explanation, or chart. It matters most when the organization already has trusted metrics and wants more people to explore them safely.

## The moving parts

- Semantic layer: canonical metrics, dimensions, joins, entities, and time grains.
- NL-to-SQL: prompt, schema context, examples, query generation, validation, and repair.
- Insight generation: metric deltas, segment drivers, anomaly detection, and narrative summaries.
- Forecasting: baseline time-series methods, uncertainty, seasonality, and backtesting.
- Governance: permissions, row-level security, PII controls, and query cost limits.
- Human workflow: analyst review, saved answers, feedback, and escalation.

## How it works

The system maps a user's question to governed metrics and allowed entities. It retrieves schema and metric context, drafts SQL or a semantic-layer query, validates the query, runs it with limits, and explains the result with citations to metric definitions. For forecasting or anomalies, it uses time-series models and shows confidence, assumptions, and backtest performance.

Vanna-style systems learn from approved SQL and schema context. dbt Semantic Layer-style systems make metric definitions explicit. Prophet and Nixtla-style tools support forecasting use cases where a language interface is only the front door.

## When to use vs alternatives

Use AI analytics for exploratory questions, metric explanations, analyst acceleration, and self-serve slices over governed data. Use classic BI dashboards for recurring executive metrics. Use analyst-written SQL for high-stakes decisions, ambiguous definitions, or messy data investigations.

## Failure modes & gotchas

- The model invents joins or metrics that sound plausible.
- SQL is correct syntactically but wrong semantically.
- Permissions are applied after query generation instead of before context retrieval.
- Users trust a forecast without understanding uncertainty or backtest error.
- The semantic layer is incomplete, so the system learns from inconsistent historical SQL.
- Costly generated queries scan too much data.

## Minimal example (pseudocode you author)

```text
question = "Why did paid conversion fall last week?"
intent = map_to_metrics(question, semantic_layer)
sql = generate_query(intent, allowed_tables, examples)
validated = validate_sql(sql, rules=["no_pii", "row_limit", "metric_defs"])
result = run_query(validated)
answer = explain(result, cite=[metric_definitions, segments_tested])
```

## Key links

- dbt Semantic Layer: https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl
- Vanna repository: https://github.com/vanna-ai/vanna
- Prophet docs: https://facebook.github.io/prophet/
- Nixtla docs: https://nixtlaverse.nixtla.io/
- Existing KB: structured outputs and function calling: ../Prompting-and-context/structured-outputs-and-function-calling.md

