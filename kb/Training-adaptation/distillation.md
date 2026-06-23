---
title: "Distillation"
category: "Training & adaptation"
url: "https://huggingface.co/docs/trl/gkd_trainer"
license: "Apache-2.0"
verdict: "Use distillation when you want a smaller or cheaper model to imitate a stronger teacher on a known workload."
as_of_date: 2026-06-22
sources:
  - {url: "https://huggingface.co/docs/trl/gkd_trainer", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/trl", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://arxiv.org/abs/1503.02531", license: "arXiv; facts only", kind: "paper"}
  - {url: "https://arxiv.org/abs/1910.01108", license: "arXiv; facts only", kind: "paper"}
---

## What it is

Distillation trains a student model to imitate a stronger teacher model or ensemble. The student is usually smaller, faster, cheaper, or easier to deploy, but it receives more informative supervision than raw labels alone.

In classic knowledge distillation, the student learns from the teacher's probability distribution, not just the final answer. In LLM workflows, distillation often means training on teacher-generated completions, tool traces, summaries, classification labels, or preference-aware outputs.

## Why it exists / when to reach for it

Agentic systems often use large models for planning, grading, routing, extraction, or critique. Running the largest model for every internal step can make the product slow and expensive. Distillation lets teams turn a reliable teacher workflow into a specialized student for high-volume tasks.

Reach for it when the task distribution is known, the teacher is expensive but dependable, and the student can be evaluated on realistic edge cases. Good fits include intent routers, support macros, safety classifiers, JSON extractors, rubric graders, and local/offline assistants.

## The moving parts

- Teacher model or ensemble, including prompts and decoding settings.
- Student model with enough capacity for the target workload.
- Distillation corpus: original inputs, teacher outputs, optional rationales or traces, and held-out cases.
- Training target: hard labels, generated sequences, softened probabilities, or a divergence loss against teacher logits.
- Temperature or sampling settings that control how much information the teacher exposes.
- Evaluation suite that compares student, teacher, and baseline on quality, latency, cost, and safety.

## How it works

A teacher first labels or generates outputs for a curated input set. The student then trains on those examples, either as supervised fine-tuning over teacher responses or by matching the teacher's output distribution. More advanced approaches mix teacher-forced data with student-generated outputs so the student learns from mistakes it is likely to make.

TRL's generalized knowledge distillation support exposes this modern pattern with a teacher model, student model, generation settings, and loss controls. The engineering idea is the same: the student should learn the teacher's useful behavior, not merely memorize a small list of examples.

## When to use vs alternatives

Use quantization when the same model already behaves well and you mainly need lower memory. Use PEFT when you need to adapt a model but not shrink it. Use caching or routing when many requests are repeated or can be sent to different models. Use RAG when the problem is missing knowledge. Use distillation when a repeated capability can be transferred into a cheaper model.

## Failure modes & gotchas

- Students inherit teacher errors, biases, and unsafe shortcuts.
- If the corpus is too narrow, the student may look strong in demos and fail on production variation.
- A small student may not preserve the teacher's long-context, planning, or rare-case behavior.
- Teacher-generated data may be subject to provider terms or source-data restrictions; record provenance.
- Distilling chain-of-thought or private traces can leak sensitive reasoning or data if not filtered.
- Always compare against the teacher and against a simpler baseline. A distilled model that is cheaper but wrong is not a win.

## Minimal code shape (pseudocode/short snippet you write)

```text
prompts = sample_realistic_workload()
teacher_outputs = teacher.generate(prompts, rubric="target_behavior")

student = train_student(
  base="small-model",
  examples=pair(prompts, teacher_outputs),
  loss="sequence_or_distribution_match"
)

report = compare(student, teacher, baseline, heldout_prompts)
ship_if(report.quality_drop <= allowed_drop and report.cost_saving > target)
```

## Key links

- https://huggingface.co/docs/trl/gkd_trainer
- https://github.com/huggingface/trl
- https://arxiv.org/abs/1503.02531
- https://arxiv.org/abs/1910.01108
