---
title: "Moderation, PII, and Data Governance"
category: "Guardrails & security"
url: "https://www.nist.gov/itl/ai-risk-management-framework"
license: "Public domain / U.S. government work"
verdict: "Moderation is a control; governance is the operating system that decides where the control belongs, who owns it, and how failures are reviewed."
as_of_date: 2026-06-22
sources:
  - {url: "https://www.nist.gov/itl/ai-risk-management-framework", license: "Public domain / U.S. government work", kind: "official_docs"}
  - {url: "https://doi.org/10.6028/NIST.AI.600-1", license: "Public domain / U.S. government work", kind: "official_docs"}
  - {url: "https://platform.openai.com/docs/guides/moderation", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

Moderation, PII controls, and governance are related but distinct. Moderation classifies content risk such as self-harm, sexual content, violence, hate, harassment, or policy-prohibited requests. PII controls identify and minimize personal data. Governance defines accountability: policy ownership, risk assessment, consent, retention, auditability, vendor review, and change management.

NIST's AI RMF frames AI risk as socio-technical: risks come from models, data, people, organizations, deployment context, and misuse. The GenAI Profile adds practical concerns for generated content, synthetic media, data leakage, hallucination, and misuse at scale.

## Why it exists / when to reach for it

An agentic learning studio may ingest user prompts, lesson drafts, source documents, retrieval traces, model outputs, and evaluation notes. Some of that material can contain personal data, copyrighted content, unsafe requests, private credentials, or learner-sensitive context. Governance makes the system defensible when something goes wrong.

## The moving parts

- Data inventory: what enters prompts, vector stores, logs, analytics, eval datasets, and support tools.
- Data classification: public, internal, confidential, regulated, minors' data, credentials, and special-category data.
- PII controls: detect, redact, tokenize, avoid collection, or route to a higher-trust workflow.
- Moderation controls: classify user input and generated output at the right points in the workflow.
- Retention rules: define how long prompts, traces, embeddings, files, and feedback are stored.
- Access controls: restrict who can read raw prompts, traces, source caches, and incident records.
- Review loops: sample outputs, review incidents, update policies, and re-run evals after changes.

## How it works

Start with a data map. Decide which fields can be stored, which must be redacted before logging, and which must never enter a model prompt. Run moderation where unsafe user content or generated content can affect a learner. Run PII checks before persistence and before sending data to vendors that should not receive it. Keep policy versions and model versions in audit events so later reviews can reconstruct what happened.

For RAG, treat embeddings as derived data that may still reveal sensitive source content. Deleting a document should also delete its chunks and embeddings. For analytics, prefer aggregate metrics over raw prompt inspection.

## When to use vs alternatives

Use automated moderation for scalable triage and consistency. Use human review for ambiguous, high-severity, or policy-changing cases. Use deterministic redaction for obvious identifiers and secrets. Use privacy/legal review for retention, consent, cross-border transfer, minors, regulated education records, and vendor contracts.

## Failure modes & gotchas

- Moderation classifiers are probabilistic and can miss context, satire, coded language, or local policy nuance.
- PII detection is incomplete; avoid collecting sensitive fields instead of relying only on redaction.
- Logs can become the real data breach surface.
- Vector stores can retain content after the source document is deleted unless deletion is explicit.
- Governance without owners becomes shelfware; owners need review cadence and authority to block launches.

## Minimal code shape

```text
record = classify_data(user_input)
if record.contains_secret:
  return block_and_report("Secret detected")

clean = redact_pii(record.text, policy="learning-studio-v2")
if moderation(clean).is_disallowed:
  return safe_response(policy_ref="content-safety")

trace_id = audit.log(
  event="lesson_request",
  policy_version="learning-studio-v2",
  pii_action=clean.redactions,
  source_ids=record.source_ids
)
```

## Key links

- https://www.nist.gov/itl/ai-risk-management-framework
- https://doi.org/10.6028/NIST.AI.600-1
- https://platform.openai.com/docs/guides/moderation
