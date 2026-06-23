---
title: How LLMs Work
category: Foundations
url: https://huggingface.co/docs/transformers/en/llm_tutorial
license: Apache-2.0
as_of_date: 2026-06-22
sources:
  - {url: https://huggingface.co/docs/transformers/en/llm_tutorial, license: Apache-2.0, kind: official_docs}
  - {url: https://huggingface.co/docs/transformers/en/main_classes/text_generation, license: Apache-2.0, kind: official_docs}
  - {url: https://huggingface.co/docs/tokenizers/index, license: Apache-2.0, kind: official_docs}
  - {url: https://github.com/huggingface/transformers, license: Apache-2.0, kind: oss_repo}
---

## What it is

A large language model is a sequence model that turns text into tokens, converts those tokens into vectors, and predicts which token is likely to come next. It does not retrieve a sentence from memory when it answers. It repeatedly scores a vocabulary of possible continuations, chooses one token by a decoding rule, appends it to the prompt, and runs the loop again.

This next-token interface is simple, but it supports rich behavior because training exposes the model to many examples of language, code, reasoning traces, instructions, documents, and conversations. The model learns statistical structure in those examples and uses the visible context to condition each prediction.

## Why it exists / when to reach for it

Reach for the LLM mental model when explaining prompt sensitivity, hallucination, token limits, latency, cost, and why the same prompt can produce different wording. It is especially useful for agentic systems because every agent step is still built from the same loop: pack context, generate a continuation, parse the result, maybe call a tool, then pack a new context.

## The moving parts

- Tokenizer: maps text to token IDs and token IDs back to text. Token boundaries are model-specific and may split words, whitespace, code, or non-English text in surprising ways.
- Embeddings: learned vectors that represent token IDs before transformer layers process them.
- Context window: the maximum number of input plus generated tokens the model can condition on in a single request.
- Transformer stack: attention and feed-forward layers that turn the prompt into contextual token states.
- Logits: raw next-token scores over the vocabulary.
- Decoder: the policy that converts logits into the next token, such as greedy decoding, sampling, top-p sampling, or beam search.

## How it works

During training, a causal language model sees token sequences and learns to predict each next token from the previous tokens. The training objective rewards high probability for the true continuation and penalizes the rest.

At inference time, the model receives a prompt already converted to token IDs. The transformer computes a vector state for each visible token. The final state is projected to logits over the vocabulary. A temperature setting can rescale those logits before probabilities are computed: lower values make the distribution sharper, while higher values make lower-ranked tokens more likely. Other filters, such as top-k or top-p, restrict the candidate set before sampling.

The context window is the model's working input, not durable memory. If a fact, tool result, or instruction is outside the packed context, the model cannot directly attend to it. Long context can help, but more tokens also increase cost and can bury the relevant evidence.

## When to use vs alternatives

Use LLMs for open-ended language tasks, synthesis, explanation, code generation, planning drafts, and interfaces where the input shape varies. Use retrieval when the answer depends on private or changing facts. Use tools when the task needs an external action, calculation, database lookup, or deterministic side effect. Use a smaller classifier or rules engine when labels, constraints, and outputs are narrow enough that free-form generation adds risk.

## Failure modes & gotchas

- Plausible continuation is not the same as truth. The model can produce fluent unsupported claims.
- Low temperature reduces variety but does not guarantee correctness.
- Token counts are not word counts; code, tables, and multilingual text can consume context quickly.
- Prompt format matters. Chat-tuned models may expect role-tagged messages rather than one plain string.
- Hidden truncation can remove instructions or evidence before the request reaches the model.
- Repetition penalties, stop tokens, and max-token limits can change behavior as much as the prompt.

## Minimal code shape

```pseudo
tokens = tokenizer.encode(prompt)

while not stopped(tokens):
  logits = model.forward(tokens).last_token_logits
  logits = logits / temperature
  candidates = top_p_filter(logits, p=0.9)
  next_token = sample(candidates)
  tokens.append(next_token)

return tokenizer.decode(tokens)
```

## Key links

- https://huggingface.co/docs/transformers/en/llm_tutorial
- https://huggingface.co/docs/transformers/en/main_classes/text_generation
- https://huggingface.co/docs/tokenizers/index
- https://github.com/huggingface/transformers
