---
title: "AI Safety and Governance"
category: "Guardrails & security"
url: "https://doi.org/10.6028/NIST.AI.600-1"
license: "Public domain / U.S. government work"
verdict: "Use governance to make safety repeatable: name owners, define risk appetite, version controls, test them, and review incidents."
as_of_date: 2026-06-22
sources:
  - {url: "https://www.nist.gov/itl/ai-risk-management-framework", license: "Public domain / U.S. government work", kind: "official_docs"}
  - {url: "https://airc.nist.gov/AI_RMF_Knowledge_Base/AI_RMF", license: "Public domain / U.S. government work", kind: "official_docs"}
  - {url: "https://doi.org/10.6028/NIST.AI.600-1", license: "Public domain / U.S. government work", kind: "official_docs"}
  - {url: "https://genai.owasp.org/llm-top-10/", license: "CC-BY-SA-4.0", kind: "official_docs"}
---

## What it is

AI safety is the practice of reducing harm from model behavior, system design, deployment context, misuse, and organizational incentives. AI governance is the management system that makes that practice durable: roles, policies, controls, audits, incident response, procurement review, and release gates.

NIST's AI RMF organizes governance around mapping the context, measuring risks, managing controls, and governing the process. The GenAI Profile adds risks that are especially relevant to generative systems: confabulation, harmful content, data leakage, synthetic media, prompt injection, insecure tool use, and unclear accountability.

## Why it exists / when to reach for it

Agentic systems are not just model calls. They combine prompts, retrieval, tools, state, memory, logs, analytics, vendors, and humans. A safety review that only asks "is the model safe?" misses most real failure paths. Governance gives teams a way to decide what is acceptable, prove controls exist, and learn from incidents.

## The moving parts

- Risk register: likely harms, impacted users, severity, likelihood, owners, mitigations, and residual risk.
- Policy stack: content policy, privacy policy, tool-use policy, evaluation policy, and incident policy.
- Control library: moderation, PII redaction, guardrails, sandboxing, evals, rate limits, provenance, approvals, and monitoring.
- Release gates: pre-launch evals, red-team cases, security review, data review, and rollback criteria.
- Vendor governance: model/provider terms, data use settings, retention, location, uptime, deprecation, and support.
- Incident response: detection, triage, containment, user communication, root cause, and policy updates.
- Change management: re-test when models, prompts, KB sources, tools, or routing rules change.

## How it works

Start by mapping the use case: who uses the system, what it can do, what data it sees, which tools it can call, and which harms matter. Measure risk with task-specific evals and adversarial cases. Manage the risk with layered controls. Govern the whole loop with named owners and evidence: policy versions, source provenance, model versions, eval reports, and incident notes.

For a learning studio, the governance question is not only "will the answer be polite?" It is also "can the system cite sources, avoid unsupported instruction, protect learner data, decline unsafe requests, and avoid taking actions outside its educational role?"

## When to use vs alternatives

Use a lightweight governance checklist for prototypes that never touch sensitive data or external actions. Use a formal risk register and approval workflow for public, enterprise, educational, health, financial, legal, child-facing, or tool-using deployments. Use independent review when the product team has incentives to ship quickly despite unresolved safety gaps.

## Failure modes & gotchas

- Paper governance: policies exist but are not wired into product code, evals, or launch gates.
- Model-only thinking: risks in retrieval, logs, vendor terms, and tools go unowned.
- Stale controls: provider models and prices change, prompt behavior drifts, and evals stop matching production.
- Unclear authority: reviewers find risk but nobody can block a release.
- Missing evidence: without audit trails, teams cannot reconstruct which policy, prompt, source, and model produced an incident.

## Minimal code shape

```text
risk = risk_register.lookup("lesson_generation")
assert risk.owner and risk.acceptance_criteria

eval_report = run_release_evals(model, prompts, kb_snapshot)
security_report = run_agent_security_checks(tools, scopes, sandbox)

if not release_gate.passes(eval_report, security_report, risk):
  block_release(with_remediation_plan=True)

deploy(policy_version=risk.policy_version, monitor=risk.monitoring_plan)
```

## Key links

- https://www.nist.gov/itl/ai-risk-management-framework
- https://airc.nist.gov/AI_RMF_Knowledge_Base/AI_RMF
- https://doi.org/10.6028/NIST.AI.600-1
- https://genai.owasp.org/llm-top-10/
