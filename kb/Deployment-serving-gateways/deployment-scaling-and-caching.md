---
title: "Deployment, Scaling, KV Cache, and Semantic Caching"
category: "Deployment & serving / gateways"
url: "https://github.com/open-telemetry/semantic-conventions-genai"
license: "Apache-2.0"
as_of_date: 2026-06-22
sources:
  - {url: "https://github.com/open-telemetry/semantic-conventions-genai", license: "Apache-2.0", kind: "standard"}
  - {url: "https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs/gen-ai", license: "Apache-2.0", kind: "standard"}
  - {url: "https://docs.vllm.ai/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.vllm.ai/en/latest/features/kv_offloading_usage.html", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.sglang.io/docs/advanced_features/hicache", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.litellm.ai/docs/proxy/caching", license: "MIT", kind: "official_docs"}
---

## What it is

Deployment and scaling for LLM systems is the discipline of keeping generation fast, affordable, observable, and correct while demand changes. It spans the model server, gateway, queues, caches, autoscaling policy, and cost controls. KV cache is the serving-engine memory that stores attention state for already processed tokens. Semantic cache is an application or gateway cache that reuses answers for semantically similar requests.

The mistake is to treat serving as one server binary. In practice, production behavior comes from the interaction between queueing, batching, cache hit rates, model choice, prompt shape, and failure policy.

## Why it exists / when to reach for it

Agentic learning products can generate long lessons, run graders, call tools, and retry on errors. A single user action can fan out into many model calls. Without scaling controls, latency spikes, costs compound, and failed requests can trigger even more work.

Reach for these patterns as soon as you have repeated prompts, multi-step workflows, provider rate limits, or real users waiting on interactive output.

## The moving parts

- Ingress and queues: separate interactive work from batch jobs, limit concurrency, and shed or defer low-priority work.
- Gateway policy: centralize routing, retries, fallback, budgets, auth, and cache decisions.
- Model server: vLLM, SGLang, TGI, Ollama, or hosted APIs; each has different batching and cache semantics.
- KV cache: per-engine token state that reduces repeated prefill work and supports active decoding.
- Prefix/prompt caching: reuses exact shared prefixes, such as stable system prompts or repeated document context.
- Semantic cache: embeds prompts and retrieves prior responses when similarity and freshness policy allow.
- Observability: traces, spans, token usage, cache hits, time to first token, queue time, provider/model labels, and error classes.
- Cost controls: per-key budgets, model tiers, max tokens, loop limits, and retry caps.

## How it works

Start by classifying work. Interactive chat and lesson previews need low time-to-first-token; batch enrichment can wait in a queue. Route simple tasks to cheaper or local models, reserve stronger models for high-value steps, and cap the number of retries inside agent loops.

At the serving layer, KV cache and prefix caching reduce repeated prompt processing. vLLM and SGLang can reuse shared prefixes or move KV blocks across tiers, but this helps only when prompts share stable token prefixes. At the gateway layer, exact response caches save repeated deterministic calls, while semantic caches can serve similar questions if the answer is safe to reuse, fresh, and not user-specific.

Use OpenTelemetry-style GenAI attributes or equivalent trace fields so every request records operation name, requested model, response model, token usage, cache read/creation counts, streaming time to first chunk, and errors. This makes cost and latency optimization a measurement problem instead of folklore.

## When to use vs alternatives

For a small prototype, a hosted provider plus a simple application cache is often enough. Add a gateway when multiple models, tenants, or budgets appear. Add self-hosted serving when data locality, volume economics, or model customization justify GPU operations. Add semantic cache only after you can define correctness boundaries; a stale or cross-tenant cached answer is worse than a slow answer.

## Failure modes & gotchas

- Cache keys must include tenant, model, system prompt version, tool context, safety policy, and any user-specific data boundary.
- Semantic cache thresholds drift as embedding models or prompt formats change; evaluate with false-positive examples.
- KV cache is not durable application memory. It accelerates token processing inside serving engines and can disappear on restart or eviction.
- Retries and fallbacks can multiply spend and change answer quality. Count them in budgets.
- GPU autoscaling is slow because workers must pull images, load weights, warm kernels, and rebuild cache.
- Queueing improves stability but can hide overload unless queue age and rejection counts are visible.
- Traces can contain sensitive content if you record prompts or messages. Prefer metadata by default and opt in to content capture with redaction.

## Minimal code shape (pseudocode/short snippet you write)

```python
job = queue.classify(request)
policy = gateway.policy_for(request.tenant, job.kind)

hit = semantic_cache.lookup(
    embedding=embed(request.normalized_prompt),
    tenant=request.tenant,
    model_family=policy.model_family,
    threshold=0.90,
)
if hit and hit.is_fresh() and hit.safe_for(request.user_scope):
    trace.set("cache.hit", True)
    return hit.response

response = gateway.chat(
    model=policy.model,
    messages=request.messages,
    max_tokens=policy.max_tokens,
    retry_budget=policy.retry_budget,
)
semantic_cache.store(request, response, ttl=policy.cache_ttl)
```

## Key links

- OpenTelemetry GenAI semantic conventions: https://github.com/open-telemetry/semantic-conventions-genai
- GenAI docs folder: https://github.com/open-telemetry/semantic-conventions-genai/tree/main/docs/gen-ai
- vLLM automatic prefix caching: https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html
- vLLM KV offloading: https://docs.vllm.ai/en/latest/features/kv_offloading_usage.html
- SGLang HiCache: https://docs.sglang.io/docs/advanced_features/hicache
- LiteLLM caching: https://docs.litellm.ai/docs/proxy/caching
