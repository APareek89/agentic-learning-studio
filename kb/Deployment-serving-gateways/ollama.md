---
title: "Ollama"
category: "Deployment & serving / gateways"
url: "https://github.com/ollama/ollama"
license: "MIT"
verdict: "Best for local development, demos, and private single-machine inference; not the default choice for high-concurrency production serving."
as_of_date: 2026-06-22
sources:
  - {url: "https://github.com/ollama/ollama", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/ollama/ollama/tree/main/docs", license: "MIT", kind: "official_docs"}
  - {url: "https://docs.ollama.com/api", license: "MIT", kind: "official_docs"}
  - {url: "https://docs.ollama.com/modelfile", license: "MIT", kind: "official_docs"}
---

## What it is

Ollama is a local model runner with a simple CLI, model library workflow, Modelfile customization, and REST API. It makes open-weight LLMs feel like local developer infrastructure: pull a model, run it, and point an app at `localhost`.

In an agentic learning environment, Ollama is most useful for offline demos, classroom exercises, privacy-sensitive prototypes, and smoke tests where the point is learning model behavior rather than operating a fleet of GPU servers.

## Why it exists / when to reach for it

Use Ollama when you want the shortest path from "I have a laptop or workstation" to "I can call a model." It removes a lot of ceremony around model files, templates, local serving, and basic API integration. It also lets learners compare models without creating cloud accounts or sharing prompts with a hosted provider.

It is not a substitute for a production inference platform when you need autoscaling, multi-tenant authorization, detailed routing policy, or high request concurrency.

## The moving parts

- CLI lifecycle: `pull`, `run`, `create`, `show`, `ps`, and related commands manage model availability and active sessions.
- Local server: exposes generate, chat, embeddings, model management, and streaming responses through HTTP.
- Model library and local cache: downloads model artifacts and keeps them available on the machine.
- Modelfile: defines a custom model package, including base model, system prompt, template, parameters such as context length, adapters, and license metadata.
- Hardware backends: uses available CPU/GPU acceleration across supported NVIDIA, AMD, Apple Metal, and Vulkan paths.
- Context sizing: context windows affect memory use directly; larger contexts require enough VRAM or incur slower offload behavior.

## How it works

The developer pulls a model and starts the Ollama service. Calls can be made through the CLI or REST API. Chat and generate endpoints stream JSON objects by default, with an option to return one complete response. A Modelfile can wrap a base model with a stable system message, prompt template, sampling settings, context length, and optional adapter.

For lesson systems, a useful pattern is to run Ollama as a local fallback model for drafting, grading practice prompts, or demonstrating tradeoffs between model size, latency, and answer quality.

## When to use vs alternatives

Use Ollama instead of vLLM, TGI, or SGLang when setup speed and local ergonomics matter more than throughput. Use vLLM or SGLang when serving many users or long contexts on GPU clusters. Use a hosted API when reliability and model quality matter more than local control. Put LiteLLM or another gateway in front if the same application needs to switch between Ollama, hosted APIs, and self-hosted servers.

## Failure modes & gotchas

- Local performance varies dramatically by model size, quantization, VRAM, and whether layers spill to CPU.
- Model licenses are separate from the Ollama code license. Pulling a model does not mean it is approved for your commercial use.
- Larger context windows require more memory; setting `num_ctx` too high can make an otherwise usable model sluggish or unusable.
- The API is convenient, but multi-user auth, audit, budget policy, and rate limits are application or gateway responsibilities.
- Streaming JSON is friendly for local tools but requires careful client parsing.
- A model that works in a local demo may not meet production latency or quality requirements.

## Minimal code shape (pseudocode/short snippet you write)

```bash
ollama pull llama3.1
ollama serve
```

```text
FROM llama3.1
PARAMETER num_ctx 8192
SYSTEM You are a concise tutor for agentic AI concepts.
```

```bash
curl http://localhost:11434/api/chat \
  -d '{"model":"llama3.1","stream":false,"messages":[{"role":"user","content":"Explain KV cache."}]}'
```

## Key links

- Ollama repository: https://github.com/ollama/ollama
- Ollama docs source: https://github.com/ollama/ollama/tree/main/docs
- API reference: https://docs.ollama.com/api
- Modelfile reference: https://docs.ollama.com/modelfile
- Model library: https://ollama.com/library
