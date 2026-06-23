---
title: "Quantization"
category: "Training & adaptation"
url: "https://huggingface.co/docs/transformers/quantization"
license: "Apache-2.0"
verdict: "Use quantization when a model already works but needs lower memory, lower bandwidth, or cheaper inference."
as_of_date: 2026-06-22
sources:
  - {url: "https://huggingface.co/docs/transformers/quantization", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://huggingface.co/docs/transformers/quantization/bitsandbytes", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/transformers", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://arxiv.org/abs/2210.17323", license: "arXiv; facts only", kind: "paper"}
  - {url: "https://arxiv.org/abs/2305.14314", license: "arXiv; facts only", kind: "paper"}
---

## What it is

Quantization represents model weights, activations, or caches with fewer bits than standard floating point. For LLMs, the common practical goal is to load and run a model with less GPU memory while preserving enough quality for the task.

Common forms include 8-bit loading, 4-bit weight quantization, GPTQ-style post-training quantization, and QLoRA-style 4-bit training with adapters. Some methods are weight-only; others also care about activations, compute dtype, or calibration data.

## Why it exists / when to reach for it

Large models are often limited by memory bandwidth and VRAM, not only raw math. Quantization reduces the bytes moved and stored. That can make a model fit on a smaller accelerator, allow larger batch sizes, lower serving cost, or enable local inference.

Reach for quantization when a model's behavior is already acceptable in higher precision and deployment constraints are the problem. In an agent stack, this is common for local planners, fast classifiers, code copilots, and private inference where cost or hardware is fixed.

## The moving parts

- Bit width and format: int8, int4, NF4, FP8, or method-specific encodings.
- Scope: weights only, weights plus activations, or cache quantization.
- Calibration data for post-training methods that need representative inputs.
- Compute dtype used during matrix operations.
- Quantization library and kernel support, such as bitsandbytes or GPTQ-compatible runtimes.
- Device map, offloading policy, memory budget, and dequantization fallback.
- Evaluation set focused on the exact production task.

## How it works

A quantizer maps high-precision numbers into a smaller set of representable values plus scale information. At inference time, kernels use the compact representation directly or dequantize pieces as needed. Post-training quantization applies this after training. Quantization-aware training and QLoRA-style workflows account for quantization during adaptation.

Hugging Face Transformers exposes quantized loading paths through quantization configs and integrations. The important implementation detail is that quality and speed are method-specific: lower memory does not automatically mean faster end-to-end latency if kernels, batch sizes, or CPU offload become bottlenecks.

## When to use vs alternatives

Use distillation when the goal is a smaller architecture that learns a narrower behavior. Use LoRA or QLoRA when the model also needs adaptation. Use pruning or architecture changes when you control training deeply. Use routing when only some requests need the large model. Use prompt or retrieval changes when quality, not memory, is the bottleneck.

## Failure modes & gotchas

- Low-bit models can lose accuracy on math, code, tool selection, long-context recall, or rare tokens even when casual chat looks fine.
- A quantized model may fit in memory but still be slow if kernels or hardware are mismatched.
- Calibration data that misses production patterns can hide quality loss.
- Some layers or outlier-heavy modules may need to stay in higher precision.
- Dequantizing back to higher precision can require much more memory and may not perfectly restore quality.
- Track the quantization recipe as part of the artifact; "4-bit" alone is not enough provenance.

## Minimal code shape (pseudocode/short snippet you write)

```text
quantized = load_model(
  "base-revision",
  quantization={bits: 4, format: "nf4", compute_dtype: "bf16"},
  device_map="auto"
)

scores = evaluate(quantized, production_eval)
baseline = evaluate(full_precision_model, production_eval)

ship_if(scores.quality >= baseline.quality - tolerance and scores.vram < budget)
```

## Key links

- https://huggingface.co/docs/transformers/quantization
- https://huggingface.co/docs/transformers/quantization/bitsandbytes
- https://github.com/huggingface/transformers
- https://arxiv.org/abs/2210.17323
- https://arxiv.org/abs/2305.14314
