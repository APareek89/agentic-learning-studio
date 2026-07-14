# KB Breadth-Gap Report — Agentic Learning Studio

**Date:** 2026-07-14 · **Scope:** READ-ONLY analysis (staging + prod, prod via read-only SELECTs).
**Method:** SQL supply/demand inventory + local-ONNX coverage probe (imports the real `src/rag/retrieve.ts`; $0, no LLM calls) + `services/kb-curator/sources.yaml` cross-check.
**Status:** REPORT ONLY — every source proposal below is **PROPOSED, NOT APPLIED**. No sources.yaml / KB / curator changes were made.

---

## 0. Executive summary

1. **The KB is broad-but-shallow, and by the retriever's own `coverage` score, "everything" looks covered** — all 35 probed demand topics score **0.80–0.94** on both DBs, none below the 0.7 GAP line. That score is **misleading**: the formula (`0.5·topSim + 0.5·min(1, strong/3.2)`) saturates because bge-small always returns 8 semantically-adjacent chunks. **The real signal is the top-hit's `maxSim` and whether the #1 chunk is actually on-topic.** Read through that lens, a handful of genuine gaps appear.
2. **Most of the "known-weak" probes are now RESOLVED.** CrewAI (0.78, dedicated doc), AutoGen (0.85), MCP (0.86), structured output (0.86), prompt caching (0.75), agent observability (0.74, dedicated Langfuse/LangSmith/Phoenix doc), vector-DB comparison (0.78, Pinecone/Chroma/Qdrant/pgvector docs), LangGraph memory (0.79) all now retrieve a dedicated on-topic doc. The manual ingest + prod curator closed these since the last KB-coverage sweep.
3. **The genuine residual gaps are narrow:** (a) **Claude Code / Agent SDK / Claude Skills**, (b) **applied end-to-end "build X" recipes** (RAG chatbot, customer-support agent, multi-agent workflow), (c) **eval-driven CI gating**, (d) **streaming/SSE**, (e) **GraphQL-for-agents** (out of scope).
4. **A real staging↔prod DRIFT hurts grounding on prod.** Prod has **zero "Agent Skills" chunks**; staging has **21** (10 docs). So a prod user asking about Claude skills/SDK retrieves top-hit *"OpenAI Agents SDK" (0.62 — wrong vendor)*, while staging retrieves *"Installing and Packaging Agent Skills" (0.68 — on-topic)*. Conversely prod is **fresher** on frameworks/deployment/vector-DBs (curator-fed to 2026-07-13); staging is **frozen** at the 2026-06-26 manual ingest.
5. **Two governance findings about the curator itself:**
   - **The curator only REFRESHES the 27 allowlisted sources — it never adds breadth.** Prod ran the curator daily for ~20 days (2026-06-24→07-13) yet total chunks moved only 235→240. It keeps *existing* topics current; it cannot cover a topic that has no allowlisted source. **Breadth is fixed by the allowlist + the one-time manual `kb/` ingest.**
   - **The curator has NEVER run against staging** (`kb_curator_runs` empty, `kb_sources.last_checked` all-null on staging). The cron is armed on `main`→prod only. Staging KB is whatever `copy-kb.mjs` / manual ingest last put there.
6. **Weighted by real (prod) user demand,** the "add first" order is: **eval depth (incl. CI gating) → Claude Code/SDK/skills (fix the prod drift) → applied-build reference docs → streaming/SSE → decide GraphQL in/out.**

---

## 1. Supply inventory

### 1a. Totals (chunks are the size unit — `token_count` is 0/unpopulated everywhere)

| Metric | Staging (`ydgiysthvxhlfpzxyrmy`) | Prod (`kdgtlbnlyscdldogxorb`) |
|---|---|---|
| documents | 98 | 96 |
| chunks (all embedded) | 235 | 240 |
| distinct categories | 18 | 17 |
| chunks/doc (avg) | ~2.4 | ~2.5 |
| oldest / newest `as_of_date` | 2026-06-22 / 2026-06-26 | 2026-06-22 / 2026-07-13 |
| chunks stale (>60d old) | **0** | **0** |

**Freshness:** by calendar, **nothing is >60 days stale** on either DB (oldest is 22 days). But staging content is **frozen** (no ingest since 2026-06-26); prod is **live-curated** (newest chunks 2026-07-08→07-13 for crewai/langgraph/sglang/qdrant/pinecone).

### 1b. Chunks per category + staging↔prod drift

| Category | Staging | Prod | Note |
|---|--:|--:|---|
| Agent frameworks | 34 | **44** | prod curator-fed (langgraph/crewai release notes) |
| Deployment & serving / gateways | 18 | **28** | prod fresher (vllm/sglang/litellm/ollama) |
| MLOps & production ML | 23 | 23 | **orphan — no source in allowlist** |
| Vector DBs and clients | 16 | **22** | prod added pinecone/weaviate/chroma depth |
| **Agent Skills** | **21** | **0** | **staging-only — never ingested to prod (drift)** |
| RAG tooling | 18 | 18 | — |
| Evaluation & observability | 15 | 15 | — |
| Foundations | 14 | 14 | — |
| Prompting & context | 14 | 14 | — |
| Training & adaptation | 13 | 13 | — |
| Tool use / MCP | 12 | 12 | — |
| Guardrails & security | 11 | 11 | — |
| Durable execution / orchestration | 6 | 6 | **orphan — declared category, no source** |
| Course | 6 | 6 | **orphan — no source** |
| Providers & models | 6 | 6 | — |
| AI analytics | 4 | 4 | **orphan — no source** |
| Memory | 2 | 2 | thinnest real category (1 doc) |
| LLMOps | 2 | 2 | **orphan — no source** |

### 1c. Curator health

- **Prod:** `kb_curator_runs` shows healthy daily runs (id 22 latest, 2026-07-13, 28 sources polled, ok=true). All 27 `kb_sources` `last_checked` = 2026-07-13. `kb_updates` = daily `kb-curator` rows since 2026-06-24 (`added` 5–34/day, mostly release-note refreshes of existing sources).
- **Staging:** `kb_curator_runs` **empty**; `kb_sources.last_checked` **all null**; `kb_updates` shows only manual `ingest` runs (last 2026-06-26). **Curator never armed here.**

---

## 2. Demand inventory

**Sources of demand:** `lessons` table (staging 84 / prod 44 rows; `prompt`+`title`, kinds `learning-artifact`+`overview-draft`) — *the task's assumed `artifacts` table does not exist; `lessons` is the store* — plus `generated_skills` (3 staging / 2 prod), `prebuilt_lessons` (100-topic library), and prod `events.library_lesson_opened` (actual library clicks).

### 2a. Demand clusters, by frequency (keyword tally over both DBs)

| Cluster | Prod (real users) | Staging (dev+users) | KB verdict (see §3) |
|---|--:|--:|---|
| **Evals** (LLM app / agentic / CS-app) | **8** | 5 | THIN (CI-gating angle) |
| LangChain | 7 | 20 | COVERED |
| RAG (concept + build) | 7 | 7 | concept COVERED / **build GAP** |
| **Customer-support agent (build)** | **5** | 3 | **GAP (applied shape)** |
| **Claude Code / Agent SDK / skills** | **4** | 4 | **GAP on prod / THIN staging** |
| LLM foundations | 4 | 2 | COVERED |
| A2A protocol | 3 | 2 | COVERED |
| Multi-agent workflow (build) | 3 | 7 | THIN (concept ok, build drifts) |
| Tool use / ReAct / agent loop | 2 | 12 | COVERED |
| Framework comparison | 2 | 6 | COVERED |
| Agent memory | 2 | 3 | COVERED (thin, 2 chunks) |
| Voice agent | 2 | 0 | partial (Voice Agents doc) |
| GraphQL for agents | 2 | 2 | **GAP — out of scope** |
| Vector embeddings / search | 1 | 6 | COVERED |
| Prompt caching | 1 | 1 | COVERED |
| Fine-tuning / LoRA | 1 | 3 | COVERED |
| Diffusion / image gen | 1 | 2 | COVERED |
| Self-host / serve LLM | 1 | 0 | COVERED |
| MCP | 1 | 0 | COVERED |
| Streaming / SSE | 0 | 1 (2026-07-14) | **GAP — emerging, no source** |
| Prompt engineering | 0 | 3 | COVERED |
| Transformer attention | 0 | 2 | COVERED |

**Library click demand** (prod `library_lesson_opened`, top): tool-use-action-boundaries (6), embeddings-learned-representations (5), model-context-protocol (5), add-observability-langfuse (3), crewai-role-based-agents (3), planning-and-reflection (3) — all well-covered topics.

**Generated skills demand:** GitHub issue summarizer/labeler ×2, daily revenue analytics (Paddle+BigQuery). Niche/applied — out of KB scope.

### 2b. Prebuilt library (the intended demand surface): 100 lessons × 10 categories
Agents · Build Projects · Evaluation · Foundations · Frameworks · Generative · Infrastructure · LLMs · RAG · Safety (10 each). Notable library topics with **thin/absent KB backing**: `durable-agents-workflow-engines`, `browser-computer-use-agents`, `structured-outputs-json-schema` (KB ok), Generative-category topics (Whisper/TTS/video/VLM — KB has only `multimodal-generative-models`), Safety-category regulatory topics (EU AI Act, NIST RMF — no KB source).

---

## 3. Coverage table (topic × score × verdict)

Probed with the **production retriever** (`retrieve(q, 8)`, bge-small-en-v1.5, hybrid vector+keyword+RRF) against both DBs. **`cov` = retriever's coverage score (saturates high — see below). `max` = similarity of the #1 chunk. Verdict uses the sharper lens: top-hit on-topic? + maxSim.**

> **Why the score is not the verdict:** coverage is ≥0.80 for *every* topic including ones with no dedicated doc, because the second term maxes out at ≥4 adjacent hits. A topic is a real **GAP** when the **#1 chunk is off-topic** (grounding would mislead) or **maxSim < ~0.62** (nothing close). **THIN** = on-topic #1 but maxSim ~0.65–0.73 (shallow). **COVERED** = on-topic dedicated #1, maxSim ≥ ~0.74.

| Topic (probe) | Demand (prod) | Staging cov/max | Prod cov/max | Prod #1 hit | Verdict |
|---|--:|---|---|---|---|
| Streaming LLM responses / SSE ⚠ | 0 (emerging) | 0.804 / 0.61 | 0.804 / **0.61** | *Context Management Patterns* (off-topic) | **GAP** |
| Claude Agent/Code SDK & skills | 4 | 0.84 / 0.68 | 0.809 / **0.62** | *OpenAI Agents SDK* (wrong vendor) | **GAP (prod)** / THIN (staging) |
| RAG chatbot — end-to-end build | 7 | 0.816 / 0.63 | 0.816 / **0.63** | *AutoGen and AG2* (off-topic) | **GAP (applied)** |
| GraphQL for agentic workflows | 2 | 0.843 / 0.69 | 0.853 / 0.71 | *CrewAI* (off-topic) | **GAP — out of scope** |
| LLM evals / CI gating ⚠ | 8 | 0.843 / 0.69 | 0.843 / 0.69 | *LLMOps Operating Loop* (adjacent) | **THIN** |
| Multi-agent orchestration/workflow | 3 | 0.844 / 0.69 | 0.844 / 0.69 | *CrewAI* → *Multi-Agent Topologies* | **THIN** |
| Customer-support agent (build) | 5 | — | — | (drifts to framework docs) | **THIN (applied)** |
| What is an AI agent | 0 | 0.852 / 0.70 | 0.852 / 0.70 | *Voice Agents* → agent-loop docs | COVERED |
| Prompt injection / defense | — | 0.854 / 0.71 | 0.854 / 0.71 | *Prompt Injection & OWASP LLM Top 10* | COVERED |
| Tool calling / function calling | 2 | 0.859 / 0.72 | 0.859 / 0.72 | *Agent Loop, ReAct, Planning* | COVERED |
| Agent memory | 2 | 0.869 / 0.74 | 0.869 / 0.74 | *Agent Memory* (only 2 chunks) | COVERED (thin) |
| Self-host / serve LLM (vLLM/Ollama) | 1 | 0.87 / 0.74 | 0.87 / 0.74 | *vLLM* | COVERED |
| Agent observability / tracing ⚠ | — | 0.888 / 0.78 | 0.888 / 0.78 | *Tracing & Observability: Langfuse…* | COVERED |
| Vector DB comparison ⚠ | 1 | 0.888 / 0.78 | 0.888 / 0.78 | *Pinecone* (+Chroma/Qdrant/pgvector) | COVERED |
| Prompt caching ⚠ | 1 | 0.873 / 0.75 | 0.873 / 0.75 | *Deployment/KV/Semantic Caching* | COVERED |
| CrewAI ⚠ | — | 0.888 / 0.78 | 0.888 / 0.78 | *CrewAI* | COVERED |
| AutoGen ⚠ | — | 0.923 / 0.85 | 0.923 / 0.85 | *AutoGen and AG2* | COVERED |
| LangGraph memory ⚠ | — | 0.884 / 0.79 | 0.896 / 0.79 | *LangGraph* | COVERED |
| Structured output / JSON schema ⚠ | — | 0.928 / 0.86 | 0.928 / 0.86 | *Structured Outputs & Function Calling* | COVERED |
| MCP ⚠ | 1 | 0.929 / 0.86 | 0.929 / 0.86 | *Model Context Protocol (MCP)* | COVERED |
| LangChain / LangGraph / comparison | 7 | 0.885 / 0.77 | 0.885 / 0.77 | *LangChain* | COVERED |
| Vector embeddings / semantic search | 1 | 0.918 / 0.84 | 0.918 / 0.84 | *Embeddings & Vector Representations* | COVERED |
| Chunking / reranking / hybrid RAG | — | 0.907–0.942 | 0.907–0.942 | *Chunking Strategies* / *Hybrid Search & Reranking* | COVERED |
| LLM foundations / transformer attention | 4 | 0.879–0.921 | 0.879–0.921 | *How LLMs Work* / *Transformers, Attention, KV* | COVERED |
| Fine-tuning / LoRA · Diffusion · A2A | 1·1·3 | 0.877–0.941 | 0.877–0.941 | *LoRA/QLoRA/PEFT* · *Multimodal* · *A2A* | COVERED |

⚠ = one of the user's "known-weak" probes. **9 of 10 known-weak probes are now COVERED**; only streaming/SSE remains a clean GAP (and evals is THIN on the CI angle).

**Verdict tally (all 35 probes, sharper lens):** ~3 GAP · ~4 THIN · ~28 COVERED. (By the literal score threshold: 0 GAP, 5 THIN — which is exactly why the score alone is not enough.)

---

## 4. Gap classification

Per the requested (a) source stale/not-ingested · (b) source missing entirely · (c) out of KB scope by design:

| Gap topic | Demand | Class | Detail |
|---|--:|---|---|
| **Claude Code / Agent SDK / Claude Skills** | 4 (prod) | **(a) + (b)** | Staging HAS the docs (Agent Skills, 21 chunks) but they were **never ingested to prod** (drift, class a). And **no allowlisted source feeds them** — the staging docs came from a manual `kb/agent-skills/` ingest, not sources.yaml. `sitemap-anthropic-docs` exists but is mapped to "Providers & models" and isn't surfacing SDK/skills pages (class b). |
| **Streaming LLM responses / SSE** | emerging | **(b)** | No dedicated doc, **no allowlisted source**. Top-hit drifts to Context-Management (0.61). |
| **Eval-driven CI gating** | 8 (prod) | **(a)** | Sources exist (`gh-promptfoo-releases`, `gh-ragas-releases`) but they are **release-note feeds → changelog chunks**, not conceptual "gate CI on evals" content. Concept docs (`llm-evaluation.md`, `eval-frameworks.md`, `regression-testing-for-agentic-systems.md`) exist but retrieval favors the LLMOps-loop chunk (0.69). Depth/shape gap, not a missing source. |
| **Applied build recipes** (RAG chatbot, customer-support agent, multi-agent workflow, voice agent) | ~13 aggregate (prod) | **(c)** mostly | KB is a **reference-concept** store by design; applied end-to-end builds are the **prebuilt library's** job (`Build Projects` category = 10 lessons + the live model). The retrieval *drift* (RAG-chatbot → AutoGen 0.63) is real but expected. Optional: a few "build X end-to-end" reference docs would ground applied lessons better. |
| **GraphQL for agentic workflows** | 2 (prod, recurring) | **(c)** | Adjacent domain, no source, off-topic top-hits (CrewAI 0.71). Decide: add one bridging doc or explicitly exclude. |
| **Curator-orphan categories** (MLOps 23, Durable-execution 6, Course 6, AI-analytics 4, LLMOps 2, + Agent-Skills 21 staging-only) | mixed | **(a)** | These categories exist in the KB from the one-time manual ingest but have **no source in sources.yaml**, so the curator can never refresh them. "Durable execution / orchestration" is even declared as a valid bucket in the sources.yaml header comment yet has zero entries. |
| **Generative depth** (Whisper/TTS/video/VLM) + **regulatory safety** (EU AI Act, NIST RMF) | library-driven | **(b)/(c)** | Prebuilt library promises these (Generative + Safety categories) but KB has only `multimodal-generative-models.md` and no regulatory sources. Low live user demand; flag for library parity, not urgent. |

---

## 5. DRAFT sources.yaml additions — **PROPOSED, NOT APPLIED**

> These are candidates for the "source missing / stale" gaps only. **URLs, exact repo names, licenses, and release-feed availability MUST be verified before adding** (this analysis made zero network calls). Category strings must match an existing `kb/` folder + `documents.category` value per the sources.yaml contract. Do **not** paste as-is.

```yaml
# ======================================================================
# PROPOSED ADDITIONS — DRAFT ONLY, NOT APPLIED. Verify url/license/feed
# and add a matching kb/<Category>/ folder before ingesting.
# ======================================================================

# ---- GAP: Claude Code / Agent SDK / Claude Skills (highest-leverage) ----
# NOTE: first + cheapest fix is NON-source: copy the 21 staging "Agent Skills"
# chunks to prod (scripts/copy-kb.mjs) so prod stops retrieving "OpenAI Agents
# SDK" for Claude-skill queries. THEN arm a source so it stays fresh:
- id: gh-anthropic-claude-agent-sdk-python
  type: github
  url: https://github.com/anthropics/claude-agent-sdk-python/releases.atom   # VERIFY repo/feed
  repo: anthropics/claude-agent-sdk-python
  license: MIT            # VERIFY
  fetch: auto
  category: Agent Skills   # requires kb/agent-skills/ (exists on staging)

- id: gh-anthropic-skills-examples
  type: github
  url: https://github.com/anthropics/skills/releases.atom   # VERIFY (may be a plain repo, not releases)
  repo: anthropics/skills
  license: MIT            # VERIFY
  fetch: auto
  category: Agent Skills

- id: sitemap-claude-docs-agent-sdk
  type: sitemap
  url: https://docs.claude.com/sitemap.xml   # VERIFY host (docs.anthropic.com → docs.claude.com)
  license: official-docs
  fetch: auto
  category: Agent Skills   # scope/post-filter to /agent-sdk + /claude-code pages

# ---- GAP: Streaming LLM responses / SSE ----
- id: sitemap-vercel-ai-sdk-docs
  type: sitemap
  url: https://ai-sdk.dev/sitemap.xml   # VERIFY
  license: official-docs
  fetch: auto
  category: Deployment & serving / gateways   # streaming/SSE lives here, or add an App-integration bucket
# (Fastest $0 alternative: hand-author kb/Deployment-serving-gateways/streaming-sse-token-by-token.md
#  distilled from OpenAI + Anthropic streaming docs — no new source needed.)

# ---- THIN → depth: eval-driven CI gating (source exists as release feed only) ----
- id: sitemap-promptfoo-docs
  type: sitemap
  url: https://www.promptfoo.dev/sitemap.xml   # VERIFY — adds CONCEPT depth vs the existing release feed
  license: official-docs
  fetch: auto
  category: Evaluation & observability
- id: gh-openai-evals
  type: github
  url: https://github.com/openai/evals/releases.atom   # VERIFY
  repo: openai/evals
  license: MIT
  fetch: auto
  category: Evaluation & observability

# ---- OPTIONAL: feed the "Durable execution / orchestration" orphan category ----
- id: gh-temporal-releases
  type: github
  url: https://github.com/temporalio/temporal/releases.atom   # VERIFY
  repo: temporalio/temporal
  license: MIT
  fetch: auto
  category: Durable execution / orchestration

# ---- DECISION NEEDED (out of current scope): GraphQL-for-agents ----
# Recurring demand (~2 prod lessons) but adjacent-domain. Recommend ONE
# hand-authored kb/ bridging doc rather than an allowlist source, OR explicitly
# exclude and let the model answer ungrounded.
```

**Non-source actions (no allowlist change needed):**
- **`copy-kb.mjs` prod→? and staging sync:** decide the canonical direction. Prod is fresher on frameworks/deployment/vector-DBs; staging uniquely has Agent-Skills. Ideally **merge both ways** so neither DB is missing a category.
- **Depth pass:** thinnest real categories are **Memory (2 chunks)** and **Agent memory** retrieval (0.74) — a single richer memory doc would help a frequently-requested topic.

---

## 6. Ranked "what to add first" (weighted by real/prod demand × gap severity)

1. **Fix the Claude-Skills prod drift + arm a source.** *Demand 4 (prod), clean GAP.* First copy the 21 staging Agent-Skills chunks to prod (stops the "OpenAI Agents SDK" mis-grounding today, zero source change); then add an Anthropic Claude-Code/Agent-SDK/skills source so it stays fresh. **Highest leverage, lowest effort.**
2. **Deepen evals for the CI-gating angle.** *Demand 8 (prod, #1), THIN.* Add promptfoo/OpenAI-Evals **docs** (not just release feeds) or hand-author an "evaluate-in-CI / regression-gate" doc. Eval is the single most-requested non-well-covered topic on prod.
3. **Add a small set of applied "build X end-to-end" reference docs** (RAG chatbot over internal docs · customer-support agent · multi-agent workflow). *Aggregate demand ~13 (prod), class-(c) but real retrieval drift.* Mostly the prebuilt library's job — but 2–3 grounding docs would stop applied lessons drifting to the wrong framework doc.
4. **Streaming / SSE.** *Emerging demand, clean source-missing GAP.* Cheapest as a single hand-authored doc; or add the Vercel AI SDK docs sitemap. Do opportunistically — current real-user demand is ~0.
5. **Decide GraphQL-for-agents in or out**, and **either wire or retire the curator-orphan categories** (MLOps, Durable-execution, Course, AI-analytics, LLMOps). These are governance clean-ups, not demand-driven.

**Two curator-level recommendations that outrank any single source:**
- **Give the curator a breadth mechanism, not just a refresh loop.** Today it only re-polls 27 fixed sources; it structurally cannot cover a topic with no allowlisted source. A periodic "demand-vs-supply diff" (this report, automated) → allowlist proposals would close breadth gaps as they emerge.
- **Arm the curator (or a scheduled `copy-kb`) against staging**, so staging stops drifting from prod and QA reflects real grounding.

---

### Appendix — reproduction (all $0, throwaway scripts already deleted)
- Supply/demand SQL: `pg` against `DATABASE_URL` (staging) and read-only `PROD_DATABASE_URL` (prod), `ssl:{rejectUnauthorized:false}`, `NODE_EXTRA_CA_CERTS` corp bundle.
- Coverage probe: `npx tsx` importing `{ retrieve }` from `src/rag/retrieve.ts`, `retrieve(q, 8)` per topic, both DBs. Local ONNX embed (bge-small-en-v1.5) — no API cost. The onnxruntime `mutex` message on exit is the known-harmless warning (HANDOFF §5).
- Demand table `lessons` (kinds `learning-artifact` + `overview-draft`); library topics `prebuilt_lessons`; click demand prod `events.library_lesson_opened`. (The task's assumed `artifacts` table does not exist — `lessons` is the store.)

---

## 7. Session-1 actions applied (2026-07-14/15)

Acting on §5–§6 above. Repo edits are LOCAL-ONLY (no commits/pushes). The kb/ docs are the **canonical source**, so they were ingested **directly into BOTH the staging and prod KBs from the repo — nothing was copied staging→prod** (each DB is fed independently from source).

**Sources (arm the curator for freshness).** Added 9 allowlisted sources to `services/kb-curator/sources.yaml` in the "add first" order (eval/CI → Claude Code/Agent SDK/Skills → applied builds → streaming/SSE); GraphQL-for-agents declared **out of scope** in the header. Total sources 28→37.

**Breadth (immediate, $0 local-ONNX ingest into STAGING).** Hand-authored 6 kb/ docs (original prose) and ingested them (`npm run ingest -- kb`, +18 chunks, 235 unchanged): `Evaluation-observability/evaluating-in-ci-and-release-gates.md`, `agent-skills/claude-agent-sdk-and-claude-code.md`, `RAG-tooling/build-a-rag-chatbot-over-your-docs.md`, `Agent-frameworks/build-a-customer-support-agent.md`, `Agent-frameworks/build-a-multi-agent-workflow.md`, `Deployment-serving-gateways/streaming-llm-responses-sse.md`.

**Before→after coverage** (staging; `retrieve(q,8)`, maxSim + #1 hit is the real lens):

| Gap topic | cov b→a | maxSim b→a | #1 hit after |
|---|---|---|---|
| Streaming / SSE | 0.804→0.856 | **0.61→0.71** | *Streaming LLM Responses Token-by-Token (SSE)* |
| Claude Code / Agent SDK / skills | 0.835→0.900 | **0.67→0.80** | *Building Agents with the Claude Agent SDK…* |
| RAG chatbot end-to-end build | 0.816→0.896 | **0.63→0.79** | *Build a RAG Chatbot Over Your Documents* |
| LLM evals / CI gating | 0.843→0.860 | **0.69→0.72** | *Evaluating LLM Apps in CI and Release Gates* |
| Customer-support agent (build) | 0.815→0.878 | **0.63→0.76** | *Build a Customer Support Agent* |
| Multi-agent orchestration/workflow | 0.844→0.891 | **0.69→0.78** | *Build a Multi-Agent Workflow* |
| MCP (control) | 0.929→0.929 | 0.86→0.86 | unchanged — no regression |
| GraphQL (out of scope) | 0.843→0.843 | 0.69→0.69 | unchanged — deliberately not filled |

Every gap now retrieves its dedicated doc as the #1 hit (previously drifted to wrong-topic neighbours, e.g. RAG-chatbot→*AutoGen*).

**Governance (a) — curator adds breadth, not just refresh.** Root cause found + fixed in `services/kb-curator/detect.ts`: for a **never-checked** source, `state.lastHash` is undefined, so the change-cursor fallback surfaced only the **single** newest item — a new source trickled 1 item/run and never backfilled. Added a **bounded first-poll backfill**: on first contact (`!lastChecked && !lastHash`) seed the newest N (`KB_FIRST_POLL_BACKFILL`, default 8), still capped by `KB_MAX_ITEMS_PER_SOURCE` in `index.ts`. So the 9 new sources will actually ingest breadth on their first live run. (tsc clean; verified by code + the existing per-source cap — not run live here, since a real curator run needs the prod cron + Claude synthesis.)

**Governance (b) — curator never runs on staging (PROPOSED, not implemented).** The web-refresh cron is armed on `main`→prod only (`kb_curator_runs` empty on staging; all `kb_sources.last_checked` null). This is about keeping staging's *release-note freshness* current, independent of the source docs (which are now ingested from the repo). **Smallest option:** add a staging leg to the scheduled curator — a second workflow / matrix entry running `npm run kb:curate` against the staging DB secrets — so staging gets the same daily delta. If double Claude-synth spend is a concern, run it weekly instead of daily. (No staging↔prod data copy is involved.)

**Drift fix — APPLIED DIRECTLY TO PROD (2026-07-14/15, from repo source).** Prod had **0 Agent-Skills chunks** and **0 gap-doc chunks**. Rather than copy anything from staging, the canonical kb/ docs were ingested straight into prod (`npm run ingest -- kb`, additive/idempotent — 214 unchanged, **+39 chunks**): the 6 new gap docs (+18) and all 11 Agent-Skills docs (+21 → 24 total). Prod totals **240→279 chunks**. Existing prod chunks (incl. the curator's fresher `kb/`-prefixed framework docs) were untouched — the source docs use un-prefixed `source_id`s, so there is no collision or regression.

**Prod before→after (live KB users hit this):**

| Gap topic | maxSim b→a | #1 hit after |
|---|---|---|
| Streaming / SSE | 0.61→0.71 | *Streaming LLM Responses (SSE)* |
| Claude Code / Agent SDK / skills | **0.63→0.80** | *Building Agents with the Claude Agent SDK…* (was *OpenAI Agents SDK*) |
| RAG chatbot build | **0.63→0.79** | *Build a RAG Chatbot Over Your Documents* (was *AutoGen*) |
| Evals / CI gating | 0.69→0.72 | *Evaluating LLM Apps in CI* |
| Customer-support agent | 0.63→0.76 | *Build a Customer Support Agent* |
| Multi-agent workflow | 0.69→0.78 | *Build a Multi-Agent Workflow* |
| MCP (control) | 0.86→0.86 | unchanged — no regression |
| GraphQL (out of scope) | 0.71→0.71 | unchanged — deliberately not filled |

Staging was updated identically (also from repo source). Both KBs are now consistent on the gap topics and Agent Skills.
