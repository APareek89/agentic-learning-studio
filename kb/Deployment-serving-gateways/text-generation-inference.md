---
title: "Text Generation Inference (TGI)"
category: "Deployment & serving / gateways"
url: "https://huggingface.co/docs/text-generation-inference/index"
license: "Apache-2.0"
verdict: "Best for maintaining existing Hugging Face TGI deployments; for new high-throughput serving, first compare vLLM and SGLang."
as_of_date: 2026-06-22
sources:
  - {url: "https://huggingface.co/docs/text-generation-inference/index", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/text-generation-inference", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://huggingface.co/docs/text-generation-inference/en/messages_api", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://huggingface.co/docs/text-generation-inference/en/reference/launcher", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

Text Generation Inference, usually called TGI, is Hugging Face's server stack for deploying text-generation models. It provides a containerized launcher, HTTP endpoints, streaming, batching, quantization options, tracing, and metrics around transformer model inference.

The important 2026 status note is that the official docs now frame TGI as being in maintenance mode. That does not make existing deployments invalid, but it changes the default recommendation for new infrastructure decisions.

## Why it exists / when to reach for it

TGI exists to make Hugging Face model serving operationally repeatable: choose a model id, run the launcher/container, and expose a generation endpoint with production knobs. It is useful when a team already runs Hugging Face Inference Endpoints, SageMaker images, or older TGI services and wants a known path for streaming text generation.

For a new agentic platform, reach for TGI when compatibility with an existing HF deployment matters more than chasing the newest serving engine.

## The moving parts

- Launcher: starts the server with model id, shards, quantization, token limits, payload limits, and telemetry settings.
- Router/server split: validates requests, schedules batches, and streams token output to clients.
- Messages API: supports an OpenAI Chat Completions compatible interaction style for chat clients.
- Streaming: returns incremental output for interactive UX.
- Batching and memory controls: exposes limits such as max concurrent requests, input length, total tokens, and batch token budgets.
- Hardware and model options: supports sharding across GPUs, quantization modes, safetensors loading, and optimized attention paths for supported models.
- Observability: integrates with OpenTelemetry and Prometheus-oriented monitoring.

## How it works

Run the launcher or container with a model id and hardware configuration. The router accepts generate or chat-style requests, validates limits, batches compatible work, forwards it to the model backend, and streams tokens or returns a final response. The OpenAI-compatible Messages API lets many existing clients call TGI with minimal code changes.

Sizing is mostly about model memory, KV cache room, max input length, max total tokens, and the number of concurrent requests you are willing to queue. Quantization can reduce memory pressure but must be tested for quality and latency on the target model.

## When to use vs alternatives

Use TGI when you already rely on it or on Hugging Face deployment flows. Use vLLM when you are optimizing a new high-throughput self-hosted endpoint. Use SGLang when structured outputs, grammar constraints, and serving runtime control are central. Use Ollama for local experiments. Use OpenRouter or a hosted provider when operating the serving stack is not the lesson you want to learn.

## Failure modes & gotchas

- Maintenance mode means you should check release activity and roadmap fit before betting a new platform on TGI.
- Launcher limits are safety rails. If max input, total token, batch, and payload settings are wrong, the service either rejects useful work or overloads memory.
- Quantization is not just a memory switch; it changes latency, supported kernels, and sometimes answer quality.
- OpenAI-compatible chat support depends on model templates and the TGI version in use.
- GPU autoscaling remains slower and more stateful than scaling normal web workers.
- Observability is available, but you still need dashboards around queue time, time to first token, token throughput, error classes, and cost per request.

## Minimal code shape (pseudocode/short snippet you write)

```bash
docker run --gpus all --shm-size 1g -p 8080:80 \
  -v "$PWD/data:/data" \
  ghcr.io/huggingface/text-generation-inference:latest \
  --model-id mistralai/Mistral-7B-Instruct-v0.2
```

```python
from openai import OpenAI

client = OpenAI(base_url="http://tgi.internal:8080/v1", api_key="local")
stream = client.chat.completions.create(
    model="tgi",
    messages=[{"role": "user", "content": "Give me three deployment risks."}],
    stream=True,
)
```

## Key links

- TGI docs: https://huggingface.co/docs/text-generation-inference/index
- TGI repository: https://github.com/huggingface/text-generation-inference
- Messages API: https://huggingface.co/docs/text-generation-inference/en/messages_api
- Launcher reference: https://huggingface.co/docs/text-generation-inference/en/reference/launcher
- Quantization: https://huggingface.co/docs/text-generation-inference/en/conceptual/quantization
