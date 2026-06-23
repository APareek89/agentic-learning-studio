---
title: Structured Outputs and Function Calling
category: Prompting & context
url: https://developers.openai.com/api/docs/guides/structured-outputs
license: Official docs; original synthesis only
as_of_date: 2026-06-22
sources:
  - {url: "https://developers.openai.com/api/docs/guides/structured-outputs", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://developers.openai.com/api/docs/guides/function-calling", license: "OpenAI official docs terms", kind: official_docs}
  - {url: "https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview", license: "Anthropic official docs terms", kind: official_docs}
  - {url: "https://ai.google.dev/gemini-api/docs/structured-output", license: "CC-BY-4.0", kind: official_docs}
  - {url: "https://ai.google.dev/gemini-api/docs/function-calling", license: "CC-BY-4.0", kind: official_docs}
---

## What it is

Structured outputs constrain a model's final answer to a machine-readable shape, usually JSON described by a schema. Function calling, also called tool use, lets the model request that the application execute a named capability with typed arguments.

They are related but not interchangeable. A schema for a final answer helps downstream UI or validation code consume the model response. A function schema is an action boundary: the model proposes arguments, then your code validates, authorizes, executes, and returns the result.

## Why it exists / when to reach for it

Reach for structured outputs when free-form prose is too hard to parse: extraction, classification, lesson metadata, rubric scores, UI blocks, and validation reports. Reach for function calling when the model needs live data, deterministic computation, side effects, or access to systems outside its training data.

Agentic systems need both. The agent may call `search_kb`, `grade_answer`, or `create_artifact`, then return a structured lesson plan that the app can render.

## The moving parts

- Schema: JSON Schema or provider-specific schema subset for fields, types, enums, required properties, and nesting.
- Tool declaration: name, description, input schema, and sometimes strictness or function-calling mode.
- Tool choice policy: automatic, required, disabled, forced, or limited to allowed functions.
- Runtime executor: application code that owns credentials, permissions, retries, and side effects.
- Tool result: a response from code back to the model, tied to the specific tool call.
- Validator: schema and business-rule checks before trusting model output or executing actions.

## How it works

For structured final answers, the application sends a schema alongside the prompt. The model is sampled under constraints or validation-aware decoding so its output is easier to parse. OpenAI distinguishes stricter Structured Outputs from JSON mode; Gemini supports JSON response formats with schemas; Anthropic commonly uses tool schemas and prompting patterns for structured data.

For function calling, the application sends function declarations with the request. The model returns one or more tool-call objects with arguments. The application validates those arguments, executes code if policy allows, then sends the tool result back so the model can continue or produce a final response.

## When to use vs alternatives

Use structured outputs for final data that stays inside the application. Use function calling for actions, retrieval, calculations, account lookups, and other external capabilities. Use plain JSON mode only when schema adherence is less important or the model/provider does not support stricter schemas. Use a deterministic parser when the input grammar is fixed. Use MCP when the same tools should be shared across clients or agent hosts.

## Failure modes & gotchas

- A valid schema is not a safety policy; authorization still belongs in code.
- Tool descriptions count toward context and can degrade selection if too many are exposed.
- Deeply nested or overly broad schemas are harder for models and sometimes rejected by APIs.
- Parallel tool calls require handlers that can process several calls, not just the first item.
- Tool outputs are untrusted data and can contain prompt-injection text.
- Structured outputs can still be semantically wrong even when syntactically valid.

## Minimal code shape

```text
tools = [{
  name: "lookup_lesson_source",
  description: "Find KB notes by topic slug.",
  input_schema: {topic_slug: "string"}
}]

first = model.generate(user_task, tools=tools, tool_choice="auto")
for call in first.tool_calls:
  args = validate(call.arguments, tools[call.name].input_schema)
  result = authorize_and_execute(call.name, args)
  append_tool_result(call.id, result)

final = model.generate(context_with_tool_results, response_schema=lesson_schema)
validate(final.json, lesson_schema)
```

## Key links

- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- OpenAI function calling: https://developers.openai.com/api/docs/guides/function-calling
- Anthropic tool use overview: https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- Gemini function calling: https://ai.google.dev/gemini-api/docs/function-calling
