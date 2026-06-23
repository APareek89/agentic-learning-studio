---
title: "Fine-tuning"
category: "Training & adaptation"
url: "https://huggingface.co/docs/transformers/training"
license: "Apache-2.0"
verdict: "Use fine-tuning when repeated behavior should become part of the model, not when the app only needs fresher facts."
as_of_date: 2026-06-22
sources:
  - {url: "https://huggingface.co/docs/transformers/training", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://huggingface.co/docs/trl/sft_trainer", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/huggingface/transformers", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://platform.openai.com/docs/guides/fine-tuning", license: "Official docs; facts only", kind: "official_docs"}
---

## What it is

Fine-tuning continues training a pretrained model on examples for a narrower task, domain, or interaction style. Instead of adding context at request time, it changes model weights so a behavior becomes more likely by default.

In LLM products, the most common form is supervised fine-tuning: prompts or conversations are paired with target responses, and the model learns to predict those target tokens. The same idea also appears as instruction tuning, chat fine-tuning, vision fine-tuning, or as a first stage before preference tuning.

## Why it exists / when to reach for it

Fine-tuning is worth considering after a prompted baseline and eval suite already exist. Reach for it when the desired behavior is frequent, stable, and hard to express reliably in every prompt: a strict output style, domain-specific shorthand, routing labels, support tone, tool argument formatting, or specialist reasoning patterns.

Do not use fine-tuning as the first answer to missing knowledge. If the app needs current policy text, customer records, pricing, or private documents, retrieval or tool calls are usually safer because those sources can change without retraining.

## The moving parts

- Base model and tokenizer or chat template.
- Training set with inputs and desired outputs.
- Validation and held-out test sets that match production traffic.
- Objective, usually next-token prediction over the target response.
- Trainer or provider-hosted job, plus learning rate, batch size, epochs, and checkpoint policy.
- Evaluation harness covering quality, format adherence, safety, latency, and cost.
- Model registry metadata: base model, data version, training config, and rollback target.

## How it works

Training examples are formatted into the model's expected text or message structure, tokenized, and batched. The model predicts the next token, compares its probabilities with the target tokens, and updates weights through backpropagation. For chat fine-tuning, only assistant/output spans are often used as the supervised target so the model learns the answer, not the user's prompt.

A practical workflow is: freeze the task definition, build evals first, collect representative examples, split by scenario rather than random rows when leakage is possible, train a small run, compare against the prompted baseline, then scale only if held-out performance improves. Provider-hosted fine-tuning wraps these steps behind a job API; local training with Hugging Face tools gives more control over data processing, adapters, hardware, and checkpoints.

## When to use vs alternatives

Use prompting when the behavior can be stated compactly and works well enough. Use RAG when answers depend on external facts. Use tool calling when the model must act on systems or compute deterministically. Use LoRA or other PEFT methods when full fine-tuning is too expensive or you want many task-specific adapters over one base model. Use preference tuning when "better" is subjective and pairwise choices are easier to collect than perfect target answers.

## Failure modes & gotchas

- A tiny or repetitive dataset can overfit and make the model brittle.
- Bad examples are amplified; unclear instructions become learned behavior.
- Fine-tuning can reduce general ability if the run is too aggressive or narrow.
- Prompt and chat-template mismatch between training and inference can erase the benefit.
- Sensitive or licensed data needs an explicit handling policy before training.
- Fine-tuned models still hallucinate and still need grounding for facts.
- Provider features change. The cached OpenAI fine-tuning guide notes limited platform availability for new users as of this rebuild, so treat hosted fine-tuning support as provider-specific.

## Minimal code shape (pseudocode/short snippet you write)

```text
examples = load_jsonl("task_examples.jsonl")
train, valid, test = scenario_split(examples)

baseline = evaluate(prompted_model, test)
candidate = fine_tune(
  base_model="open-or-hosted-base",
  train=format_for_chat_template(train),
  validation=format_for_chat_template(valid),
  config={epochs: 2, learning_rate: "small"}
)

ship_if(evaluate(candidate, test) > baseline and safety_check(candidate))
```

## Key links

- https://huggingface.co/docs/transformers/training
- https://huggingface.co/docs/trl/sft_trainer
- https://github.com/huggingface/transformers
- https://platform.openai.com/docs/guides/fine-tuning
