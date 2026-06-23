---
title: "Prompt Injection and OWASP LLM Top 10"
category: "Guardrails & security"
url: "https://genai.owasp.org/llm-top-10/"
license: "CC-BY-SA-4.0"
verdict: "Treat prompt injection as an application security problem, not a clever-prompting problem."
as_of_date: 2026-06-22
sources:
  - {url: "https://genai.owasp.org/llm-top-10/", license: "CC-BY-SA-4.0", kind: "official_docs"}
  - {url: "https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html", license: "CC-BY-SA-4.0", kind: "official_docs"}
  - {url: "https://modelcontextprotocol.io/specification/latest", license: "MIT / Apache-2.0", kind: "official_docs"}
---

## What it is

Prompt injection is the attempt to make an LLM follow attacker-controlled instructions instead of the developer's intended policy. Direct injection comes from a user's message. Indirect injection comes from retrieved documents, web pages, emails, tool results, or other content the model sees while working.

OWASP's LLM guidance widens the lens beyond injection. The LLM Top 10 also covers insecure outputs, sensitive information disclosure, excessive agency, system prompt leakage, vector and embedding weaknesses, misinformation, supply-chain risk, and unsafe plugin/tool design.

## Why it exists / when to reach for it

LLMs interpret text as both data and instructions. Agentic systems amplify that ambiguity because they retrieve untrusted text and can take actions through tools. A malicious page in a RAG corpus can tell the model to ignore previous instructions, reveal secrets, call a payment tool, or poison citations.

## The moving parts

- Trust boundaries: system/developer instructions, user input, retrieved content, tool outputs, and tool arguments.
- Data labeling: mark external content as untrusted data, not instructions.
- Least privilege: expose only the tools, scopes, and files needed for the task.
- Structured mediation: parse model intent into validated tool calls rather than executing free-form text.
- Human approval: require confirmation for irreversible, external, expensive, or privacy-sensitive actions.
- Egress controls: decide what data may leave the system through messages, tools, logs, and web requests.
- Monitoring: capture attempted injection patterns, blocked actions, and post-incident lessons.

## How it works

Defenses work by preventing untrusted text from becoming authority. Put durable policy in system/developer instructions and application code. Wrap retrieved text in clear delimiters and metadata. Require tool calls to pass schema, allowlist, authorization, and business-rule checks. Never put secrets in the prompt when a scoped token or server-side lookup can do the job.

The model can help classify suspicious content, but the final enforcement point should be outside the model. For example, if an email tells an agent to forward credentials, the mail body is evidence for the user's task, not permission to act.

## When to use vs alternatives

Use prompt-injection controls whenever the model consumes untrusted context or can call tools. For a static chatbot with no private data and no side effects, simple instruction hierarchy and moderation may be enough. For agents, add sandboxing, approval gates, content provenance, and tool-level authorization.

## Failure modes & gotchas

- "Ignore previous instructions" is only the obvious case; subtle injection can be hidden in citations, HTML, comments, or tool output.
- Summarization does not reliably remove malicious instructions.
- A retrieval filter can miss poisoned chunks, especially if embeddings surface semantically similar attacks.
- Secrets in prompts, traces, or tool outputs can leak even if the final answer is blocked.
- A fallback model or alternate tool path can bypass controls if it has different permissions.

## Minimal code shape

```text
trusted_policy = load_system_policy()
untrusted = label_as_data(retrieved_docs, source_ids=True)

intent = model.plan(trusted_policy, user_request, untrusted)
call = parse_tool_call(intent)

if not policy.tool_allowed(call.name, user, resource):
  return safe_refusal("That action is not available.")

if policy.requires_approval(call):
  return request_human_confirmation(call.summary)

return sandbox.execute(validated(call))
```

## Key links

- https://genai.owasp.org/llm-top-10/
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- https://modelcontextprotocol.io/specification/latest
