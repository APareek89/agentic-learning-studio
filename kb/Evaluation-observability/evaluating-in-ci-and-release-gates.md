---
title: "Evaluating LLM Apps in CI and Release Gates"
category: "Evaluation & observability"
url: "https://www.promptfoo.dev/docs/integrations/ci-cd/"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-07-14"
sources:
  - {url: "https://www.promptfoo.dev/docs/integrations/ci-cd/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/openai/evals", license: "MIT with dataset-specific exceptions", kind: "oss_repo"}
  - {url: "https://docs.confident-ai.com/docs/getting-started", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Evaluating in CI means running an automated eval suite on every change that can alter model behavior — a prompt edit, a model or version bump, a retrieval-corpus rebuild, a tool change, or a routing rule — and turning the result into a pass/fail gate that blocks a merge or a deploy. It is the operational half of LLM evaluation: offline evals define *what good looks like*; CI gating makes that definition *enforceable* so a regression cannot ship silently.

## Why it exists / when to reach for it

LLM apps regress in ways unit tests never catch: a prompt tweak that helps one intent quietly breaks another, a model upgrade that raises average quality but fails a safety slice, a KB rebuild that drops citation coverage. Manual spot-checks miss these because the failure is distributional, not a crash. Reach for CI evals once a workflow serves real users, the moment you have more than one person editing prompts, or as soon as "it felt fine in the demo" stops being an acceptable release bar.

## The moving parts

- Eval dataset: a versioned set of representative cases (input, fixtures, expected properties, and why the case matters), checked into the repo next to the code.
- Runner: invokes the *real* app path (retrieval + tools), not a simplified prompt.
- Scorers: deterministic assertions (JSON-valid, contains-citation, no-PII), reference comparisons, and model-graded rubrics (LLM-as-judge) for softer qualities.
- Thresholds: hard rules for critical cases plus an allowed-movement band on aggregate scores versus a stored baseline.
- Baseline: the last accepted run, so the gate measures *delta*, not just an absolute.
- Report artifact: a per-case diff the reviewer reads on a failed check.

## How it works

Wire the suite as a CI job (GitHub Actions, GitLab CI, etc.) triggered on pull requests that touch prompts, agent code, or KB config. The job runs the candidate against every case, scores it, compares to the baseline, and exits non-zero when a critical case fails or aggregate quality drops past the band. Keep judge calls cheap and few — a small, high-signal set beats a giant flaky one. Cache embeddings and fixtures so the job stays fast. Promote failing production traces and user corrections into the dataset over time, so the gate hardens against the failures you actually see.

Treat the gate as a diagnostic, not a leaderboard: a candidate that improves the average but fails a grounding or safety slice must not merge. When a case fails because the *expected* answer went stale, update the dataset with a note — never quietly lower the threshold to make the build green.

## When to use vs alternatives

CI evals catch regressions before release; online scoring and observability catch what leaks through. Use CI gating for anything with a repeatable expected property; use human review for genuinely subjective quality and for building new cases. Canary/shadow deploys complement (not replace) the gate for changes whose effect only shows at real traffic.

## Failure modes & gotchas

- Non-deterministic judges make the gate flaky → pin the judge model+prompt, average a few samples, or prefer deterministic scorers for gate-critical cases.
- Testing a simplified prompt instead of the real retrieval/tool path → the gate passes while production fails.
- Threshold drift: silently loosening the band each time it fails defeats the purpose.
- Cost/time creep: a huge suite on every PR stalls developers → keep a fast "gate" subset and run the full suite nightly.
- Baseline rot: no stored baseline means you can only assert absolutes, missing slow regressions.

## Minimal code shape (what you write)

```yaml
# .github/workflows/evals.yml
on: { pull_request: { paths: ["prompts/**", "agent/**", "kb/**"] } }
jobs:
  evals:
    steps:
      - run: npx promptfoo eval -c evals/gate.yaml --share=false
      # promptfoo exits non-zero when an assertion fails → PR blocked
```

```yaml
# evals/gate.yaml
prompts: [file://prompts/support.txt]
providers: [anthropic:claude-sonnet-4-6]
tests:
  - vars: { q: "reset my password" }
    assert:
      - { type: contains, value: "reset link" }
      - { type: llm-rubric, value: "answer is grounded in the docs, no invented policy" }
```

## Key links

- promptfoo CI/CD integration — https://www.promptfoo.dev/docs/integrations/ci-cd/
- OpenAI Evals — https://github.com/openai/evals
- DeepEval (pytest-style LLM evals) — https://docs.confident-ai.com/
