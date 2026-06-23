---
title: Transformers, Attention, and KV Cache
category: Foundations
url: https://huggingface.co/docs/transformers/en/kv_cache
license: Apache-2.0
as_of_date: 2026-06-22
sources:
  - {url: https://huggingface.co/docs/transformers/index, license: Apache-2.0, kind: official_docs}
  - {url: https://huggingface.co/docs/transformers/en/kv_cache, license: Apache-2.0, kind: official_docs}
  - {url: https://d2l.ai/chapter_attention-mechanisms-and-transformers/self-attention-and-positional-encoding.html, license: CC-BY-SA-4.0, kind: educational_textbook}
  - {url: https://arxiv.org/abs/1706.03762, license: "arXiv.org perpetual non-exclusive license; facts only", kind: paper}
---

## What it is

A transformer is a neural network architecture for sequence data. Its central operation is attention: each token can compare itself with other tokens in the visible sequence and mix information from the relevant ones. A KV cache is an inference-time store of previously computed key and value tensors so an autoregressive model can generate the next token without recomputing the whole prefix at every step.

## Why it exists / when to reach for it

Transformers became the default architecture for LLMs because they train efficiently in parallel and scale well with data and compute. Attention gives the model a direct path between distant tokens, which is useful for language, code, vision-language tasks, speech, and multimodal inputs.

Reach for this topic when discussing context windows, long-context cost, generation latency, batch serving, memory pressure, and why serving engines care so much about cache layout.

## The moving parts

- Token states: vectors representing each position in the sequence.
- Queries: projections that ask what a token is looking for.
- Keys: projections that advertise what each token can match.
- Values: projections carrying information to be mixed into the output.
- Attention mask: rules that block invalid positions, such as future tokens in causal generation.
- Multi-head attention: parallel attention views that learn different relationship patterns.
- Positional information: embeddings or rotations that tell the model where tokens sit in order.
- Feed-forward blocks, residual connections, and normalization: the rest of the transformer layer.
- KV cache: stored keys and values from previous decode steps.

## How it works

In self-attention, each layer projects token states into query, key, and value matrices. Attention scores come from comparing queries with keys. After masking and normalization, those scores weight the values, producing a context-aware vector for each token. Multi-head attention runs this process several times with separate projections, then combines the results.

For a causal LLM, generation has two phases. Prefill processes the prompt and builds hidden states and KV tensors for every prompt token. Decode then adds one token at a time. With a KV cache, the model computes the new token's query, key, and value, appends the new key and value to the cache, and attends over cached past values. This saves compute but spends memory roughly proportional to layers, heads, sequence length, and active requests.

## When to use vs alternatives

Use transformers when the task needs flexible sequence modeling, pretrained LLM capability, or cross-token reasoning over rich context. RNNs, CNN sequence models, and state-space models can be cheaper for narrow streaming or fixed-pattern tasks. Retrieval, databases, and tool calls are still better for facts and actions that should not live in model weights.

## Failure modes & gotchas

- KV cache reduces repeated compute but can dominate GPU memory at long context or high concurrency.
- Long prompts still require expensive prefill before decode starts.
- Cache entries are only valid for the exact prefix and model state that produced them.
- Attention can connect tokens but does not guarantee faithful use of the best evidence.
- Positional scaling and long-context extensions can degrade outside the distribution the model learned.
- Batching requests with different sequence lengths creates fragmentation and scheduling tradeoffs.

## Minimal code shape

```pseudo
hidden = embed(prompt_tokens)
cache = []

for layer in transformer.layers:
  q, k, v = layer.project_qkv(hidden)
  cache[layer].append(k, v)
  weights = softmax(mask(q @ cache[layer].keys.T) / sqrt(head_dim))
  hidden = layer.finish(weights @ cache[layer].values)

next_token = sample(output_head(hidden.last))
```

## Key links

- https://huggingface.co/docs/transformers/index
- https://huggingface.co/docs/transformers/en/kv_cache
- https://d2l.ai/chapter_attention-mechanisms-and-transformers/self-attention-and-positional-encoding.html
- https://arxiv.org/abs/1706.03762
