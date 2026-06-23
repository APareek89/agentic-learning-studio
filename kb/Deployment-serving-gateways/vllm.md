---
title: "vLLM"
category: "Deployment & serving / gateways"
url: "https://docs.vllm.ai/"
license: "Apache-2.0"
verdict: "Best for high-throughput self-hosted serving of open-weight models when GPU memory, batching, and KV-cache efficiency are the main constraints."
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.vllm.ai/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/vllm-project/vllm", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://blog.vllm.ai/2023/06/20/vllm.html", license: "Official engineering blog; original synthesis only", kind: "official_engineering_blog"}
  - {url: "https://docs.vllm.ai/en/latest/serving/online_serving/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

vLLM is an inference engine and serving stack for running open-weight language models on your own hardware. Its center of gravity is efficient online serving: it manages GPU memory with paged attention (PagedAttention) KV cache blocks, batches requests continuously, exposes OpenAI-compatible HTTP endpoints, and supports distributed inference strategies for models that do not fit neatly on one accelerator.

For agentic systems, vLLM is often the self-hosted "model endpoint" behind a gateway. The app keeps talking in an OpenAI-like shape while vLLM handles the lower-level work of scheduling prefill, decode, KV cache storage, quantization choices, and multi-GPU execution.

## Why it exists / when to reach for it

Reach for vLLM when hosted APIs are too expensive, too restrictive, or not aligned with your data-locality requirements, and when you have the engineering budget to operate GPU inference. It is especially strong when request volume is high enough that batching, prefix reuse, and model parallelism matter.

It is less compelling for a single laptop demo or a small internal prototype. In those cases, Ollama or a hosted provider gets you moving with less operational surface area.

## The moving parts

- Model runtime: loads Hugging Face style model weights and tokenizer/chat templates, with support for many model families and quantization formats.
- Scheduler: interleaves requests so the server can keep the GPU busy instead of serving one prompt at a time.
- Paged attention / PagedAttention KV cache manager: tracks prompt and decode key/value tensors in block-oriented cache pages, including prefix caching and optional offload patterns for larger cache tiers.
- API layer: offers OpenAI-compatible chat/completions, responses, embeddings, transcription, model listing, health, and metrics endpoints, plus other protocol adapters.
- Parallelism controls: tensor, pipeline, data, expert, and context parallel options depending on model size and cluster shape.
- Observability hooks: health checks, load endpoints, and Prometheus-style metrics for production monitoring.

## How it works

Start a server with a model id or local model path. The API layer validates requests and applies chat templates, then the engine schedules prefill and decode work across the available devices. Shared prompt prefixes can reuse previously computed KV blocks, which helps workloads like repeated questions over the same long document or long-running chat sessions. Distributed settings split the model across GPUs or nodes when one device cannot fit the weights and KV cache.

The practical loop is: choose the model, size the context and KV cache budget, run a load test with real prompt shapes, then tune parallelism and cache behavior. For long context serving, the GPU memory left after weights determines how many active tokens can be held in KV cache; paged attention reduces waste but does not remove that concurrency limit.

## When to use vs alternatives

Use vLLM over Ollama when you need a production endpoint, not just a developer-local runtime. Use it over TGI for most new high-throughput deployments unless you are deliberately staying inside a Hugging Face TGI stack. Use SGLang when the application needs first-class structured generation/runtime programming features in addition to fast serving.

Keep a gateway such as LiteLLM in front when you want budgets, tenant keys, routing, fallback to hosted models, or one logical model name across several vLLM replicas.

## Failure modes & gotchas

- GPU memory is the product constraint. Weight size, context length, KV cache, batch size, and quantization all compete for the same resource.
- Chat templates are not optional for chat-tuned models. Missing or wrong templates create confusing prompt behavior or request failures.
- Prefix caching helps only when prompts share exact prefixes and the bottleneck is prefill; it does not make long answer generation free.
- Multi-node serving adds network and NCCL/Ray operational risk. Weak interconnects can erase the benefit of extra GPUs.
- OpenAI compatibility is broad, but provider-specific edge cases, tool behavior, and unsupported parameters still need integration tests.
- Dynamic development endpoints and cache-reset APIs should not be exposed in production.

## Minimal code shape (pseudocode/short snippet you write)

```bash
vllm serve meta-llama/Llama-3.1-8B-Instruct \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 2 \
  --enable-prefix-caching
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://vllm.internal:8000/v1", api_key="local")
reply = client.chat.completions.create(
    model="meta-llama/Llama-3.1-8B-Instruct",
    messages=[{"role": "user", "content": "Draft a lesson outline."}],
)
```

## Key links

- vLLM docs: https://docs.vllm.ai/
- vLLM repository: https://github.com/vllm-project/vllm
- vLLM PagedAttention engineering blog: https://blog.vllm.ai/2023/06/20/vllm.html
- OpenAI-compatible serving: https://docs.vllm.ai/en/latest/serving/online_serving/
- Automatic prefix caching: https://docs.vllm.ai/en/latest/features/automatic_prefix_caching.html
- Parallelism and scaling: https://docs.vllm.ai/en/latest/serving/parallelism_scaling.html
