---
title: "LLM Gateways and Routing: LiteLLM and OpenRouter"
category: "Deployment & serving / gateways"
url: "https://docs.litellm.ai/docs/"
license: "MIT"
verdict: "Use LiteLLM when you need a self-hosted gateway and policy plane; use OpenRouter when you want a hosted multi-provider router with minimal operations."
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.litellm.ai/docs/", license: "MIT", kind: "official_docs"}
  - {url: "https://docs.litellm.ai/docs/routing", license: "MIT", kind: "official_docs"}
  - {url: "https://docs.litellm.ai/docs/proxy/caching", license: "MIT", kind: "official_docs"}
  - {url: "https://docs.litellm.ai/docs/proxy/cost_tracking", license: "MIT", kind: "official_docs"}
  - {url: "https://github.com/BerriAI/litellm", license: "MIT", kind: "oss_repo"}
  - {url: "https://openrouter.ai/docs", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://openrouter.ai/docs/guides/routing/provider-selection", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://openrouter.ai/docs/guides/routing/model-fallbacks", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

An LLM gateway sits between the application and model providers. It normalizes API shapes, centralizes keys, applies routing policy, tracks spend, adds retries and fallbacks, and gives platform teams one place to control model access. LiteLLM is a self-hosted gateway/library with an OpenAI-compatible proxy. OpenRouter is a hosted multi-provider API and router.

In agentic systems, this layer matters because different steps often need different models: a small model for classification, a strong model for lesson writing, an embedding model for routing, and a fallback path when a provider fails.

## Why it exists / when to reach for it

Without a gateway, every call site learns provider-specific auth, request formats, error classes, model names, and pricing. That spreads policy across the codebase. A gateway lets the app ask for a logical capability such as `lesson-writer` or `rubric-grader` while the platform chooses the actual provider, region, budget, cache, and fallback behavior.

Reach for a gateway when more than one provider, tenant, team, or cost center is involved. For a single model in a small prototype, a direct SDK is simpler.

## The moving parts

- Provider adapters: translate one application-facing API into OpenAI, Anthropic, Bedrock, Vertex, local vLLM, Ollama, OpenRouter, and other backends.
- Router: chooses deployments by model name, health, cost, latency, throughput, semantic intent, or explicit order.
- Fallback policy: retries another model or provider when a request fails, is rate limited, or violates a provider-specific constraint.
- Virtual keys and auth: separate application keys from provider keys and allow per-user, per-team, or per-project access.
- Budgets and cost tracking: attribute usage and stop runaway agent loops.
- Cache layer: exact response cache, semantic cache, auth cache, and provider prompt-cache awareness.
- Observability: logs, callbacks, traces, error mapping, and provider response metadata.

## How it works

The application calls the gateway with a standard chat/completions request. The gateway maps the logical model to one or more deployments, checks key permissions and budgets, chooses a route, forwards the request, normalizes errors and responses, and records usage. If policy allows, it retries or falls back to a different route.

LiteLLM is useful when you want to own that control plane, including virtual keys, budgets, self-hosted proxy config, and local provider support. OpenRouter is useful when you want one hosted endpoint that can route across many providers, with request-level controls for provider order, fallback behavior, price, latency, throughput, data policies, and model fallback lists.

## When to use vs alternatives

Use LiteLLM when enterprise controls, self-hosting, private provider keys, or local model endpoints matter. Use OpenRouter when the team values speed of integration and hosted provider routing more than owning the gateway. Use direct provider SDKs when there is only one provider and no shared policy. Use Kubernetes/service mesh patterns around vLLM or SGLang when the problem is replica traffic, not provider abstraction.

## Failure modes & gotchas

- "OpenAI-compatible" does not mean identical safety behavior, tool-call behavior, context limits, or token accounting across providers.
- Fallbacks can silently change model quality, latency, tone, region, or data-retention posture.
- Semantic routing and semantic caching require embeddings, thresholds, and test sets; bad thresholds misroute important prompts.
- Central logs and caches can contain sensitive prompts. Redaction and retention policy need to be designed before launch.
- Budget controls must include retries and agent loops, not only first attempts.
- Provider routing can make incident debugging harder unless every response records the selected model, provider, region, cache status, and fallback chain.

## Minimal code shape (pseudocode/short snippet you write)

```yaml
model_list:
  - model_name: lesson-writer
    litellm_params: {model: openai/gpt-4.1-mini}
  - model_name: lesson-writer
    litellm_params: {model: anthropic/claude-sonnet-4-5}

router_settings:
  fallbacks: [{"lesson-writer": ["lesson-writer"]}]
  routing_strategy: usage-based-routing
```

```python
response = gateway.chat(
    model="lesson-writer",
    messages=messages,
    metadata={"tenant": "studio", "lesson_id": lesson_id},
    cache={"ttl": 300},
)
```

## Key links

- LiteLLM docs: https://docs.litellm.ai/docs/
- LiteLLM repository: https://github.com/BerriAI/litellm
- LiteLLM routing: https://docs.litellm.ai/docs/routing
- LiteLLM proxy caching: https://docs.litellm.ai/docs/proxy/caching
- OpenRouter docs: https://openrouter.ai/docs
- OpenRouter provider routing: https://openrouter.ai/docs/guides/routing/provider-selection
- OpenRouter model fallbacks: https://openrouter.ai/docs/guides/routing/model-fallbacks
