---
title: MCP Server Lifecycle, Tools, Resources, and Prompts
category: Tool use / MCP
url: https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
license: Apache-2.0 / MIT
verdict: Best for understanding the concrete MCP protocol surface behind a server, not just the high-level acronym.
as_of_date: 2026-06-22
sources:
  - {url: "https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle", license: "Apache-2.0 / MIT", kind: "standard"}
  - {url: "https://modelcontextprotocol.io/specification/2025-11-25/server/tools", license: "Apache-2.0 / MIT", kind: "standard"}
  - {url: "https://modelcontextprotocol.io/specification/2025-11-25/server/resources", license: "Apache-2.0 / MIT", kind: "standard"}
  - {url: "https://modelcontextprotocol.io/specification/2025-11-25/server/prompts", license: "Apache-2.0 / MIT", kind: "standard"}
  - {url: "https://github.com/modelcontextprotocol/modelcontextprotocol", license: "Apache-2.0 / MIT / CC-BY-4.0", kind: "oss_repo"}
---

## What it is

An MCP server is the protocol-facing wrapper around useful capabilities. Its lifecycle starts with initialization and capability negotiation, then moves into listing, reading, calling, progress, cancellation, errors, and optional change notifications. The major server primitives are tools, resources, and prompts.

## Why it exists / when to reach for it

The lifecycle matters because MCP is stateful. A client needs to know which protocol version is in force, which features the server supports, whether tool lists can change, and how to correlate long-running operations. The primitives matter because they mean different things: tools are active operations, resources are context, and prompts are templates. Treating all three as "functions" collapses useful safety boundaries.

Reach for this level of detail when building an MCP server, auditing one, or teaching why an MCP host can do more than send raw HTTP requests.

## The moving parts

- Initialization: client and server exchange versions, capabilities, and implementation metadata.
- Operation phase: client issues protocol methods such as listing tools, calling a tool, reading a resource, or getting a prompt.
- Notifications: either side can send messages that do not require a response, such as initialized or list-changed signals.
- Tools: named operations with descriptions, input schemas, optional output schemas, and annotations.
- Resources: URI-addressed data with names, MIME types, metadata, subscriptions, and read methods.
- Prompts: named templates with optional arguments that return messages for the host to use.
- Utilities: pagination, progress, cancellation, ping, logging, and completion.
- Shutdown: the transport closes after the active interaction is complete or aborted.

## How it works

The client starts by sending `initialize`. The server chooses a compatible version and declares capabilities, such as support for tools, resources, or prompts. The client then sends `notifications/initialized` to mark the connection ready.

For tools, the client calls `tools/list`, chooses a tool under host policy, then sends `tools/call` with validated arguments. For resources, the client lists templates or known resources, then reads content by URI. For prompts, the client asks for a named prompt and supplies arguments so the server can return a set of messages.

Each primitive carries different UX expectations. Tool execution is usually model-initiated and may require approval. Resource reads are passive context injection and should preserve provenance. Prompts are reusable task starters or workflow templates, usually selected by the user or host.

## When to use vs alternatives

Use MCP tools for operations an AI model may decide to invoke during a task. Use resources for context that should be inspected, cited, cached, or selected by the app. Use prompts for repeatable workflows that need consistent instructions or examples.

If the operation is purely internal application code, a local function call is simpler. If the contract is a public REST API for ordinary developers, OpenAPI may be the better primary artifact. If another autonomous agent owns the task lifecycle, A2A is a closer fit.

## Failure modes & gotchas

- Do not grant broad file, database, or SaaS access because a schema looks tidy.
- Tool input schemas validate shape, not intent. The host still decides whether an action is allowed.
- Resource URIs must be validated; never trust paths or schemes sent through the model context.
- A prompt returned by a server is not automatically higher priority than the user's or host's instructions.
- List-changed notifications are easy to ignore; stale tool registries can make hosts call unavailable tools.
- Cancellation and progress are not decoration. Long-running tools need a plan for both.
- Output schemas are helpful, but tool results can still contain hostile text or poisoned data.

## Minimal code shape (pseudocode/short snippet you write)

```text
on initialize(params):
  assert params.protocolVersion is supported
  return {
    protocolVersion: "2025-11-25",
    capabilities: {
      tools: {listChanged: true},
      resources: {subscribe: true},
      prompts: {listChanged: false}
    }
  }

on "tools/call" with name="create_ticket":
  require_user_approval()
  args = validate(input_schema, request.arguments)
  return run_ticket_api(args)
```

## Key links

- https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- https://modelcontextprotocol.io/specification/2025-11-25/server/prompts
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
