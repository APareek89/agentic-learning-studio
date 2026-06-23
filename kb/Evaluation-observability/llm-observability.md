---
title: "Tracing and Observability: Langfuse, LangSmith, Phoenix, Helicone"
category: "Evaluation & observability"
url: https://langfuse.com/docs/tracing
license: MIT Expat except EE folders
verdict: Choose Langfuse for open-source tracing plus eval/prompt workflows, LangSmith for LangChain-native debugging, Phoenix for OpenTelemetry/OpenInference evaluation workflows, and Helicone for gateway-first request logging and cost visibility.
as_of_date: 2026-06-22
sources:
  - {url: "https://langfuse.com/docs/tracing", license: "MIT Expat except EE folders", kind: "official_docs"}
  - {url: "https://github.com/langfuse/langfuse", license: "MIT Expat except EE folders", kind: "oss_repo"}
  - {url: "https://docs.smith.langchain.com/observability", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://arize.com/docs/phoenix", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/Arize-ai/phoenix", license: "Elastic-2.0; facts only", kind: "oss_repo"}
  - {url: "https://docs.helicone.ai/getting-started/platform-overview", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/Helicone/helicone", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://github.com/open-telemetry/semantic-conventions-genai", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

LLM observability records what happened inside an AI workflow: prompts, model calls, retrieved context, tool calls, errors, latency, token counts, costs, scores, feedback, and final outputs. Tracing adds causal structure: a user request becomes a trace, each model or tool operation becomes a span, and metadata connects the run to a prompt version, dataset case, user session, or deployment.

## Why it exists / when to reach for it

Agentic failures rarely live in one line of code. A bad answer may come from stale retrieval, an over-broad tool, a model fallback, a prompt change, a context compaction step, or a downstream formatter. Observability lets teams replay the path from user request to response, identify the failing component, and convert real failures into eval cases.

## The moving parts

- Trace IDs and span IDs for request correlation.
- Span types for model calls, retrieval, tool execution, memory, workflow steps, and agent invocation.
- Prompt and model metadata: version, parameters, provider, routing path, and output type.
- Usage metrics: input/output tokens, cache reads, time to first token or chunk, and total duration.
- Scores and feedback: online evaluators, human annotations, user ratings, and regression labels.
- Privacy controls: redaction, opt-in content capture, retention limits, and sampling rules.
- Export path: platform SDKs, OpenTelemetry/OTLP, OpenInference, webhook export, or warehouse sync.

## How it works

Instrument the application boundary first, then each meaningful internal operation. A lesson-generation trace might contain spans for profile loading, retrieval, outline generation, tool calls, final rendering, and post-generation scoring. Attach stable identifiers such as prompt version, KB version, model name, agent name, and release SHA. Keep large or sensitive content behind redaction rules and store enough metadata to debug without exposing private data by default.

OpenTelemetry's GenAI semantic conventions are useful when you want vendor-neutral telemetry. The dedicated GenAI conventions repository defines span and metric shapes for operations such as chat, embeddings, retrieval, memory, tool execution, agent invocation, and workflow duration. Even when using a product-specific SDK, matching common names for provider, operation, model, token usage, errors, and tool spans makes later migration and cross-tool analysis easier.

## When to use vs alternatives

Use Langfuse when you want an open-source LLM observability stack with traces, scores, datasets, prompt management, and self-hosting options. Use LangSmith when the app is built around LangChain or LangGraph and you want native trace debugging, dashboards, annotations, and online evaluations. Use Phoenix when OpenTelemetry/OpenInference compatibility, experiments, datasets, and evaluation workflows are central, especially across mixed frameworks. Use Helicone when a gateway or proxy integration is the fastest path to request logs, routing, fallbacks, costs, and provider-level reliability. Generic APM is still useful for infrastructure, but it usually lacks LLM-specific semantics.

## Failure modes & gotchas

- Capturing raw prompts and outputs can store PII, secrets, or user-owned content.
- Sampling can hide rare but severe agent failures.
- Cost and token totals are misleading if retries, cached tokens, or routing fallbacks are not recorded.
- Trace names with high-cardinality values make dashboards hard to use.
- Observability without ownership becomes a searchable pile of failures.
- Provider proxies can obscure the true upstream model unless routing metadata is attached.
- OpenTelemetry GenAI conventions are still marked development; pin versions and expect field movement.

## Minimal code shape

```ts
const trace = obs.startTrace("lesson_generation", {
  userSessionId,
  kbVersion,
  releaseSha,
});

await trace.span("retrieval", async (span) => {
  span.set({ query, topK: 8 });
  span.output = await retrieve(query);
});

await trace.span("chat", async (span) => {
  span.set({ provider: "openai", model, promptVersion, stream: true });
  span.output = await model.generate(renderedPrompt);
  span.metrics = { inputTokens, outputTokens, costUsd, timeToFirstTokenMs };
});

trace.score("groundedness", groundednessScore);
```

## Key links

- [Langfuse tracing](https://langfuse.com/docs/tracing)
- [LangSmith observability](https://docs.smith.langchain.com/observability)
- [Arize Phoenix docs](https://arize.com/docs/phoenix)
- [Helicone platform overview](https://docs.helicone.ai/getting-started/platform-overview)
- [OpenTelemetry GenAI semantic conventions](https://github.com/open-telemetry/semantic-conventions-genai)
