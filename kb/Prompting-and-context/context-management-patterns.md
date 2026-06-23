---
title: Context Management Patterns
category: Prompting & context
url: https://developers.openai.com/api/docs/guides/conversation-state
license: Official docs; original synthesis only
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.openai.com/api/docs/guides/conversation-state", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://developers.openai.com/api/docs/guides/compaction", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://docs.anthropic.com/en/docs/build-with-claude/context-windows", license: "Anthropic official docs terms", kind: official_docs}
  - {url: "https://ai.google.dev/gemini-api/docs/long-context", license: "CC-BY-4.0", kind: official_docs}
---

## What it is

Context management is the set of patterns used to keep the right information inside a model's current context window. It covers conversation history, retrieved evidence, tool calls and results, summaries, compaction items, files, user state, and token budgets.

The key idea is that a long context window is not the same as durable memory. The model can only condition on what the application sends or what the provider's state mechanism appends for the current turn.

## Why it exists / when to reach for it

Reach for context management as soon as an interaction spans multiple turns, uses tools, cites sources, or loads more material than comfortably fits in one request. Without it, agents forget commitments, repeat work, cite stale facts, or waste tokens on irrelevant history.

Lesson generation needs context management because a useful answer may depend on the learner's level, the active exercise, KB notes, previous mistakes, and recent tool outputs.

## The moving parts

- Transcript: user and assistant messages that still matter.
- State summary: compact facts, decisions, open questions, and next actions.
- Retrieval pack: fresh source chunks with titles, dates, and URLs.
- Tool ledger: tool calls, arguments, outputs, and error states.
- Provider state: conversation objects, previous response IDs, or managed threads where available.
- Compaction: summarization or opaque provider items that reduce old context.
- Budget policy: explicit limits for input, output, and reasoning tokens.

## How it works

There are several common patterns.

Manual chaining sends the relevant prior messages and output items with each request. It is portable and auditable, but the application owns pruning and privacy.

Provider-managed state uses features such as conversation objects or `previous_response_id` to continue a thread. This reduces client-side transcript handling, but still has billing, retention, and inspection implications. OpenAI notes that previous context can still be billed as input tokens when using chained responses.

Compaction replaces a growing window with a smaller state representation. OpenAI supports server-side compaction through `context_management` thresholds and a standalone compact endpoint; returned compaction items may be opaque and should be carried forward according to the API pattern.

Long-context loading sends large documents or media directly when the model and budget allow it. Gemini guidance highlights placing the specific question after long context and using context caching when the same large corpus is reused.

## When to use vs alternatives

Use full long context when the model needs broad cross-document reasoning and the corpus fits the model and budget. Use RAG when the question usually needs only a small slice of a large corpus. Use summaries for old conversational state. Use structured databases for facts that must be exact. Use durable workflow state for agent progress, retries, and approvals.

## Failure modes & gotchas

- Truncation can silently remove the one fact needed for the answer.
- Summaries can preserve the theme but lose IDs, dates, or user constraints.
- Replaying every tool result can expose stale or malicious text.
- Provider-managed state can complicate retention and audit requirements.
- Long context increases time to first token and cost even when the answer is short.
- RAG chunks need metadata; otherwise the model sees context without provenance.

## Minimal code shape

```text
state = load_conversation_state(thread_id)
evidence = retrieve_sources(user_question, top_k=8)
window = pack_under_budget([
  system_policy,
  state.durable_facts,
  state.open_questions,
  recent_tool_ledger,
  evidence,
  user_question
])

if window.too_large:
  window = compact(window, preserve=["facts", "decisions", "next_actions"])

response = model.generate(window)
save_state(update_state(state, response))
```

## Key links

- OpenAI conversation state: https://developers.openai.com/api/docs/guides/conversation-state
- OpenAI compaction: https://developers.openai.com/api/docs/guides/compaction
- Anthropic context windows: https://docs.anthropic.com/en/docs/build-with-claude/context-windows
- Gemini long context: https://ai.google.dev/gemini-api/docs/long-context
