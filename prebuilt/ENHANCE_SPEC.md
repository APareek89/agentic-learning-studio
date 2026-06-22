# Library Enhancement Spec — bring prebuilt lessons up to the new-lesson quality bar

**Goal.** The 98 prebuilt lessons in `prebuilt/lessons/*.json` were authored against the OLD
prompts and are pedagogically weak (no orientation hooks, no `mentalMap.structureType`, thin on
failure-modes / verify-AI / recall). Enhance each one to the SAME bar a freshly-generated lesson
hits today — **by editing its existing Blueprint JSON in place**, keeping it schema-valid, then
re-seeding. We do this with agents (this session's model) — **no app Anthropic API calls**.

**Hard rule (the invariant):** the Blueprint is DATA ONLY. Never write HTML/CSS/JS. The
deterministic renderer (`renderArtifact`) makes the HTML from your Blueprint.

**Edit, don't rebuild.** The current file already PASSES validation. Preserve the gate-critical
scaffolding — `glossary` ids, `citations`, and every `mentalMap` node's `moduleId` wiring — and
IMPROVE on top of it. Wholesale rewrites tend to break the gates. Keep `slug`, `meta.title`.

---

## ⭐ CONTENT RICHNESS — THIS IS THE HOOK (most important; do NOT be thin or skimpy)

These free library lessons are the top-of-funnel: people stay because the free lesson is genuinely
great, then convert to paid personalized lessons. So be GENEROUS with substance — structure alone
(orient hooks, structureType) is necessary but NOT enough. Every enhanced lesson must have:

- **A concrete PROBLEM/SCENARIO anchor.** Open the lesson with a real-world problem statement it
  solves, and thread ONE running example/case study through the modules (e.g. "a support bot that
  must triage billing complaints", "a docs-search feature that keeps citing the wrong page"). Make it
  feel like solving a real task, not reciting facts.
- **A BIG, fully-worked example — especially for BEGINNER.** Beginner = concrete-before-abstract:
  build up one substantial, realistic artifact step by step IN CONTEXT of the problem statement. For a
  prompt lesson that means a COMPLETE, real prompt (role + context + task + constraints + output
  schema) assembled and shown in full — not a 2-line fragment. Don't make the learner infer the whole
  from a snippet. (Intermediate: a completion problem on a realistic artifact. Advanced: terser, focus
  on the hard/edge parts — strip the basics.)
- **Real CODE EXAMPLES** for any technical/build topic: actual runnable `codeExample` blocks in the
  lesson's framework (use `predictThenReveal` so they predict output first), with a `code-path`/file
  context where it helps. More than one where the topic warrants it.
- **At least one CASE STUDY** (a `scenario` or rich `functionalExample`): the idea applied to a
  concrete, believable situation with the decision/tradeoff made explicit — ideally a situation a
  practitioner would actually hit.
- **Two ways to see each key idea:** a plain business/`functionalExample` framing AND (for technical
  topics) the code — so non-coders and engineers both get value.
- **Substantial bodies.** Each module should be a real read, not a stub. A good enhanced lesson renders
  noticeably larger than the thin original. If a module feels skimpy, add the worked example / case
  study / second example it's missing. Quality over speed — take the time.

Tune all of the above to `learnerProfile.level` (beginner gets the big worked anchor + plain analogies
+ most scaffolding; advanced gets depth/edge-cases, not re-explained basics). See the exemplar
(`prebuilt/_exemplar.json`) for the target density.

---

## The quality bar — apply ALL that fit the topic (from SKELETON_SYSTEM + MODULE_SYSTEM)

1. **`mentalMap.structureType`** — set it: `procedural` (how-to/build → ordered path, give nodes
   `order` + set `entryNodeId`), `dependency` (must-grasp-X-before-Y), `conceptual` (what-is/how-does
   — the default for explanatory; OMIT fake `order`), or `comparative` (X vs Y → nodes are the options).
2. **7-question arc** ordering: WHAT / WHY-IT-EXISTS / PIECES early → HOW in the middle →
   WHEN-IT-BREAKS late → KNOW-IT + WHAT-NEXT in synthesis. Reorder modules/nodes to hold this arc.
   Protect the under-weighted ones: #2 (why it exists), #5 (failure modes), #6 (self-check), #7 (next).
3. **Node `orient`** (every `mentalMap` node): a 10–15 word description of what that block covers /
   why it's here (not a sentence-long explanation). Today most are missing — add them.
4. **WHY-IT-EXISTS hook** — early (module 1's framing): the problem it solves / when you'd reach for
   it, as a real block (a `conceptual` opener or a `note`), not buried history trivia.
5. **Module `sub`** — one short phrase per module: how it follows from the previous one (the spine).
6. **FAILURE MODES** — a deliberate "how this breaks in practice" element (a `conceptual`/`note`
   "How this breaks" block, or a `decisionCallout.avoidWhen`) in the relevant late module. Real
   content, not scattered warning asides.
7. **VERIFY-AI-OUTPUT** — where a module teaches code/build: a short concrete "how to check the
   AI-generated version before trusting it" `note`/checklist (the specific things to verify for THIS topic).
8. **RECALL-FIRST** — on a `codeExample`, use `predictThenReveal {prompt, answer}` so they predict
   the output BEFORE seeing it. On a hard prose concept, OPEN with a one-line "Before reading on,
   predict: …" callout (a `note`). Have a later module briefly bring back an EARLIER concept (spaced recall).
9. **WORKED → COMPLETION → SOLO ramp** — earlier modules worked examples; later modules a completion
   problem (key line left as a TODO via `predictThenReveal`); the synthesis capstone is the SOLO build.
10. **LEVEL = scaffolding that FADES** — beginner: pre-teach vocab, concrete-before-abstract, fully
    worked, explain the why. intermediate: assume vocab, completion problems, tradeoffs, edge cases.
    advanced: STRIP basics, problems over worked examples, focus on failure modes / non-obvious
    interactions. "More text" for advanced must add DEPTH, never re-explain basics. Use `depthTier:"deeper"`
    to gate advanced detail.
11. **synthesis** — `recap` phrased as a RETRIEVAL prompt (reconstruct from memory), `buildOrder`
    mirrors module order exactly, `capstone` = a solo build tied to the goal AND points to the NEXT rung
    (never a dead end).
12. **Subject fidelity** — teach the subject as taught to anyone; don't reframe "for <role>". Keep examples concrete.

## Schema gates you MUST keep passing (run the validator — see below)
- **shape** — Zod. Block kinds: `conceptual, technical, functionalExample, codeExample, decisionCallout,
  decisionMatrix, decisionTree, diagram, scenario, walkthrough, taxonomy, note, selfCheckQuiz,
  interactiveScatter, interactiveSlider, steppedFlow, knowledgeCheck`. `body` fields are RichText
  (array of `{t:"text"|...}` nodes) — copy the shape from the current file / the exemplar; don't invent.
- **gate1 term-integrity** — modules' `termIds` may only reference ids that exist in `glossary`.
- **gate3 decision-coverage** — if a module sets `decisionItForces`, it must contain a
  `decisionMatrix` | `decisionCallout` | `decisionTree` block.
- **gate4 mentalmap-wiring** — at least one `mentalMap` node must link to a real module via `moduleId`.
- **gate5 citation-integrity** — module `citations` may only reference ids in the top-level `citations`.
- **gate6 matrix-alignment** — every `decisionMatrix` option must have a cell for every criterion.
- **gate7 combo-soundness** — EACH module must have ≥1 always-visible block (at least one block with
  NO `visibleWhen`), or some learner combos see it empty.
- **knowledge_check gate** — only include `selfCheckQuiz`/`knowledgeCheck` blocks if the lesson's
  `learnerProfile.lessonTypes` includes `knowledge_check`. (predictThenReveal / predict-first notes /
  scenario are NOT gated — weave them in regardless.)

## Exemplar (the target)
Study `prebuilt/_exemplar.json` — that's `the-agent-loop`, already rebuilt to this bar. Mirror its
use of `structureType`, node `orient`, failure-mode + verify blocks, predictThenReveal, and synthesis.

## Per-lesson procedure (what each agent does)
1. `Read prebuilt/lessons/<slug>.json` (current valid baseline) and skim `prebuilt/_exemplar.json`.
2. Apply the quality bar above with targeted `Edit`s (preserve glossary/citations/mentalMap wiring).
3. Self-validate — loop until it prints `OK`:
   `NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem" npx tsx scripts/validate-lesson.ts <slug>`
   Fix every error it lists; do not finish on `INVALID`/`PARSE-FAIL`/`RENDER-FAIL`.
4. Done = validator prints `OK` with `structureType` set and `orientHooks` = all nodes.

## Publish (done by the orchestrator, not per-agent)
- Seed to the DB in `.env` (staging): `npx tsx scripts/seed-library.ts` (validates + renders + upserts;
  invalid files are skipped and logged to `prebuilt/INVALID.md`, old DB content kept).
- Mark done in `prebuilt/ENHANCED.json` and `update prebuilt_lessons set content_version='v3-agent-2026-06'`
  for the seeded slugs. Then promote staging→prod when the user approves.
