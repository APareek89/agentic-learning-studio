---
title: "Installing and Packaging Agent Skills"
category: "Agent Skills"
url: "https://code.claude.com/docs/en/skills"
license: "Official docs; MIT and Apache-2.0 examples; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://code.claude.com/docs/en/skills", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://code.claude.com/docs/en/discover-plugins", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/anthropics/skills", license: "Apache-2.0 examples; source-available document skills excluded", kind: "oss_repo"}
  - {url: "https://github.com/lackeyjb/playwright-skill", license: "MIT", kind: "oss_repo"}
---

# Installation Scopes

Where a skill lives determines who can use it.

- User-level: `~/.claude/skills/<skill-name>/SKILL.md`. Available across the user's projects.
- Project-level: `.claude/skills/<skill-name>/SKILL.md`. Versioned with a repository and available to sessions in that project.
- Nested project-level: a package or subdirectory can define its own `.claude/skills/` for monorepos.
- Plugin-level: a plugin can bundle skills under `skills/<skill-name>/` and expose namespaced commands.
- Enterprise-level: managed by organization settings where supported.

For a single-user custom workflow, user-level is easiest. For a team workflow tied to a codebase, project-level is better. For a reusable distribution that also includes agents, hooks, MCP servers, or multiple skills, use a plugin.

## Manual Install

The manual pattern is to copy or symlink a skill directory into the right skills folder:

```bash
mkdir -p ~/.claude/skills
ln -s /path/to/my-skill ~/.claude/skills/my-skill
```

or for a project:

```bash
mkdir -p .claude/skills
cp -R /path/to/my-skill .claude/skills/my-skill
```

The skill directory must contain `SKILL.md` at its root. Restart may be needed if the top-level skills folder did not exist at session start, but edits to existing watched skill files are usually picked up live.

## Plugin Marketplace Install

Plugins are the easiest packaging route for public or team-distributed skill bundles. The user first adds a marketplace, then installs a named plugin from it:

```text
/plugin marketplace add owner/repo
/plugin install plugin-name@marketplace-name
```

Anthropic's public skills repo, for example, can be added as a marketplace and then specific plugins can be installed from that catalog. Third-party plugin repositories commonly include `.claude-plugin/marketplace.json` plus one or more skill folders.

After installing or changing plugins during a running Claude Code session, run:

```text
/reload-plugins
```

Plugin skills are namespaced, so a skill called `commit` inside a `commit-commands` plugin may be invoked as `/commit-commands:commit`.

## NPM or Package-Manager Install

Some community skill collections use package managers such as `npx skills` or a repository-specific setup script. This can install into several agent hosts, such as Claude Code, Codex, Cursor, Gemini CLI, or Goose. The package manager should still produce a normal skill directory containing `SKILL.md`; treat it as automation around the same filesystem format.

## Zip Upload for Claude.ai or API

For Claude.ai, custom skills are commonly uploaded as zip files. Package the skill folder itself as the root folder inside the zip, not just loose files. For API usage, upload and manage custom skills through the Skills API, then reference the skill ID in the request container where supported.

## Packaging Checklist

- Directory name and `name` are stable and kebab-case where required.
- `description` contains trigger phrases.
- License file is present for redistributable skills.
- Support files are referenced from `SKILL.md`.
- Scripts have setup instructions and `--help` where practical.
- Side-effecting skills are manual-only or require explicit confirmation.
- README explains install, invoke, dependencies, and trust expectations.
