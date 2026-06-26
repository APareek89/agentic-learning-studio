---
title: "SKILL.md Format and Progressive Disclosure"
category: "Agent Skills"
url: "https://agentskills.io/specification"
license: "Official specification; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://agentskills.io/specification", license: "Official specification; original synthesis only", kind: "standard"}
  - {url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://code.claude.com/docs/en/skills", license: "Official docs; original synthesis only", kind: "official_docs"}
---

# SKILL.md Format

A skill is a directory. If you are asking how to write a SKILL.md, start with YAML frontmatter followed by Markdown instructions. The portable Agent Skills standard requires `name` and `description`; Claude Code can also infer a command name from the directory and supports extra fields for invocation, arguments, tools, paths, and execution context.

Minimal portable shape:

```markdown
---
name: invoice-organizer
description: Organize invoices and receipts for tax preparation. Use when the user asks to classify, rename, summarize, or file invoice documents.
---

# Invoice Organizer

Follow this workflow:
1. Identify all invoice files.
2. Extract vendor, date, amount, tax, and category.
3. Rename files consistently.
4. Produce a summary table and list anything uncertain.
```

## Required Fields

For the common question "what frontmatter does a skill need?", the minimal portable answer is `name` and `description`.

`name` is the stable skill identifier in the portable spec. Use lowercase letters, numbers, and hyphens. Keep it short and make it match the directory name when possible.

`description` is the trigger. It should say what the skill does and when to use it, using natural phrases a user might actually say. A weak description says "helps with invoices." A strong description says "Organize invoices and receipts for tax preparation. Use when the user asks to classify receipts, rename invoice files, extract totals, or prepare expense summaries."

## Useful Optional Fields

Some hosts support more fields. Common ones include:

- `license`: SPDX name or pointer to a bundled license file.
- `compatibility`: environment requirements such as Claude Code, macOS, Python, or network access.
- `allowed-tools`: tools the skill may use without repeated approval, where the host supports it.
- `argument-hint` and `arguments`: hints and named placeholders for slash-command usage.
- `disable-model-invocation`: manual-only invocation for workflows with side effects.
- `user-invocable`: hide a background knowledge skill from the slash menu.

Treat host-specific fields as progressive enhancement. Keep `name`, `description`, and the instruction body useful even in hosts that ignore extras.

## Directory Layout

A practical layout is:

```text
my-skill/
  SKILL.md
  references/
    api-guide.md
    examples.md
  scripts/
    validate.py
  assets/
    template.docx
```

Use `references/` for long guidance the agent should read only when needed. Use `scripts/` for repeatable, deterministic work such as validation, extraction, conversion, or test execution. Use `assets/` for templates, schemas, images, fonts, or other files consumed by the workflow.

## Progressive Disclosure

Design for three levels:

1. Metadata: the agent sees the name and description while deciding whether the skill applies.
2. Main instructions: the agent loads `SKILL.md` after activation, so keep it concise and navigational.
3. Support files: the agent reads references or runs scripts only when the current task requires them.

The main file should tell the agent which support files exist and when to use each one. Avoid deep chains where `SKILL.md` points to a reference that points to another reference. One clear hop is easier for agents to follow.
