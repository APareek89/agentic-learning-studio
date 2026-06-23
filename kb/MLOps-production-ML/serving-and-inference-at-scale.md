---
title: "Serving and Inference at Scale"
category: "MLOps & production ML"
url: "https://kserve.github.io/website/"
license: "Apache-2.0"
verdict: "Serving is a scheduling and SLO problem as much as a model-runtime problem."
as_of_date: 2026-06-23
sources:
  - {url: "https://kserve.github.io/website/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.ray.io/en/latest/serve/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.bentoml.com/", license: "Apache-2.0", kind: "official_docs"}
---

## What it is

Serving is the production layer that accepts prediction requests and returns outputs within a reliability, latency, throughput, and cost budget. It may expose REST or gRPC, run batch jobs, stream tokens, or serve many model versions behind one endpoint.

At scale, the hard part is keeping the hardware busy without violating user-facing latency. Dynamic batching, autoscaling, model warmup, queue limits, and backpressure matter as much as the framework used to load the model.

## Why it exists / when it matters

Training produces a model; serving turns it into a product capability. The serving layer matters when request volume varies, users care about latency, GPUs are expensive, multiple models share infrastructure, or a bad deployment can affect production traffic.

## The moving parts

- API contract: REST/gRPC endpoint, schema, auth, idempotency, and error model.
- Runtime: framework server, custom app, Triton, KServe, Ray Serve, BentoML, vLLM, or TGI.
- Scheduler: batching, queuing, worker pools, concurrency limits, and request cancellation.
- Hardware: CPU, GPU, memory, network, model load time, and accelerator topology.
- Release controls: canary, blue/green, shadow, rollback, and model version pinning.
- Observability: latency percentiles, queue time, model time, errors, saturation, and quality signals.

## How it works

Small services can run one model per container and scale replicas by request count or CPU. Larger systems separate ingress from model workers, add dynamic batching, route by model version, and collect per-stage timing. GPU-backed services often trade latency for throughput by batching requests together; interactive products usually cap queue time so one slow batch does not harm tail latency.

KServe standardizes inference services on Kubernetes. Triton provides a high-performance inference server with model repository patterns and batching features. Ray Serve provides Python-native deployment graphs and autoscaling. BentoML provides packaging plus service APIs. LLM-specific runtimes such as vLLM and TGI add token streaming, KV-cache management, and OpenAI-compatible APIs.

## When to use vs alternatives

Use simple REST when traffic is predictable and the model is light. Use a serving framework when you need model versioning, batching, autoscaling, or multi-model deployments. Use Kubernetes-native serving when the organization already operates Kubernetes well. Use managed endpoints when operational simplicity matters more than deep runtime control.

This doc complements, rather than replaces, the KB docs for vLLM, TGI, SGLang, LiteLLM, and deployment scaling.

## Failure modes & gotchas

- Average latency looks fine while p95 or p99 fails the user experience.
- Dynamic batching improves throughput but hides queue time.
- Autoscaling reacts after a traffic spike, while model cold starts are slow.
- GPU memory fragmentation or model load time makes rollouts unstable.
- A canary receives traffic that is too small to reveal quality regressions.
- No backpressure, so overload turns into cascading timeouts.

## Minimal example (pseudocode you author)

```text
request -> auth -> schema validation -> router(model="risk-v3")
router -> queue(max_wait_ms=25, max_batch=32)
worker -> preprocess -> model(batch) -> postprocess
emit metrics: queue_ms, model_ms, total_ms, status, model_version
if p95_total_ms > slo for 10m:
  scale replicas or shed low-priority traffic
```

## Key links

- KServe: https://kserve.github.io/website/
- Triton Inference Server: https://docs.nvidia.com/deeplearning/triton-inference-server/user-guide/docs/
- Ray Serve: https://docs.ray.io/en/latest/serve/
- BentoML: https://docs.bentoml.com/
- Existing KB: vLLM: ../Deployment-serving-gateways/vllm.md
- Existing KB: LiteLLM/OpenRouter: ../Deployment-serving-gateways/llm-gateways-routing-litellm-openrouter.md

