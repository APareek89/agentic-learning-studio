---
title: "AI Solution Architect Course Track"
category: "Course"
url: "kb://course/ai-solution-architect"
license: "Original synthesis only"
verdict: "The architect's job is to compose models, data, tools, security, and operations into a system that can be changed safely."
as_of_date: 2026-06-23
sources:
  - {url: "kb://manifest.yaml", license: "Original synthesis only", kind: "internal_kb"}
  - {url: "kb://course/ai-solution-architect", license: "Original synthesis only", kind: "course_outline"}
---

## Who it's for

Solution architects, staff engineers, platform leads, and technical consultants designing AI systems across applications, data, security, and operations. The track emphasizes tradeoffs, integration boundaries, and production readiness.

## Prerequisites

- Strong web/API and cloud architecture fundamentals.
- Basic data modeling and security awareness.
- Familiarity with LLM prompts, embeddings, and service deployment.

## Ordered modules

1. AI system architecture patterns  
   Map to: How LLMs Work, Model Selection and Tradeoffs, Deployment Scaling and Caching. Outcome: select hosted API, self-hosted inference, hybrid route, or offline pipeline.

2. Retrieval and knowledge grounding  
   Map to: RAG Fundamentals, Hybrid Search and Reranking, Graph RAG, Retrieval Evaluation, Vector DB docs. Outcome: design corpus ingestion, chunking, embeddings, search, rerank, and citation flow.

3. Agent and tool architecture  
   Map to: LangGraph, OpenAI Agents SDK, MCP Server Lifecycle, Tool and Plugin Standards, Agent Tool Security. Outcome: define tool contracts, approval points, state, and recovery.

4. Serving and infrastructure choices  
   Map to: Serving and Inference at Scale, vLLM, TGI, SGLang, LiteLLM, Kubernetes Serving. Outcome: compare latency, throughput, cost, scaling, and provider fallback.

5. MLOps/LLMOps release system  
   Map to: Model Packaging, Registries, CI/CD Continuous Training, LLMOps Operating Loop. Outcome: design versioned deployment, eval gates, trace capture, and rollback.

6. Governance and safety  
   Map to: Prompt Injection, Moderation/PII, AI Safety and Governance, Guardrails. Outcome: apply least privilege, redaction, audit logs, and policy enforcement.

7. Observability and incident response  
   Map to: LLM Observability, Production Model Monitoring, Regression Testing. Outcome: define SLOs, trace sampling, eval regression dashboards, and incident playbooks.

## Capstone

Architect a regulated enterprise knowledge assistant. Deliver a diagram and design memo covering identity, permissions, corpus ingestion, vector index, model routing, tool sandboxing, eval gates, monitoring, data retention, and rollout plan.

## Key links

- Serving and Inference at Scale: ../MLOps-production-ML/serving-and-inference-at-scale.md
- Model Context Protocol: ../Tool-use-MCP/model-context-protocol.md
- vLLM: ../Deployment-serving-gateways/vllm.md
- LLMOps Operating Loop: ../LLMOps/llmops-operating-loop.md
