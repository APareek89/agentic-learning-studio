---
title: "Wizbit Agent Skill Author Install Use Flow"
category: "Agent Skills"
url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview"
license: "Official docs; original product synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://code.claude.com/docs/en/skills", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://support.claude.com/en/articles/12512198-how-to-create-custom-skills", license: "Official help center; original synthesis only", kind: "official_docs"}
---

# Wizbit Flow: Author, Install, Use

Wizbit's skill feature should guide the user from task intent to a working installed skill. The best flow is not "generate a markdown file." It is a loop that makes the skill useful in the target agent.

## 1. Author

Collect the task:

- What recurring work should the agent do?
- What inputs will the user provide?
- What output should exist when done?
- Which phrases should trigger the skill?
- Which systems, files, or tools are involved?
- What should never happen without confirmation?

Then generate:

- A kebab-case skill directory name.
- `SKILL.md` with frontmatter and concise instructions.
- Optional `references/` files for long policies, examples, or API details.
- Optional `scripts/` files for deterministic checks or transformations.
- Optional `assets/` files for templates.
- A small test plan with positive, negative, and edge prompts.

Use the description as the most important field. It should be specific enough for automatic triggering and readable enough for a user browsing installed skills.

## 2. Install

Choose installation based on scope:

- Personal workflow: install to `~/.claude/skills/<skill-name>/`.
- Project workflow: install to `.claude/skills/<skill-name>/` and commit it.
- Shareable bundle: package as a plugin with `.claude-plugin/marketplace.json`.
- Claude.ai upload: zip the skill folder with the folder as the zip root.
- API use: upload the skill through the Skills API and reference its ID in the request container.

After installation, verify the host can see it. In Claude Code, ask what skills are available or invoke `/skill-name`. For plugin installs, use the plugin manager and reload plugins after changes.

## 3. Use

The first use should be low risk:

- Invoke manually with `/skill-name` and a small sample.
- Try a natural-language prompt that should auto-trigger.
- Check that the agent reads only needed references.
- Confirm scripts run and produce understandable output.
- Verify the final artifact against the output contract.

If the skill should not run automatically, set a manual-only field where supported and state in the instructions that the agent must ask before side effects.

## 4. Improve

Capture observations from first use:

- Did the skill trigger?
- Did it trigger when it should not?
- Did it follow the correct sequence?
- Did it skip a required check?
- Did it ask for missing information?
- Did it use support files efficiently?

Revise the description first for trigger problems. Revise the body for workflow problems. Add scripts only when a repeated step needs reliability.

## Wizbit Retrieval Targets

When a user asks "make a skill for my task," retrieve authoring and `SKILL.md` format docs. When they ask "how do I install it," retrieve install/package docs. When they ask "why didn't it trigger," retrieve invocation and testing docs. When they ask "should this be MCP," retrieve the Skill vs MCP doc. When they ask "show examples," retrieve public examples.
