---
title: "Serving on Kubernetes and When It Is Overkill"
category: "MLOps & production ML"
url: "https://kserve.github.io/website/"
license: "Apache-2.0"
verdict: "Kubernetes is a strong substrate for shared ML platforms, but a heavy default for one model and one team."
as_of_date: 2026-06-23
sources:
  - {url: "https://kserve.github.io/website/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://www.kubeflow.org/docs/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://docs.seldon.ai/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://kubernetes.io/docs/home/", license: "CC-BY-4.0", kind: "official_docs"}
---

## What it is

Serving on Kubernetes means model endpoints run as containerized workloads managed by Kubernetes primitives and ML-specific controllers. KServe, Seldon, Kubeflow, and related tools add model-serving abstractions on top: inference services, canaries, autoscaling, model protocols, explainers, and rollout patterns.

## Why it exists / when it matters

Kubernetes helps when many teams share clusters, deployments need standard controls, models require GPUs, platform teams need policy enforcement, and production operations already use Kubernetes. It gives a common way to schedule, isolate, observe, scale, and roll back services.

It is overkill when the team has one model, low traffic, no Kubernetes expertise, and no need for multi-tenant platform controls.

## The moving parts

- Container image: packaged model server or app.
- Kubernetes resources: pods, deployments, services, ingress, secrets, config, volumes, and node pools.
- Serving controller: KServe, Seldon, or a custom Helm chart/operator.
- Autoscaling: requests, concurrency, queue depth, GPU metrics, or custom metrics.
- GPU scheduling: node selectors, tolerations, device plugins, MIG partitions, and capacity planning.
- Release policy: canary, shadow, traffic split, rollback, and approval.

## How it works

A model is packaged into an image or referenced from a model repository. A serving resource describes the runtime, model location, resources, and traffic policy. Kubernetes schedules pods on appropriate nodes, exposes a service, and applies health checks and scaling rules. Serving frameworks add ML-aware routing and lifecycle controls.

The first design question is operational ownership. If the product team owns both model and cluster, complexity can crush velocity. If a platform team offers a paved road, Kubernetes can be a reliable substrate.

## When to use vs alternatives

Use Kubernetes serving for shared infrastructure, GPU pools, regulated deployment controls, multi-model platforms, or teams already fluent in Kubernetes. Use managed model endpoints when speed and low operational burden matter. Use a single VM/container service for early prototypes and predictable low-traffic models.

## Failure modes & gotchas

- The ML team debugs Kubernetes instead of model behavior.
- GPU capacity is scheduled but not efficiently batched.
- Autoscaling and model cold starts create user-visible latency.
- Too many controllers and CRDs obscure the real serving path.
- Secrets, model artifacts, and logs are not governed consistently.
- Platform standards are adopted before model/version/eval contracts are mature.

## Minimal example (pseudocode you author)

```yaml
apiVersion: serving.example/v1
kind: InferenceService
metadata:
  name: churn-risk
spec:
  predictor:
    image: registry/churn-risk:2026-06-23.1
    resources:
      limits:
        cpu: "2"
        memory: "4Gi"
    autoscaling:
      targetConcurrency: 20
```

## Key links

- KServe: https://kserve.github.io/website/
- Kubeflow: https://www.kubeflow.org/docs/
- Seldon docs: https://docs.seldon.ai/
- Kubernetes docs: https://kubernetes.io/docs/home/

