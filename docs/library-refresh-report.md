# Library Refresh Report

**Scope:** LOCAL-ONLY, STAGING DB (`ydgiysthvxhlfpzxyrmy`, ap-south-1). No commits/pushes.
**Owner-directed multi-phase refresh:** inventory → propose 50 → migrate reading-mode → rebuild existing → build 50 new. QA battery is the definition of done on every touched lesson.

Companion snapshots: `docs/library-inventory.json` (Phase 1), `docs/prod-demand.json` (Phase 2 demand mining).

---

## Phase 1 — Inventory ($0, read-only) — ✅ DONE

**Source:** `scripts/inventory.ts` against staging (`prebuilt_lessons` + `community_lessons` + `contributors`), blueprint-parsed for readingMode / module loadState.

### Library — 100 lessons, perfectly category-balanced (10 × 10)

| Category | Count | | Category | Count |
|---|--:|---|---|--:|
| Agents | 10 | | Generative | 10 |
| Build Projects | 10 | | Infrastructure | 10 |
| Evaluation | 10 | | LLMs | 10 |
| Foundations | 10 | | RAG | 10 |
| Frameworks | 10 | | Safety | 10 |

- **Levels:** 59 intermediate · 24 beginner · 17 advanced
- **Render family:** **100/100 classic-vertical** — *zero* world lessons in the library yet (this is what Phases 3–4 fix)
- **Built-ness:** 100/100 fully built (all 5/5 modules) — no stubs, no courses
- **Content versions:** 78 `v4-rich-reenrich-2026-06-23` · 20 `v3-agent-2026-06` · 2 `v2-2026-06-overview-7q` — all pre-date the world template + fact-ledger + code-gate pipeline, so **every one is a rebuild candidate**.

### Community — 7 lessons, 1 contributor

| slug | cat | lvl | by | ♥ | read | built | render |
|---|---|---|---|--:|---|---|---|
| agent-memory-for-customer-support… | RAG | beg | pojidov934 | 0 | world | 6/6 | **world** |
| build-and-run-llm-app-evaluations… | LLMs | beg | pojidov934 | 0 | world | 6/6 | **world** |
| from-repo-to-marketing-creative-agent-59d879 | Agents | int | AP | 0 | horizontal | 0/5 | classic-horizontal ⚠ PARTIAL |
| how-large-language-models-work-a1956c | LLMs | beg | anandp.pareek6 | 1 | vertical | 2/6 | classic-vertical ⚠ PARTIAL |
| building-a-customer-support-app-with-langchain… | Frameworks | beg | anandp.pareek6 | 1 | vertical | 5/5 | classic-vertical |
| how-langchain-works-the-building-blocks-2ae697 | Frameworks | beg | AIdude | 1 | vertical | 1/5 | classic-vertical ⚠ PARTIAL |
| fine-tuning-an-llm-for-a-specific-task-7b3455 | LLMs | beg | AIdude | 4 | vertical | 5/5 | classic-vertical |

- **Render family:** 4 classic-vertical · 2 world · 1 classic-horizontal
- **Built-ness:** 4/7 fully built. **3 PARTIAL** (skip in migration): `from-repo-to-marketing-creative-agent-59d879` (0/5), `how-large-language-models-work-a1956c` (2/6), `how-langchain-works-the-building-blocks-2ae697` (1/5)

### Migration readiness (readingMode → world)
- **Library:** all 100 are classic + fully-built, but **all 100 are being rebuilt in Phase 4** (rebuild emits world), so the data-migration flip targets them only as a fallback.
- **Community eligible to flip:** **2** fully-built classic verticals (`building-a-customer-support-app-with-langchain…`, `fine-tuning-an-llm-for-a-specific-task-7b3455`). 2 are already world; 3 partial builds are skipped.

---

## Phase 2 — Propose 50 new topics — ⏳ AWAITING OWNER APPROVAL

**Grounding (3 sources):** (1) prod real demand — `docs/prod-demand.json`, 44 generations / 39 distinct prompts; (2) `docs/kb-gap-report.md` demand clusters; (3) mid-2026 web-trend sweep (10 parallel research agents → 120 candidates → synthesis). Curated to exactly 50, deduped vs the existing 100 (zero slug collisions), GraphQL-for-agents excluded per brief.

**Distribution:** Agents 7 · Build Projects 6 · Evaluation 7 · Foundations 3 · Frameworks 5 · Generative 3 · Infrastructure 5 · LLMs 4 · RAG 5 · Safety 5 = **50**.
Demand-weighted toward the owner's priority buckets (agents/evals/frameworks/RAG/build/ops/security); Foundations & Generative kept light since the existing 100 already cover them deeply.
**Mode:** 35 std / 15 quick (30%). **Level:** 3 beginner · 32 intermediate · 15 advanced. **Grounding split:** 15 prod-demand · 10 both · 7 kb-gap · 18 trend.

All 4 named prod-demand clusters appear: A2A (concept #1 + stack #2 + build #8 + security #47 = 4), Claude Code/Agent SDK/Skills (#3, #24, #25), voice agents (#7, #9, #20), customer-support builds (#10, #14), prompt caching (#32, #37), databases-for-agentic-systems (#33, #43, #44). Evals #1 cluster → 7 Evaluation lessons. Streaming/SSE gap → #11.

**Curation applied to the raw synthesis:** dropped "Build an AI Gateway with LiteLLM" (duplicated the existing *Model Gateways with LiteLLM* + new *Model Routing* #35); differentiated the two prompt-caching lessons (#32 Infra = cost/ops lever, #37 LLMs = KV-cache mechanism); moved 6 narrow lessons to quick.

Manifest with slugs: `docs/new-topics-proposal.json`.

### The 50 proposed topics

**Agents** (7)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 1 | The A2A Protocol: Agent Cards and Cross-Vendor Handoff | intermediate | std | both | #1 prod protocol request (asked 3x) with zero library coverage; A2A is now the horizontal cross-vendor coordination standard complementing MCP. |
| 2 | The MCP + A2A Stack: Tools vs Agent Coordination | advanced | std | prod-demand | Merges 3x A2A demand with multi-agent build demand into the 2026 enterprise-default two-layer architecture (MCP for tools, A2A for agents). |
| 3 | Customizing Claude Code: Subagents, Hooks, and CLAUDE.md | intermediate | std | kb-gap | Part of the 4x Claude Code/.claude customization cluster and a clean KB gap; teaches lifecycle hooks, forked subagents, and repo-constitution conventions. |
| 4 | Supervisor, Swarm, and Handoff: Choosing a Multi-Agent Topology | intermediate | std | prod-demand | Decision-focused answer to the recurring multi-agent-workflow ask (3x); covers the three production-surviving orchestration shapes, distinct from generic orchestration. |
| 5 | Context Engineering: The Discipline | intermediate | std | trend | Context engineering replaced prompt engineering as the core 2026 agent-building skill; teaches what-belongs-in-the-window selection and the memory-vs-context framing. |
| 6 | Interleaved Thinking Between Tool Calls | advanced | std | trend | Reasoning-plus-tools models now think between tool calls, reshaping how multi-step agent loops are structured; a first-class 2026 agent feature not yet covered. |
| 7 | Turn Detection, Barge-in, and Latency Budgets for Voice Agents | advanced | std | prod-demand | Voice support agents asked 2x; the conversational-UX layer (semantic turn detection, interruption handling, ~800ms budget) is where most voice prototypes break. |

**Build Projects** (6)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 8 | Build an A2A Agent with a Signed AgentCard | intermediate | std | both | A2A asked 3x with no build path; a hands-on lesson exposing a signed AgentCard and handling a delegated task turns the spec into a shippable skill. |
| 9 | Build a Voice Agent with the Realtime Speech-to-Speech API | intermediate | std | prod-demand | Voice customer-support agents requested 2x with no build lesson wiring a live speech-to-speech loop end to end. |
| 10 | Build a Customer-Support Agent with Tools and Escalation | intermediate | std | prod-demand | Customer-support agent builds appear 5x in prod (the top applied GAP); an end-to-end build with tool calls, knowledge lookup, and human escalation. |
| 11 | Streaming Agent Output with SSE and the Vercel AI SDK | intermediate | std | kb-gap | Streaming/SSE is an emerging clean KB gap; token + tool-part streaming is the baseline UX every 2026 agent app needs. |
| 12 | Build a Multi-Agent Workflow with Handoffs | intermediate | std | prod-demand | Multi-agent workflow builds asked 3x; a concrete supervisor + specialist-agents build with handoff, shared state, and result merging. |
| 13 | Build a Multimodal RAG App over PDFs with ColPali | advanced | std | prod-demand | RAG-build is a named prod GAP (7x); an OCR-free visual-document pipeline retrieving figures, tables, and charts is the most in-demand net-new RAG build. |

**Evaluation** (7)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 14 | Build Evals for a Customer-Support Agent | intermediate | std | both | Directly requested in prod (evals for a customer-support app) inside the #1 uncovered eval cluster; end-to-end simulation + turn-level + tool-call scoring. |
| 15 | Trajectory and Tool-Call Evaluation for Agents | advanced | std | both | Grading the path (tool selection, argument validity, step order) not just the answer is the core 2026 agent-eval skill and the top uncovered cluster. |
| 16 | Eval-Driven CI Gates for Agents | advanced | std | kb-gap | CI-gating is the explicitly THIN angle in the KB-gap report; wires evals into GitHub Actions to block PRs on quality regression with pass@k thresholds. |
| 17 | pass@k and pass^k: Measuring Agent Consistency | intermediate | quick | kb-gap | Foundational 2026 metric for non-deterministic agents (any-of-k vs all-k); a single teachable concept underpinning CI eval gates. |
| 18 | Debiasing and Calibrating LLM Judges | advanced | std | trend | Position/verbosity/self-preference bias and calibration drift on every judge swap now demand kappa/alpha agreement checks; extends LLM-as-Judge beyond basics. |
| 19 | Production-to-Eval Feedback Loop | intermediate | quick | kb-gap | Converting failed production traces into eval cases grows golden sets from real behavior; a standard loop in the 2026 agent-eval stack. |
| 20 | Evaluating Voice Agents | intermediate | std | prod-demand | Voice support asked 2x; adds voice-specific metrics (WER, turn-latency p95, containment, barge-in correctness) not covered by text evals, within the top eval cluster. |

**Foundations** (3)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 21 | The Gen AI Solution Architect Role | beginner | std | prod-demand | Explicit prod request for the 'gen AI solution architect' role; maps the end-to-end decision surface (models, RAG, agents, evals, cost, safety) for newcomers. |
| 22 | From Prompting to Context Engineering to Agents | beginner | quick | trend | Orients learners on the 2026 progression that reframed the field; a conceptual on-ramp connecting prompting, context, tools, and autonomy. |
| 23 | Anatomy of an Agentic Application | beginner | std | kb-gap | Grounds the many applied builds (support agents, agentic LMS, signal-scoring agents) in a shared component vocabulary before learners dive into frameworks. |

**Frameworks** (5)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 24 | Building Agents with the Claude Agent SDK | intermediate | std | both | Claude Agent SDK asked 4x in prod with a clean KB gap; teaches production harness primitives (subagents, sessions, hooks) beyond raw API calls. |
| 25 | Claude Skills: Portable Filesystem Capabilities (SKILL.md) | intermediate | std | kb-gap | Part of the 4x Claude cluster and a distinct portable capability format; SKILL.md packages load on demand across Claude Code and the Agent SDK. |
| 26 | LangChain vs LangGraph: Chains, Graphs, and When to Use Each | intermediate | std | prod-demand | Explicit prod request for the head-to-head; clarifies the chain-vs-durable-graph decision the existing single-tool lessons never contrast directly. |
| 27 | Type-Safe Agents with Pydantic AI | intermediate | quick | trend | Pydantic AI V2 (stable June 2026) is the go-to for type-safe structured-output agents; a growing framework with no dedicated lesson. |
| 28 | Self-Improving Agents with DSPy and GEPA | advanced | std | trend | GEPA reflective prompt evolution (ICLR 2026 Oral) beats RL with 35x fewer rollouts; how teams now optimize agent prompts and tools from traces. |

**Generative** (3)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 29 | Generative Video APIs: Veo and Sora Workflows | intermediate | std | prod-demand | Text-to-video is now an HTTP API with native synced audio; app-building demand (marketing-ad creation from scripts) needs API-first treatment, not concept-level. |
| 30 | Generative UI: Rendering Tool Calls as Live Components | intermediate | quick | trend | Connecting a tool result to a streamed component is the fastest-maturing agent-frontend pattern powering richer support and app-building agents. |
| 31 | Multi-Model Media Pipelines: Routing and Clip Extension | advanced | quick | prod-demand | Production teams route by scene type and chain clip-extension for coherent long video, matching the marketing-creative app-building prompts. |

**Infrastructure** (5)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 32 | Prompt and Prefix Caching for LLM Apps | intermediate | std | both | Direct prod request ('how prompt caching works in LLMs') with no lesson; prefix/KV caching is the highest-ROI cost lever for repeated agent system prompts. |
| 33 | Databases for Agentic Systems | intermediate | quick | prod-demand | Direct prod request ('different databases in agentic systems'); teaches choosing across vector, graph, key-value, and relational stores for memory tiers. |
| 34 | Agent Sandboxes: Running Untrusted Agent Code Safely | intermediate | std | trend | Coding/computer-use agents execute model-generated code; ephemeral microVM sandboxing (E2B, Firecracker, gVisor) is a core 2026 deployment skill. |
| 35 | Model Routing: Cascades and Cost-Aware Model Selection | intermediate | quick | trend | The ~100x cross-model price spread makes cascade/cost-aware routing the top production cost lever; increasingly governed infra with pre-merge eval gates. |
| 36 | MCP Registries and Server Discovery | intermediate | quick | trend | Teams now discover tools from the ~2,000-server MCP registry rather than hand-wiring them, making registry literacy a practical 2026 requirement. |

**LLMs** (4)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 37 | How Prompt and KV Caching Work | intermediate | std | both | Model-side mechanism behind the cost lever: KV cache, prefix reuse, PagedAttention — why repeated agent prefixes cache (complements the Infra ops lesson). |
| 38 | Reasoning Models and Test-Time Compute | intermediate | quick | trend | Every major lab now ships a reasoning tier that plans and self-checks; practitioners must learn when the token/latency cost is worth it. |
| 39 | Constrained Decoding and Grammar-Guided Generation | advanced | std | trend | FSM/grammar-based decoding is the 2026 production standard for reliable outputs; teaches the 'constraint tax' on tool calls below the JSON-Schema surface. |
| 40 | Distilling Agents from a Frontier Teacher | advanced | quick | trend | Cloning a frontier agent's tool-use trajectories into a fine-tuned small model is the practical path to cheap specialized agents on a team's task distribution. |

**RAG** (5)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 41 | Agentic RAG: Iterative Retrieve-Reason-Refine Loops | advanced | std | both | Dominant 2026 production retrieval paradigm; directly serves the 7x RAG-build and 3x multi-agent-workflow demand by teaching agent-driven decompose/retrieve/judge/re-retrieve. |
| 42 | Contextual Retrieval: Chunk Augmentation Before Embedding | intermediate | quick | both | Anthropic's contextual-retrieval trick still wins 2026 benchmarks (35-67% fewer failed retrievals) and pairs with the 4x-demanded Claude stack via prompt caching. |
| 43 | Retrieval as a Tool: Designing Search for Agents | intermediate | quick | prod-demand | Leading 2026 agents treat retrieval as an agent-invoked tool (grep/search) not passive vector lookup; matches agent-tool-pattern and 'databases in agentic systems' demand. |
| 44 | Text-to-SQL for Agents: RAG Over Structured Data | advanced | std | prod-demand | RAG over relational data via text-to-SQL maps to the prod request for 'different databases in agentic systems'; covers schema retrieval and self-correction. |
| 45 | Self-Correcting RAG: Retrieval Grading and Re-Retrieval | advanced | quick | trend | Grading retrieved chunks and looping back on low relevance (CRAG/Self-RAG lineage) is a survive-production 2026 pattern that cuts hallucination in agentic pipelines. |

**Safety** (5)

| # | Topic | Level | Mode | Grounding | Why |
|--:|---|---|---|---|---|
| 46 | The Lethal Trifecta and the Agents Rule of Two | intermediate | std | trend | The dominant 2026 mental model for agent breaches (private data + untrusted content + external comms) plus Meta's concrete Rule-of-Two design constraint. |
| 47 | Securing A2A: Trust and Auth in Agent-to-Agent Protocols | advanced | std | both | As A2A spreads (3x prod ask), cross-agent trust, delegated authorization, and injection propagation across handoffs become a new attack surface beyond single-agent tool security. |
| 48 | Securing MCP Servers: Tool Poisoning and Rug Pulls | intermediate | std | trend | MCP hit ~97M downloads/month with 30%+ of registry servers carrying flaws; tool poisoning and post-approval rug pulls are the concrete new attack class. |
| 49 | Building an Agent Guardrail Stack (Llama Guard, NeMo, LLM Guard) | intermediate | std | trend | 2026 guardrails are a multi-layer stack across input/output/tool-use, not one filter; teaches wiring classifier and Colang rails, extending the guardrails lesson. |
| 50 | Data Exfiltration Defenses for Agents (Zero-Click Leaks) | intermediate | quick | trend | Real zero-click exploits (EchoLeak in M365 Copilot, GeminiJack) show markdown-image and external-request leaks; blocking exfil vectors and CSP is now a required layer. |

### Cost / time estimate & batch plan
Build-time model (HANDOFF latency profile): **std ≈ 6 min**, **quick ≈ 2.5 min** per lesson; my build concurrency **≤3** (shared Anthropic cap with other sessions).

| Phase | Lessons | Lesson-minutes | Wall @concurrency 2 | Wall @concurrency 3 | Batches of 8 |
|---|--:|--:|--:|--:|--:|
| 4 — rebuild existing (100, all std→world) | 100 | ~600 | ~5.0 h | ~3.3 h | 13 |
| 5 — build 50 new (35 std + 15 quick) | 50 | ~248 | ~2.1 h | ~1.4 h | 7 |
| **Total generation** | **150** | **~848** | **~7 h** | **~4.7 h** | **20** |

Plus the QA battery between each batch (qa-world Playwright + content-audit + validate + 3-lesson learner-hat sampling) — roughly +2–3 h aggregate, run as gates. Realistically an **overnight / multi-session** effort. **Model spend (rough, Sonnet-module-dominated): ~$60–130 total.**

**Batch plan:** concurrency 2 (max 3); resumable via `content_version` bump (`v5-world-2026-07`) + `rebuilt_at`. Phase 4 first, QA-gated, **STOP after batch 1** for owner review (QA table + 2 before/after screenshots). Then Phase 5 from `docs/new-topics-proposal.json` via a new `scripts/build-new-topics.ts` (seeds row → live pipeline with `readingMode=world`, `cards.quick` for quick topics → upsert `prebuilt_lessons`).

---

## Phase 3 — Migration as data — ✅ DONE (design flip live on PROD)

Owner refinement: extend the migration to the **library too** (not just community) — flip `readingMode`→world on all fully-built `prebuilt_lessons` as an INTERIM so the whole library shows the new design (once the world renderer deploys), `$0`; Phase-4 rebuilds then overwrite each with upgraded content.

**Scripts (my area):**
- `scripts/migrate-reading-mode.mjs` (NEW) — `$0` deterministic flip + re-render; covers library + community; eligibility = every module `loadState==="full"`, skips course/partial/already-world; modes: dry / `--out-dir` local / `--apply`.
- `scripts/rebuild-library.ts` — `readingMode:"vertical"`→`"world"` (line ~84), `CONTENT_VERSION`→`v5-world-2026-07`, added `--out-dir` local mode + `--slugs`/`--limit`/`--concurrency`/`--dump`.
- `scripts/qa-world.mjs` — added `file://` mode (QA local html without a server/DB).
- `scripts/shot.mjs`, `scripts/backup-lessons.mjs`, `scripts/inventory.ts`, `scripts/prod-demand.ts` (NEW helpers).

**5-sample verification (local, `$0`):** the-agent-loop · what-is-rag · llm-as-judge · vector-databases-compared · prompt-injection-defense → flipped to world, rendered locally.
- qa-world: **4/5 clean**; `vector-databases-compared` = 1 cosmetic heading-clip on a long old-authored card title (content intact in popup; self-fixes on rebuild).
- content-audit (3): **3/3 clean**.
- **Per-module `selfCheckQuiz` → ✅ check cards + interactive quiz popups verified** (screenshots), both dark+light themes.

**Applied to PROD** (per owner "flip prod now, backup first"): backed up 100 prebuilt + 5 community → `backups/prod-lessons-before-world-flip-2026-07-14.json` (reversible), then **flipped all 105** on prod. Verified: prod `prebuilt_lessons` world=100/vertical=0; **staging untouched** (vertical=100/world=0). Prod live-serve renders classic (unchanged, `world-data=0`) until `src/render/world.ts` deploys — the flip future-proofs the design switch.

## Phase 4 — Enhance existing (rebuild content) — ⏸️ PAUSED (resume on "go") · **ALL WRITES TO PROD DB**

Rebuild the 100 existing through the live pipeline (fact-ledger, code-gate, storyboard pedagogy), world mode, batches of ~8, concurrency 3, QA between, resumable via `content_version=v5-world-2026-07`. Each rebuild OVERWRITES the flipped design-only version with upgraded content.

**🐞 Batch-1 bug caught by the QA gate + FIXED (2026-07-14):** the first batch-1 run produced lessons with **`finalCheck: 0` (no knowledge check)** across all 7 successes. Root cause: `rebuild-library.ts` `generate()` did profiler→retriever→architect→runDeepDive(per module) but **never called `writeOverviewProse`** — the node that writes the S5 finalCheck (+ fills glossary defs/synthesis), which the live `runBuildJob` calls after the module wave (orchestrator.ts:275). Fix: added `await writeOverviewProse(bp)` after the module loop in `generate()`. Verified on `the-agent-loop`: finalCheck now = 5 MCQs, qa-world + audit CLEAN, KC stage renders (`_check`, 5 cards). Batch 1 re-run to prod with `--force` (fixes the 7 + retries `what-is-rag`, which hit a transient module failure first run). **STOP after this re-run for owner review (QA table + before/after).**

## Phase 5 — Build 50 approved — pending (owner says "go" tomorrow; new `scripts/build-new-topics.ts`)

---

## ⏸️ PAUSED 2026-07-14 — RESUME ON OWNER "GO" (2026-07-15)

**Saved locally, not committed** (owner skipped the cloud handoff). A fresh session can resume from this file + the HANDOFF "LIBRARY REFRESH" bullet.

### Exact PROD state at pause
- **Design:** all 100 `prebuilt_lessons` + 5 `community_lessons` = `readingMode:"world"` (flipped). Renders CLASSIC on prod until the world renderer code deploys (`world-data=0`, no visible change; verified).
- **Content:** `content_version` = 75 `v4-rich-reenrich`, 17 `v3-agent`, **8 `v5-world`** (batch-1: 5 have `finalCheck`, **3 are buggy/no-finalCheck**). All 100 are `≠ v5.1` so the resume run redoes everything and self-heals the 3.
- **Backup (pre-flip, local, reversible):** `backups/prod-lessons-before-world-flip-2026-07-14.json` (20 MB, 100 prebuilt + 5 community).
- Staging DB: **untouched** (100 vertical / 0 world).

### Code state (fix already applied, uncommitted)
- `rebuild-library.ts`: `readingMode→world`, `CONTENT_VERSION=v5.1-world-2026-07-finalcheck`, `--out-dir`/`--slugs`/`--limit`/`--concurrency`/`--dump`, **`writeOverviewProse` call added** (the finalCheck fix).
- New scripts: `migrate-reading-mode.mjs`, `inventory.ts`, `prod-demand.ts`, `backup-lessons.mjs`, `shot.mjs`; `qa-world.mjs` gained file:// mode.

### Resume steps (run throughout the day on "go")
```bash
export NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"
set -a; . ./.env; set +a
PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)

# PHASE 4 — rebuild existing content → PROD (world, v5.1, resumable, QA between batches)
DATABASE_URL="$PROD_URL" npx tsx scripts/rebuild-library.ts --category "Agents" --dump /tmp/lib-rebuild --concurrency 3
#   ...repeat per category: Build Projects · Evaluation · Foundations · Frameworks · Generative · Infrastructure · LLMs · RAG · Safety
#   (or one shot: --all --yes ; resumable — v5.1 skips finished lessons)
node scripts/qa-world.mjs /tmp/lib-rebuild/<slug>.html           # element QA (both themes)
node scripts/audit-lesson-content.mjs /tmp/lib-rebuild/<slug>.html # content audit
#   + assert every rebuilt lesson has finalCheck.questions.length > 0 (the bug watch-point)

# PHASE 5 — build the 50 approved new topics (docs/new-topics-proposal.json)
#   TODO: write scripts/build-new-topics.ts (manifest → live pipeline; cards.quick="on" for quick topics;
#   readingMode world; insert into prebuilt_lessons with slug/title/description/category/level). Batches of ~8, QA between.
```

### Gotchas
- **NODE_EXTRA_CA_CERTS** on every model/DB call (corp MITM) — local only; a cloud clone must NOT set it.
- **All writes → PROD** (`DATABASE_URL="$PROD_URL"`). Never repoint the app's default DATABASE_URL at prod.
- Concurrency ≤3 (shared Anthropic account with other sessions).
- ~8.5 min/lesson (modules build sequentially in `generate()`); batch of 8 @ conc 3 ≈ 25 min; 100 ≈ 5–7 h.
- World design is invisible on prod until `src/render/world.ts` et al. deploy — separate owner decision.
- Reversible: restore any lesson from the backup json if a rebuild regresses.
