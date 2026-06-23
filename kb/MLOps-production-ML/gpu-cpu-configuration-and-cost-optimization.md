---
title: "GPU and CPU Configuration and Cost Optimization"
category: "MLOps & production ML"
url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/"
license: "CC-BY-4.0"
verdict: "Cost optimization is workload shaping first, hardware shopping second."
as_of_date: 2026-06-23
sources:
  - {url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/", license: "CC-BY-4.0", kind: "official_docs"}
  - {url: "https://docs.ray.io/en/latest/cluster/kubernetes/index.html", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.nvidia.com/datacenter/tesla/mig-user-guide/", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

GPU and CPU configuration is the practice of matching model workloads to the right compute shape, scaling policy, batching strategy, and reliability target. Cost optimization is not simply "use cheaper instances"; it is reducing idle time, wasted memory, over-provisioning, cold-start pain, and unnecessary precision or context length.

## Why it exists / when it matters

Inference can be the dominant cost of an AI product. Training jobs can also waste large budgets when experiments are not queued, preemptible capacity is mishandled, or data loading starves accelerators. The right configuration turns the same model into a viable product instead of an expensive demo.

## The moving parts

- Workload shape: batch, online, streaming, bursty, steady, latency-sensitive, or throughput-oriented.
- Hardware: CPU, GPU, memory, disk, network, accelerator interconnect, and MIG partitioning.
- Scheduling: replica count, node pools, queueing, batch size, placement, and preemption tolerance.
- Autoscaling: HPA, cluster autoscaler, KEDA/custom metrics, Ray autoscaling, or managed scaling.
- Runtime tuning: quantization, context length, batch window, cache reuse, and model parallelism.
- Unit economics: cost per request, cost per token, cost per prediction, and utilization.

## How it works

Start with real traffic traces or realistic load tests. Split latency into queue time, preprocessing, model execution, postprocessing, and network. If GPUs are underutilized, tune batching or consolidation. If tail latency fails, reduce queue time, add replicas, or route heavy jobs away from interactive endpoints. If memory is the limiter, consider quantization, smaller context, model choice, KV-cache tuning, or separate model sizes by use case.

CPU is often enough for small tabular models, classical ML, light embedding jobs, and batch analytics. GPUs matter for large neural models, high-throughput embedding, image/audio models, and LLM inference.

## When to use vs alternatives

Use autoscaling when traffic changes faster than humans can resize safely. Use static capacity for predictable workloads with strict warmup needs. Use spot/preemptible capacity for retryable batch training and offline embedding, not for fragile interactive endpoints unless you have fallback capacity.

## Failure modes & gotchas

- Optimizing GPU utilization while violating latency SLOs.
- Scaling on CPU while the real bottleneck is GPU memory or queue depth.
- Ignoring cold starts for large model weights.
- Using one large model for all requests instead of routing simple cases to cheaper paths.
- Treating spot capacity as free without checkpointing and retry logic.
- No per-tenant budget or rate limit, so one customer can dominate compute.

## Minimal example (pseudocode you author)

```text
for each endpoint:
  measure p50/p95 latency, queue_ms, gpu_util, memory_used, cost_per_1k_requests
  if queue_ms high and gpu_util high:
    add replicas or route overflow
  if queue_ms high and gpu_util low:
    tune batching or worker concurrency
  if memory high:
    reduce context, quantize, or choose smaller model
  enforce tenant_budget and request_priority
```

## Key links

- Kubernetes HPA: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
- Ray on Kubernetes: https://docs.ray.io/en/latest/cluster/kubernetes/index.html
- NVIDIA MIG user guide: https://docs.nvidia.com/datacenter/tesla/mig-user-guide/
- Existing KB: deployment scaling and caching: ../Deployment-serving-gateways/deployment-scaling-and-caching.md

