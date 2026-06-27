---
title: "Skill vs MCP vs Slash Command"
category: "Agent Skills"
url: "https://code.claude.com/docs/en/skills"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://code.claude.com/docs/en/skills", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://modelcontextprotocol.io/specification/latest", license: "Apache-2.0 / MIT", kind: "standard"}
  - {url: "https://github.com/anthropics/skills/tree/main/skills/mcp-builder", license: "Apache-2.0", kind: "oss_repo"}
---

# Skill vs MCP vs Slash Command

Skills, MCP servers, tools, slash commands, and plugins solve different layers of the agent stack. Pick the smallest layer that matches the problem.

## Skill

A skill is procedural knowledge packaged as files. It answers: "How should the agent do this kind of work?" It can include instructions, checklists, reference files, scripts, examples, templates, and safety rules.

Use a skill for:

- Repeatable workflows.
- Domain style guides or policies.
- Task-specific verification.
- Tool orchestration recipes.
- Output formats and examples.

Example: a "webapp-testing" skill tells the agent how to detect a dev server, write a Playwright script, inspect the DOM after waiting for JavaScript, capture screenshots, and report failures.

## MCP

MCP is a protocol for connecting agents to external systems through tools, resources, and prompts. It answers: "What actions or data can the agent access?" An MCP server handles transport, authentication, tool schemas, resources, and responses.

Use MCP for:

- Connecting to SaaS systems, databases, internal APIs, or local services.
- Exposing tool functions with structured inputs.
- Providing resources or prompts from a service.
- Managing auth and permissions outside the skill.

Example: a Jira MCP server exposes `search_issues` and `create_issue`; a Jira skill explains the team's triage workflow, fields to fill, escalation rules, and how to summarize a sprint.

## Slash Command

A slash command is a user-invoked entrypoint. In Claude Code, custom commands and skills have converged: a skill can be invoked with `/skill-name`, and older `.claude/commands/*.md` files still work. The important distinction is intent. Slash invocation is about manual control; skills also support automatic discovery from the description and supporting files.

Use manual slash invocation for:

- Workflows with side effects.
- Commands where timing matters.
- Operations the user wants to start explicitly.
- A clean shortcut around a skill's larger instructions.

Example: `/ship` starts a release workflow only when the user chooses to ship.

## Plugin

A plugin is packaging. It can bundle skills, commands, agents, hooks, MCP servers, LSP servers, and other configuration. It answers: "How do I distribute and install a set of agent customizations?"

Use a plugin when:

- A suite contains multiple skills or agents.
- Setup requires hooks, MCP config, or dependencies.
- A team wants marketplace install and updates.
- Namespacing avoids conflicts with local skills.

## Decision Guide

- Need the agent to follow a recurring process? Create a skill.
- Need the agent to access an external system? Build or install MCP.
- Need the user to start a workflow explicitly? Make the skill user-invocable or add a command.
- Need to distribute a bundle? Package it as a plugin.
- Need all of the above? Use MCP for access, skills for behavior, slash commands for user control, and a plugin for packaging.

For Wizbit's author-install-use flow, the user-facing artifact is usually a skill. If the task needs live system access, Wizbit should suggest pairing the skill with an MCP server or an existing integration rather than stuffing credentials and API calls into the skill body.
