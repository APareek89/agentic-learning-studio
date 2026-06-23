---
title: LLM-as-Judge
category: "Evaluation & observability"
url: https://www.braintrust.dev/docs/evaluate/write-scorers
license: Official docs; original synthesis only
verdict: ""
as_of_date: 2026-06-22
sources:
  - {url: "https://www.braintrust.dev/docs/evaluate/write-scorers", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://www.braintrust.dev/docs/reference/autoevals", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/braintrustdata/braintrust-sdk", license: "Apache-2.0", kind: "oss_repo"}
  - {url: "https://deepeval.com/docs/metrics-llm-evals", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://github.com/confident-ai/deepeval", license: "Apache-2.0", kind: "oss_repo"}
---

## What it is

LLM-as-judge uses a model as an evaluator for another model's output. Instead of matching a single reference string, the judge reads the input, output, context, and rubric, then returns a score, label, or structured critique. It is useful when the target quality is hard to encode as a deterministic assertion, such as helpfulness, faithfulness, tone, completeness, or whether an explanation fits a learner's level.

## Why it exists / when to reach for it

Many LLM product requirements are semantic. A lesson can be valid JSON and still be vague, ungrounded, too advanced, or overconfident. Human review is the gold standard for ambiguous judgments, but it is slow and inconsistent at release-gate scale. LLM judges give teams a repeatable first-pass signal, especially when they are calibrated against human labels and paired with deterministic checks.

## The moving parts

- Rubric: concise scoring criteria with examples of good, borderline, and failing outputs.
- Evidence: source passages, retrieved chunks, tool results, or reference facts the judge may use.
- Judge prompt: instructions that isolate the evaluation task from the generation task.
- Output schema: numeric score, categorical label, pass/fail, and a short reason.
- Calibration set: human-labeled examples used to tune thresholds and catch bias.
- Stability controls: fixed model version where possible, low temperature, retries, and drift monitoring.
- Audit trail: stored inputs, scores, rationales, and judge model metadata.

## How it works

Define a narrow question for the judge. "Is this answer grounded in the supplied sources?" is easier to validate than "Is this answer good?" Pass only the information needed for that decision. Ask for structured output so downstream code can compare scores and route failures. Periodically sample judge decisions for human review and measure agreement.

For agentic systems, judge both the final answer and the path. A final response may look helpful even if the agent used the wrong tool, ignored a safer source, or invented a hidden intermediate fact. Add separate judge tasks for groundedness, task completion, pedagogical fit, and tool-plan quality instead of asking one judge to score everything at once.

## When to use vs alternatives

Use deterministic checks for syntax, required fields, citation count, exact labels, tool argument validity, and policy allow/deny lists. Use embedding or string similarity for narrow reference comparisons. Use LLM judges for semantic evaluation where multiple good answers exist. Use human review for high-stakes content, novel rubrics, disputed judge behavior, and final adjudication of important failures.

## Failure modes & gotchas

- Judges can reward verbose answers even when concise answers are better.
- A judge without evidence may validate a plausible hallucination.
- Rubrics that mix many dimensions produce noisy, hard-to-debug scores.
- The same provider family can share blind spots between generator and judge.
- Judge model upgrades can move scores even when the application did not change.
- Rationales are diagnostic hints, not guaranteed explanations of the judge's true reasoning.
- Sensitive user data in judge prompts needs the same privacy treatment as production prompts.

## Minimal code shape

```ts
const judge = makeJudge({
  model: "fixed-judge-model",
  rubric: [
    "Score 1 if the answer contradicts supplied evidence.",
    "Score 3 if it is mostly grounded but misses important caveats.",
    "Score 5 if every key claim is supported and uncertainty is clear.",
  ],
  schema: { score: "number", pass: "boolean", reason: "string" },
});

const result = await judge.score({
  input: caseItem.question,
  output: candidate.answer,
  evidence: candidate.retrievedChunks,
});

assert(result.score >= 4);
```

## Key links

- [Braintrust scorers and classifiers](https://www.braintrust.dev/docs/evaluate/write-scorers)
- [Braintrust Autoevals](https://www.braintrust.dev/docs/reference/autoevals)
- [DeepEval G-Eval](https://deepeval.com/docs/metrics-llm-evals)
- [DeepEval metrics overview](https://deepeval.com/docs/metrics-introduction)
