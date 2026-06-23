---
title: Tool and Plugin Standards
category: Tool use / MCP
url: https://spec.openapis.org/oas/latest.html
license: Apache-2.0
verdict: Best for turning stable API surfaces into validated agent tools; insufficient by itself for permissions, runtime policy, or trust.
as_of_date: 2026-06-22
sources:
  - {url: "https://spec.openapis.org/oas/latest.html", license: "Apache-2.0", kind: "standard"}
  - {url: "https://json-schema.org/draft/2020-12/json-schema-core", license: "BSD-3-Clause / AFL-3.0", kind: "standard"}
  - {url: "https://developers.openai.com/api/docs/guides/function-calling", license: "Official docs; original synthesis only", kind: "provider_docs"}
  - {url: "https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview", license: "Official docs; original synthesis only", kind: "provider_docs"}
  - {url: "https://ai.google.dev/gemini-api/docs/function-calling", license: "Official docs; original synthesis only", kind: "provider_docs"}
  - {url: "https://modelcontextprotocol.io/specification/2025-11-25/server/tools", license: "Apache-2.0 / MIT", kind: "standard"}
---

## What it is

Tool and plugin standards describe actions in a machine-readable way so an AI runtime can decide what is available, validate arguments, execute under controlled credentials, and return results to the model. The common building blocks are OpenAPI for HTTP APIs, JSON Schema for structured input/output shapes, provider-specific tool schemas for model APIs, and MCP for host-neutral tool servers.

## Why it exists / when to reach for it

Agents fail in boring ways when tools are informal: vague names, missing argument constraints, hidden side effects, inconsistent errors, and unclear auth. A standard contract lets teams generate wrappers, validate calls before execution, test behavior, and document what the model is allowed to request.

Reach for standards when tools are shared across teams, exposed to more than one model provider, audited, or generated from an existing API. For a prototype with two local functions, a handwritten wrapper can be enough, but it should still borrow the same discipline: names, descriptions, schemas, auth boundaries, and failure semantics.

## The moving parts

- Operation identity: a stable name the model can choose.
- Description: concise guidance about when to use the action and what it does not do.
- Input schema: usually a JSON object with typed properties, required fields, enums, and nested constraints.
- Output schema: the expected shape of the result, including errors or partial success.
- Auth and security: API keys, OAuth scopes, user delegation, service accounts, or no auth.
- Side-effect class: read-only, idempotent write, destructive write, external communication, purchase, or privileged action.
- Runtime adapter: the code that validates, calls the service, handles retries, and redacts secrets.
- Approval policy: host-side rules for whether the model may call the operation automatically.

## How it works

OpenAPI describes HTTP resources, paths, methods, parameters, request bodies, responses, and security schemes. Tool builders often select a safe subset of operations from an OpenAPI document, convert each operation into a provider or MCP tool definition, and attach a narrower description for model use.

JSON Schema supplies the vocabulary for most argument shapes: object properties, primitive types, arrays, enums, composition, references, defaults, and annotations. Provider APIs then wrap those schemas differently. OpenAI function calling uses tool definitions with parameters and supports strict schema-following modes. Anthropic tools use named definitions with input schemas and a tool-choice policy. Gemini function calling uses function declarations and can return calls for client execution. MCP uses tools exposed by a server through `tools/list` and `tools/call`.

The runtime should never execute model output directly. It parses the requested tool name, checks allowlists and policy, validates arguments, runs the adapter under controlled credentials, normalizes the result, and feeds the result back as untrusted context.

## When to use vs alternatives

Use OpenAPI when the underlying capability is an HTTP API with many operations or multiple client languages. Use JSON Schema directly when the operation is not HTTP but still needs structured validation. Use provider-native schemas when you only target one model API. Use MCP when the same tools should be discoverable by multiple hosts.

Older "plugin" patterns are best understood as packaging around these ingredients: an API description, auth instructions, manifest metadata, and user-facing descriptions. The modern lesson is less about one plugin format and more about making actions narrow, typed, testable, and permissioned.

## Failure modes & gotchas

- Huge OpenAPI specs overwhelm model selection. Expose a curated subset with task-focused names.
- Schema validation does not prove the action is safe or authorized.
- Provider schema dialects are not identical. Test the subset of JSON Schema each runtime actually enforces.
- Descriptions are behavioral controls. Ambiguous verbs like `update` and `manage` cause misfires.
- Output needs structure too; free-form tool results are hard to verify and easy to inject.
- Secrets must live in the adapter or host, never in the schema or prompt.
- Generated wrappers can accidentally expose destructive endpoints that were safe for humans but unsafe for autonomous use.

## Minimal code shape (pseudocode/short snippet you write)

```text
spec = load_openapi("billing-api.yaml")
ops = pick_operations(spec, allowlist=["get_invoice", "create_refund_draft"])

for op in ops:
  tool = {
    name: stable_tool_name(op),
    description: concise_model_description(op),
    input_schema: json_schema_for(op.request),
    side_effect: classify(op)
  }

on_model_tool_call(name, args):
  tool = registry[name]
  policy.require_allowed(tool.side_effect, user, args)
  valid_args = validate(tool.input_schema, args)
  result = adapter.call(tool, valid_args, credentials_for(user))
  return redact_and_shape(result, tool.output_schema)
```

## Key links

- https://spec.openapis.org/oas/latest.html
- https://json-schema.org/draft/2020-12/json-schema-core
- https://developers.openai.com/api/docs/guides/function-calling
- https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/overview
- https://ai.google.dev/gemini-api/docs/function-calling
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
