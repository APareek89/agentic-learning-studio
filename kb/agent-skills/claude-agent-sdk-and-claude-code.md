---
title: "Building Agents with the Claude Agent SDK and Claude Code"
category: "Agent Skills"
url: "https://docs.claude.com/en/api/agent-sdk/overview"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-07-14"
sources:
  - {url: "https://docs.claude.com/en/api/agent-sdk/overview", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://code.claude.com/docs/en/sdk", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/anthropics/claude-agent-sdk-python", license: "MIT", kind: "oss_repo"}
---

## What it is

The Claude Agent SDK (formerly the Claude Code SDK) is the programmatic harness that powers Claude Code, exposed as a library so you can build your own agents on the same loop. It gives you an agent that plans, calls tools, reads and edits files, runs commands, and iterates toward a goal — with the context-gathering, permissioning, and tool orchestration handled for you. Claude Code is the terminal/IDE product built on it; the SDK (`claude-agent-sdk` in Python, `@anthropic-ai/claude-agent-sdk` in TypeScript) is the same engine for your own apps. Agent Skills are the packaged, reusable playbooks the agent can load into that loop.

## Why it exists / when to reach for it

Writing an agent loop by hand means re-implementing tool dispatch, file access, shell execution, context compaction, and permission prompts — and getting all of them safe. Reach for the Agent SDK when you want a coding-capable or tool-using agent (a support bot that edits config, a migration agent, a research agent) without rebuilding that machinery, and when you want it to behave like Claude Code: gather its own context, use tools in a loop, and stop when the task is done.

## The moving parts

- The query/loop entry point: you pass a prompt (and options); the SDK runs the multi-turn agent loop until completion.
- Built-in tools: file read/write/edit, bash/command execution, search, and web fetch — gated by a permission mode.
- Custom tools: your own functions exposed to the agent (often via MCP servers), so it can hit your APIs and data.
- Agent Skills: `SKILL.md`-based folders the agent discovers and loads on demand for recurring tasks (progressive disclosure keeps them cheap).
- Permission modes / hooks: control what the agent may do (ask, allow-listed, or autonomous) and intercept tool calls.
- System prompt + subagents: shape behavior and fan work out to scoped helper agents.

## How it works

You call the SDK with a task and a set of allowed tools. The agent decides what context it needs, calls tools to get it (read files, run a query, search the web), acts (edit a file, call your API), observes the result, and loops — compacting context as it goes — until it reports done or hits a stop condition. You constrain it with a permission mode (interactive prompts for a human-in-the-loop app; allow-listed tools for autonomous jobs) and with hooks that can veto or log tool calls. Skills and MCP servers extend *what* it can do without changing the loop; the system prompt and subagents shape *how* it does it.

## When to use vs alternatives

Use the Agent SDK when you want Claude's own agent loop plus file/shell/tool capability out of the box, especially for coding-shaped or ops tasks. Use a framework like LangGraph when you need an explicit, inspectable state machine you fully own, or must mix providers. Use raw tool-calling on the Messages API when your agent is a simple single-tool loop and you don't need file/shell access. The three compose: an SDK agent can call MCP tools that a framework also uses.

## Failure modes & gotchas

- Over-broad permissions: autonomous file/shell access is powerful — scope tools and use an allow-list or hooks in production, never blanket "auto".
- Confusing the products: Claude Code (the app) vs the Agent SDK (the library) vs Agent Skills (loadable playbooks) vs MCP (how tools connect) — they layer, they aren't alternatives.
- Skill sprawl: too many always-on skills bloat context; rely on progressive disclosure so only the relevant `SKILL.md` loads.
- Treating it as a chat API: it's an agent loop that takes turns and uses tools — budget for multiple tool round-trips, not one response.
- Runaway loops: set stop conditions / max turns so a stuck task can't spin.

## Minimal code shape (what you write)

```python
from claude_agent_sdk import query, ClaudeAgentOptions

async for msg in query(
    prompt="Triage the failing test in tests/test_auth.py and propose a fix.",
    options=ClaudeAgentOptions(
        allowed_tools=["Read", "Edit", "Bash"],
        permission_mode="acceptEdits",   # or "default" (ask) for human-in-the-loop
    ),
):
    print(msg)   # streamed turns: tool calls, results, and the final answer
```

## Key links

- Claude Agent SDK overview — https://docs.claude.com/en/api/agent-sdk/overview
- Claude Code SDK docs — https://code.claude.com/docs/en/sdk
- Python SDK — https://github.com/anthropics/claude-agent-sdk-python
