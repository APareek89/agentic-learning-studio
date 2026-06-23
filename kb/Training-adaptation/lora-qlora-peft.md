---
title: "LoRA, QLoRA, and PEFT"
category: "Training & adaptation"
url: "https://huggingface.co/docs/peft/index"
license: "Apache-2.0"
verdict: "Use PEFT when you need task adaptation with far fewer trainable weights than full fine-tuning."
as_of_date: 2026-06-22
sources:
  - {url: "https://huggingface.co/docs/peft/index", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://huggingface.co/docs/peft/developer_guides/lora", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://huggingface.co/docs/transformers/quantization/bitsandbytes", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/peft", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://arxiv.org/abs/2106.09685", license: "arXiv; facts only", kind: "paper"}
  - {url: "https://arxiv.org/abs/2305.14314", license: "arXiv; facts only", kind: "paper"}
---

## What it is

Parameter-efficient fine-tuning (PEFT) adapts a large model by training a small number of new parameters while leaving most base weights frozen. LoRA is the best-known method: it adds low-rank update matrices to selected linear layers, then trains only those small matrices. QLoRA combines LoRA with a quantized frozen base model so adaptation fits on much smaller hardware.

The result is an adapter: a lightweight artifact tied to a specific base model. At inference time, the adapter can be loaded dynamically or merged into the base weights when operational simplicity matters more than adapter swapping.

## Why it exists / when to reach for it

Full fine-tuning large models is expensive because optimizer state and gradients scale with the whole model. PEFT exists to make adaptation feasible for teams that have modest GPUs, many domain variants, or a need to ship small task-specific deltas instead of whole model copies.

Reach for LoRA when the task is stable enough to train but you want lower cost, easier experiment tracking, or many adapters over one base. Reach for QLoRA when the base model is too large to hold in standard precision during training.

## The moving parts

- Frozen base model and exact revision.
- Target modules, commonly attention or MLP projection layers.
- LoRA rank, alpha/scaling, dropout, and initialization.
- Adapter checkpoint, adapter name, and merge/unmerge policy.
- Quantization configuration for QLoRA: bit width, compute dtype, NF4 or other quant type, and double/nested quantization when used.
- Training data, evaluation set, and the same prompt/chat format planned for inference.

## How it works

LoRA approximates a weight update with two smaller matrices. During the forward pass, the frozen layer still runs, and the adapter adds a learned low-rank correction. Because only the adapter weights train, memory and storage costs drop sharply compared with updating every parameter.

QLoRA loads the base model in 4-bit form, keeps it frozen, and backpropagates through it into LoRA adapters. The QLoRA paper introduced practical memory-saving details such as NormalFloat 4-bit weights, double quantization of quantization constants, and paged optimizers to handle memory spikes. These details do not remove the need for evaluation; they make the run possible.

## When to use vs alternatives

Use prompting first if the behavior can be reliably instructed. Use RAG for changing facts. Use full fine-tuning when you control enough data and compute and need maximum adaptation without adapter indirection. Use distillation when the goal is a smaller standalone model rather than a specialized delta. Use quantization alone when the model already behaves well and the goal is cheaper inference.

## Failure modes & gotchas

- Rank is a capacity knob, not a quality guarantee; poor data still yields poor adapters.
- Target modules are architecture-specific. A config copied from another model may silently under-adapt.
- Adapter and base model revisions must match. Treat the base hash as part of the adapter artifact.
- QLoRA saves weight memory, but activations, sequence length, batch size, and optimizer settings still dominate training feasibility.
- Merging adapters simplifies serving but removes easy switching and can obscure provenance.
- Quantized training and inference depend on hardware kernels, library versions, and compute dtype. Test the exact deployment path.

## Minimal code shape (pseudocode/short snippet you write)

```text
base = load_model("base-revision", quantized_4bit=True)
adapter = attach_lora(
  base,
  target_modules=["attention_q", "attention_v"],
  rank=16,
  alpha=32,
  dropout=0.05
)

train_only(adapter.parameters, examples)
compare(adapter, base, heldout_prompts)
publish(adapter, requires_base="base-revision")
```

## Key links

- https://huggingface.co/docs/peft/index
- https://huggingface.co/docs/peft/developer_guides/lora
- https://huggingface.co/docs/transformers/quantization/bitsandbytes
- https://github.com/huggingface/peft
- https://arxiv.org/abs/2106.09685
- https://arxiv.org/abs/2305.14314
