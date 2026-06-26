---
title: "Authoring Agent Skills for a Task"
category: "Agent Skills"
url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices"
license: "Official docs; Apache-2.0 examples; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://support.claude.com/en/articles/12512198-how-to-create-custom-skills", license: "Official help center; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/anthropics/skills/tree/main/skills/skill-creator", license: "Apache-2.0", kind: "oss_repo"}
---

# Authoring Workflow

Start from the task, not the file format. A good skill captures a repeatable behavior: the trigger, the steps, the decisions, the expected output, and the checks that prove the work is done.

## 1. Capture Intent

Ask what the user wants the agent to do, when the skill should trigger, and what output should exist at the end. If the current chat already contains a successful workflow, mine it for the exact sequence: tools used, file types touched, corrections the user made, final format, and verification commands.

Write down:

- Task family: what recurring job this skill handles.
- Trigger phrases: natural user wording that should activate it.
- Inputs: files, URLs, project state, credentials, or context needed.
- Output contract: document, code patch, report, table, PR, artifact, or decision.
- Verification: tests, screenshots, lint, review checklist, or human approval point.

## 2. Write the Description First

The description is the discovery surface. Put the high-signal trigger terms there, not buried later in the body. Include both capability and timing:

```yaml
description: Audit a local web app with Playwright. Use when the user asks to test a UI, verify a flow, inspect console errors, capture screenshots, or check responsive behavior.
```

If a skill under-triggers, add phrases the user actually used. If it over-triggers, narrow the description or make it manual-only.

## 3. Keep SKILL.md Tight

The body should be the operational guide. Prefer imperative steps over essays. Include the critical order of operations, decision points, output format, and verification rule. Skip background knowledge the model already knows unless it is domain-specific.

Use support files when content would distract from the main workflow:

- Put API tables, policy text, templates, and long examples in `references/`.
- Put reliable transformations and validations in `scripts/`.
- Put reusable output files in `assets/`.

## 4. Add Scripts Only When They Reduce Risk

Scripts are valuable when a step must be repeatable or exact: parse a file, validate JSON, inspect a browser, convert a document, run a query guard, or summarize a large log. Give every script a help mode, clear errors, and predictable output. Tell the agent whether to execute the script or read it as reference.

## 5. Test With Real Prompts

Create a small test set:

- Direct invocation: `/skill-name sample args`.
- Natural trigger: "Can you review my diff for risky changes?"
- Boundary case: a similar request that should not trigger.
- Missing dependency case: no file, no URL, no credentials, or no server running.

Observe the agent behavior, not just whether the file parses. Did it load the right support file? Did it skip a required check? Did it ask a useful question when blocked? Revise based on those observations.

## Common Mistakes

- Vague description with no trigger phrases.
- One giant skill for multiple unrelated workflows.
- Long `SKILL.md` that should be split into references.
- Scripts with hidden dependencies or no error messages.
- Instructions that allow side effects without explicit user control.
- No negative examples, causing the skill to trigger too often.
