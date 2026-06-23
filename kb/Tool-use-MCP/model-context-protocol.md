---
title: Model Context Protocol (MCP)
category: Tool use / MCP
url: https://modelcontextprotocol.io/docs/getting-started/intro
license: CC-BY-4.0 / Apache-2.0 / MIT
verdict: Best when an AI product needs reusable, host-neutral access to tools, resources, and prompt templates.
as_of_date: 2026-06-22
sources:
  - {url: "https://modelcontextprotocol.io/docs/getting-started/intro", license: "CC-BY-4.0", kind: "official_docs"}
  - {url: "https://modelcontextprotocol.io/specification/2025-11-25/architecture", license: "Apache-2.0 / MIT", kind: "standard"}
  - {url: "https://github.com/modelcontextprotocol/modelcontextprotocol", license: "Apache-2.0 / MIT / CC-BY-4.0", kind: "oss_repo"}
  - {url: "https://github.com/modelcontextprotocol/typescript-sdk", license: "Apache-2.0 / MIT / CC-BY-4.0", kind: "oss_repo"}
  - {url: "https://github.com/modelcontextprotocol/python-sdk", license: "MIT", kind: "oss_repo"}
---

## What it is

Model Context Protocol is a standard way for AI applications to connect to external capabilities. It defines a client-server protocol: an AI host runs MCP clients, and those clients connect to MCP servers that expose tools, resources, prompts, and optional client-side features such as roots, sampling, and elicitation.

MCP is not an agent framework. It does not decide plans, maintain memory, or choose a model. It gives the host a predictable way to discover and call external context providers while preserving a clear boundary between model reasoning and real-world operations.

## Why it exists / when to reach for it

Without a protocol, every host-tool integration becomes a custom adapter: one shape for a code editor, another for a chat app, another for an internal agent runtime. MCP targets that integration tax. A server that wraps GitHub, a database, a design system, or an internal workflow can be reused across compatible hosts without each host learning the underlying service directly.

Reach for MCP when tool access must travel across products or teams, when local and remote tools need a common shape, or when you want host-controlled permissions around actions. For a one-off backend endpoint inside a single app, a direct SDK call is often simpler.

## The moving parts

- Host: the AI application the user interacts with.
- Client: the protocol participant managed by the host for one MCP server connection.
- Server: the process or remote endpoint that exposes capabilities.
- Tools: callable operations, usually model-selected, that can have side effects.
- Resources: readable context identified by URIs, often selected by the app or user.
- Prompts: reusable message templates that help structure a task.
- Transports: stdio for local servers and streamable HTTP for remote servers.
- Authorization layer: especially important for remote servers, where OAuth or other HTTP auth patterns may apply.

## How it works

The client opens a transport connection and sends an initialization request with its protocol version and capabilities. The server replies with its version, metadata, and supported features. After an initialized notification, the client can list available tools, resources, and prompts, then call or read the ones the host decides to use.

The data layer uses JSON-RPC-style request, response, notification, and error messages. The transport layer determines how those messages move: local stdio is useful for desktop-style integrations, while streamable HTTP supports network services and streaming responses.

In a typical agent loop, the host asks the model what to do, the model proposes a tool call, the host checks policy and user consent, the client sends the call to the MCP server, and the returned content is placed back into model context. Tool results and resource contents must be treated as untrusted input.

## When to use vs alternatives

Use MCP instead of provider-native function calling when the same capability should work across hosts or model providers. Use provider-native tools when you only target one API and want the smallest possible surface. Use OpenAPI or a direct SDK when the consumer is ordinary application code, not an AI host negotiating tools and context at runtime.

MCP also complements A2A. MCP is primarily agent-to-tool and app-to-context plumbing; A2A is for one agent service to discover and delegate work to another agent service.

## Failure modes & gotchas

- A server schema is not a permission model. The host still needs approval, scoping, auditing, and revocation.
- Resources can carry prompt injection. Label provenance and keep data separate from instructions.
- Local stdio servers can break if application logs are written to stdout instead of stderr.
- Protocol versions matter. Pin and test against the stable version your host supports.
- Remote servers need normal web hardening: TLS, auth, rate limits, tenant isolation, and careful token handling.
- Tool descriptions shape model behavior. Vague names or broad tools lead to over-calling and hard-to-debug actions.

## Minimal code shape (pseudocode/short snippet you write)

```text
host starts client for "kb_server"
client.initialize(protocol_version="2025-11-25", capabilities={})

available = client.request("tools/list")
if policy.allows("search_kb") and model_selects("search_kb"):
  result = client.request("tools/call", {
    "name": "search_kb",
    "arguments": {"query": user_question}
  })
  conversation.add_tool_result(result.content, provenance="kb_server")
```

## Key links

- https://modelcontextprotocol.io/docs/getting-started/intro
- https://modelcontextprotocol.io/specification/2025-11-25/architecture
- https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- https://github.com/modelcontextprotocol/modelcontextprotocol
- https://github.com/modelcontextprotocol/typescript-sdk
- https://github.com/modelcontextprotocol/python-sdk
