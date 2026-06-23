---
title: A2A Agent-to-Agent Interoperability
category: Tool use / MCP
url: https://a2a-protocol.org/latest/
license: Apache-2.0
verdict: Best for cross-agent delegation between independently built agent services; not a replacement for MCP or an agent framework.
as_of_date: 2026-06-22
sources:
  - {url: "https://a2a-protocol.org/latest/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://a2a-protocol.org/latest/specification/", license: "Apache-2.0", kind: "standard"}
  - {url: "https://a2a-protocol.org/latest/topics/key-concepts/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://a2a-protocol.org/latest/topics/agent-discovery/", license: "Apache-2.0", kind: "official_docs"}
  - {url: "https://github.com/a2aproject/A2A", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

A2A, short for Agent2Agent, is an interoperability protocol for communication between independent AI agents. It lets a client agent discover a remote agent, understand what that agent can do, send work, receive task state, and collect messages or artifacts. The project is hosted under the Linux Foundation ecosystem, was originally developed by Google, and is licensed under Apache-2.0.

## Why it exists / when to reach for it

Modern agent systems often mix frameworks, vendors, runtime environments, and ownership boundaries. One agent may specialize in procurement, another in code review, another in research, and another in customer support. A2A gives them a shared task-exchange language without requiring one agent to expose its private tools, memory, chain of thought, or implementation details.

Reach for A2A when the counterpart is itself an agent service with judgment, state, skills, and artifacts. If the counterpart is just a deterministic API, use OpenAPI or an SDK. If the counterpart is a tool inside one agent's workspace, use MCP or native function calling.

## The moving parts

- A2A server: the remote agent endpoint.
- A2A client: the caller that discovers and delegates work.
- Agent Card: JSON metadata describing identity, endpoint, capabilities, skills, auth requirements, and supported input/output modes.
- Skills: task descriptions inside the Agent Card, including names, examples, and modality hints.
- Message: a conversational payload with role and one or more parts.
- Part: text, structured data, or file content/reference.
- Task: stateful work with lifecycle status, context, and history.
- Artifact: generated output tied to a task, such as a report, file, table, or structured object.
- Streaming and push notifications: mechanisms for long-running work.

## How it works

Discovery commonly starts from an Agent Card. A public or internal agent can publish it at a well-known URL, register it in a curated directory, or distribute it through direct configuration. The card tells the client which endpoint to call, which authentication scheme to use, and which skills the remote agent claims to support.

Requests use JSON-RPC-style payloads over HTTP(S). For a simple interaction, the client sends a message and receives either an immediate message or a task. For longer work, the remote agent returns a task that moves through states such as working, input-required, completed, failed, canceled, or rejected. The client can poll, stream updates over Server-Sent Events, subscribe after reconnecting, or configure push notifications to a webhook.

Artifacts separate final or intermediate work products from chat text. That distinction is useful for lessons because a remote agent may deliver a spreadsheet, image, JSON object, or multi-part report rather than a single answer.

## When to use vs alternatives

Use A2A for agent-to-agent delegation across frameworks, companies, or trust domains. Use MCP when an agent or host needs tools and context. Use a queue when the worker is fully internal and no dynamic capability discovery is needed. Use an API contract when the service has deterministic operations and no autonomous task lifecycle.

A2A and MCP fit together: an A2A-compatible research agent might use MCP servers internally for web search, database reads, or document access, while exposing only its higher-level research skill to other agents.

## Failure modes & gotchas

- Agent Cards can leak sensitive capabilities. Public cards should be sparse; richer cards may need authentication.
- Capability discovery is not trust. Clients still need allowlists, identity checks, and policy enforcement.
- Long-running tasks need replay, idempotency, and reconnection behavior, not just a happy-path stream.
- Push notification webhooks create a second security boundary; verify sender identity and message freshness.
- A task artifact can contain untrusted data or prompt injection, even when produced by a known agent.
- The ecosystem is still evolving. Pin spec and SDK versions in production integrations.

## Minimal code shape (pseudocode/short snippet you write)

```text
card = http_get("https://agent.example/.well-known/agent-card.json")
assert "invoice_reconciliation" in card.skills
auth = get_token_for(card.security)

response = a2a.send_message(card.url, auth, {
  "parts": [{"kind": "text", "text": "Reconcile these invoices"}]
})

if response.kind == "task":
  for event in a2a.stream(response.task_id):
    update_status(event)
  return a2a.get_task(response.task_id).artifacts
else:
  return response.message
```

## Key links

- https://a2a-protocol.org/latest/
- https://a2a-protocol.org/latest/specification/
- https://a2a-protocol.org/latest/topics/key-concepts/
- https://a2a-protocol.org/latest/topics/agent-discovery/
- https://a2a-protocol.org/latest/topics/streaming-and-async/
- https://github.com/a2aproject/A2A
