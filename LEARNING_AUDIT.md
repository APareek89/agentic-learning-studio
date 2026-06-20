# LEARNING_AUDIT.md — evidence-based learning-science review
_Auditor stance: skeptical. Only working code counts; UI copy and feature names do not. Ambiguity rated DOWN. Audited at commit on 2026-06-19 (post Phase-1 redesign)._

---

## PHASE 0 — Architecture map (where each capability lives, or is absent)

| Capability | Where it lives | Notes |
|---|---|---|
| **Intake / context capture** | `public/index.html` dropdowns (levels· depth· examples· text· extras· lesson-type) + open-text `industry/build-goal/framework`; `public/app.js` `sel{}` + `buildPayload()`; resolved in `src/agent/nodes.ts` `profiler()` | All learner-DECLARED. Level is multi-select self-report. |
| **Lesson generation** | `src/agent/graph.ts` (`profiler→retriever→architect→seedFirstModule→composer`); prompts in `src/agent/prompts.ts` (`PROFILER_SYSTEM`, `SKELETON_SYSTEM`, `MODULE_SYSTEM`); `nodes.ts` `architect` (skeleton) + `runDeepDive` (per-module bodies). Output = Blueprint JSON (`src/render/schema.ts`) | Progressive: skeleton then on-demand modules. |
| **Rendering / interactive surface** | `src/render/components.ts` (one renderer per block), `src/render/runtime.ts` (delegated handlers, viz hydration, KC grading client), `src/render/tokens.ts` (CSS, 27-combo gates, collapsibles, scroll-reveal) | Model emits data only; renderer owns markup. |
| **Questions / exercises / assessment** | `selfCheckQuiz` → `components.ts` `quiz()`; `knowledgeCheck` → `components.ts` `knowledgeCheck()` + `POST /api/check` (`src/server.ts:428`) + `schema.ts:304` | Two mechanisms of very different rigor (see P1). |
| **Feedback handling** | `POST /api/check`: MCQ verified vs Blueprint; freeText graded by Haiku → `{correct, feedback}` (one sentence); client `runtime.ts` `kcShow()` reveals explanation | Real for KC; none for `selfCheckQuiz`. |
| **Learner state / memory (per-user, cross-session)** | Migration `0002_users_phase1.sql`: `lessons` (history + rating, 30-day expiry) + `user_preferences` (last selections + sign-up profile). Routes: `/api/lessons`, `/api/preferences`, `/api/profile`, `/api/suggest` (`server.ts:94–140`) | Stores **preferences + history + ratings**. **No mastery/performance state.** |
| **Scheduling / spaced review** | **ABSENT.** No scheduler, no review queue, no interval logic, no resurfacing. `/api/suggest` (`server.ts:125`) suggests NEW topics, not review of learned concepts. | The single biggest hole. |
| **Analytics / success metrics** | `POST /api/rate` 1–5 stars on `lessons` (`server.ts:143`); progress bar = **% of blocks opened** (`runtime.ts` `setProgress()`); dashboard shows stars + "days left" (`app.js:485`) | Measures **satisfaction + engagement**, never learning. |
| **Conversation loop (agentic asset)** | `POST /api/ask` (RAG answer in chat, `server.ts:382`) + `POST /api/ask/expand` (grows a NEW module from a question via `runDeepDive`, `server.ts:403`) | Real mid-flow reshaping — but it **adds content**, never adapts difficulty. |

Knowledge-check results are **not written anywhere** (confirmed: no insert/update in `/api/check`). So no behavioral signal survives the session — which starves principles 3, 6, 8, and 10.

---

## PHASE 1 — Scored rubric

| # | Principle | Rating | Evidence (files) | The gap (trap checked) |
|---|---|---|---|---|
| 1 | Active over passive | **PARTIAL** | Generative elements exist: `knowledgeCheck` freeText (`components.ts` `knowledgeCheck`), `predictThenReveal` on code (`components.ts` `codeBlock:109`), learner-authored questions (`/api/ask`). But `block()` (`components.ts:190`) shows the **default unit is `richText` to read**; interactive viz (`vizBlock`) is **click-through = consumption (trap hit)**; KC is opt-in + terminal. | Producing is the exception, not the spine. Default lesson = reading. |
| 2 | Retrieval practice | **PARTIAL** | Real recall ONLY in `knowledgeCheck` freeText: textarea, answer in a **hidden** `.kc-explain`, graded server-side (`components.ts:159`, `/api/check:449`). | `selfCheckQuiz` = **Reveal button with answer in the DOM** (`quiz():142` — trap: not retrieval). KC **MCQ shows options on screen** (recognition — trap). Recall is opt-in, last-in-module, sparse, **never spaced, never persisted**. |
| 3 | Spacing & interleaving | **ABSENT** | No scheduler / review queue / interval code anywhere. `/api/suggest` is new-topic suggestion. KC results not stored. | Nothing resurfaces. No persistence of what to review. Single-session only. |
| 4 | Cognitive-load management | **SOLID** | Chunked modules (`schema.ts ModuleSchema`); examples & code **collapsed by default** (`components.ts` `collapsible():154`, used at `:200/:207`); progressive disclosure (`depthTier:"deeper"` + overview↔workbench, `runtime.ts`); density control (low/med/high, `prompts.ts`); advance organizer = mental map; 27-combo gates hide off-target content (`tokens.ts`). Foundational→advanced ordering (`SKELETON_SYSTEM`). | Genuine strength. Minor deduction: scroll-reveal animation (`runtime.ts observeReveals`) adds extraneous motion; difficulty isn't sequenced by measured skill. |
| 5 | Multimedia discipline | **PARTIAL** | When present, visuals carry meaning and sit with their words: `interactiveScatter/Slider/steppedFlow` with captions (`components.ts` `vizBlock`), inline diagrams, "In plain words" analogy (`analogyHtml:148`). | Visuals are **opt-in** (`visualsRequested`) and sparse; decorative scroll-reveal + the landing's animated neural hero add motion with no instructional value. |
| 6 | Expertise adaptation — fade, don't deepen | **SUPERFICIAL** | Level comes from a **self-select dropdown** (`nodes.ts:79–83` `pickedLevels`), falling back to prompt inference, then default. 27-combo gates do reduce scaffolding for "advanced" (acronyms off, tiers collapsed) — directionally correct WITHIN a lesson. | **Trap hit twice:** (a) least-informed person makes the calibration call; (b) a mixed selection picks the **LEAST-advanced** level → **MORE** scaffolding for everyone (`nodes.ts:76–80`). Level is **never inferred from behavior** and **never adapts across lessons** — and KC performance isn't even stored to enable it. |
| 7 | Worked-example → problem progression | **SUPERFICIAL** | Elements exist independently: worked (`codeExample`, `walkthrough`), completion-ish (`predictThenReveal`), problem (`knowledgeCheck` freeText). | No orchestrated **fade**. Blocks are independent; the prompts don't sequence worked→completion→solo; predict/KC are optional. Modeling and transfer aren't connected. |
| 8 | Anti-fluency / desirable difficulty | **SUPERFICIAL** | One real effortful element: KC freeText forces production before reveal. | The system optimizes for **smoothness**: examples/code collapsed (frictionless), `selfCheckQuiz` = reveal (fluency illusion), **success = star ratings** (`/api/rate`) and a **% -opened progress bar**. No "confidently wrong" surfacing — confidence is never elicited, correctness never compared to confidence. |
| 9 | Feedback quality | **PARTIAL** | KC: immediate, task-targeted, specific-ish — Haiku returns **"ONE short sentence of specific feedback"** + correct/incorrect + reveals explanation (`/api/check:455`, `runtime.ts kcShow`). | No explicit **NEXT STEP** ("re-read X / try Y"). The common path (`selfCheckQuiz`) gives **no feedback at all**, only a reveal. |
| 10 | Backward design + measure RETENTION, not satisfaction | **SUPERFICIAL** | Partial alignment exists: modules carry objectives ("After this you'll be able to…", `schema.ts:340`), and KC questions are told to "test what the learner wanted to learn" tied to objectives (`prompts.ts:178`). | **Success is measured by star ratings** (`/api/rate`, dashboard `lc-stars`) and engagement (% blocks opened) — **the exact anti-pattern**. **Zero delayed retention/transfer**: KC is in-session, not persisted, never re-tested. The principle most platforms skip is skipped here. |

**Score tally:** SOLID ×1 (load management) · PARTIAL ×4 (active, retrieval, multimedia, feedback) · SUPERFICIAL ×4 (adaptation, worked-example fade, desirable difficulty, backward-design/retention) · ABSENT ×1 (spacing).

---

## PHASE 1.5 — Anti-patterns FOUND (flagged, not endorsed)
- **Satisfaction as the success signal.** Star ratings are the saved per-lesson "quality" metric (`/api/rate`, `lessons.rating`) and the dashboard's headline (`app.js:485`). This is satisfaction, not learning.
- **Engagement-as-learning.** The progress bar is **% of building blocks opened** (`runtime.ts setProgress`) — time/clicks dressed as progress.
- **Click-through "interactivity" counted as active.** The interactive viz blocks are consumption with a slider/tabs.

**Anti-patterns NOT present (credit where due):** No learning-styles matching (the content-type toggles are preferences, not visual/auditory/kinesthetic meshing). No streaks. No "% retention" pyramid / Dale's-Cone numbers in copy (scan clean).

---

## PHASE 2 — The 3–5 biggest, most consequential gaps (blunt)

1. **You measure satisfaction, not learning.** A 5-star rating and "blocks opened" are the only success signals. Nothing tells you whether anyone remembered anything a day later. Until a retention metric exists, every other "improvement" is unfalsifiable.
2. **Nothing is remembered about the learner's MIND — only their preferences.** `user_preferences` + `lessons` store what they picked and generated; KC results are thrown away (`/api/check` writes nothing). There is no mastery model, so adaptation, spacing, and retention measurement are all impossible by construction.
3. **No spacing, at all.** The one principle with the largest, most replicated effect on durable memory is entirely absent. A lesson is a one-shot; concepts never come back.
4. **Adaptation is backwards.** Level is self-reported by the least-informed party, and a mixed selection gives everyone MORE scaffolding — the opposite of fade. Competence is never inferred from behavior.
5. **The retrieval you have is mostly recognition or reveal.** Real free-recall exists but is opt-in, terminal, and rare; the default checks show options or a Reveal button — which forfeits the testing effect.

---

## PHASE 2 — Prioritized backlog (agentic-studio-specific: exploit the conversation loop + per-user memory)

| Feature | Principle(s) | Failure mode it fixes | Effort | Priority |
|---|---|---|---|---|
| **Persist a per-user mastery map** — write every KC result (per concept/`termId`/objective: correct?, confidence?, when) to a new `concept_mastery` table; `/api/check` records it. | 3, 6, 8, 10 | "Nothing is remembered about the learner's mind" — the prerequisite for everything below. | M | **P0** |
| **Spaced review across sessions** — on next login, the agent opens with a short **free-recall** check on the weakest/oldest concepts from the mastery map (SM-2-style intervals), interleaving across past lessons. A "Review" surface, not a new lesson. | 3, 2, 1 | The absent principle. Turns one-shot lessons into durable memory. | L | **P0** |
| **Replace stars-as-success with a retention metric** — demote the rating to an optional product signal; the headline becomes "% of prior-session concepts recalled" from the spaced check. Kill the %-opened progress bar as "progress." | 10, 8 | "You measure satisfaction, not learning." | S* | **P0** |
| **Free-recall by default** — make `knowledgeCheck` (freeText) a non-optional spine item per module (not opt-in/terminal), and convert `selfCheckQuiz` from Reveal-the-answer to **predict/answer-before-reveal** (answer hidden until the learner types). | 1, 2, 8 | Recognition/reveal forfeiting the testing effect; active learning being the exception. | M | **P1** |
| **Behavioral level calibration** — adjust scaffolding from KC performance within and across lessons (fade when hard items are answered correctly), overriding the self-report dropdown; the conversation loop can confirm ("that looked easy — want me to go deeper / drop the basics?"). | 6 | Least-informed self-calibration; mixed-audience over-scaffolding. | M | **P1** |
| **Next-step feedback wired to the agent** — `/api/check` returns a concrete next action; on a wrong KC the chat offers a one-click **`/api/ask/expand`** to generate exactly the missing piece as a new module. | 9, 1 | Bare correct/incorrect with no "what to do next." | S | **P1** |
| **Worked→completion→solo fade for code** — extend `predictThenReveal` into a deliberate sequence (full worked example → completion problem with blanks → solo build-it), tracked toward mastery. | 7, 1 | Modeling and transfer never connected. | M | **P2** |
| **Confidence calibration + "confidently wrong" surfacing** — ask confidence before reveal; the spaced scheduler prioritizes items the learner was confident-but-wrong on. | 8 | No surfacing of the most dangerous knowledge state. | M | **P2** |

\* P0 metric work is small in code but depends on the mastery map; sequence it right after.

**Design rule for all of the above:** every feature must use the two things a generic LMS lacks — the **conversation loop** (`/api/ask`, `/api/ask/expand`) and **per-user memory** (`lessons`, `user_preferences`, the proposed `concept_mastery`). Spacing/feedback/adaptation should flow through the agent dialogue, not a separate quiz UI.

---

## PHASE 2 — DO NOT BUILD (anti-patterns + learning-theatre)
- **Learning-styles matching** (visual/auditory/kinesthetic meshing). Debunked; no meshing effect. Keep the content-type toggles as preferences — do **not** reframe them as styles.
- **Streaks, badges, vanity dashboards, time-on-task, or "% blocks opened"** presented as success. The %-opened progress bar already does this — **demote it, don't extend it**.
- **Satisfaction (stars/thumbs) as the learning metric.** Fine as a product signal; never as evidence of learning.
- **Any "% retention" pyramid / Dale's-Cone numbers** in UI or prompts (fabricated). None exist today — keep it that way.
- **More click-through "interactive" widgets** counted as active learning. Clicking a slider is not generating. Add effortful production, not more toys.
- **A bigger "advanced" lesson.** Do not equate advanced with more/denser content; advanced should mean **less scaffolding**, driven by demonstrated competence.
