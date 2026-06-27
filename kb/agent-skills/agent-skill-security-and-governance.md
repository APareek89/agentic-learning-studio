---
title: "Agent Skill Security and Governance"
category: "Agent Skills"
url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview"
license: "Official docs; MIT and Apache-2.0 examples; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://code.claude.com/docs/en/discover-plugins", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://arxiv.org/abs/2606.16287", license: "Research paper; facts only", kind: "paper"}
  - {url: "https://arxiv.org/abs/2603.16572", license: "Research paper; facts only", kind: "paper"}
  - {url: "https://github.com/sanjay3290/ai-skills", license: "Apache-2.0", kind: "oss_repo"}
---

# Security Model

Treat a skill like software plus instructions. It can influence what the agent reads, writes, executes, installs, or sends to external systems. A malicious or careless skill can cause tool misuse, data exposure, credential leakage, destructive commands, or dependency confusion.

## Trust Before Install

Before installing a third-party skill:

- Check the license and repository owner.
- Read `SKILL.md` and every referenced script.
- Look for unexpected network calls, shell commands, credential handling, or file access.
- Confirm whether dependencies are pinned and maintained.
- Prefer official, organization-managed, or permissively licensed sources.
- Avoid unknown, restrictive, or copied skills with unclear provenance.

For plugin marketplace installs, review what the plugin contributes: skills, agents, hooks, MCP servers, and other configuration. A plugin can add more than one skill.

## Keep Secrets Out of Skills

Never hardcode API keys, passwords, tokens, private URLs, or customer data in `SKILL.md`, references, or example config. Use environment variables, host keychains, managed settings, or MCP auth flows. If a skill needs credentials, include setup instructions and a status check, not the secret itself.

## Control Side Effects

Side-effecting skills should not auto-trigger casually. Use manual invocation, explicit confirmation, dry-run modes, and narrow tool permissions. Examples:

- Deployment skills should require `/deploy` or `/ship`.
- Email, Slack, CRM, or issue-creation skills should preview before sending.
- Database skills should default to read-only and block writes unless the user explicitly requested a safe write path.
- File deletion or migration skills should show planned changes first.

## Script Safety

Scripts should be small, auditable, and predictable. Add:

- `--help` output.
- Input validation.
- Clear error messages.
- Machine-readable output where useful.
- No hidden remote fetch unless documented.
- No automatic package install without user consent for risky environments.

If a script exists to perform a deterministic operation, tell the agent to run it rather than read or rewrite it. If the script encodes domain logic the agent must understand, explicitly say to read it as reference.

## Governance for Teams

Teams should maintain an allowlist of approved skill sources, pin versions for critical workflows, and review changes before rollout. For project skills, keep them in git and review them like code. For plugins, pin to trusted marketplaces or commit SHAs where possible, and document who owns updates.

## Common Security Pitfalls

- Installing skills from unknown marketplaces without reading scripts.
- Letting a skill fetch untrusted external content and treat it as instructions.
- Giving broad shell or network permissions to a vague skill.
- Using copied proprietary or source-available skill implementations.
- Forgetting that support files can carry prompt injection just like `SKILL.md`.
- Allowing auto-triggered skills to perform irreversible work.

The safe default for Wizbit is to generate skills that are explicit, reviewable, dry-run friendly, and least-privilege. If the user asks for a risky workflow, make the skill manual-only and require confirmation at the point of action.
