---
title: "Model Selection and Tradeoffs"
category: "Providers & models"
url: "https://developers.openai.com/api/docs/guides/latest-model"
license: "Official docs; original synthesis only"
verdict: "Pick the cheapest, fastest, safest model that passes your own evals with margin; re-run selection when providers update models, prices, or deprecations."
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.openai.com/api/docs/guides/latest-model", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://openai.com/api/pricing/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.anthropic.com/en/docs/about-claude/pricing", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://ai.google.dev/gemini-api/docs/pricing", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://mistral.ai/pricing", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://api-docs.deepseek.com/quick_start/pricing", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Model selection is the engineering process for deciding which model should handle each task. It balances quality, latency, cost, context length, modality, safety behavior, tool reliability, structured-output support, data governance, uptime, regional requirements, and operational complexity.

The right answer is usually a routing policy, not a single model. Strong models handle hard planning and high-risk synthesis. Smaller models handle cheap deterministic-ish work. Specialized models handle embeddings, reranking, moderation, speech, images, or video.

## Why it exists / when to reach for it

Agentic workflows multiply model calls. A lesson-generation run may plan, retrieve, draft, critique, repair JSON, judge citations, and summarize a trace. Choosing a flagship model for every step can be slow and expensive. Choosing the cheapest model for every step can quietly degrade factuality, safety, and schema reliability.

## The moving parts

- Task inventory: every model call, input size, output size, tool surface, and user-visible consequence.
- Acceptance evals: representative examples, adversarial cases, schema checks, citation checks, and human review rubrics.
- Cost model: input, cached input, output, reasoning tokens, batch discounts, tool calls, retries, and provider minimums.
- Latency budget: first-token latency, total latency, streaming UX, queueing, and fallback behavior.
- Context strategy: retrieval, summarization, compaction, prompt caching, and long-context use.
- Data policy: retention, training use, region, regulated data, and vendor contract terms.
- Resilience: rate limits, model deprecations, failover, and compatibility tests.

## How it works

Start from task risk. For high-risk or hard-to-verify work, begin with a strong model and reduce only after evals prove safety margin. For low-risk extraction or formatting, start small and measure. Keep prompts and tool schemas stable while comparing candidates. Record model IDs, settings, date, provider docs, eval version, and traffic assumptions.

OpenAI's current GPT-5.5 guidance is a useful example: tune reasoning effort instead of assuming maximum effort is always better, use the Responses API for reasoning/tool workflows, use structured outputs instead of prompt-described schemas, and benchmark cost, latency, and accuracy together. Apply the same discipline to other providers: use their current model/pricing/deprecation pages and verify behavior on your own workload.

## When to use vs alternatives

Use a single strong model early in prototyping to reduce integration variables. Move to routing after the workflow stabilizes and traffic or latency matters. Use self-hosting when volume, data control, or customization justifies serving operations. Use a gateway when you need routing, fallback, budgets, or provider abstraction, but do not let abstraction hide model-specific prompt and schema differences.

## Failure modes & gotchas

- Benchmark chasing: public leaderboards may not predict your product's quality.
- Hidden retry cost: a cheap model that fails schemas can cost more after repairs.
- Context misuse: bigger windows can hide poor retrieval and increase latency.
- Fallback mismatch: a backup model may not support the same tools, JSON schema, safety settings, or context length.
- Pricing drift: provider pricing pages are live business documents; avoid hardcoded assumptions.
- Deprecation risk: model aliases can move, retire, or change behavior; pin when reproducibility matters.

## Minimal code shape

```text
candidates = provider_catalog.filter(
  modality=task.modality,
  data_policy=task.data_policy,
  tool_support=task.needs_tools
)

results = []
for model in candidates:
  metrics = run_eval_suite(model, task.eval_set)
  spend = estimate_cost(model, traffic, retries=metrics.retry_rate)
  results.append({model, metrics, spend, latency=model.latency})

winner = choose_lowest_cost_passing(results, min_quality=task.threshold)
deploy_route(task.name, winner.model, fallback=tested_fallback(winner))
```

## Key links

- https://developers.openai.com/api/docs/guides/latest-model
- https://openai.com/api/pricing/
- https://docs.anthropic.com/en/docs/about-claude/pricing
- https://ai.google.dev/gemini-api/docs/pricing
- https://mistral.ai/pricing
- https://api-docs.deepseek.com/quick_start/pricing
