---
title: Prompt Engineering
category: Prompting & context
url: https://developers.openai.com/api/docs/guides/prompt-engineering
license: Official docs; original synthesis only
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.openai.com/api/docs/guides/prompt-engineering", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview", license: "Anthropic official docs terms", kind: official_docs}
  - {url: "https://ai.google.dev/gemini-api/docs/prompting-strategies", license: "CC-BY-4.0", kind: official_docs}
---

## What it is

Prompt engineering is the practice of turning a product intent into instructions, examples, context, and output constraints that a language model can follow repeatably. It is not just clever wording. In production, a prompt is part interface contract, part policy, part test fixture, and part context packer.

Modern API prompts usually include high-authority instructions, the user's task, optional examples, relevant context, and generation settings such as output token limits or sampling parameters. OpenAI's Responses API separates `instructions` from `input`; Anthropic exposes system instructions as a top-level `system` value; Gemini supports system instructions and encourages clear structure for long inputs.

## Why it exists / when to reach for it

Reach for prompting first when the behavior is task framing, tone, format, refusal policy, context usage, tool-selection guidance, or workflow discipline. It is the fastest layer to change and easiest layer to evaluate before committing to retrieval, fine-tuning, or custom model work.

Prompt engineering is especially useful for agentic lesson generation because the same model must switch between tutor, evaluator, planner, code explainer, and safety reviewer. The prompt tells the model which role it is playing, what evidence matters, and how the answer will be consumed by the application.

## The moving parts

- Instruction hierarchy: durable application rules should sit above user-provided requests.
- Task statement: the immediate objective and success criteria.
- Context: retrieved notes, files, user state, or examples the model should use.
- Delimiters: Markdown headings, XML-style tags, or other stable boundaries.
- Output contract: prose, Markdown, JSON, citations, length, or schema.
- Model parameters: max output tokens, temperature, top-p/top-k where supported, reasoning controls, and verbosity controls.
- Evals: representative prompts that detect regressions when the prompt or model changes.

## How it works

A model conditions on the visible prompt and predicts likely continuations. Prompt structure changes which instructions are salient, which text is treated as data, and which constraints survive a long context. Good prompts reduce ambiguity before the model has to guess.

A practical flow is: state the role and invariant policy, define the task, give any examples or rubrics, attach context in labeled blocks, then ask for the output in the target shape. Put stable reused material early for cacheability, and put request-specific details near the end, especially in long-context Gemini-style prompts where the question often performs better after the source material.

As of June 22, 2026, OpenAI guidance also favors code-managed prompts over reusable prompt objects: reusable prompt objects were scheduled to be de-emphasized starting June 3, 2026 and shut down on November 30, 2026. Treat prompts like code: version them, review them, test them, and roll them out deliberately.

## When to use vs alternatives

Use prompting when you need behavioral steering but the model already has the capability. Use structured outputs when the main risk is malformed JSON or missing fields. Use function calling when the model must request application actions or fresh data. Use RAG when facts come from private or changing sources. Use fine-tuning when many examples define a durable style or decision boundary that prompts cannot stabilize. Use deterministic code when the task has exact rules.

## Failure modes & gotchas

- Vague prompts produce plausible but inconsistent behavior.
- Long prompts can bury the important rule behind low-value context.
- Examples can overfit the model to one narrow pattern.
- User-provided context can contain prompt injection; label it as data, not instructions.
- Changing model snapshots can change prompt behavior, so pin and test production workloads.
- Tuning randomness parameters without evals can hide regressions behind variability.

## Minimal code shape

```text
prompt = build_prompt(
  system_rules=stable_policy,
  examples=small_edge_case_set,
  context=retrieved_facts,
  user_task=current_request,
  output_contract="return concise Markdown with citations"
)
response = model.generate(prompt, params={max_output_tokens, temperature})
assert eval_suite.pass(response)
```

## Key links

- OpenAI prompt engineering: https://developers.openai.com/api/docs/guides/prompt-engineering
- Anthropic prompt engineering overview: https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview
- Gemini prompting strategies: https://ai.google.dev/gemini-api/docs/prompting-strategies
