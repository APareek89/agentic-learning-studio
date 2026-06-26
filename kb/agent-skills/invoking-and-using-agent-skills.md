---
title: "Invoking and Using Agent Skills"
category: "Agent Skills"
url: "https://code.claude.com/docs/en/skills"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://code.claude.com/docs/en/skills", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://platform.claude.com/docs/en/build-with-claude/skills-guide", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://support.claude.com/en/articles/12512180-use-skills-in-claude", license: "Official help center; original synthesis only", kind: "official_docs"}
---

# How Skills Are Invoked

Skills can be used in two main ways: automatically by description matching, or manually by slash command. The best skill authoring flow supports both, unless the workflow is too risky to let the model start on its own.

## Automatic Triggering

Automatic triggering depends on the description. At session start, the agent sees skill names and descriptions. If the user's request matches, the agent loads `SKILL.md` and follows the instructions. This is why the description should include realistic words users say:

- "test this login flow"
- "turn this article into an action plan"
- "query Postgres read-only"
- "convert markdown to EPUB"
- "write a PR review"

If a skill does not trigger, first check whether the skill is available, then improve the description with clearer terms. If it triggers too often, make the description narrower or add a manual-only field where the host supports it.

## Slash Invocation

In Claude Code, skills can appear in the slash menu. The command name usually comes from the directory or plugin namespace:

- `~/.claude/skills/review/SKILL.md` becomes `/review`.
- `.claude/skills/deploy-staging/SKILL.md` becomes `/deploy-staging`.
- `my-plugin/skills/review/SKILL.md` becomes `/my-plugin:review`.

Manual invocation is useful when the user wants control over timing, such as deployment, commits, external messages, or account changes. For side-effecting workflows, prefer manual invocation plus an explicit confirmation step.

## Arguments

Some hosts support argument hints and substitutions. A skill can accept freeform arguments or named positions:

```yaml
---
name: summarize-issue
description: Summarize a GitHub issue and suggest next steps.
argument-hint: "[issue-url]"
arguments: [issue_url]
---

Read $issue_url and produce a summary, risk list, and proposed owner.
```

When a user invokes `/summarize-issue https://...`, the skill content receives the argument. Keep arguments optional where possible, because users often invoke skills conversationally rather than like shell commands.

## API Usage

In the Claude API, skills are specified in the request container. Built-in Anthropic skills use short IDs such as document skills; custom skills use uploaded IDs. API usage also requires the correct beta headers and code execution tool support where applicable. Pin versions for stable production behavior and use `latest` only when you are comfortable accepting updates.

## What Users Should See

A good skill should feel like a specialized assistant waking up at the right moment. The user should not need to know the internals. They should be able to say:

- "Use the PDF skill to extract form fields."
- "Run `/webapp-testing` on my local app."
- "Make this article actionable."
- "Create a skill for my weekly analytics report."

The agent should load the relevant instructions, ask for missing inputs, run or read support files as needed, and return the promised output with verification status.

## Troubleshooting

- Skill absent: confirm it is in the correct directory or plugin scope.
- Skill not auto-triggering: strengthen description with user phrasing and task nouns.
- Skill auto-triggering too often: narrow the description or disable model invocation.
- Support file ignored: add a prominent pointer in `SKILL.md` that says when to read it.
- Script failures: add setup checks, dependency messages, and small test commands.
