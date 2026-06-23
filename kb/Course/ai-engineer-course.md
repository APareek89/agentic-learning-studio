---
title: "AI Engineer Course Track"
category: "Course"
url: "kb://course/ai-engineer"
license: "Original synthesis only"
verdict: "AI engineers need to build the loop: prompt, retrieve, call tools, evaluate, observe, and ship."
as_of_date: 2026-06-23
sources:
  - {url: "kb://manifest.yaml", license: "Original synthesis only", kind: "internal_kb"}
  - {url: "kb://course/ai-engineer", license: "Original synthesis only", kind: "course_outline"}
---

## Who it's for

Software engineers building LLM applications, copilots, RAG systems, agent workflows, and AI-enabled product features. The track is implementation-heavy but keeps production quality in view.

## Prerequisites

- Comfortable with TypeScript or Python services.
- Basic HTTP, databases, auth, and async job handling.
- Intro familiarity with prompts and LLM APIs.

## Ordered modules

1. Prompt and structured-output foundations  
   Map to: Prompt Engineering, System Prompts, Structured Outputs and Function Calling. Outcome: build reliable model calls with schemas, retries, and validation.

2. Embeddings and RAG implementation  
   Map to: Embeddings and Vector Representations, RAG Fundamentals, Chunking Strategies, Embedding Models for RAG. Outcome: implement ingestion, chunking, vector search, rerank, and answer grounding.

3. Tool calling and agents  
   Map to: Tool and Plugin Standards, MCP Server Lifecycle, LangGraph, OpenAI Agents SDK, Agent Loop. Outcome: build a stateful tool-using workflow with bounded actions.

4. Model gateways and serving integration  
   Map to: LiteLLM/OpenRouter, vLLM, Ollama, TGI, SGLang. Outcome: integrate hosted and self-hosted endpoints behind one application contract.

5. Evals and regression testing  
   Map to: Eval Frameworks, LLM Evaluation, Retrieval Evaluation, Regression Testing. Outcome: create an automated test suite for answer quality, tool calls, and RAG grounding.

6. Observability and LLMOps  
   Map to: LLMOps Operating Loop, Tracing and Observability, Prompt Injection, Guardrails. Outcome: emit traces, measure cost/latency, and enforce safety controls.

7. Deployment path  
   Map to: Model Packaging, Serving and Inference at Scale, CI/CD Continuous Training. Outcome: deploy a feature with staging, rollback, and monitoring.

## Capstone

Build a document QA assistant with tool use. It must ingest a corpus, answer with citations, call at least one tool, reject unsafe actions, log traces, run an eval suite, and expose a staging deployment plan.

## Key links

- RAG Fundamentals: ../RAG-tooling/rag-fundamentals.md
- LangGraph: ../Agent-frameworks/langgraph.md
- Eval Frameworks: ../Evaluation-observability/eval-frameworks.md
- LLMOps Operating Loop: ../LLMOps/llmops-operating-loop.md

