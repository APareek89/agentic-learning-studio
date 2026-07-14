---
title: "Build a Customer Support Agent (End to End)"
category: "Agent frameworks"
url: "https://langchain-ai.github.io/langgraph/tutorials/customer-support/customer-support/"
license: "Official docs; original synthesis only"
verdict: "allow"
as_of_date: "2026-07-14"
sources:
  - {url: "https://langchain-ai.github.io/langgraph/tutorials/customer-support/customer-support/", license: "Official docs; original synthesis only", kind: "official_docs"}
  - {url: "https://docs.claude.com/en/docs/build-with-claude/tool-use", license: "Official docs; original synthesis only", kind: "official_docs"}
---

## What it is

A customer support agent is an LLM app that resolves user requests by combining retrieval (answer from the help center / policy docs) with actions (look up an order, issue a refund, escalate) and a safe boundary around what it may do autonomously. This is the end-to-end build recipe that composes RAG, tool calling, memory, guardrails, and human-in-the-loop into one deployable workflow — the applied shape behind "build a support agent with LangChain/LangGraph" or "with the Claude Agent SDK."

## Why it exists / when to reach for it

Support is the most common first agent because it has clear value and clear guardrails: most questions are answerable from docs, a minority need a real action, and a few must reach a human. Reach for an agent (not a plain RAG bot) when resolving a request requires *doing* something — reading an order, changing a subscription, filing a ticket — not just answering. Build it when deflection rate and first-contact resolution are the metrics you're paid to move.

## The moving parts

- Knowledge grounding: RAG over the help center + policies so answers are cited, not invented.
- Tools: typed functions for `get_order`, `issue_refund`, `create_ticket`, `escalate_to_human`, each hitting your backend.
- Policy/guardrails: rules on refund limits, PII handling, and which tools require confirmation.
- Memory: conversation state plus customer context (plan, history) for personalized, coherent multi-turn.
- Human-in-the-loop: an approval gate on high-impact tools (refunds over a threshold) and a clean handoff path.
- Orchestration: the loop that routes between "answer from docs," "call a tool," and "escalate."

## How it works

The agent receives a message plus customer context. It classifies intent, retrieves relevant policy passages, and decides: answer directly (grounded + cited), call a tool (fetch the order, then act), or escalate. Low-risk tools run autonomously; high-impact ones pause for confirmation (human-in-the-loop) before executing. State persists across turns so follow-ups resolve and the agent doesn't re-ask what it already knows. Every tool result feeds back into the loop until the request is resolved or handed off. In LangGraph you model this as an explicit graph (nodes = classify/retrieve/act/escalate, edges = the routing); with the Claude Agent SDK you give it the tools and a system prompt and let its loop drive, gated by permission mode.

## When to use vs alternatives

An agent when requests need actions + guardrails. Plain RAG when it's purely informational (FAQ deflection with no account actions). A rules/decision-tree bot when the flows are rigid and small — but that brittleness is exactly what agents remove. Start narrow (one or two tools, tight guardrails) and widen as evals show it's safe.

## Failure modes & gotchas

- Unbounded autonomy: never let refunds/cancellations run without a confirmation gate and per-action limits.
- Ungrounded answers: without "cite or say you don't know," the agent invents policy — a support liability.
- No escalation path: users trapped in a loop with a stuck agent churn; always offer a human handoff.
- Tool errors swallowed: a failed `get_order` must surface, not be hallucinated around.
- PII leakage: scrub logs/traces; don't pass full customer records into the prompt when an id suffices.
- Skipping evals on real tickets: measure resolution + safety on a labeled ticket set before widening scope.

## Minimal code shape (what you write)

```python
tools = [get_order, issue_refund, create_ticket, escalate_to_human]

def support_agent(msg, customer):
    ctx = kb.search(msg)                          # grounded policy passages
    plan = llm(system=POLICY_PROMPT, tools=tools, # "cite docs; refunds>50 need approval"
               context=ctx, customer=customer, user=msg)
    for call in plan.tool_calls:
        if call.name == "issue_refund" and call.args["amount"] > 50:
            require_human_approval(call)           # HITL gate
        run(call)
    return plan.answer_with_citations
```

## Key links

- LangGraph customer-support tutorial — https://langchain-ai.github.io/langgraph/tutorials/customer-support/customer-support/
- Claude tool use — https://docs.claude.com/en/docs/build-with-claude/tool-use
