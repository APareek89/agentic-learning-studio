---
title: System Prompts and Context Management
category: Prompting & context
url: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts
license: Official docs; original synthesis only
as_of_date: 2026-06-22
sources:
  - {url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts", license: "Anthropic official docs terms", kind: official_docs}
  - {url: "https://developers.openai.com/api/docs/guides/prompt-engineering", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://ai.google.dev/gemini-api/docs/prompting-strategies", license: "CC-BY-4.0", kind: official_docs}
---

## What it is

A system prompt is the application's standing instruction layer: identity, boundaries, workflow rules, output standards, and policy. Context management is the companion practice of deciding which user request, history, retrieved evidence, tool results, and state should be visible in the current model call.

Providers expose this layer differently. OpenAI's Responses API uses `instructions` or higher-authority developer messages. Anthropic's Messages API uses a top-level `system` field. Gemini supports system instructions and also recommends placing critical constraints early.

## Why it exists / when to reach for it

Use system prompts when behavior should be stable across user turns: teaching style, refusal boundaries, source-citation rules, tool-use policy, and formatting norms. Use context management whenever the model could be confused by missing facts, too much history, stale memory, or conflicting instructions.

In a lesson studio, system prompts keep the tutor aligned with product rules, while context management determines which KB notes, learner profile, exercise state, and tool results reach the model.

## The moving parts

- Identity and scope: what the assistant is and is not.
- Instruction hierarchy: application rules outrank user preferences.
- Context blocks: retrieved facts, files, examples, conversation state, and tool outputs.
- Delimiters: section headings, XML-style tags, or typed message parts.
- Recency and priority: what to keep, summarize, or discard.
- Validation rules: what must be checked before showing or acting on an answer.

## How it works

The model attends over all tokens in the request, but it does not automatically know which text is policy and which text is untrusted data. The prompt has to make those roles explicit. Put invariant rules in the system/developer layer, put task-specific user intent in the user layer, and put retrieved material in clearly labeled context sections.

For long contexts, place source material before the final question when that matches provider guidance, and mark the transition from evidence to task. When the context contains tool outputs or documents, state that they are data, not instructions. When history grows, preserve exact user commitments and decisions in a compact state summary rather than replaying low-value chatter.

## When to use vs alternatives

Use system prompts for behavioral rules that should apply to every turn. Use user prompts for the current task. Use retrieval for external facts. Use a database or workflow engine for durable state that must be exact. Use guardrails or code checks for constraints that cannot be left to model obedience.

## Failure modes & gotchas

- A system prompt can conflict with a user request; define the precedence explicitly.
- Long context can dilute the most important instruction.
- Retrieved documents may contain malicious or irrelevant instructions.
- Summaries can erase exact constraints, IDs, dates, or unresolved questions.
- Overly broad "be thorough" instructions can trigger unnecessary tool use or rambling.
- Provider APIs differ: do not assume one provider's role names or message layout transfers directly to another.

## Minimal code shape

```text
request_context = pack_context(
  system_rules=product_policy,
  user_task=current_turn,
  retrieved_notes=top_k_sources,
  history_state=compact_state,
  tool_outputs=recent_results,
  token_budget=model.max_input_tokens
)

response = model.generate(
  system=request_context.system_rules,
  input=request_context.ordered_blocks
)
```

## Key links

- Anthropic system prompts: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/system-prompts
- OpenAI prompt engineering roles and instructions: https://developers.openai.com/api/docs/guides/prompt-engineering
- Gemini prompting strategies: https://ai.google.dev/gemini-api/docs/prompting-strategies
