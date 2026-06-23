---
title: "Agent Tool Security and Sandboxing"
category: "Guardrails & security"
url: "https://genai.owasp.org/llm-top-10/"
license: "CC-BY-SA-4.0"
verdict: "Secure the tool boundary like an API gateway: typed inputs, least privilege, isolated execution, approval gates, and auditable side effects."
as_of_date: 2026-06-22
sources:
  - {url: "https://genai.owasp.org/llm-top-10/", license: "CC-BY-SA-4.0", kind: "official_docs"}
  - {url: "https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html", license: "CC-BY-SA-4.0", kind: "official_docs"}
  - {url: "https://modelcontextprotocol.io/specification/latest", license: "MIT / Apache-2.0", kind: "official_docs"}
---

## What it is

Agent tool security is the control layer between language-model intent and real-world action. It decides which tools exist, what arguments are valid, which credentials are available, where code can run, what files or network destinations are reachable, and when a human must approve.

Sandboxing is one part of that layer. It confines execution so a bad model plan, malicious tool result, or compromised dependency cannot freely read local files, exfiltrate secrets, mutate production data, or spend money.

## Why it exists / when to reach for it

Agents fail differently from chatbots because they act. A generated answer may be wrong; a tool call can delete a file, email a customer, leak a key, alter a database, or publish content. OWASP's "excessive agency" risk is the core warning: broad tools plus broad credentials plus untrusted instructions are a security incident waiting to happen.

## The moving parts

- Tool inventory: every callable function, browser action, shell command, connector, and hosted tool.
- Capability tiers: read-only, write, external-send, money movement, credential access, code execution, and admin.
- Input schemas: strict types, enums, path constraints, URL allowlists, maximum sizes, and business rules.
- Credential scoping: per-user or per-task tokens with the narrowest privileges possible.
- Sandboxes: filesystem, process, network, time, memory, package, and browser-profile isolation.
- Approval gates: explicit confirmation for irreversible, external, expensive, or policy-sensitive actions.
- Audit logs: user, model, tool, arguments, redactions, approval state, result digest, and policy version.

## How it works

Expose narrow tools, not raw power. A `send_invoice_reminder(customer_id)` workflow is safer than a general email tool with arbitrary recipient and body. Validate the model's requested tool call before execution. Bind credentials server-side after authorization, not by placing secrets in the prompt. Run code and browsing in disposable environments with no default access to production secrets or user files.

Tool output must also be treated as untrusted. A web page, log line, email, or MCP tool result can contain instructions aimed at the model. The tool runner should return structured data plus provenance, while the policy layer decides whether follow-up action is allowed.

## When to use vs alternatives

For low-risk transformations, schema validation may be enough. For filesystem, shell, browser, network, or enterprise connectors, use sandboxing and egress controls. For high-risk business actions, prefer deterministic workflows plus human approval. For production admin tasks, require a separate privileged path rather than handing an agent broad credentials.

## Failure modes & gotchas

- Read access can be sensitive; a tool that "only reads" can still leak private data.
- A sandbox with unrestricted network egress is only half a sandbox.
- Tool descriptions are prompts, not permissions.
- Retrying a non-idempotent tool can duplicate side effects.
- Long-lived credentials let a single prompt-injection bug persist across tasks.
- Alternate transports or fallback tools can bypass the intended approval path.

## Minimal code shape

```text
tool_call = parse_tool_call(model_output)
schema.validate(tool_call.args)

policy.require_capability(user, tool_call.name, tool_call.args)
policy.require_approval_if(
  tool_call.external_send or tool_call.irreversible or tool_call.cost > limit
)

token = mint_scoped_token(user, tool_call.name, ttl="5m")
result = sandbox.run(tool_call, token=token, network=egress_policy)

audit.record(tool_call, result.digest, policy.version)
```

## Key links

- https://genai.owasp.org/llm-top-10/
- https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- https://modelcontextprotocol.io/specification/latest
