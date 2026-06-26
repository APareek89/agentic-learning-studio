---
title: "Public Agent Skill Examples"
category: "Agent Skills"
url: "https://github.com/anthropics/skills"
license: "Apache-2.0; MIT; source-available entries excluded; original synthesis only"
verdict: "allow"
as_of_date: "2026-06-26"
sources:
  - {url: "https://github.com/anthropics/skills", license: "Apache-2.0 examples; source-available document skills excluded", kind: "oss_repo"}
  - {url: "https://github.com/anthropics/claude-cookbooks", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/obra/superpowers", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/garrytan/gstack", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/lackeyjb/playwright-skill", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/conorluddy/ios-simulator-skill", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/sanjay3290/ai-skills", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://github.com/michalparkola/tapestry-skills-for-claude-code", license: "MIT", kind: "oss_repo"}
  - {url: "https://github.com/smerchek/claude-epub-skill", license: "MIT", kind: "oss_repo"}
---

# Public Skill Examples

These examples are summarized at the pattern level. Do not copy their instruction prose into a new skill; use them to learn structure, scoping, and packaging.

## Anthropic Example Skills

Anthropic's public repository shows several Apache-2.0 skills with clean progressive-disclosure patterns:

- `skill-creator`: a meta-skill for interviewing the user, drafting `SKILL.md`, creating tests, running evaluations, and improving the trigger description.
- `mcp-builder`: a workflow skill for designing MCP servers, with scripts and references for TypeScript and Python server patterns.
- `webapp-testing`: a local web testing skill that prefers running helper scripts and Playwright automation instead of loading large script contents into context.
- `frontend-design`, `theme-factory`, `canvas-design`, and `algorithmic-art`: creative skills that show how style rules, design principles, presets, and assets can guide visual work.
- `internal-comms` and `doc-coauthoring`: writing workflow skills that structure context gathering, drafting, refinement, and review.
- `claude-api`: a large reference skill that routes by language and pushes detailed SDK material into subfolders.

Anthropic's `docx`, `pdf`, `pptx`, and `xlsx` implementations are useful evidence that document skills can be powerful, but their repository license is source-available/proprietary. Do not ingest or copy those implementations. For document examples, rely on official docs that list the pre-built document skill capabilities and write original guidance.

## Claude Cookbooks Custom Skills

The MIT-licensed Claude Cookbooks skills show business-oriented custom skills. The financial statement skill focuses on ratio analysis and investment metrics. The brand guideline skill applies colors, typography, and layout standards to outputs. The financial modeling skill demonstrates a bigger workflow with DCF analysis, sensitivity testing, scenario planning, and simulation. These are good examples of domain skills with clear expected outputs and business terminology in the description.

## Superpowers

The MIT-licensed Superpowers suite is a methodology library for agent-assisted development. Its skills are intentionally narrow: `brainstorming`, `writing-plans`, `executing-plans`, `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `receiving-code-review`, `using-git-worktrees`, and others. The key pattern is workflow gating: use one skill before creative work, another before implementation, another before claiming completion. This is a strong model for skills that enforce engineering discipline.

## gstack

The MIT-licensed gstack repository packages many slash-invoked skills around a software factory workflow. Representative skills include `/spec` for turning intent into executable specifications, `/review` for pre-landing review, `/qa` for browser-based quality checks, `/ship` for release flow, `/office-hours` for product interrogation, and `/autoplan` for running multiple review perspectives. The pattern to learn is suite design: many focused skills can feed one another through files and conventions, instead of one enormous skill.

## Expanded Permissive Examples

- Playwright Skill (MIT): packaged as a plugin, with a browser automation skill that detects dev servers, writes temporary scripts, and runs a universal executor.
- iOS Simulator Skill (MIT): uses many small scripts for Xcode builds, simulator lifecycle, accessibility-first navigation, screenshots, and log inspection. It shows the value of low-token structured script output.
- AI Agent Skills by sanjay3290 (Apache-2.0): database, Google Workspace, media, and delegation skills. The Postgres/MySQL/MSSQL skills are notable for read-only guardrails and multiple connection profiles.
- Tapestry Skills (MIT): content extraction and action-planning skills such as `learn-this`, `youtube-transcript`, `article-extractor`, and `ship-learn-next`. This shows orchestration across multiple focused skills.
- Markdown to EPUB (MIT): a document conversion skill with scripts, requirements, tests, and a narrow output contract.

## Pattern Summary

Good public skills tend to be either focused task skills, reference/navigation skills, or orchestration skills. The strongest examples make the trigger unmistakable, keep `SKILL.md` navigational, push details into files, and use scripts for deterministic work.
