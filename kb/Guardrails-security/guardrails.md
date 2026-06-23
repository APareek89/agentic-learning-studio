---
title: "Guardrails"
category: "Guardrails & security"
url: "https://github.com/NVIDIA/NeMo-Guardrails"
license: "Apache-2.0"
verdict: "Use NeMo Guardrails for programmable conversation and tool-flow rails; use Guardrails AI when validation, schema repair, and reusable validators are the center of gravity."
as_of_date: 2026-06-22
sources:
  - {url: "https://github.com/NVIDIA/NeMo-Guardrails", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://docs.nvidia.com/nemo/guardrails", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/guardrails-ai/guardrails", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

Guardrails are runtime controls that sit around model calls, retrieved context, and tool execution. They do not make an LLM inherently safe; they make the application more explicit about what the model may receive, say, retrieve, and do.

NeMo Guardrails and Guardrails AI cover overlapping but different needs. NeMo Guardrails is a programmable rail layer for conversational applications, with input, dialog, retrieval, execution, and output rails. Guardrails AI focuses on guards and validators for input/output risk checks, structured extraction, validation, and repair.

## Why it exists / when to reach for it

Reach for guardrails when a prompt-only contract is too weak: regulated language, private data, unsafe content, schema-critical outputs, tool actions, RAG citation quality, or escalation rules. In an agentic learning product, guardrails keep lesson generation from drifting into unsupported claims, unsafe advice, or malformed lesson JSON.

## The moving parts

- Policy: the product rules, prohibited content, required disclosures, escalation criteria, and data boundaries.
- Placement: pre-input checks, retrieval filters, tool input/output checks, model output checks, and final response validation.
- Deterministic validators: schemas, regexes, allowlists, type checks, citation requirements, and policy state machines.
- Model-based checks: toxicity, jailbreak, topic, hallucination, or semantic policy classifiers.
- Recovery: block, redact, retry, ask a clarifying question, route to a human, or return a safe fallback.
- Telemetry: log the policy version, guard decision, source IDs, and remediation without storing secrets.

## How it works

A guardrail system wraps a model call with a policy pipeline. Input rails classify or normalize the user message. Retrieval rails filter or annotate chunks before they become model context. Dialog rails decide which paths are allowed in a conversation. Execution rails check tool arguments and tool results. Output rails validate the final answer before it reaches the user.

NeMo expresses much of this as configurable rails and Colang dialogue flows. Guardrails AI composes guards from validators and can use Pydantic-style structures or hub validators to validate LLM inputs and outputs. In both cases, the strongest designs combine deterministic checks with narrowly scoped model checks.

## When to use vs alternatives

Use NeMo Guardrails when the conversation path, tool boundary, or RAG flow itself needs policy-aware control. Use Guardrails AI when you mostly need reusable validators, schema enforcement, and retry/repair around model outputs. Use native structured outputs or JSON schema when the risk is only formatting. Use application authorization, sandboxing, and approvals for side effects; guardrails are not a permissions system.

## Failure modes & gotchas

- False confidence: a rail can fail open, miss a new attack, or be bypassed by a different tool path.
- Overblocking: aggressive checks can make legitimate learning workflows unusable.
- Hidden cost: model-based guards add latency, spend, and their own failure modes.
- Policy drift: rules that are not versioned and tested become stale as models and product features change.
- Logging risk: blocked content can still contain secrets or personal data.
- Validator mismatch: a schema validator can prove shape, not factual truth.

## Minimal code shape

```text
policy = load_policy("lesson-generation-v4")

request = input_guard.check(user_message, policy)
if request.blocked:
  return safe_response(request.reason)

chunks = retrieval_guard.filter(retrieve(request.clean_text), policy)
draft = model.generate(system_policy, chunks, request.clean_text)

checked = output_guard.validate(draft, schema=LessonBlueprint)
if checked.can_repair:
  checked = model.repair(checked.errors, draft)

return checked.value if checked.allowed else safe_fallback(checked.reason)
```

## Key links

- https://github.com/NVIDIA/NeMo-Guardrails
- https://docs.nvidia.com/nemo/guardrails
- https://github.com/guardrails-ai/guardrails
- https://guardrailsai.com/guardrails/docs
