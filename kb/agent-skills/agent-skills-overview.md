---
title: "Agent Skills Overview and When to Use Them"
category: "Agent Skills"
url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://code.claude.com/docs/en/skills", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://agentskills.io/specification", license: "Official specification; original synthesis only", kind: "standard"}
---

# Agent Skills Overview

An Agent Skill is a small filesystem package that teaches an AI agent how to perform a recurring class of work. The minimal package is a directory with `SKILL.md`; mature packages also include scripts, reference files, templates, examples, or assets. The skill does not replace the base model. It gives the model a reusable playbook, plus optional tools and source material, for a task that benefits from consistency.

Use a skill when a user or team repeatedly pastes the same instructions, checklist, examples, brand rules, domain process, or operational procedure into chat. Good candidates include document workflows, code review processes, web app testing recipes, database query safety rules, product planning rituals, and domain-specific output formats.

## How Skills Load

Skills are designed around progressive disclosure. At startup, the agent sees lightweight discovery metadata, especially the description that says what the skill does and when to use it. When the current task matches that metadata, the agent loads the `SKILL.md` body. If the skill points to support files, the agent reads or executes only the files needed for that task.

This matters because a skill can bundle far more knowledge than should sit in the conversation all the time. Put the decision guide in `SKILL.md`, then keep long API references, templates, or scripts in separate files. The skill stays discoverable without turning every session into a large prompt.

## When Not to Use a Skill

Do not create a skill for one-off instructions, static facts that belong in project memory, or a tool connection problem that should be solved with MCP. A skill is best for behavior: how to decide, what sequence to follow, what to verify, what output to produce, and which references or scripts to consult.

Avoid skills that are too broad, such as "do engineering better." Split them into precise workflows: "write a migration plan," "review a PR," "test a local web app," or "convert markdown to EPUB." Smaller skills trigger more reliably and are easier to audit.

## Typical Lifecycle

1. Author the skill around one task family.
2. Install it at user, project, enterprise, or plugin scope.
3. Invoke it manually with `/skill-name` or let the agent trigger it automatically from the description.
4. Observe whether it loads at the right time and produces the expected behavior.
5. Tighten the description, instructions, support files, or scripts based on real usage.

## User Outcome

For Wizbit, the key message is simple: a skill turns "I know how I want the agent to work" into a portable package the agent can install and reuse. The user should leave the authoring flow with a named folder, a valid `SKILL.md`, a clear trigger description, and a tested way to invoke the result.
