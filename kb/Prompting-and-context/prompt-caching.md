---
title: Prompt Caching
category: Prompting & context
url: https://developers.openai.com/api/docs/guides/prompt-caching
license: Official docs; original synthesis only
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.openai.com/api/docs/guides/prompt-caching", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching", license: "Anthropic official docs terms", kind: official_docs}
  - {url: "https://ai.google.dev/gemini-api/docs/caching", license: "CC-BY-4.0", kind: official_docs}
---

## What it is

Prompt caching reuses provider-side work for a repeated prompt prefix. Instead of paying full latency and cost every time a request includes the same long instructions, tool schemas, documents, or examples, the provider can reuse cached internal state for the matching prefix.

It is a prefix optimization, not a memory feature. The model still generates a fresh answer for the current request; caching just reduces repeated prefill work when the beginning of the request is stable enough to match.

## Why it exists / when to reach for it

Reach for prompt caching when many requests share a large static prefix: product policy, lesson rubric, tool definitions, few-shot examples, long reference docs, or a user's uploaded file set. It is especially useful for multi-turn "chat with this corpus" flows and agent runs with the same tools across turns.

For Agentic Learning Studio, stable tutor policy and source-grounding instructions are good cache candidates. User-specific answers, fresh retrieval results, and turn-local requests should usually sit after the cached prefix.

## The moving parts

- Cacheable prefix: the identical beginning of the rendered request.
- Breakpoint or key: provider-specific hints such as Anthropic `cache_control`, OpenAI `prompt_cache_key`, or Gemini cached content IDs.
- Retention: short in-memory windows, extended retention, or explicit TTL depending on provider and model.
- Eligibility thresholds: minimum token counts and model support vary.
- Telemetry: cached token counts, cache hit rates, latency, and cost.

## How it works

OpenAI prompt caching is automatic for eligible recent models and starts with long prompts of at least 1024 tokens. Cache hits require exact prefix matches; stable content should be first, and dynamic user content should be later. OpenAI exposes cached token counts in usage metadata and supports `prompt_cache_key` and retention controls on supported models.

Anthropic supports automatic caching and explicit cache breakpoints with `cache_control`. Its docs describe the cached prefix as spanning tools, system content, and messages up to the selected breakpoint. The default short-lived cache duration is five minutes, with an optional one-hour duration at extra cost.

Gemini has implicit caching on newer models and explicit caching through cached content resources. Explicit caches can be referenced in later generation calls, have a TTL, and default to one hour if no TTL is set.

## When to use vs alternatives

Use provider prompt caching when the repeated material must remain in the model context. Use RAG when only a few relevant chunks are needed from a large corpus. Use an application response cache when the whole answer can be reused. Use a semantic cache when similar user questions can share a prior response after safety checks. Use a database when you need exact durable state, not repeated model context.

## Failure modes & gotchas

- Reordering, reformatting, or injecting timestamps into the prefix can destroy cache hits.
- Tool schemas and structured-output schemas count as prompt material; changing them invalidates reuse.
- Cache thresholds and retention rules are provider- and model-specific.
- Cached tokens can still count toward rate limits or context windows depending on provider policy.
- Do not place private or regulated content in a long-lived cache unless retention and data-policy rules allow it.
- Cache telemetry is essential; a "cache-friendly" prompt may still miss in production traffic.

## Minimal code shape

```text
stable_prefix = render([
  product_policy,
  tool_definitions,
  lesson_output_contract,
  reusable_examples
])

dynamic_tail = render([learner_request, retrieved_sources, current_turn_state])
response = model.generate(
  stable_prefix + dynamic_tail,
  cache_hint={key: "lesson-tutor-v4", retention: "short_or_configured"}
)
log(response.usage.cached_tokens)
```

## Key links

- OpenAI prompt caching: https://developers.openai.com/api/docs/guides/prompt-caching
- Anthropic prompt caching: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching
- Gemini context caching: https://ai.google.dev/gemini-api/docs/caching
