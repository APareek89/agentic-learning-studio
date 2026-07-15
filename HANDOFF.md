# HANDOFF — Agentic Learning Studio

## 🌍 V2 DESIGN AND UX — CHANGES MADE (2026-07-13 · LOCAL-ONLY, not committed/pushed)
> **STATUS: design APPROVED by the owner (2026-07-13, "the design is mostly fine now").** The
> "Zoom World" template is the PRODUCTION lesson experience for ALL NEW generations, and the
> Builder was reduced to its essentials. Everything below is LOCAL-only — not committed, not
> pushed; the staging push decision comes after the content pass.
>
> **NEXT (separate session, owner has the prompt ready): CONTENT-FLOW PASS** — rework the
> generation-agent SYSTEM PROMPTS (`src/agent/prompts.ts`: PLANNER_SYSTEM / SKELETON_SYSTEM /
> MODULE_SYSTEM / OVERVIEW_PROSE_SYSTEM + their user-prompt builders) against the owner's
> "Content flow guideline" (hook → failure demo → action-verb outcomes → anchored bridge →
> concept at depth → progressive worked example → common mistakes w/ real errors → guided
> practice → independent challenge → knowledge check → decision rule + next gap; 30/70
> explain-to-do ratio, ≤10-line snippets, no filler tone). The guideline is a REFERENCE to be
> MAPPED onto the existing Blueprint block vocabulary — not a new schema; any additive schema
> field needs explicit owner sign-off first.
>
> **1. New lesson template — `readingMode: "world"` (default for every new generation).**
> - **`src/render/world.ts` (NEW)** — `renderBodyWorld` + `WORLD_CSS` + `WORLD_JS`. Each module renders
>   as a MENTAL MAP of its blocks on a pannable/zoomable canvas: every block = a card (kind chip +
>   heading + one-line orient, all DERIVED from the Blueprint — headings from block titles, orient/
>   caption lines from first sentences; the model authors nothing presentation-specific). Clicking a
>   card opens a POPUP carrying 100% of the block content, rendered by the SAME `components.ts block()`
>   renderers as the classic view (now exported, with `synthesisInner`/`citationsInner`) — zero content
>   loss. Beats (Next ▸ / Auto / ↺ / ←→) tour the map with a one-line caption + console strip; stages =
>   modules + lead "This module" card (summary/objectives/why-it-matters/curated visual) + Putting it
>   together + Knowledge check (bp.finalCheck as question cards; mcq graded client-side from embedded
>   correct flags, freeText = write-then-reveal — NOTE: deviates from /api/check server grading, revisit
>   before prod) + Sources. Canvas: drag-pan (6px threshold, works from cards), wheel-zoom, ⤾ recenter.
>   Collapsible in-artifact module rail (hidden by default). Glossary (i) popovers + scatter/slider/
>   stepped viz hydration ported into WORLD_JS. Progress relays to the host via the same `als-progress`
>   postMessage. **Stub modules** (mid-build): a "being built" card + the runtime fires POST /api/module
>   once per stub and self-reloads every 22s — verified live: a stub module self-healed in ~90s.
> - **`src/render/index.ts`** — dispatches to the world renderer when `readingMode==="world"` &&
>   !previewOnly (fast-overview drafts still show the brief); world pages force `data-theme="dark"`
>   (block content uses the existing dark palette) and load WORLD_CSS + WORLD_JS instead of RUNTIME_JS.
> - **`src/render/schema.ts`** — `readingMode` enum gains `"world"`. Existing vertical/horizontal
>   lessons (My Lessons, Library, Community) are UNTOUCHED — they keep the classic renderer.
>
> **2. Builder reduced to essentials (`public/index.html` + `public/app.js`).**
> - KEPT: prompt ("what do you want to learn"), **Level**, **Coverage** (the conceptual/technical
>   depth picker), document/repo uploads, Generate Overview.
> - REMOVED: Objective, Examples, Text (density), Extras (visuals/syntax), Lesson type, **Reading
>   (vertical/horizontal)**, Code framework, and the industry/build-goal context fields.
> - Fixed defaults now sent by `buildPayload`: `examples=functional_code` (every lesson has examples),
>   `visuals=on`, `lessonTypes=["content","knowledge_check"]`, `readingMode="world"`,
>   framework/objective/industry/buildGoal empty. Suggested-topic quick-generate uses the same defaults.
> - **`src/agent/nodes.ts` (profiler)** — density is now DERIVED from level when not sent:
>   beginner→high · intermediate→medium · advanced→low; readingMode defaults to `"world"` (legacy
>   vertical/horizontal still honored for old drafts); world implies knowledge_check (like horizontal).
>
> **3. Verified locally** — `tsc --noEmit` clean · $0 fixture `scripts/test-world.ts` (crewai library
> blueprint → /tmp/als-world.html; Playwright: 8 stages, popups 1000+ chars via REAL clicks, (i)
> popovers inside popups, quiz answers, pan/recenter, 0 errors) · **fresh LIVE lesson end-to-end** on
> :5070 with the exact trimmed-Builder payload: overview 9s → build 354s (5/6; module 1 stubbed,
> uncharged) → artifact renders in world mode (9 stages) → stub self-healed via the world runtime in
> ~90s → full map (screenshots in /tmp/live-world-*.png).
>
> **Known gaps / follow-ups before staging:** (a) final-check grading is client-side in world mode
> (embedded correct flags) — wire /api/check for parity; (b) host "Ask more"/rating flows untouched
> and work; the host Dark toggle is a no-op on world pages (always dark by design); (c) the Slides
> toggle + horizontal mode still exist for old lessons — retire later if the owner wants; (d) design
> mockups that led here live in `public/mockups/` (untracked) — `interactive-v9-full.html` is the
> approved reference.
>
> **4. CONTENT-FLOW PASS (2026-07-13 · LOCAL-ONLY · prompts only, ZERO schema changes).** The owner's
> content-flow guideline (hook → failure demo → verb outcomes → anchored bridge → concept-at-level →
> progressive example → mistakes-with-real-errors → guided practice → independent challenge →
> knowledge check → decision rule + next gap; 30/70 explain-to-do; ≤10-line snippets; no filler) is
> now encoded in the generation prompts, mapped onto the EXISTING block vocabulary. Files touched:
> `src/agent/prompts.ts` (MODULE_SYSTEM + moduleUserPrompt = main work; SKELETON_SYSTEM,
> PLANNER_SYSTEM, architectUserPrompt plan-branch, OVERVIEW_PROSE_SYSTEM, BRIEF_SYSTEM) and
> `src/agent/calibration.ts` (LevelSpec gains `conceptShape`, emitted by calibrationDirective —
> extends, composes with densityBuys()).
> - **Mapping (guideline item → existing home):** hook → module's FIRST block opens with a ≤2-sentence
>   problem-question (also the world card's orient line) · failure demo → codeExample + predictThenReveal
>   whose `answer` carries the VERBATIM error/wrong output (no `output` field needed) · outcomes →
>   module.objectives + brief.outcomes (action verbs; "understand X" banned) · bridge → the `analogy`
>   field, anchored to nearest anchor (role > prior modules > everyday), side-by-side framed · concept →
>   conceptual/technical + one visual + glossary spans; per-level shape via calibration `conceptShape` ·
>   worked example → 2–3 "Stage N" codeExamples, delta-only, real intermediate output per stage, ONE
>   running example named by planner/skeleton in covers/summaries · mistakes → "How X breaks" block, 2–3
>   modes each with verbatim error, level-filtered · guided practice → late-module completion codeExample
>   ("Stop — attempt before revealing" + 1–2 hints + changed-lines-flagged answer) · independent
>   challenge → synthesis.capstone (adjacent context, spec + output format + "You've nailed it when:"
>   3–5-criterion rubric, no hints) · knowledge check → bp.finalCheck (S5 intact; ≥1 code-reading + ≥1
>   decision Q; explanation covers why each distractor is wrong) · recap → retrieval prompt ENDING in one
>   memorable decision rule; capstoneNext = the problem this lesson can't solve. Cross-cutting: 30/70 as
>   a block-mix rule (compress prose, never add volume — composes with density = sentence shape); every
>   block gets a specific 3–7-word title + strong standalone first sentence (world cards derive from
>   these); ≤1 untitled note/module; HARD MAX 8 blocks/module; snippets aim-8/ceiling-10 lines; banned
>   openers ("This module covers…", "We introduce…") in summaries.
> - **Scorecard (live, 2 fresh beginner lessons on :5070):** Lesson 1 "Tool Calling in LLM Agents" —
>   8 pass / 4 partial / 1 fail (5-agent rubric review): hooks, bridges, failure demos (real tool_call
>   JSON + KeyError + validation errors), progressive stages w/ flagged deltas, guided practice (all 3
>   elements), 0 objective violations, finalCheck mix + per-distractor explanations, recap rule +
>   adjacent capstone all PASSED; misses were block inflation (11 blocks/module), snippets 11–16L,
>   "This module covers…" summaries, thin M1/M3 mistake evidence, un-glossed background jargon.
>   Round-2 prompt fixes → Lesson 2 "Building Agent Memory": blocks exactly 8/8/8/8/8/8, summaries all
>   second-person action openers (0 violations), ≤1 untitled note, every codeExample has explain,
>   inline glosses present ("a JSON file (a plain text format…)"), explain/doing ≈ 31–37% / 63–69%
>   per module (target 30/70), 0 JS errors in the world template. Residual: snippets still drift
>   1–5 lines over 10 (8 of ~16) — mitigated post-generation with "aim 8 / ceiling 10" wording (in the
>   prompts, not yet live-verified); if it persists, the deterministic fix is a line-count repair in
>   density.ts, NOT more prompt text.
> - Verify: `npx tsc --noEmit` clean · blueprints at /tmp/als-bp.json + /tmp/als-bp2.json · artifacts
>   `84e6d210…` (tool calling) + `af89df70…` (agent memory) on the staging DB, world-rendered
>   screenshots /tmp/als2-shot-*.png. NOT committed (LOCAL ONLY, per instruction).
> - **Visual-bug round (2026-07-14, from owner's real-usage screenshots — 5 issues + Auto-mode blend):**
>   (1) **Card overlap (the big one):** `world.ts gridPos` top-row Y offset was `Math.floor(i/3)*0` —
>   multiplied by ZERO — so with ≥7 cards (standard at 8 blocks + lead) cards 4+ stacked EXACTLY on
>   cards 1-3. Also explains the "Example before Concept 1" scramble AND the Auto-mode text blend
>   (a dimmed card sat exactly under the focused one, seen zoomed-in). Fix: serpentine grid — rows
>   of 3, odd rows right-to-left, real 342px row offsets; card N+1 always spatially adjacent.
>   Verified: 0 overlaps across 9 stages × 69 cards on two lessons; 22-frame Auto-mode capture
>   eyeballed clean (single focused card per frame incl. the exact card from the owner's screenshot).
>   (2) **Empty popups:** the 27-combo gates (`body[data-depth] .needs-*{display:none}`) hid
>   non-matching blocks INSIDE world popups (map shows a card for every block → card opened empty,
>   e.g. conceptual blocks on a technical-coverage lesson). Fix: `.w-pob .needs-*{display:block
>   !important}` — a popup always carries 100% of its block (the world design intent). Verified on a
>   technical-depth variant: 69/69 popups non-empty. (3) **Brown example block:** dark
>   `.blk-example` `#241d0f` → `#1d2136` slate-indigo (tokens.ts; amber border keeps the identity).
>   (4) **Trivial completion code:** MODULE_SYSTEM now requires the practice gap to be THE CRUX
>   (never a return/print/import; widen the variation if the natural gap is trivial; snippet must
>   stand alone). (5) **LIGHT MODE for world lessons:** header ☀/☾ toggle (persists in
>   localStorage `als-world-theme`), light values for all --w* vars + every hard-coded dark color;
>   sets `data-theme` on BOTH html and body (block content CSS keys off either). Playwright-verified
>   both themes, map + popups readable.
> - **2026-07-14 session 2 (finishing pass):** (a) **module-persist race fixed** (`server.ts
>   ensureModuleBuild`): two concurrent single-module builds each persisted their own FULL blueprint
>   copy — later write clobbered the earlier module back to a stub (fragment cached, blueprint stub
>   ⇒ world mode showed "being built" forever). Now grafts ONLY the built module (+ its citations +
>   nodeMeta) into a freshly-fetched blueprint; and the /api/module cache-hit path kicks
>   `ensureModuleBuild` when the blueprint is still stub (heals world mode). Verified live on the
>   raced lesson. (b) **snippet caps made tiered + honest** (`density.ts`): observed every Stage 1
>   lands ≤10L, only final assembly/practice stages overflow — so prompt says teaching stages ≤10,
>   assembly/practice ≤14 HARD; `repairCodeLength` fires only >14 (`CODE_LINE_REPAIR_AT`), uses
>   SONNET (Haiku refuses surgical elision), accepts only shrunk-and-fits rewrites. Known residual:
>   RAG lesson m6 keeps a 15L + 20L pair (Sonnet declined twice; render is a scrollable code block,
>   acceptable) — new generations are capped at write time.
> - **LEARNER-REVIEW ROUND (2026-07-14): 4 parallel Playwright learner-agents reviewed 4 fresh
>   lessons (RAG chatbot · LangGraph-vs-CrewAI-vs-AutoGen · embeddings-technical · prompt-injection),
>   ~70 issues found, the systemic ones FIXED + re-verified:** (1) **markdown leak (top issue, all 4
>   lessons):** synthesis capstones/finalCheck prompts showed raw \`**\`/\`\`\` fences/inline "1. -"
>   lists as wall-of-text. New `mdLite()` in components.ts (fences→pre, **→strong, \`→code,
>   inline enumerations→real lists, newline paragraphs — deliberately not a full parser) applied to
>   capstone, classic + world finalCheck prompts, predict-reveal answers; spanHtml converts inline
>   **/\`/newlines in span text; firstSentence strips markers from card teasers/captions. Verified:
>   0 non-code ** leaks across all 4 lessons. (2) **beat-caption text-over-text (all 4):** caption
>   lines now sit on scrim pills (dark+light) + header got a gradient backdrop + counter pill.
>   (3) **span-glue typos** ("adoption.'You", "trim_historyfunction", bare floating ⓘ):
>   joinSpans() heals missing spaces at clause/chip boundaries; empty-text term spans no longer
>   render bare chips. (4) **popup title shown twice (all 4):** body's first h3 / collapse-h /
>   eyebrow+h2 hidden inside popups (header carries the title). (5) **sources duplicates (3/4):**
>   citationsInner dedupes by title+kind. (6) **KC polish:** options lettered A/B/C/D (matches the
>   explanations), explanation pre-rendered via mdLite (shown with ✓ Correct / ✗ Not quite verdict),
>   contrast raised; Reveal buttons now disable → "Revealed ✓"; "Predict:" label suppressed when the
>   prompt already opens with Stop/Predict. (7) **matrix column bloat:** repairBlueprint also drops
>   "computational cost"/"setup complexity"/"when to use" dup criteria + prompt caps criteria at
>   2–4. (8) firstSentence no longer cuts at "e.g."/"i.e."; beat captions use a longer capline (210)
>   + stage taglines 240 so tours don't end mid-thought; "[map] 1 blocks" grammar; knowledge-check
>   stage badges number 1..N (no "▸ start" on Question 1). (9) **prompt guards for future
>   generations:** OVERVIEW_PROSE plain-text-only + ≤25-word single decision rule; MODULE_SYSTEM —
>   never leak a completion answer next to its TODO, cross-refs use exact PRIOR-MODULES numbers,
>   diagram blocks must have edges, scatter is click-not-drag, matrix criteria exclusions;
>   PLANNER/SKELETON pin running-example constants (fixes the 1536-vs-384 dimension flip class).
>   **Known content-level residuals in the 4 sample lessons** (would regenerate away, left as-is):
>   RAG m6 15L+20L snippets, RAG 1536/384 dim flip, injection lesson's one wrong module cross-ref,
>   frameworks lesson's non-functional "drag" wording on its scatter. Reviewer verdicts: 4/4 "yes,
>   this would teach me" — pedagogy consistently rated the strongest part.
> - **DELIVERY-DESIGN ROUND (2026-07-14 evening, owner's 7 fixes):** (1+5+7 structural) **story-card
>   GROUPING** — `buildStages` folds functionalExample/codeExample blocks into the nearest preceding
>   concept/technical card as labelled buttons (`WAtt`, ≤4/card, own popups `wpop-si-ci-aN`,
>   openPopup(si,ci,ai)); maps drop from 9 to ~5-6 uniform story nodes, so full-view text is
>   legible (2 rows ⇒ larger camFit scale) — cards now FIXED 360×208 (flex column, title/orient
>   line-clamped, OPEN pinned bottom); the ▸ start card PULSES until read (`wpulse` keyframes,
>   stops on .visited). MODULE_SYSTEM gains "STORYBOARD THE MODULE": 3-beat arc (SETUP recall
>   bridge titled "Recap: …" + driving question → BUILD chapter-titled concepts with artifacts
>   immediately after their concept → PAYOFF breaks/practice + forward hand-off); titles must read
>   aloud as one continuous story. Verified on a fresh lesson (streaming, `d1dcf44a…`): every
>   module reads Recap → chapters → stages → practice → breaks; M4 = 5 cards, one carrying 4
>   artifact buttons. (2) beat caption full-width + smaller font (right:26px, clamp 12.5-15px) —
>   half the vertical footprint. (3) **Auto mode now OPENS each block's popup** as beats advance
>   (11s dwell when a popup is open vs 5.2s; check cards still pause for answering). (4) dotted
>   wires no longer show THROUGH dimmed cards — .dim fades card CONTENT, surface stays opaque.
>   (6) Recenter now re-FITS the whole map (camFit) instead of only undoing user pan while zoomed.
>   All re-render onto existing lessons except the storyboard rule (generation-time).
> - **POLISH ROUND 2 (2026-07-14 late, owner's 4 fixes + QA mandate):** (1) grouped-card layout bugs
>   — root cause: card became flex-column so the chip STRETCHED full width (collided with corner
>   badges) and squeezed/clipped the heading. Fixed: `.w-chip{align-self:flex-start;flex-shrink:0}`,
>   h3/atts flex-shrink:0. Attachment buttons now SHORT type labels ("▶ Example", "⟨⟩ Code 1/2" —
>   full block title shows in the popup header via `WAtt.full`). (2) **Auto mode REMOVED** (button +
>   E.auto/tickAuto/pause/resume machinery — beats are Next/→ only now). (3) **console strip
>   REMOVED**; the beat caption moved down into its place (bottom:18px). (4) **`scripts/qa-world.mjs`
>   (NEW, $0)** — element-level QA the owner demanded: per card × per stage × both themes asserts no
>   content overflow, no clipped headings, no chip↔badge collisions, no att-button overflow, no card
>   overlaps, no empty popups (incl. attachment popups), 0 JS errors — and saves per-card CLOSE-UP
>   screenshots (the full-map screenshots that missed these bugs are not enough; run this before
>   claiming UI is fine). Usage: `node scripts/qa-world.mjs <artifactId> …` (exit 1 on failures).
>   Verified CLEAN on streaming + embeddings + the new evals lesson `d0a5b71e…` ("Build and Run LLM
>   App Evaluations", storyboarded, grouped). Full-app view (sign-in → My Lessons → Open, world
>   lesson inside the viewer iframe) Playwright-verified working.
> - **POLISH ROUND 3 (2026-07-14, owner's 4 fixes + masterflow):** (1) in-lesson theme button
>   REMOVED — the world page now follows the HOST nav toggle (`#viewer-theme` posts
>   `{type:"als-theme"}`; world listens + boots from the shared same-origin `als-theme`
>   localStorage key; full-screen opens honor it too; `als-world-theme` key retired;
>   qa-world.mjs flips theme via postMessage now). (2) **Ask-more scroll fixed** — root cause:
>   `.workspace` height hardcoded `100vh-57px` but the topbar is content-driven (59px signed-out
>   → 73px signed-in), leaving a 16px page scroll. Now `calc(100dvh - var(--topbarH))` where
>   app.js measures the bar (+ ResizeObserver for the post-sign-in growth). Verified:
>   scrollHeight === innerHeight with the chat open. (3) toolbar "↗ Open" → "⛶ Full Screen".
>   (4) **DIAGRAMS RETIRED as an asset category** (quality call): MODULE_SYSTEM bans `diagram`
>   blocks (steppedFlow/scatter/slider remain the only visuals); world renderer SKIPS existing
>   diagram blocks and the curated `module.visual` on lead cards; `attachVisual` disabled in
>   runBuildJob (retrieveVisual/schema kept for old artifacts). (5) **docs/masterflow.mmd (NEW)**
>   — full app flow (inputs→auth→overview job→HITL gate→build job→module wave w/ gates+repairs→
>   RAG→render/runtime→ask) in the one-step-per-box AGENT/FN/GATE convention with measured
>   latencies per node (overview ~7.5-10s; design ~70-90s; module 60-150s; build total 5-7min;
>   ask fast-path 2-5s; render 50-150ms). Mermaid-validated + rendered (/tmp/masterflow.png).
>   All verified live: tsc clean, qa-world CLEAN ×2 lessons, host-toggle theme flip observed in
>   the iframe, 0 diagram cards rendered.
> - **LATENCY PROFILE (2026-07-14, measured):** a 6-module build = ~5.5-7 min: design leg
>   ~70-90s SEQUENTIAL (planner Opus ~30-45s → architect Sonnet ~30-45s), then the module wave
>   ~150-250s (6 modules ∥ cap 5; each = retrieve 1-2s + Sonnet emitting ~3.3-5k JSON tokens at
>   ~50-80 tok/s = 50-140s; synthesis/finalCheck writer ~2.5k tokens rides in parallel, hidden).
>   **~80% of wall time is OUTPUT-TOKEN generation — physics, not waste.** The 16k cap is NOT the
>   driver (actual module output 3.3-5k); going faster means cutting CONTENT (≈linear: half the
>   tokens ≈ half the wave). Levers, ranked: (1) PERCEIVED latency — open the lesson at design+
>   module-1 (~2-2.5 min) and let stubs self-heal (runtime already does this; prioritize module 1
>   in the wave / revive seedFirstModule) — biggest win, zero quality cost, NOT YET IMPLEMENTED;
>   (2) wave cap 5→6 (one wave for 6-module lessons, saves 60-120s; watch 2GB memory);
>   (3) optional "quick lesson" mode = density low + ~5 blocks (≈2.5-3 min, learner-visible
>   thinness — offer as a choice, don't make global); (4) planner Opus→Sonnet-thinking saves
>   ~20-30s but risks structure quality — the one output all 6 writers amplify (structure moved
>   UP to Opus deliberately; needs a scorecard A/B before touching). Haiku for planner/architect
>   rejected: plan output is small (~2k tokens) so savings are ~30-40s total, while plan/prose
>   defects cascade into every module and cost more in repairs than they save. Haiku stays where
>   it already is (profiler, brief, glossary, density repair — fast structured tasks).
> - **SPEED ROUND (2026-07-14, owner directives 1+3 done; 2+4 assessed):** (1) **concept prose
>   capped + plain English** — MODULE_SYSTEM: conceptual/technical block bodies ≤4 sentences
>   (advanced 5), everyday words, one clause/sentence; caps exclude examples/code; calibration
>   `conceptShape` per level carries the same caps. (3) **⚡ QUICK READ toggle shipped** —
>   Builder checkbox (`#quick-read`) → `cards.quick="on"` → profiler pins moduleTarget=4 +
>   density=low + `profile.quick` (new optional LearnerProfile field) → moduleUserPrompt QUICK
>   line (4-5 lean blocks, ≤3-sentence concepts, one example/2-stage code). MEASURED: MCP quick
>   lesson `6ba2d6df…` = overview 14s + build 145s = **~2.5 min total** (vs 5.5-7 min), modules
>   ~1.7-2.3k tokens (half standard), qa-world CLEAN. Known slack: model emits 7-8 small blocks
>   vs the 4-5 asked (token total is on target so left as-is); one concept block hit 10 sentences
>   (count caps are prompt-only — a density.ts sentence-count repair is the code lever if it
>   drifts). (2) architect-leg removal PROPOSED, not implemented: keep Opus planner, DELETE the
>   Sonnet architect pass (plan→writers direct; writers return summary+objectives — they already
>   return nodeMeta; deterministic plan→skeleton coercion; stub cards show plan `covers` until
>   built; finalCheck writer keys off covers). Saves 30-45s sequential; touches nodes/orchestrator/
>   deep-dive schema — needs one verified build. (4) split-writer-per-module (parallel example
>   agent) assessed and NOT recommended: coherence of staged examples/predict-reveals is the
>   praised pedagogy and drift risk is the dimension-bug class; token cuts (1+3) + open-at-module-1
>   deliver the same seconds safely.
> - **OWNER DECISIONS (2026-07-14 late):** architect-leg removal and open-at-module-1 are
>   SKIPPED for now (proposals stay recorded in the SPEED ROUND bullet — do not implement
>   without a fresh go).
> - **EXTERNAL AUDITS RECEIVED (2026-07-14, both on the evals lesson `d0a5b71e…`, audited from a
>   DOWNLOADED HTML that predates the diagram retirement):**
>   `~/Documents/lesson-content-quality-feedback.md` + `~/Documents/lesson-quality-audit-d0a5b71e.md`.
>   TRIAGE (full analysis in those files): **already fixed** — duplicate curated SVGs (diagrams
>   retired; their root-cause note on visuals.ts top-1 selection is correct but moot), code
>   collapsed-by-default (world popups force collapse open). **Confirmed OPEN renderer bugs** —
>   objective stem doubled ("After this you'll be able to" hard-coded in world.ts lead card AND
>   demanded of the model in prompts — single-owner fix); sources card count (Object.keys) vs
>   deduped rendered list (5 vs 8) — needs a shared visibleCitationCount; mobile focus clipping
>   (camFocusEl fixed 1.16 scale overflows 390px viewports); scatter "nearest matches" ignores
>   group/distance (top-3 always, can contradict the caption); mid-clause "…" in world-data
>   taglines/orients when the FIRST sentence exceeds the clamp. **Confirmed systemic CONTENT
>   class (the big one)** — parallel writers re-derive shared facts: recap cards misstate prior
>   modules (writer only gets prior TITLES+TERMS, so it invents answer keys — "three fields" vs
>   four), synthesis/finalCheck grade a taxonomy no module taught (writeOverviewProse sees only
>   titles/objectives), forward-pointers misdescribe the next module (writer never sees it),
>   dataset field/filename/threshold drift across modules, wrong/stale provider IDs
>   (`openai:gpt-o-…` typo, promptfoo `openai:chat:` format, ~2yr-old snapshots), non-runnable
>   snippets (KeyError field mismatches, wrong promptfoo output schema, "50-case dataset" of 4).
>   Their shared top recommendations: (1) a planner-emitted FACT LEDGER/lesson contract threaded
>   verbatim to every writer + synthesis, (2) a code-validation gate beyond line count, (3)
>   doc-grounded currency for tool IDs (ties to the pending KB-gap analysis), (4) a rendered-
>   lesson content-extraction audit script. NOTHING IMPLEMENTED YET marker superseded — see AUDIT-RESPONSE below.
> - **NEXT SESSIONS QUEUED (2026-07-15, owner-directed, designed to run in PARALLEL — disjoint
>   file areas, same working tree, still LOCAL-ONLY/no commits):**
>   **Session 1 — KB curator strengthening** (independent of the app; touches ONLY
>   services/kb-curator/ + kb/ source docs + docs/ + staging DB ingest; must NOT restart :5070 or
>   edit src/ or public/): act on `docs/kb-gap-report.md` — add allowlisted sources for the
>   residual gaps (eval-depth incl. CI gating · Claude Code/Agent SDK/Skills · applied build
>   recipes · streaming/SSE; GraphQL declared out-of-scope), fix the prod↔staging Agent-Skills
>   drift (prod has 0 chunks, staging 21 — prod writes ONLY with explicit owner confirmation),
>   and address the two governance findings (curator refreshes but never adds breadth; curator
>   never runs on staging). Verify with the report's own $0 coverage probe.
>   - **✅ SESSION 1 DONE (2026-07-14/15 · repo edits LOCAL-ONLY/no commits; KB docs ingested from repo SOURCE
>     into BOTH staging AND prod — nothing copied staging→prod).** Full write-up: `docs/kb-gap-report.md` §7. Summary:
>     - **Sources:** `services/kb-curator/sources.yaml` 28→37 (9 added in add-first order: promptfoo-docs /
>       openai-evals / deepeval · anthropic-claude-agent-sdk-python / claude-code-docs · langchain-python-docs /
>       llamaindex-docs · vercel-ai releases + ai-sdk-docs). GraphQL-for-agents declared OUT OF SCOPE in the header.
>     - **Breadth ($0 local-ONNX, from repo source):** authored 6 kb/ docs, `npm run ingest -- kb` into staging
>       (+18 chunks) AND prod (+39 chunks incl. the 11 Agent-Skills docs prod was missing): eval-in-CI ·
>       claude-agent-sdk-and-claude-code · build-a-rag-chatbot · build-a-customer-support-agent ·
>       build-a-multi-agent-workflow · streaming-llm-responses-sse. Prod 240→279, staging 235→253.
>     - **Before→after coverage (staging; maxSim + #1 hit is the real lens — the cov score saturates):**
>       | gap topic | cov b→a | maxSim b→a | #1 hit after |
>       |---|---|---|---|
>       | Streaming/SSE | .804→.856 | **.61→.71** | Streaming LLM Responses (SSE) |
>       | Claude Code/Agent SDK/skills | .835→.900 | **.67→.80** | Claude Agent SDK & Claude Code |
>       | RAG chatbot build | .816→.896 | **.63→.79** | Build a RAG Chatbot Over Your Docs |
>       | Evals / CI gating | .843→.860 | **.69→.72** | Evaluating LLM Apps in CI |
>       | Customer-support agent | .815→.878 | **.63→.76** | Build a Customer Support Agent |
>       | Multi-agent workflow | .844→.891 | **.69→.78** | Build a Multi-Agent Workflow |
>       | MCP (control) | .929→.929 | .86→.86 | unchanged (no regression) |
>       | GraphQL (out of scope) | .843→.843 | .69→.69 | unchanged (deliberately) |
>       Every gap now retrieves its dedicated doc as #1 (was drifting to wrong-topic neighbours, e.g. RAG-chatbot→AutoGen).
>     - **Governance (a) FIXED:** `services/kb-curator/detect.ts` — never-checked sources only surfaced 1 item (no
>       backfill) → added a bounded first-poll backfill (`KB_FIRST_POLL_BACKFILL`, default 8; still capped by
>       `KB_MAX_ITEMS_PER_SOURCE`). So the 9 new sources ingest real breadth on their first live run. tsc clean.
>     - **Agent-Skills drift FIXED DIRECTLY IN PROD (from repo source, nothing from staging):** prod had 0
>       Agent-Skills chunks → ingested the 11 kb/agent-skills docs straight into prod (now 24 chunks). Prod gap
>       coverage verified: Claude-SDK .63→.80 (#1 was *OpenAI Agents SDK* → now *Claude Agent SDK & Claude Code*),
>       RAG-chatbot .63→.79 (was *AutoGen*), streaming .61→.71, support-agent .63→.76, multi-agent .69→.78,
>       eval-CI .69→.72; MCP control + GraphQL(out-of-scope) unchanged. Existing prod chunks untouched (no regression).
>     - **Governance (b) PROPOSED (not implemented):** curator web-refresh cron is prod-only; smallest = add a
>       staging leg (2nd workflow / matrix) running `npm run kb:curate` against staging secrets (weekly if Claude
>       spend matters). No staging↔prod data copy involved. See report §7.
>     - **COMMITTED + PUSHED TO PROD (`main` `142d8dc`, 2026-07-15):** the curator-related changes are on prod —
>       `services/kb-curator/{sources.yaml,detect.ts}` + the 6 `kb/` source docs + `docs/kb-gap-report.md`.
>       Effects: (1) arms the GitHub-Actions curator cron (kb-curate.yml, `main`-only) → the next nightly run
>       (15:30 UTC) fetches the 9 new sources into the prod DB via Claude Haiku synth (backfills ~5 items/source
>       on first contact); (2) triggered a Render web-app redeploy (harmless — the app doesn't read
>       `services/kb-curator/` or `kb/` at runtime). Session 2's `src/`+`public/` WIP and this HANDOFF file were
>       DELIBERATELY EXCLUDED from the commit (HANDOFF carries other sessions' "LOCAL-ONLY, not committed" V2 notes).
>   **Session 2 — UI/flow feedback round** (touches public/* + src/agent|render; owns :5070):
>   (a) agent-memory lesson generated NO code examples — diagnose from the BLUEPRINT first
>   (check whether codeExamples exist but are folded into attachment buttons vs truly absent;
>   examples gating; then prompts) and fix; (b) Home page: showcase the new lesson design
>   (world-template snippets/cards) on the landing; (c) rename tab "Builder"→"Lesson Builder" +
>   kill the scroll on that page (suggestions area must fit the viewport); (d) after "Generate
>   Lesson" on an overview → send the user to My Lessons (not Trainer) to watch the build; in My
>   Lessons DISABLE "Open" until the lesson is ≥50% BUILT (note: the list's "% complete" is
>   learner progress — build progress must come from blueprint loadState counts via
>   lessons.ts/artifacts).
> - **AUDIT-RESPONSE IMPLEMENTED (2026-07-14/15, owner: "all three but only after validation"):**
>   Validation FIRST caught the audits' two errors: their P0 "openai:gpt-o typo" was NOT in the
>   blueprint — it was OUR `highlightCode()` DROPPING characters (the number regex's trailing \b
>   made digit-then-letter tokens like "gpt-4o"/"30s" match NO alternative → silently skipped,
>   corrupting rendered code AND what the Copy button copies, in EVERY lesson). FIXED (trailing
>   \b removed + a totality guarantee emitting unmatched chars verbatim); verified 41/41 code
>   blocks across 3 lessons render byte-identical to blueprint code. Their "code collapsed by
>   default" was also stale (world popups force collapses open). Everything else validated TRUE.
>   **Bundle A (renderer parity — re-renders onto all lessons):** objective-stem de-dup (renderer
>   owns the heading, strips the stem from bullets); shared `visibleCitationIds()` = sources card
>   count always equals the deduped list; mobile focus-zoom clamped to viewport (390px fits);
>   scatter "nearest" distance-capped (top-3-always contradicted its own caption); world-data now
>   carries FULL first sentences (CSS clamps visuals) — 35 mid-clause "…" strings → 0; favicon
>   data-URL; qa-world.mjs gained permanent checks (sources parity, stutter, ellipsis, 390px fit).
>   **Bundle B (fact ledger):** planner emits `contract` (5-12 pinned-fact lines: taxonomy names+
>   order, dataset fields, file names, tool/model IDs, thresholds, running-example constants) →
>   code-set onto `bp.meta.contract` (new optional field, survives persist/heals) → threaded
>   VERBATIM to every module writer AND writeOverviewProse. Recall openers may only assert facts
>   present in priorModules (now carrying SUMMARIES) or the contract; writers receive the NEXT
>   module for accurate bridges; failure-card FORM varies by module parity; finalCheck may not be
>   answerable by the capstone. **Bundle C:** `codeExample.codeRole` (runnable|fragment|
>   illustrative, owner-approved) + honesty badge in codeBlock(); `src/agent/codegate.ts` post-
>   repair objective lint (YAML/JSON parse, provider-ID allowlist, contract-field word-boundary
>   refs, never-defined-file commands) with ONE targeted repair kept only if re-lint passes —
>   wired into runDeepDive (`[code-gate]` logs); `scripts/audit-lesson-content.mjs` (NEW) content
>   extraction audit (dup SVGs, provider ids scanned from DE-TAGGED code — naive tag-stripping is
>   exactly what fabricated the audits' phantom "gpt-o" —, stutter, ellipsis, source parity,
>   threshold drift, md leaks). **A/B PROOF:** same evals prompt regenerated → `eed7cce9…`:
>   13-line contract (50 cases · cases.yaml · promptfooconfig.yaml · 0.85 threshold · 4 assertion
>   types in pinned order), codeRole honest (4 runnable/8 fragment/2 illustrative), recall openers
>   quote pinned facts, capstone keeps the contract taxonomy in an adjacent domain, thresholds
>   consistent — content audit CLEAN + qa-world CLEAN (the old lesson scores 3-4 findings on the
>   same scripts). Deferred from the audits: quiz interleaving (S5 deliberate), rubric submission
>   form, spellcheck stage, python ast (no python on Render). (1) **snippet cap now enforced in CODE** —
>   `density.ts` gains `CODE_LINE_LIMIT=10`, `codeOffenders()` (counts non-empty lines) +
>   `repairCodeLength()` (constrained Haiku compress; preserves cited line numbers, TODOs and
>   ★/CHANGED markers, returns code unchanged if it can't; only accepts rewrites that fit the cap);
>   wired in `nodes.ts` runDeepDive — prose + code repairs run in PARALLEL, code repair fires on ANY
>   offender (independent of the prose gate). Detection verified $0 on the memory lesson (caught
>   M2+M6 snippets). (2) **reading-order badges** — `world.ts` cards get a corner `.w-idx` badge
>   ("▸ start", 1, 2, …) showing the suggested order on every multi-card map (recall-openers/staged
>   examples assume a sequence, the map invites free clicking); fades out when a card is read (✓
>   takes the spot). Playwright-verified on :5070 (badges render, fade on visit, 0 JS errors);
>   reaches EXISTING lessons via re-render. (3) failure-mode prompt softened: silent failures show
>   the concrete observable SYMPTOM instead of a fabricated error string — never drop an important
>   failure mode for lacking one. (4) **schema addition (approved): `note` gains optional `title`**
>   — `components.ts` renders it as `<h3>`; world cards pick it up automatically via deriveLines;
>   no validate/repair changes (optional field, old lessons unaffected); MODULE_SYSTEM now requires
>   titles on notes. (5) PLANNER_SYSTEM + SKELETON_SYSTEM: a third-party framework/library must not
>   be a module's SUBJECT unless the learner named one (fixes M6 "Connect LangChain's …" despite
>   framework-agnostic) — libraries live inside examples. All fixes affect FUTURE generations except
>   (2), which is renderer-side. Still open: world finalCheck client-side grading (pre-existing gap a).

> - **⏸️ LIBRARY REFRESH — PAUSED 2026-07-14, RESUME ON OWNER "GO" (2026-07-15, run throughout the day). LOCAL-ONLY save; NOT committed/pushed (owner skipped the cloud handoff). Full detail: `docs/library-refresh-report.md`.**
>   Owner-directed 5-phase refresh. **⚠️ ALL WRITES TARGET THE PROD DB** (`kdgtlbnlyscdldogxorb`; owner reversed the initial staging/local scope mid-session → "all in prod DB only"). **STAGING IS DELIBERATELY UNTOUCHED** (verified: staging prebuilt = 100 vertical / 0 world). Area: `scripts/`·`docs/`·`backups/`·DB rows; did NOT edit `src/`·`public/`·`kb-curator` for the refresh itself (but the refresh DEPENDS on the uncommitted world-renderer + pipeline code already in `src/`).
>   - **Phase 1 INVENTORY ✅** — `scripts/inventory.ts` → `docs/library-inventory.json`. Library=100 (10×10 balanced), community=7 staging / 5 prod.
>   - **Phase 2 ✅ 50 NEW TOPICS APPROVED as-is** — `docs/new-topics-proposal.json` (grounded in `docs/prod-demand.json` + kb-gap-report + mid-2026 web-trend sweep; deduped vs the 100). Build = Phase 5 (tomorrow).
>   - **Phase 3 ✅ DONE (design flip live on PROD)** — `scripts/migrate-reading-mode.mjs` ($0, deterministic flip+re-render, covers library+community) flipped `readingMode`→"world" on **all 100 prod `prebuilt_lessons` + 5 prod `community_lessons`**. Backup (pre-flip, LOCAL only, reversible): `backups/prod-lessons-before-world-flip-2026-07-14.json`. **⚠️ prod blueprints now carry `readingMode:"world"` but prod's DEPLOYED code has no world renderer → still renders CLASSIC (verified `world-data=0`, no visible change). The whole library auto-upgrades to the world design the moment the world renderer ships to prod** (`src/render/world.ts` [untracked] + world dispatch in `index.ts` + "world" enum in `schema.ts` + tokens/components/runtime — all currently uncommitted local work). That deploy is a SEPARATE owner decision.
>   - **Phase 4 ⏸️ PARTIAL (rebuild existing content → PROD)** — rebuilds the 100 through the live pipeline (fact-ledger/code-gate/storyboard/**finalCheck**), world, batches of ~8, concurrency 3, QA-gated. **🐞 Bug caught+FIXED:** first batch shipped `finalCheck:0` (no knowledge check) — `generate()` never called `writeOverviewProse` (the node that writes S5 finalCheck; live build calls it at orchestrator.ts:275). **FIX committed in `rebuild-library.ts`** (`await writeOverviewProse(bp)` after the module loop) + verified (the-agent-loop → 5 MCQs, qa-world+audit CLEAN). **`CONTENT_VERSION` bumped `v5-world-2026-07` → `v5.1-world-2026-07-finalcheck`** so a resumable run redoes the buggy ones. **Current PROD state:** 8 lessons at `v5-world` (5 with finalCheck, 3 buggy) + 92 at v3/v4 (flipped-design-only). ALL 100 are `≠ v5.1` → the resume run redoes everything cleanly (self-heals the 3 buggy).
>   - **Phase 5 ⏳ NOT STARTED** — build the 50 approved topics; needs a NEW `scripts/build-new-topics.ts` (manifest `docs/new-topics-proposal.json` → live pipeline, `cards.quick="on"` for quick topics, `readingMode` world → insert `prebuilt_lessons`), batches of ~8, QA between.
>   - **▶️ RESUME ON "GO" (exact commands):** `export NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"; set -a; . ./.env; set +a; PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` — then Phase 4: `DATABASE_URL="$PROD_URL" npx tsx scripts/rebuild-library.ts --category "<Cat>" --dump /tmp/lib-rebuild --concurrency 3` per category (or `--all --yes`; resumable via v5.1) → QA each batch: `node scripts/qa-world.mjs /tmp/lib-rebuild/*.html` + `node scripts/audit-lesson-content.mjs <file>.html` + assert `finalCheck.questions.length>0` per lesson → then Phase 5 (write build-new-topics.ts, build 50). **GOTCHAS:** NODE_EXTRA_CA_CERTS on every model/DB call (corp MITM, local only); concurrency ≤3 (shared Anthropic acct); ~8.5min/lesson sequential-modules (batch of 8 @conc3 ≈ 25min; 100 ≈ 5-7h); OPENAI_API_KEY enables GPT failover; `what-is-rag` hit a transient module fail (retries fine).

> - **UI/FLOW ROUND (2026-07-14, owner's 4 items — LOCAL-ONLY; touches `public/*` + `src/render/world.ts` +
>   `src/lib/lessons.ts`; owns :5070). All four Playwright-verified with element-level screenshots I looked at.**
>   **(a) "No code examples" in the agent-memory lesson was a LEGIBILITY bug, not a generation gap.** Diagnosed
>   from the BLUEPRINT first: the code IS there (17 `codeExample` + 4 `functionalExample` per lesson) — world.ts
>   `buildStages` folds code/example blocks into `.w-att` buttons on the host concept card, and those buttons
>   were tiny (10.5px, muted) so a learner scanning the map never registered them. Fix is world.ts CSS+JS ONLY
>   (no prompts): `.w-att` now reads as a real CTA — 11.5px/800, filled accent, per-type identity (CODE = green
>   `.is-code`, EXAMPLE = violet `.is-ex`; class set from the block icon in `buildWorld`) + light-theme
>   overrides. Verified on `d8966a14…`: qa-world + audit CLEAN, element close-ups BOTH themes (green "Code 1/2" +
>   violet "Example" legible AT MAP SCALE), code popups open with real code, 0 JS errors.
>   **(b) Home showcase of the world design** — replaced the outdated OLD-design CSS mockup in the "See it before
>   you generate" preview with REAL screenshots of a generated world lesson (`eed7cce9…`), captured 2× into
>   `public/showcase/{world-map-dark,world-popup-dark,world-map-light}.png` (STATIC assets, no live iframe).
>   Reuses the existing `.preview/.frame/#ptabs` chrome + toggle JS (3 tabs: Mental map · A block opened · Light
>   mode); new `.pv-shot` rule in `home.css`. Verified: renders, tabs toggle, lazy imgs load, 0 errors.
>   **(c) "Builder" → "Lesson Builder"** (topbar tab + every prose ref in `index.html`/`app.js`) AND **killed the
>   page scroll on that tab.** Measured FIRST (getBoundingClientRect): signed-in, the landing overflowed the
>   viewport by 67px once "Suggested for you" appears. Fix mirrors the Trainer `.workspace`/Ask-chat one:
>   `#tab-configurator` height = `calc(100dvh - var(--topbarH))` + internal `#landing` overflow as a safety net,
>   hero/landing padding trimmed to reclaim the 67px (scoped so the SHARED LLM-Skills `.landing` is untouched).
>   Verified: `scrollHeight === innerHeight` at 800/900/1000px, suggestions fully visible, both themes, 0 errors.
>   **(d) Generate Lesson → My Lessons (not Trainer) + gated Open.** `startBuild` now `switchTab("dashboard")`
>   after kicking the build — the background Trainer tab keeps building and `activateTab` never switches the top
>   tab, so pollJob's re-activation doesn't yank the user back. BUILD progress is now computed server-side in
>   `lessons.ts listLessons` straight from the blueprint's module `loadState` (SQL count — the large blueprint is
>   NEVER shipped to the client): new `buildPct/modulesBuilt/modulesTotal` fields, DISTINCT from `percent`
>   (= LEARNER progress). `lessonCard` DISABLES "Open" until `buildPct ≥ 50` (greyed + tooltip) and re-enables
>   LIVE as the dashboard poller refreshes; bar/label/gate all read the same module-based number. Verified
>   END-TO-END on :5070 with a REAL quick-read build: overview → Generate Lesson → **redirected to My Lessons** →
>   Open DISABLED at 0% built → **ENABLED at 75%** while still building; 0 console errors.
>   **(e) "⚡ Get Hands on" restored (follow-up).** Root cause: the launch button lived ONLY in the CLASSIC
>   renderer toolbars (`components.ts` `.hx-tools` + vertical `.tb-right`, gated by `handsOnEligible(bp)`); the V2
>   work stripped those classic toolbars AND the world renderer (`world.ts`, the new default) never carried the
>   button — so it vanished for every new lesson. Fix (world.ts only): render `⚡ Get Hands on` in the `.w-head`
>   gated by `handsOnEligible(bp)` (imported from `./eligibility`), styled green (`.w-handson`, + a light-theme
>   override so the higher-specificity light `.w-btn` rule can't flatten it), and wire it in WORLD_JS to
>   postMessage the host `{type:"als-handson",lessonId,moduleId}` (current stage's module) with a standalone
>   `window.open("/hands-on?…")` fallback — identical contract to the classic runtime (`app.js` handler unchanged).
>   NOTE the eligibility gate is unchanged: the button shows ONLY on pure-Python-runnable lessons; the many
>   lessons that name OpenAI/Anthropic/etc. stay (correctly) ineligible. Verified $0 via a fixture (an ELIGIBLE
>   blueprint — "The ReAct Loop" — re-rendered `readingMode:"world"`): button present, gating correct on real
>   ineligible lessons, both themes styled (green), STANDALONE click → `window.open("/hands-on?…&module=…")`,
>   IN-APP iframe click → parent receives `als-handson`, 0 JS errors. (Classic vertical/horizontal lessons still
>   have no toolbar post-V2 — restoring theirs is a separate, larger change, deferred.)

> - **MASTER QA GATE — ✅ GO (2026-07-15, local⇄PROD; full report `docs/qa-gate-report.md`).** Ran on live
>   PROD data (`.env` is entirely prod now; :5070 = prod; QA acct `grz1q@web-library.net`). **No BLOCKERS.**
>   Passed: STEP-0 pending-push report (no schema drift — 0001-0021 cover everything, changes are JSONB-only);
>   A code-gate (tsc clean, WORLD_JS `new Function` parses, WORLD_CSS balanced); B library regression (15
>   library lessons — 7 rebuilt-`v5-world` + 8 flipped-world across all 10 cats — qa-world+audit CLEAN each,
>   highlighter byte-identical 3/3; + 2 classic user lessons render clean); C two fresh prod builds (standard
>   `33b2c7ec` ~6 min + quick `d8c771d7` ~2.6 min — redirect→My Lessons ✓, gated Open disabled@0%→enabled@67%
>   live ✓, pedagogy+host-app+blueprint all ✓, contract present, thresholds consistent); D app sweep (home
>   showcase, 2 library + 1 community opened from UI, My Lessons sane, 0 console errors); E live-site check
>   (OLD deployed code degrades world-blueprint library lessons to a **readable CLASSIC** render, 0 errors →
>   push is SAFE, not urgent). **Gitignore hardened** (`backups/` 20MB prod dump, `.DS_Store`, `design-v2/`,
>   `public/mockups/` now ignored). Findings: MAJOR(hygiene, pre-existing) components.ts ships git-binary (4
>   NUL mdLite sentinels — works, optional `\u0000` cleanup); MINORs logged in the report.
> - **✅ PUSHED TO PROD (2026-07-15) — `main` `c31b514`** (was `142d8dc`). Owner-authorized; explicit 39-file
>   ship-list (no `git add -A`; stray tracked `node_modules` symlink deletion left unstaged). Render
>   auto-deployed; **post-push smoke GREEN on `agentic-learning-studio.onrender.com`:** /healthz db+auth true ·
>   homepage 200 with the "Lesson Builder" tab + world-map showcase · `the-agent-loop` / `crewai-role-based-
>   agents` / `what-is-rag` now render the WORLD map (5 cards, Example/Code buttons, ⚡ Get Hands on) not the
>   old classic fallback · 0 console errors. Rollback target: `142d8dc`.
> - **🎨 HOME REDESIGN — DONE + PUSHED (2026-07-15, owner-directed).** The landing `#tab-home` now uses a
>   coursera.org-style, **image-led** design blended INTO the existing SEO content. Files: `public/index.html`
>   (`#tab-home` only — topbar nav untouched), `public/home.css` (new image-led classes, scoped Coursera blue
>   `#0056D2`), `public/styles.css` (global font → **Source Sans 3**), `public/home-img/` (**22 nanoBanana2
>   PHOTOGRAPHIC lifestyle images**, self-hosted + optimized to ~2.1 MB total). Design: photo hero (SEO H1/copy
>   preserved) + full-width dark-blue Beta strip + stat strip + "Browse AI topics" photo tiles → /library +
>   "Start with a top lesson" photo cards → real /library/:slug + how-it-works photos; the existing 6 SEO
>   feature sections, mission, "entire AI landscape" keyword block, and FAQ are all KEPT (restyled). Owner rules
>   honored: nav kept (font-only change), SEO content blended not replaced, testimonials dropped.
>   **Technical SEO QA PASS:** exactly 1 H1, title/description/robots/canonical/6 OG/4 Twitter intact, JSON-LD
>   valid (Organization+WebSite+SoftwareApplication+FAQPage), all imgs alt+lazy+width/height (no CLS), no
>   horizontal overflow @390px, 0 console errors, other tabs unaffected. **Hyperlink QA PASS:** all 13 internal
>   routes 200 (/library, 8 lesson pages, 4 footer legal pages), all 8 lesson slugs verified in prod, no dead/`#`
>   links. Scratch preview `public/home-v2.html` + `home-v2-images.js` are NOT shipped (superseded by the real
>   integration). The nanoBanana2 credit connector was the owner's PixelBin (org 12026759).

**This doc is a MAP, not the code. Do NOT read the whole repo to get oriented.** Use the file
map below to jump straight to the one or two files a change touches, and open only those. Each
file has a one-line responsibility — that tells you where to go. Companion memory:
`~/.claude/projects/-Users-anandpareek-Documents/memory/agentic-learning-studio-project.md`.
(`DESIGN_SPEC.md` is older deep detail — optional; this HANDOFF is the source of truth.)

## 🧪 LOCAL‑ONLY (2026‑07‑10) — fast overview + Slides view · NOT committed / NOT pushed
> Two features working on local `:5070`, awaiting owner verification before any commit/staging push:
> 1. **FAST OVERVIEW (~7.5s warm, was ~75s):** "Generate Overview" no longer builds the skeleton. `coverageBrief`
>    (`nodes.ts`, TWO PARALLEL Haiku calls — core bullets ∥ sections) fills a bullets-only template (framing /
>    concepts / examples / outcomes / planned sections) wrapped in a minimal valid Blueprint via new optional
>    **`bp.brief`** (schema.ts `OverviewBriefSchema`). The preview renders **`briefPreview()`** (components.ts, `.ov-brief`
>    CSS in tokens.ts) — bullets only, NO mental map (the map appears on the built lesson). The **planner+architect
>    skeleton MOVED into `runBuildJob`** (`isFastDraft` branch, `[timing] build-design ...` logs) with the approved brief
>    injected into both prompts (`approvedBriefDirective` in prompts.ts) and the approved TITLE forced. Full
>    GenerateInput + resolved intent persist on the draft inside **`cards.__genInput` / `__intent`** (NO migration) — this
>    also fixes the old "cards/lessonTypes ignored by build" gap. Overview also runs profiler ∥ retriever. Old-style
>    full-skeleton drafts + rebuilds take the unchanged path. **Live-verified E2E on :5070 (staging DB):** overview
>    7.5s (profiler+retriever ~2s · brief ~5.5s); build 6/6=100% in ~306s (design 72s + one parallel module wave);
>    built module titles matched the approved sections ~verbatim; charge-once held (17.5→16.5).
> 2. **SLIDES VIEW (vertical lessons, additive):** a **"▶ Slides"** toolbar toggle turns the whole area between the left
>    module nav and the toolbar into a NO-SCROLL slide stage (body becomes a flex column — no hardcoded toolbar
>    height; plain WHITE bg in light mode, existing dark bg in dark). Decks are derived CLIENT-SIDE from the rendered
>    panel DOM (`buildDeck` in runtime.ts — $0, works on every existing lesson): a title slide per module (summary /
>    plain-words / why-it-matters / objectives) + ONE slide per block; collapsibles forced open; **"⤢ Details"** opens the
>    full block in a new `#smodal` popup; staggered fade-up animations; ←/→/Space keys; clickable dots; Next crosses into
>    the next section (synthesis/KC/Sources = single free-scroll slides); a stub module's deck live-refreshes when its
>    body lands (`refreshSlidesFor` in `pump`). PREVIEW drafts block the toggle (previewNote). Files: `components.ts`
>    (`briefPreview`, `#t-slides` btn, `#smodal`), `tokens.ts` (`.ov-brief` + slides CSS), `runtime.ts` (SL engine).
> **Fixture (NO credits):** `npx tsx scripts/test-slides.ts` → `/tmp/als-slides-lesson.html` + `/tmp/als-brief-preview.html`.
> Playwright-verified: stage exact-fits the viewport, white/dark bg correct, modal open/Esc, keyboard nav, left-nav
> switching, read-view restore, 0 console errors. `tsc --noEmit` clean.
> 3. **INTERACTIVE-DELIVERY DESIGN EXPLORATION (mockups only, `public/mockups/interactive-*.html`, untracked):** owner is
>    redesigning in-module delivery. Round 1 = 5 concepts (Guided Reveal / Cinematic / Living Diagram / Story Sim / Game
>    Deck) on the "Observe" module. Round 2 (owner direction: V2-cinema × V3-anchor × V4-example hybrid, full app chrome +
>    module rail, lesson `crewai-role-based-agents` M2) = **V6 Anchor Stage · V7 Cinema+Filmstrip · V8 Split Cinema ·
>    V9 Zoom World · V10 Chapters**. Hub: `/mockups/interactive-index.html` on :5070. Owner picked **V9** →
>    **`interactive-v9-full.html` = the FULL lesson built in that direction** (all 5 crewai modules as data-driven
>    spatial worlds + per-module interactives [slider/code-map/kickoff-run/process-race/decision-matrices/TODO-completion/
>    failure-injection] + synthesis + graded 3-Q knowledge check + sources; collapsible rail; module auto-advance; Auto
>    plays the whole lesson). **v2 (owner feedback round):** each module = an AUTO-GRID mental map of its BLOCKS
>    (kind chip + heading + orient; S-flow for 4-6, zigzag for 2-3, wide card for 1 — positions computed, never
>    hand-placed); click any card → popup with 100% blueprint content (block data GENERATED from the prebuilt
>    blueprint via /tmp/gen-data.mjs — prose/steps/code+TODO/matrices/slider/quizzes); canvas = drag-pan (threshold
>    6px, works from cards too) + wheel-zoom + ⤾ recenter; header basics-only (Next·Auto·↺ — run buttons removed,
>    flows play as beats). Design principles P1-P6 in the file header comment. **Learner-persona Playwright audit**
>    (walks every beat, opens/reads every popup, uses every interactive, checks P1 bands/P2 no-empty-boxes/P3
>    coverage/overlaps/scroll): 0 issues, 0 JS errors, KC 3/3. Next: owner reviews → decide app integration scope.

## ⚠️ PROD‑ONLY DELTA (2026‑06‑27) — these shipped to `main`/PROD but are NOT on `staging`
> The "IN SYNC" note below is now STALE. A run of beta‑launch work went to **prod only** (owner's
> explicit "prod only" instruction), so `origin/main` is AHEAD of `origin/staging` in app content,
> and the **PROD Supabase DB has migrations `0020` + `0021` that the STAGING DB does NOT.**
> To re‑sync staging later: overlay these files from `main`, run `npm run migrate` against the
> **staging** DB, and re‑test. Prod tip at time of writing: see `git log origin/main`.
>
> **Prod‑only app changes (not on staging):**
> 1. **Rebrand** "Wizbit" → **"Agentic Learning Studio"** everywhere user‑facing (title/meta/OG/JSON‑LD,
>    headers/footers/auth brand, `hands-on.html`, policy pages, `email.ts` templates, consent text,
>    `robots.txt` + code comments). **Logo file `wizbit-logo.png` kept** (alt text updated); `prathibhax.com`
>    domain unchanged. ⚠️ Supabase Auth emails (magic‑link/confirmation) still say "Wizbit" — change in the
>    Supabase dashboard (not in repo).
> 2. **Free‑beta pricing**: pricing tab, credit pill, buy cards, account top‑up, and the buy‑modal CTA are
>    **hidden via CSS** (logic untouched — re‑enable by removing the rules in `styles.css`). Hero banner
>    "Beta launch · Free for one week · 2 free lessons." Out‑of‑credits popup → "Thanks for learning with
>    us! We'll be back soon."
> 3. **Privacy/Security rewritten** minimal + de‑vendored (no vendor names, no unverifiable claims). **Terms**
>    has a free‑beta "as is" clause. Single **`CONTACT_EMAIL`** (env `CONTACT_EMAIL`, default
>    `findkailash@gmail.com`) injected into policy pages via a `{{CONTACT_EMAIL}}` token (server route
>    replace) + used in `email.ts` and error messages. Footer disclaimer: "Lessons are inspired by
>    information available on the web, but curated using AI for you."
> 4. **Beta traction** — feedback button/popup → `POST /api/feedback` → **`feedback`** table; `POST /api/event`
>    + client `track()` for `signup` / `lesson_generated` / `library_lesson_opened` / `lesson_completed` /
>    `skill_generated` → **`events`** table. **Migration `0020_beta_feedback_events.sql` applied to PROD DB.**
> 5. **SEO** — title/meta/OG/Twitter/JSON‑LD now lead with **"Learn Artificial Intelligence (AI)"** (broadened
>    from agentic‑only), keeping "agentic AI" in scope.
> 6. **Community sharing** — the **1‑free‑lesson reward removed**; it's now just **"Share with Community"**
>    (popup + My Lessons button + success copy). `community.ts shareLesson` no longer grants credit.
> 7. **Multi‑instance groundwork (additive)** — persist generation jobs + uploaded‑doc grounding so polls/builds
>    can run on any instance: new **`gen_jobs`** + **`upload_docs`** tables; `jobs.ts` write‑through flush
>    (2 s) + `GET /api/job/:id` DB fallback; `uploads.ts` write‑through + `hydrateUploads()` called at
>    `/api/overview` & `/api/build`. **Migration `0021_persist_jobs_uploads.sql` applied to PROD DB.**
>    In‑memory stays the fast path → **single‑instance behaviour unchanged**. To actually scale to ~50
>    concurrent: provision multiple Render instances + set `MAX_CONCURRENT_GENERATIONS` per instance (the
>    box is 1 CPU/2 GB → ~2 concurrent today; Claude Scale tier is NOT the bottleneck). Known gap:
>    `/api/jobs/active` (dashboard reattach) is still local‑memory only — fine for direct poll‑by‑id.
>
> **Migrations on PROD DB but not STAGING DB:** `0020`, `0021`. **New prod env vars:** `CONTACT_EMAIL`
> (optional, has default), `MAX_CONCURRENT_GENERATIONS` (optional, for scaling).

## ✅ DEPLOY STATUS (2026-06-24) — `staging` AND `main`/prod are IN SYNC, full feature set
> **2026-06-26 UPDATE — NOW ON STAGING AND PROD (in sync again):** promoted to prod (`origin/main` = `83c98a5`, app content
> byte-identical to `origin/staging`): (a) the lesson-toolbar title-removal fix, (b) **"Get Hands on" browser-run Python
> notebooks** (Phase 1 + v2), and (c) two **trainer fixes** — don't reveal a building lesson until module 1 is ready, and
> force-fresh lesson switch during a build. Migration `0015` (`hands_on_notebooks`) applied to **BOTH** the staging AND prod
> Supabase projects. Live-verified: `/hands-on` 200 + the `Beta` button present on both onrender hosts. Owner is still
> reviewing Hands-On on local and may request changes.
> **2026-06-27 UPDATE — S5 + S6 + grounding-log ON STAGING + PROD (`main e134aeb`, no DB migration):** ONE end-of-lesson knowledge
> check (`bp.finalCheck`; `_check` pane/page BEFORE Sources), dynamic module count (profiler `scope` → 5/6/8), and `[retrieve]`
> grounded/ungrounded telemetry. **Batch B (GPT failover) — now ON STAGING + working (see the BATCH B note below).** Full detail: §7.
> **2026-06-27 — BATCH-1 (27-Jun doc) ON STAGING (`origin/staging edbabd7`), NOT yet prod:** signup grant 1→2; fractional credits
> (lesson=1, skill=0.5) via migration **0019** (`credit_lots`/`credit_ledger` int→numeric) + `spend(userId, amount)` multi-lot FIFO
> draw + a skill 402 gate/charge-on-success; out-of-credits **buy-a-plan popup**; **"while you wait"** 4 relevant free-library cards
> during overview generation; **Free** pill on Community; a built skill shows in **My Skills** immediately; **library KC nav fix**
> (`showsFinalCheckPane` — no empty `_check` on old per-module-KC lessons). Migration 0019 applied to the STAGING DB. Verified:
> fractional spend 8/8 vs staging DB; Playwright on staging (Community pill, buy popup, gen-suggest off the 100-lesson library, 5 KC
> library lessons with no empty nav). PENDING: full build/skill charge re-QA (staging Anthropic cap → 07-01); item 9 (home example
> richness — needs a pointer); 2 separate-session prompts (poor diagrams; add real KCs to library content); prod promote (incl.
> applying 0019 to the PROD DB) on owner confirm.
> **2026-06-27 (later) — BATCH B (GPT FAILOVER) NOW ON STAGING + FIXED (`origin/staging 1f15b34`):** OpenAI key set on the
> staging+prod Render envs (and local `.env`). Confirmed `gpt-5.5` / `gpt-5.4-mini` exist on the account. Fixed the real failover bug —
> OpenAI's strict structured-output rejects `.optional()` Zod fields ("all fields must be required"), so EVERY structured GPT fallback
> failed silently (withFallbacks re-raised the Claude error); fix = force `method:"functionCalling"` (tool-calling) on the GPT branch.
> Validated by FORCING failover (invalid Anthropic key) → a full build ran ENTIRELY on GPT, **5/5**, finalCheck/KC generated on GPT, 0
> errors. ⚠️ gpt-5.5 is a SLOW reasoning model (~10-min build); fine as a failover, but while the staging Anthropic spend cap is active
> (→ 2026-07-01) every staging build runs on GPT and is slow — it reverts to fast Claude when the cap resets. This ALSO fixes the
> "KC not coming on staging" report (the cap was blocking `writeOverviewProse` → no `finalCheck`; failover now generates it).
>
> ### 📌 ON STAGING (`origin/staging 1f15b34`) BUT NOT ON PROD (`main e134aeb`) — as of 2026-06-27:
> 1. **Batch-1 (27-Jun doc):** signup→2 credits; fractional credits lesson=1/skill=0.5 (**migration 0019** — applied to the STAGING DB
>    ONLY, NOT prod); out-of-credits buy-a-plan popup; "while you wait" library popup; Community **Free** pill; skill→My-Skills refresh;
>    library-KC nav fix (`showsFinalCheckPane`).
> 2. **Batch B (GPT failover):** all nodes fall over to GPT-5.5 / GPT-5.4-mini after ~2 quick Claude tries (env-gated on `OPENAI_API_KEY`).
>
> **To promote to PROD:** cherry-pick the staging files into `main`, **apply migration 0019 to the PROD DB** (`DATABASE_URL=$PROD_DATABASE_URL`),
> and confirm `OPENAI_API_KEY` is on the prod Render env (then Batch B is live on prod too). **Latency (local Claude, S5/S6 active):**
> overview ~75s→**71s**, build 108s→**81.5s** (~25% faster — S5 drops per-module KC tokens; 5/5, 0 failover).

## 🐞 KNOWN ISSUES / TO-FIX (QA backlog — 2026-06-27)
Consolidated from the full QA sweep (prod UAT, staging re-QA, mobile, KB coverage, input/upload code-trace, verify-before-promote). Full detail + repros: `~/Documents/wizbit-issues-master.md`; per-area: `wizbit-prod-uat-2026-06-26.md`, `wizbit-staging-reqa-2026-06-26.md`, `wizbit-staging-mobile-qa-2026-06-26.md`, `wizbit-kb-coverage-2026-06-26.md`, `wizbit-input-cycle-codetrace.md`. Key: ✅ fixed-on-staging · 🟡 open · 🔴 high · ⚙️ infra · 📋 data.

**🔴 High**
- **Repo upload crashes the instance** — `/api/upload-repo` (server.ts:1123) clones + embeds *synchronously* in the request; a non-trivial repo 502s and on PROD knocked out the next overview+skill (OOM/restart). Tiny repos work but ~16s. → async background ingest off the request path. (Same root as build/module 502s.)
- **Build/skill OOM on the 512MB Starter** → job_404 (in-memory jobs lost on restart). Worsened by the Anthropic cap → all staging gen on slow GPT-5.5 (~10min) until 2026-07-01. → persist job state; bigger/warm instance.

**🟡 Input cycle — accepted-but-silently-dropped (code-trace)**
- `cards` ignored by `/api/build` (runBuildJob never reads `art.cards` — editing card knobs between overview & build has no effect).
- `lessonTypes[]` ignored by the planner (only architect/overview-prose see it).
- `framework` silently dropped unless `examples`=code.
- Stale `uploadIds` → silent ungrounded build (uploads are **in-memory only**, lost on restart; `referOnly` quietly falls back). → persist uploads or fail loudly.
- P3: `objective:'other'`=no-op; `readingMode` never reaches a prompt (`horizontal` secretly adds a KC); body `userProfile` overridden by saved prefs.

**🟡 Uploads**
- `.csv` rejected (415); `/api/upload` + `/api/upload-repo` have **no requireAuth**; file-picker `accept` lists inconsistent + offer `.markdown` (server 415s) / omit several server-accepted exts; docs-only repo (README, no ext) → 422.

**📋 Library / KC**
- ~half of library lessons render a **perpetual empty KC pane** — lessons with neither per-module KC nor a backfilled `finalCheck` show `class="kc kc-pending"` "…appears once the lesson finishes building…" (components.ts:264; showsFinalCheckPane:280 returns true when `!hasModuleKC`). → run `scripts/backfill-finalcheck.ts` over the library, or suppress the pane for library lessons without a real finalCheck. (Affected in sample: the-agent-loop, human-in-the-loop-agents, tool-use-action-boundaries, model-context-protocol, planning-and-reflection, multi-agent-orchestration, serve-local-llm-ollama.)

**🟡 RAG/KB**
- No retrievable **code** or **business** examples (intents return code=false/biz=false); topic gaps (classic ML, generative media, hardware, governance, bias/fairness); coverage metric inflated (gate on `topSim`). See `wizbit-kb-coverage-2026-06-26.md`.

**🟡 Mobile (staging)**
- Lesson build-path map doesn't reflow; stacked sticky toolbars; toggle bar nested h-scroll; tap targets <44px (13×21 ▾); 9–11px fonts; Builder input placeholder clipping. (Page overflow itself ✅ fixed.)

**⚙️ Infra/routing**
- `prathibhax.com` apex has **no DNS A record** (prod only reachable via onrender origin). `/account` + `/my-lessons` direct URLs fall back to Home.

Solo dev → both environments carry the SAME code (pushed together). Everything below is live + runtime-verified
on local `:5070` (the opus-split worktree). The whole pipeline + UI set on both:
- **Module-cache correctness** — `moduleCacheKey` keys on objective/buildGoal/framework/lessonTypes (no wrong-input bleed).
- **Parallel module build (A1/A4/A2)** — cap-3 (`MAX_MODULE_CONCURRENCY`) parallel bodies, spine-order incremental render,
  relaxed density trigger. ~13.5 min → **~3.5–6 min** (verified: 3 module traces start the same second; 1 density pass, not 5).
- **Deterministic overview repair (A5)** + **529/overload resilience** — shared `withOverloadRetry` (`llm.ts`) on
  profiler/architect/modules; runs ride out a transient overload instead of failing.
- **Opus PLANNER → Sonnet WRITER split** — new `planner` node (Opus, STRUCTURE only, ~3-4k chars/~18s) feeds the `architect`
  node (now SONNET) which WRITES the prose. `runOverviewJob` = profiler→retriever→**planner**→architect. `coerceSkeleton`
  tolerates title-less citations + empty glossary defs. See "Generation latency".
- **Deferred glossary + synthesis** — `writeOverviewProse` (nodes.ts) fills glossary definitions + synthesis DURING the build,
  in parallel with the module bodies (the preview never showed them). Overview ~94s → **~73s**; ~0 added to the build.
- **"This lesson will cover"** — `mentalMap.willCover` (≤4 bullets; renderer `coversList()` falls back to module titles) below
  the overview map, + a FLEXIBLE no-clip overview layout (`#overview` min-height + roomy card clamp 162–204px; scrolls
  gracefully only if content genuinely overflows).
- **5 Trainer/renderer UI fixes** — preview lock cleared after "Generate Lesson"; horizontal-overview parity with vertical;
  scatter label de-collision; tabs → dropdown under "Trainer"; Sources link to the real source URL.
- **Upload gating + 25MB cap** — "Generate Overview" is DISABLED while a file/repo is still uploading server-side (else the
  lesson generated UNGROUNDED); 25MB cap client + server (`express.json` 40mb, `/api/upload` 35M-base64 ≈ 25MB).
- Prior baseline already on both: R0 module-build 529 resilience.

## Generation latency (2026-06-23)
- **529/overload resilience (shared `withOverloadRetry` in `src/agent/llm.ts`):** Anthropic `overloaded_error` (529) was
  failing whole builds — the old 3-attempt/~3s retry burned out during a transient overload (clears in 30-90s) → 0 modules,
  empty lesson. Now: detect overload/rate (529/429/overloaded/rate-limit) and ride it out with long JITTERED backoff
  (2/5/12/25/40s, +0-30%), 6 attempts (~84s). Jitter also de-syncs the parallel builds below. Applied to the **module build**
  (`runDeepDive`, on staging + prod) AND the **overview** profiler + Opus skeleton (`profiler`/`architect`, staging only so far).
  (`runDeepDive` still has its own inline copy of the same loop — could adopt the helper later; constants match, no drift.)
- **Parallel module build (`runBuildJob`, A1+A4):** module bodies build in PARALLEL (cap `MAX_MODULE_CONCURRENCY`, default
  **3**) instead of one-at-a-time, in spine order so Module 1 lands in the first wave; persists serially per-completion so the
  lesson grows monotonically as modules finish. ~13.5 min → ~5-6 min. Safe to share `bp`: each module writes only its own
  slot; `repairBlueprint()` is synchronous (atomic in Node) + skips stubs. Cap kept low so parallel calls don't burst the
  Anthropic rate/overload limit. (Module-body ~145s each is still the per-unit cost — next levers: shrink output / templatize
  framing / Haiku for simple modules.)
- **Relaxed density repair (A2, `runDeepDive`):** the extra "TIGHTEN prose" Sonnet call now fires only when prose is
  meaningfully over the tier (≥3 over-ceiling sentences OR ≥25% over), not on a stray long sentence (which fired ~every
  module). Density is a verbosity knob, not correctness — saves ~7-24s/module.

## Repo cleanup (2026-06-23)
- **Module-cache correctness fix:** `moduleCacheKey` (`src/lib/hash.ts`) + its call site (`src/server.ts`) now include
  `objective`/`buildGoal`/`framework`/`lessonTypes`. Before, two lessons differing only in those inputs collided on the
  module cache and a cache hit served the wrong fragment (silently dropping those inputs). Side effect: existing
  `module_cache` rows get new keys and regenerate once.
- **`Stale/` quarantine (gitignored, local-only):** throwaway/leftover files from past sessions were moved into a top-level
  `Stale/` folder (added to `.gitignore`) instead of being deleted — nothing lost, repo root tidy. Contents: throwaway
  helper scripts (`scripts/_*.ts`), mockup HTML (`public/_*-mockup.html`, `public/_enhanced-sample.html`,
  `public/_lesson.html`), design exploration mockups (`public/design/`), `prebuilt/REENRICH_SPEC.md`, `skipped.log`.
  NOT moved: `kb-build/backups/` (live prod/staging DB backups), `services/project-builder/` (Codex-owned),
  `services/kb-curator/` (curator session). Safe to delete `Stale/` once confirmed unneeded.

---

## 1. What it is
A web app whose **Configurator** tab takes a topic + options and generates a **self-contained
interactive HTML lesson** about agentic AI (mental-map-first, click-to-deepen, (i) on every term,
RAG-grounded). The **Trainer** tab is the lesson viewer; **My Lessons** = saved lessons;
**Library** = public prebuilt lessons. Replaces video with structured reading.

Stack: TypeScript · LangGraph.js · Claude (ChatAnthropic) · Supabase (Postgres + pgvector) ·
local Transformers.js embeddings (bge-small) · Express · vanilla front-end. `tsx` runs the TS
directly — **no build step**. Repo: `github.com/APareek89/agentic-learning-studio` (`main`,
auto-deploys to Render).

**Core invariant:** the model emits a **Blueprint (JSON) only**; a deterministic renderer
(`src/render/*`) turns it into HTML. That's why interactivity always works — never have the model write HTML.

---

## 2. Run / environment (non-negotiable)
- Port **5070** (`PORT=5070 npm start`; 5060 is Chrome-blocked). Kill stale: `lsof -ti tcp:5070 | xargs kill -9`.
- **Every Claude/Supabase/HF call** needs `NODE_EXTRA_CA_CERTS="/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem"` (corp MITM).
- `.env` is set (git-ignored). Supabase = **new project `kdgtlbnlyscdldogxorb`** (ap-southeast-2), auth ON, DB password `@`→`%40`.
- `GET /healthz` → `{db, dbConfigured, dbError, auth}` (live `select 1`). `db:false` = env, not code.
- **Render prod (#1 gotcha):** dashboard env `DATABASE_URL` must be the **new** project with the password `@` as `%40`, and `SUPABASE_URL=https://kdgtlbnlyscdldogxorb.supabase.co`. `render.yaml` has `sync:false` (values live only in the dashboard). A wrong/old value ⇒ empty dashboard + failed downloads.
- **Staging lane:** see **`STAGING.md`**. `main`→prod Render→prod Supabase (`kdgtlbnlyscdldogxorb`); `staging` branch→staging Render service→a SEPARATE staging Supabase project. ONE local repo (switch branches); local `.env` must point at **staging**, never prod. Migrations run per-DB (staging first, then prod inline). CORS needs no change (staging is same-origin; `EXTRA_ORIGINS` for cross-origin).
- **LOCAL ⇄ PROD (owner directive, 2026-07-14 evening):** local `.env` now points ENTIRELY at
  PROD — `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` are the prod project
  (`kdgtlbnlyscdldogxorb`). Localhost sign-in = the PROD QA account (`grz1q@web-library.net`,
  password in `~/.claude/secrets/als-qa-creds` as QA_PROD_PASSWORD). Everything generated/edited
  locally now writes the LIVE prod DB — be deliberate (test lessons land in prod under the QA
  account). Escape hatch: `STAGING_DATABASE_URL`/`STAGING_SUPABASE_URL` preserved in `.env`; the
  staging ANON key was overwritten during the swap — refetch from the staging dashboard if ever
  needed. `PROD_SUPABASE_SECRET_KEY` sits in `.env` for server-side use ONLY — never as anon.
  Verified 2026-07-14: healthz db+auth true, prod QA sign-in OK (3 lessons), /api/library = 100
  prod entries. (The old "local must point at staging" rule is retired with the staging workflow.)
- **`.env` DB vars (LEGACY NOTE, superseded above):** `DATABASE_URL` = **STAGING** (`ydgiysthvxhlfpzxyrmy`, ap-south-1) — the app + all default tooling use this; never repoint it at prod. `PROD_DATABASE_URL` = **PROD** (`kdgtlbnlyscdldogxorb`, ap-southeast-2) — used ONLY for explicit prod data migrations, by overriding per-command: `PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` then `DATABASE_URL="$PROD_URL" …`.
- **WORKFLOW FOR CLAUDE (OWNER OVERRIDE 2026-07-14): LOCAL → PROD directly.** We do NOT use the staging branch unless the owner explicitly asks — do not push to `staging`, do not touch the staging Render service. The path is: work LOCAL (uncommitted) → owner runs the MASTER QA GATE (docs/qa-gate-report.md must be GO) → owner commits + pushes local `main` → origin `main` (live: prathibhax.com, auto-deploys). Claude never commits/pushes without an explicit owner instruction. ⚠️ CODE ≠ DATA (scoped precisely): local tooling writes to the STAGING Supabase DB (`.env` guard). A prod push covers ALL code — incl. sources.yaml (prod curator ingests new KB sources on its next daily run) and blueprint JSONB fields (no SQL). The ONLY owner-gated prod-data steps are: (1) the refreshed LIBRARY rows (prebuilt_lessons) — row-copy staging→prod or replay rebuild against PROD_DATABASE_URL; (2) any NEW TABLES must ship as supabase/migrations files + their idempotent backfill scripts re-run once against prod (e.g. lesson_embeddings/lesson_match_log when built); (3) optional: Agent-Skills chunk drift copy. Prod RAG embeddings already exist (curator-fed). Test lessons on the QA account stay in staging — never copy. (Old staging-first workflow retired by owner decision.)
- **Staging KB:** the RAG `chunks` are reference data, so a fresh staging DB has an empty knowledge base (generations still work, just ungrounded). Populate it once with `SRC_DATABASE_URL="<prod URI>" node scripts/copy-kb.mjs` (copies documents/chunks/glossary/kb_updates prod→staging, idempotent) or re-ingest from source (`npm run ingest`).
- **QA + DataforSEO creds (NOT committed — secrets live in `~/.claude/secrets/als-qa-creds`, chmod 600):** QA test accounts are **staging `pojidov934@divahd.com`** / **prod `grz1q@web-library.net`** (passwords in the secrets file as `QA_STAGING_PASSWORD`/`QA_PROD_PASSWORD`). Run: `set -a; . ~/.claude/secrets/als-qa-creds; QA_BASE_URL=<url> QA_EMAIL=$QA_STAGING_EMAIL QA_PASSWORD=$QA_STAGING_PASSWORD npm run qa`. **DataforSEO** creds are in the SAME secrets file (`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`, 16-char pw, confirmed working — ~$47 balance Jun 2026; source `~/Documents/DFSEO.rtf`). Call via curl Basic-auth + `--cacert "$CA"` (Python urllib's TLS doesn't trust the corp proxy; curl does). Plaintext secrets are deliberately kept OUT of this committed file even though the repo is private.
- **Prod is reachable at `https://agentic-learning-studio.onrender.com` / staging at `…-1.onrender.com`** (the custom domain `prathibhax.com` does NOT resolve from the agent sandbox — use the onrender URLs to verify deploys).

---

## 3. File map (open ONLY what you change)
```
src/server.ts        Express + all routes. /api/overview (bg, free skeleton draft) +
                     /api/build (bg, promote draft→lesson + build bodies)·/api/job/:id·/api/learn (SSE)·
                     /api/artifact/:id (RE-RENDERS from blueprint)·/…/full (download, time-boxed)·
                     /api/module + /api/check (PUBLIC, no auth — artifact iframe calls them)·
                     /api/ask + /ask/expand·/api/upload(+ -repo)·/api/library + /lesson/:slug
                     (RE-RENDERS from stored blueprint, falls back to stored html)·
                     /api/community (list) + /community/lesson/:slug (public, re-renders) +
                     /community/like (public, +1) + /community/share (auth: snapshot + discount; contributor flag = no discount)·
                     /api/contributor/me + /contributor/register (auth) + /community/drivers + /community/driver/:id (public)·
                     /api/progress (auth: host relays iframe progress)·
                     /api/lessons /preferences /profile /suggest /rate·/healthz.
src/agent/           THE GENERATION PIPELINE (LangGraph):
  state.ts           GraphState channels (inputs: cards, levels, lessonTypes, framework,
                     industry, buildGoal, readingMode, userProfile, userId/Email).
  llm.ts             makeLLM(tier,temp,opts) → opus/sonnet/haiku. Drops topP always; drops
                     temperature for the OPUS tier (Opus 4.8 400s on it).
  calibration.ts     LEVEL specs (scaffolding) + DENSITY specs (countable prose) + densityBuys()
                     (the level×density COUPLING) → calibrationDirective() injected into prompts.
  prompts.ts         PROFILER_SYSTEM · SKELETON_SYSTEM · MODULE_SYSTEM + architectUserPrompt() /
                     moduleUserPrompt() builders. (ARCHITECT_SYSTEM is dead/legacy — ignore.)
  nodes.ts           profiler · retriever · architect (skeleton: RAW parse via extractJsonObject
                     + coerceSkeleton, NOT withStructuredOutput) · seedFirstModule · composer ·
                     runDeepDive (writes ONE module's blocks + density repair + quiz gate).
  graph.ts           START→profiler→retriever→architect⟲(repair once)→seedFirstModule→composer→END.
  orchestrator.ts    TWO-STAGE HITL gate (DETACHED bg): runOverviewJob (profile→retrieve→
                     architect→register skeleton as DRAFT kind "overview-draft", preview-only,
                     NO bodies) · runBuildJob (promote draft→"learning-artifact" + build all
                     module bodies). Auto course-splitting retired from the live flow.
  density.ts         measureModule + repairDensity (per-tier sentence ceilings; RULE 2).
src/render/          BLUEPRINT → HTML (deterministic; the model never writes HTML/JS):
  schema.ts          Blueprint Zod + block kinds + validateBlueprint (7 gates) + repairBlueprint.
                     `diagram` block = discriminated `template` (9: neuralNetwork/pipeline/agentLoop/
                     graph/sequence/layeredArchitecture/tree/matrix/barProportion) + a flexible
                     all-optional `data` bag (DiagramDataSchema). Model supplies DATA ONLY — never SVG.
  diagrams.ts        PREBUILT diagram component library (NEW, 9 templates). One pure fn per template → a
                     self-contained INLINE SVG string (theme-aware via CSS vars, <title>/<desc>,
                     every label escaped, $0/offline, no JS). renderDiagram(template,data,idSeed)
                     dispatches; bad/empty payload → safe empty-state, never throws.
  tokens.ts          ARTIFACT_CSS — design tokens, 27-combo gates, OVERVIEW no-scroll grid,
                     HORIZONTAL-mode CSS, modal, `.diagram` container (+ `.hmodal .diagram`).
  components.ts      renderBody (vertical) + renderBodyHorizontal + mentalMap() + moduleInner()
                     + every block renderer (diagramBlock() wraps renderDiagram in a <figure>).
                     THIS is the overview/layout file.
  runtime.ts         RUNTIME_JS — nav, (i) popovers, quiz grading, viz hydration, bg module
                     queue, horizontal pager + modal.
  index.ts           renderArtifact(bp) → one self-contained HTML string (body data-level/depth/
                     examples/reading attrs).
src/lib/             db.ts · artifacts.ts (durable store + JSONB coercion) · lessons.ts (dashboard/
                     prefs/courses + saveProgress + %-completed in listLessons) · community.ts
                     (share→snapshot+discount, list, like, serve + contributors: register/get/
                     listDrivers/getDriver) ·
                     uploads.ts (in-mem upload store, Array.isArray-guarded) ·
                     jobs.ts · auth.ts · hash.ts · langfuse.ts.
src/rag/             embed · loaders · chunkers · store · retrieve · ingest (KB in Supabase `chunks`).
services/kb-curator/ DAILY KB refresh job (GitHub Actions) — detect(24h-delta)·fetch·ipgate·synthesize·
                     apply(reuses src/rag embed+upsertSource)·report·index; sources.yaml allowlist. See §7.
.github/workflows/   kb-curate.yml (cron 15:30 UTC = 9pm IST; merge to main to arm). kb-build/ = Codex KB rebuild tooling (§7).
public/              index.html (tabs Configurator/Trainer/My Lessons/Library) · app.js (Library cards
                     = image-free CSS "course tiles": renderLibrary() builds the markup, CATEGORY_STYLE
                     map {bg,icon,text,svg} drives per-category color + inline-SVG icon) · styles.css (.lib-*).
supabase/migrations/ schema (0005 = prebuilt_lessons.content_version/rebuilt_at). scripts/ migrate ·
                     seed-library (deterministic, from prebuilt/*.json) · rebuild-library (RE-GENERATES
                     prebuilt lessons through the LIVE pipeline; filter-gated) · test-structure · test-horizontal · …
```

---

## 4. How it's configured (the decisions that matter)
- **Models (cost-controlled hybrid):** skeleton/structure = **`claude-opus-4-8`** (set in `nodes.ts` `skeletonLLM`); modules/profiler/density/glossary = Sonnet/Haiku. ~10–15% cost lift. **No proofreader** (latency). Model IDs come from `llm.ts` (env-overridable `ANTHROPIC_MODEL_*`).
- **Skeleton parsing:** Opus 4.8 + langchain `withStructuredOutput` truncates/double-encodes large Blueprints → the skeleton is generated **RAW** and parsed by `extractJsonObject` + `coerceSkeleton` (strip nulls; arrays→records for glossary/citations; recap str→rich-text; buildOrder/checklist str→objects; fill omitted arrays; inject resolved profile) → `BlueprintSchema.safeParse` → existing repair-retry on off-shape. Modules keep Sonnet `withStructuredOutput` (fine).
- **Generation flow (human-in-the-loop overview gate):** UI "Generate Overview — Free" → `/api/overview` → `runOverviewJob` builds ONLY the skeleton, registered as a preview-only **draft** (kind `overview-draft`, hidden from My Lessons, renders overview-only — nothing builds, clicking a node shows a "generate the lesson" note). Trainer shows the overview + two CTAs: **Generate Lesson** (`/api/build` → `runBuildJob` promotes the draft to `learning-artifact` and writes all module bodies → user sent to My Lessons, opens as it builds) and **Edit overview** (modal for feedback → re-runs `/api/overview` with the feedback appended → new draft). Module bodies still build lazily via `/api/module` (cached in `module_cache`). `/api/learn` is a legacy SSE path (not the live one). Auto course-splitting was retired from this flow (single overview); existing course artifacts still render.
- **Level×density coupling:** `calibration.ts` `densityBuys()` — what "more/less text" BUYS per cell (High+Advanced→substance/edge-cases NOT re-explanation; High+Beginner→scaffolding; Low+Advanced→terse; Low+Beginner→cut scope keep scaffolding).
- **Profiler gap-fill precedence:** selection > request-implied > profile-inferred > cautious default. Subject is the ASK; role/industry only flavor EXAMPLES (never reframe). Level inferred from build goal + topic complexity (not default "intermediate").
- **Quiz gate:** `selfCheckQuiz` + `knowledgeCheck` ONLY when lessonType includes `knowledge_check` (enforced in `runDeepDive` + prompts). In-flow retrieval (predict-then-reveal, recall hooks) is NOT gated.
- **Reading mode:** `learnerProfile.readingMode` `vertical` (default) | `horizontal` (paged deck, modal-on-expand, final knowledge-check page). Horizontal implies knowledge_check. `data-reading` attr drives CSS/runtime.
- **Overview:** a no-scroll concept/process map of uniform SQUARE blocks (`#overview` + `.map*` in `tokens.ts`; `mentalMap()` in `components.ts`) — corner number/icon badge on the top-left corner; ordered = single arrow-connected row, conceptual/comparative = wrapping square rows. Card = headline + 10–15-word `orient` description only; detail (what/why/analogy) lives in the module head, not on the map.
- **Existing lessons pick up renderer fixes:** both `/api/artifact/:id` (user lessons) AND `/api/lesson/:slug` (library) RE-RENDER from the stored Blueprint (fallback to stored html), so renderer/overview changes reach saved + prebuilt lessons without re-generating.
- **Prebuilt library = real generated lessons:** the library is RE-GENERATED through the SAME live pipeline as fresh lessons (`scripts/rebuild-library.ts`), not authored by hand — so it carries the concept-map overview, 7-question coverage, scenario shaping, and pedagogy. Every module is FULLY built (no stubs — the library has no background build queue). `prebuilt_lessons.content_version` + `rebuilt_at` make rebuilds resumable.
- **Prebuilt diagrams (data-as-CODE, $0):** the `diagram` block extends the viz-block pattern (model emits DATA ONLY, renderer owns every SVG tag) but as STATIC inline SVG — no hydration, so it shows identically in vertical, horizontal, and the horizontal modal. The model picks a `template` by SHAPE when a beginner can't picture an idea from code/prose; archetype→template map lives in `MODULE_SYSTEM` "INTERACTIVE VISUALS & DIAGRAMS" + the `moduleUserPrompt` VISUALS line (agent loop→agentLoop · pipeline/chain→pipeline · state/multi-agent topology→graph · trace/request path→sequence · stack→layeredArchitecture · net→neuralNetwork). Gated on `visualsRequested`, ≤1 visual per module. For `graph` the model gives coarse col/row grid coords; the renderer places + routes (no auto-layout). Fixture: `scripts/test-diagrams.ts` (NO credits) → renders all six in both modes to `/tmp/als-diagrams-*.html`.

---

## 5. Gotchas (load-bearing — don't re-discover)
- Port **5070**; `NODE_EXTRA_CA_CERTS` on every external call; `tsx` (no build).
- **Render `DATABASE_URL`**: new project + `%40` password. `db:false` ⇒ env.
- **Opus 4.8**: `withStructuredOutput` unreliable for big JSON → skeleton uses RAW parse (above). Opus 400s on `temperature` (dropped in `llm.ts`). Non-streaming max_tokens ceiling ≈16k; streaming needed above that.
- **JSONB from DB** can arrive odd: `artifacts.ts` coerces `upload_ids`→array + parses blueprint/cards/profile; `uploads.ts` helpers `Array.isArray`-guard (old rows stored `upload_ids:{}` and crashed `ids.some`).
- **Public routes (no `requireAuth`):** `/api/module` + `/api/check` (artifact iframe has no token) AND `/api/upload` + `/api/upload-repo` (the Configurator is open — learners attach files/repos BEFORE signing in; uploads are session-scoped in-mem, random docIds, not user data). The lesson-CREATING routes (`/api/generate`, `/api/learn`, `/api/ask`, `/api/ask/expand`, dashboard/prefs) stay gated — that's the real wall. Repo-clone abuse bounds (≤400 files / ≤4MB / 90s, public https github/gitlab/bitbucket) unchanged.
- **Overview drafts vs lessons (the gate) keyed off `kind`:** an un-approved overview is stored with `kind = "overview-draft"`; `listLessons` filters `kind = 'learning-artifact'` so drafts never show in My Lessons. `runBuildJob` promotes the kind on approval (`updateArtifact` persists `kind` now). `/api/artifact/:id` renders `previewOnly` when `kind === overview-draft` (empty bg queue + click-to-build disabled in `runtime.ts` via the `PREVIEW` flag). No DB migration — reuses the existing `kind` column.
- **`/api/ask` is a FAST path — NO RAG.** It answers from the model's own knowledge grounded in the lesson's in-memory structure (topic/thesis/module titles); the KB embed+search was the latency. The heavier `/api/ask/expand` ("add details in lesson") still does full grounding via `runDeepDive`.
- `pdf-parse` import = `"pdf-parse/lib/pdf-parse.js"`; pg `date`→string; `decisionMatrix.cells` = ARRAY; onnxruntime `mutex` warning on exit is harmless.
- Artifact CSS is **baked per-lesson at render** → renderer/CSS changes only affect re-rendered lessons (and `/api/artifact/:id` re-renders, so most do).
- **Prod hardening (Jun 2026):** RLS on all 13 tables (migration `0008`; server bypasses via `postgres`/`rolbypassrls`). `server.ts` has `trust proxy` + `helmet` (CSP OFF — lessons inline JS) + `cors` allowlist (`prathibhax.com`/`www`/onrender/localhost + `EXTRA_ORIGINS`) + `express-rate-limit` (600/15min on `/api`, 40/hr on overview/build/upload). Global gen cap `MAX_CONCURRENT_GENERATIONS` (default 4) in `jobs.ts` (acquire in the route, release in the job `finally`). `llm.ts` sets `maxRetries:4` (429/529 backoff).
- **Hardening round 2 (Jun 2026, migration `0009`):** lesson **iframe sandboxed** (`viewer-frame`, runtime verified working); **input caps** (overview prompt ≤5000, upload ≤~10MB→413); **community moderation** — `/api/community/report` + `reported`/`hidden` columns, auto-hide at ≥3 reports, all listings filter `hidden=false`, report button on tiles; **discount anti-farm** — one unredeemed `community_share` code per user; **retry UI** — `showGenError` "Try again" on a failed overview/build; **retention** — lesson expiry 30d→1yr (`expires_at` default; "Saved" badge unless ≤30d left).
- **Live host (Jun 2026):** deployed at **https://prathibhax.com** (+ www) on Render — GoDaddy DNS resolved (apex A → 216.24.57.1, www CNAME → onrender; GoDaddy Forwarding removed) and the Render instance upgraded to **Standard (2 GB)**. CORS allowlist already includes the domain.
- **Langfuse traces the LIVE path now (DONE Jun 2026):** `makeLangfuseHandler()` is wired into BOTH `runOverviewJob` and `runBuildJob` in `orchestrator.ts` — each builds a per-job `config = { callbacks:[handler], runName:"lesson:<title/prompt>", metadata:{langfuseTags:["live-generation"], stage} }`, passes it to `profiler`/`architect` (and to `runDeepDive` via `opts.config`; `retriever` takes no config), and `flushAsync()`s in the job `finally` (background jobs can exit before traces flush). Legacy `/api/learn` handler kept as-is. So with `LANGFUSE_*` keys (+ `LANGFUSE_BASEURL`) set, real lessons trace. Verified live (Jun 2026): an overview+build run produced traces named `lesson:…` carrying `ChatAnthropic` GENERATION observations (model + token usage) in Langfuse. CAVEAT: `metadata.langfuseTags` does NOT populate trace `tags` in the installed `langfuse-langchain` version (filter by `name` instead) — pre-existing, also affects the legacy path.
- **NEXT (deferred by decision):** (1) **billing + per-user credit metering** — gate `/api/overview`+`/api/build` on a paid/granted balance (Paddle); the #1 money risk still open. (2) **account basics** — email-verified gating in code, password reset, account deletion/export. (3) ~~Langfuse live-path wiring~~ **DONE (above)** — set `LANGFUSE_*` in Render to trace prod. (4) smaller: tight CSP w/ nonces, per-user (not just per-IP) rate limits, langchain dep upgrade (12 transitive vulns, breaking), admin unpublish UI. USER-side still: **Anthropic spend cap**. (DONE by user: Supabase Pro, confirm-email ON, prod env correct, Render Standard 2GB, domain live.)

---

## 6. Verify before pushing
```
npx tsc --noEmit                         # must be clean
npx tsx scripts/test-structure.ts        # skeleton + classification (USES CREDITS)
npx tsx scripts/test-horizontal.ts       # renders vertical+horizontal fixtures (NO credits)
```
Then restart :5070 and `curl localhost:5070/healthz` (expect `db:true`). Push to `main` after a coherent chunk (user tests on Render). Generation is deterministic code + model calls — never hand-edit lesson content with the LLM.

---

## 7. Open / next

> ### 🚀 PROMOTED TO PROD — 2026-06-27 (`main` `3d3fae4`)
> All 5 items below (1 UAT Batch 1 · 2 LLM Skills · 3 Lesson visuals/v5 · 4 B3 durability+latency · 5 Home/nav UI) were
> promoted to prod on 2026-06-27: the **19 staging files** (byte-identical to `origin/staging`, tsc clean) pushed to `main`
> (`f6347eb..3d3fae4`); **migrations `0017`+`0018` applied to the PROD DB**; **visuals ingested (129/129) + backfilled
> (95/100 library lessons, 136 visuals)** on prod. Verified live on `https://agentic-learning-studio.onrender.com`: healthz
> green; new home heading + AI-landscape box + Library FREE pill + LLM-Skills-after-My-Lessons tab order; a library lesson
> renders the "Visualize this" CTA. ✅ **Authed overview+build re-QA on prod — PASSED (2026-06-27):** a full build completed
> **5/5 = 100%** (`stubModuleIds: []`) and the prod credit debited **1 → 0** — charge-once-on-full-success verified LIVE on
> prod; durability held (build completed despite a slow module). NO 502/404 (B3 ship-blocker gone on prod). Auth used the
> public `anon` key from prod `/api/config` + the prod QA account. **Latency this run was slow (overview ~429s, build ~658s)
> purely from elevated Anthropic latency TODAY** (the same broad slowness hit staging earlier) — NOT the instance (prod is
> Standard 2GB) and NOT rate-limiting (org is Scale tier). On a normal Anthropic day prod does the whole build in ~3.5–6 min
> (and local same-code = 307s); re-measure latency when Anthropic latency normalizes. **All 5 items are now fully promoted +
> verified on prod.**
>
> _(Original staging-ready note, 2026-06-26 — kept for the promote-mechanism reference:)_
> Staging = `https://agentic-learning-studio-1.onrender.com` (Supabase `ydgiyst…`). Prod = `https://agentic-learning-studio.onrender.com`
> (Supabase `kdgtlbnl…`). Promote to `main` with the `git checkout origin/staging -- <paths>` pattern, then run any per-item DB
> step against the **PROD** DB (`PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` then `DATABASE_URL="$PROD_URL" …`).
>
> 1. **UAT Batch 1 fixes** (`3ad0e1e`) — B2 SPA fallback · B6 401-race · B5 stale-build badge · B8 library KC grading ·
>    B9 popover · B4 mobile header · download-mid-build. **No DB migration.** Promote: 6 files (`server.ts`,
>    `render/{runtime,tokens}.ts`, `public/{app.js,styles.css,home.css}`).
> 2. **LLM Skills tab** (`e4be14c`+`da61062`) — Build a Skill / My Skills dropdown. **Migration `0017_generated_skills.sql`**
>    (apply to PROD DB). Promote: `lib/skillgen.ts`, `rag/retrieve.ts`, `server.ts`, `public/{index.html,skills.js,skills.css,app.js}`, migration.
> 3. **Lesson visuals + v5 swap** (`2a200fe`+`2402f53`) — "Visualize this" CTA/popup, v5 diagrams. **Migration
>    `0018_lesson_visuals.sql`** + ingest + backfill on PROD DB (`npm run migrate` → `ingest-visuals.ts` → `backfill-visuals.ts`,
>    all with `DATABASE_URL="$PROD_URL"`). Promote: `lib/visuals.ts`, `render/{schema,components,tokens,runtime}.ts`,
>    `agent/orchestrator.ts`, `scripts/{ingest,backfill}-visuals.ts`, plus the two migrations.
> 4. **B3 build durability + latency** (`bda97ee`) — the 502/404 ship-blocker fix + caching/planner/concurrency (full
>    detail in the B3 bullet below). **No DB migration.** Promote: `src/server.ts`, `src/agent/{orchestrator,nodes}.ts`,
>    `src/lib/jobs.ts`, `src/render/runtime.ts`, `public/app.js`. ⚠️ `orchestrator.ts` + `render/runtime.ts` are shared with
>    item 3 (visuals) — promote the CURRENT files (they contain both). ⚠️ A clean 5/5 *generation* re-QA on the Render host is
>    blocked until the staging Anthropic spend cap resets (2026-07-01) — verified locally (5/5) + 202/no-502 on the host.
> 5. **Home + nav UI batch** (`d5e9235`) — broadened home messaging to the whole AI landscape (new H1, broadened sub/chips,
>    a new `#ai-areas` box: 8 grouped topic areas / 50 chips below the community band); **sticky top nav** (`.topbar`
>    position:sticky + `html,body` height→min-height); **Library "FREE" pill**; **LLM Skills tab moved after My Lessons**;
>    **bigger/lighter dropdown caret**; **dark-mode fix** for the "free overview" toast in the lesson iframe (was white-on-light
>    → invisible; now hardcoded dark bg). **No DB migration.** Promote: `public/{index.html,home.css,styles.css}`,
>    `src/render/runtime.ts` (runtime.ts also shared with items 3+4 — promote current). Verified: home in-browser (Playwright,
>    sticky pinned at scrollY=5481) + served HTML/CSS/runtime bytes. Dark-mode toast fix verified in served bytes (the
>    end-to-end dark lesson view needs a built lesson → re-confirm visually after the Anthropic cap resets).
> KNOWN minor (pre-existing, non-visible): standalone artifact at 375px reports a ~117px phantom scroll while a viz modal is open.
> ✅ **SHIP-BLOCKER LIFTED (2026-06-26, `bda97ee` on `origin/staging`):** the build **502/404 ship-blocker is FIXED** (see the B3
> entry below — `/api/module` now returns 202 + polls instead of synthesizing on the request; `runBuildJob` is per-module
> resilient; `pollJob` 404 reconstructs persisted state). Verified: `/api/module` returns **202 in <1s** on the staging host
> (was ~120s synchronous → 502), and a full build to **5/5 = 100%** locally (staging DB; was timing out at 3/5). When promoting
> these items to prod, `agent/orchestrator.ts` is now shared between item 3 (visuals) and B3 — promote the **current** file.
> ⚠️ **Final clean 5/5 re-QA on the staging Render host is BLOCKED until the Anthropic spend cap resets** (the staging
> `ANTHROPIC_API_KEY` hit its specified usage limit — `400 invalid_request_error: "regain access on 2026-07-01 at 00:00 UTC"`;
> my verification builds exhausted the remaining budget). Until then staging builds degrade gracefully (partial lesson, NOT
> charged) rather than 502/404. Raise the key's limit (or wait for 2026-07-01) to capture a clean staging build-to-100%.

- **🧠 PROD OOM + MEMORY FIX (2026-06-27) — FIXED & ON PROD.** The prod instance (Standard 2 GB) exceeded RAM and Render
  auto-restarted it. Root cause = two unbounded in-memory Maps (audit P0-2/P0-3), aggravated by the Batch-A concurrency bump +
  go-live traffic:
  - **`src/lib/jobs.ts`** — generation progress trackers were never freed (the `activeJobs` cutoff only filtered the view).
    Added the opportunistic sweep the `skillgen`/`handson` maps already use: drop trackers >60 min on each `createJob`. (`8fce4e4`)
  - **`src/lib/uploads.ts`** — parsed/embedded uploads were never evicted. Added `createdAt` + a 2 h `gcUploads()` on each
    upload. (`8fce4e4`)
  - **Concurrency defaults lowered to bound PEAK RAM:** `MAX_MODULE_CONCURRENCY` 8→5 (`orchestrator.ts`),
    `MAX_CONCURRENT_GENERATIONS` 4→2 (`jobs.ts`). Both still env-overridable. (this commit)
  Jobs/uploads are RAM-only; lessons live in Postgres, so these GCs have **zero user impact** (pollJob reconstructs from the
  persisted artifact if a tracker is ever missing). After deploy the Render **Memory graph should plateau** instead of climbing
  to a cliff. NOTE (still open, see STAGING_AUDIT.md Scalability): all this state is single-instance in-memory — it must move to
  Postgres/Redis before any horizontal scaling, and **Sentry + memory alerting (Phase-2 prompt) would have flagged this pre-OOM**.
- **⚡ LATENCY / MODEL-TIERING — Batch A + S5 + S6 + grounding-log DONE & ON PROD; Batch B (GPT failover) coded + env-gated, pending the OpenAI-key validation (2026-06-27, `main e134aeb`).**
  Root cause of slow builds was **output-token generation** (latency ≈ output_tokens ÷ decode_rate), NOT input/cache/RAG/rate-limit
  (org is Scale tier). **Batch A (shipped to staging `6610833` + prod `e23fa33`):**
  - **All modules build in ONE parallel wave** — removed the B3 serial "module-1 cache-warm-up" (it traded wall-clock for cents
    of input cost). `orchestrator.ts` `runBuildJob`. Measured **build 307s → 108s (2.8×)** locally (5/5, 0 failed; wall-clock ≈
    slowest module, not the sum). `MAX_MODULE_CONCURRENCY` 5→8 (env).
  - **Model tiering:** `profiler` → Haiku (`nodes.ts`), `repairDensity` → Haiku (`density.ts`) — both env-overridable; verified
    clean (profiler 6s→2.5s). No gate/credit/schema change.
  - **Overview still ~74s** (planner 23s + **architect 49s = the long pole**, one 16k Sonnet skeleton call) — NOT addressed by
    Batch A; the planner leg is targeted by Batch B (planner→a cheaper model), the architect stays Sonnet (quality-critical).
  - **Cost reality (flag for finance):** a full 5-module lesson ≈ **$0.95–1.70** Anthropic spend vs **$0.99/credit** — thin/negative
    margin. S5 (single end-KC) + Haiku tiering improve it; fewer/lighter modules help.
  - **✅ S5 / S6 / grounding-log — DONE, ON STAGING (`origin/staging 1f3b899`) AND PROD (`main e134aeb`, 2026-06-27; NO DB migration).**
    Verified locally (staging Supabase + working key) + tsc-clean on the prod base; a full build runs 5/5=100% and
    charge-once-on-full-success holds. Promoted 7 files: `src/agent/{nodes,prompts,state}.ts`, `src/rag/retrieve.ts`,
    `src/render/{components,schema}.ts`, `src/server.ts`.
    - **S5 — single end-of-lesson KC:** modules NEVER emit knowledgeCheck/selfCheckQuiz (`moduleUserPrompt` directive forced OFF +
      `runDeepDive` strips both; the in-flow retrieval primitives — predictThenReveal, recall hooks, scenarios — are KEPT). ONE
      lesson-level KC is generated in `writeOverviewProse` → **`bp.finalCheck`** (stable id `_final_check`; schema: extracted
      `KnowledgeCheckBlockSchema`, optional Blueprint field). Rendered in a **`_check` pane (vertical) / page (horizontal) BEFORE
      Sources** (`finalCheckInner` in `components.ts`; the old DEAD `cumulativeCheckItems`/`horizontalCheckPage` were removed).
      `/api/check` resolves `bp.finalCheck` by block id (per-module KC fallback kept for old/library lessons). Gated on `lessonTypes`
      incl `knowledge_check` (horizontal implies it). Verified: broad vertical → 1 KC (5 Qs) before Sources, narrow horizontal → 1 KC
      page, grading works, ZERO per-module quizzes, both modes.
      ⚠️ **Transitional (cosmetic, prod):** an OLD KC lesson re-rendered with this code shows its old per-module KCs AND an empty
      `_check` placeholder (it has no `finalCheck`). Only affects pre-existing KC lessons; new builds are clean. Candidate follow-up:
      suppress the `_check` placeholder when a lesson already has per-module KC blocks and no `finalCheck`.
    - **S6 — dynamic module count:** profiler classifies `scope` (narrow|moderate|broad) → `moduleTarget` **5/6/8** (on `Intent`),
      threaded into the planner + architect (skeleton) prompts (was hardcoded 4-5). `MAX_MODULE_CONCURRENCY` already defaults to 8.
      Verified: "the whole field of machine learning" → 8 modules; "what is an AI agent" → 5.
    - **grounding telemetry:** `src/rag/retrieve.ts` logs `[retrieve] grounded|ungrounded · N chunk(s) · coverage=… · q="…"` per call
      (the early `!ragEnabled()`/empty-query return logs ungrounded with a reason). Cheap; gives data on how often broad topics ground.
  - **🟡 Batch B — GPT failover: CODED + COMMITTED LOCALLY (`feat/credits-billing 192aabf`), NOT pushed; env-gated NO-OP without `OPENAI_API_KEY`.**
    `src/agent/llm.ts` adds `gptFallbackEnabled()` / `makeGptLLM(tier)` (Sonnet→`gpt-5.5`, Haiku→`gpt-5.4-mini`; env-overridable via
    `OPENAI_MODEL_SONNET`/`OPENAI_MODEL_HAIKU`) / `stripCacheControl` (drops the Anthropic-only cache_control on the GPT branch) /
    `structuredWithFallback` / `rawWithFallback` / `invokeResilient`. Wired into profiler, planner, architect, runDeepDive,
    writeOverviewProse, density-repair, and `/api/check`. With a key: Claude SDK retries cut to 2 (`CLAUDE_RETRIES`) + LangChain
    `.withFallbacks([gpt…])` → fails over to GPT FAST (not the ~84s backoff); without a key: unchanged (Claude-only + `withOverloadRetry`).
    Verified: tsc clean + a full no-key build is 5/5=100% with ZERO GPT refs (no regression). `.env` + `.env.example` now carry a blank
    `OPENAI_API_KEY=` field (+ the two `OPENAI_MODEL_*` defaults). **PENDING (needs the user's key):** (1) confirm the exact OpenAI
    model-id strings vs the account (`gpt-5.5`/`gpt-5.4-mini` are best-guess defaults), (2) FORCE the fallback + run full GPT-only
    builds (structured-output parse + lesson quality; watch for GPT-5.x temperature/max_tokens 400s), (3) push to `origin/staging` +
    add `OPENAI_API_KEY` to BOTH the staging AND prod Render envs before any prod promote.
- **🔎 FULL STAGING AUDIT — see [`STAGING_AUDIT.md`](STAGING_AUDIT.md) (2026-06-27, `8f1c8e2`).** A read-only code /
  security / scalability / resilience audit + the full generation-pipeline data-flow map (input → agents → output → user
  context). Owner to review tomorrow. **Headline P0s** (full detail + P1/P2/P3 + ops runbook in the doc):
  - **P0-1 unmetered model-spend faucet** — `POST /api/module` is public, unrate-limited, takes no gen slot, and runs real
    ~16k-tok Sonnet builds (via `ensureModuleBuild`) for FREE; the credit is only charged in `runBuildJob`. A known artifact
    UUID = free paid generation. (Pre-existing: the old synchronous `/api/module` was also free; B3 made it async.) **Decide:**
    add a light gen-slot + per-IP rate-limit to `/api/module`, and/or only allow on-demand builds for artifacts owned by the
    caller. Trade-off: `/api/module` must stay token-less for the lesson iframe — gate by cost/rate, not auth.
  - **P0-2 unauthenticated expensive `/api/upload` + `/api/upload-repo`** (CPU/embedding, `git clone`, unbounded in-mem
    `uploads` Map) → DoS/OOM. **Decide:** rate-limit + cap + TTL-evict the uploads Map.
  - **P0-3 `jobs` Map never pruned** (`src/lib/jobs.ts`) — siblings `skillgen`/`handson` sweep, this one doesn't → slow OOM.
    Quick fix: add the same periodic sweep.
  - **P0-4 credit charge depends on the process surviving the whole build** — a restart/deploy (or the `/api/module`
    recovery path) yields a free lesson; the bare `-1` spend is non-idempotent. **Architectural:** make the charge idempotent
    (key it to the artifact + a "charged" flag) so it survives restarts and can't double/under-charge.
  - **✅ P0-5 zero-module build charged — FIXED (`8f1c8e2`):** `fullSuccess` now requires `pending.length > 0`.
  - **P0-6 backups/PITR undefined** — confirm Supabase PITR is on for BOTH DBs + do a restore drill (single biggest
    data-loss risk; all durable state has one home). See the doc's runbook.
  - **13× P1** incl: per-resource authz (`/api/build` can charge another user; `/api/ask/expand` edits any lesson),
    `module_cache` key omits `uploadIds`/`referOnly` (cross-user upload-grounded leak), `runBuildJob`⇄`ensureModuleBuild`
    last-write-wins blueprint clobber, iframe sandbox effectively disabled (`allow-scripts allow-same-origin` + CSP off),
    DB `rejectUnauthorized:false`, uploaded-doc grounding silently lost on restart, migrations manual/untracked (no
    `schema_migrations`). All in `STAGING_AUDIT.md` with file:line + fixes.
- **🔑 Anthropic API limit (the staging-build blocker):** the `400 "regain access 2026-07-01"` is a **monthly SPEND cap**
  (not a rate limit). Raise it in console.anthropic.com → **Settings → Limits** (org AND the key's **Workspace** — workspace
  limit overrides org) and ensure **Billing** has credit/auto-reload. Give **prod** a high cap, **staging** a modest one
  (~$2-5 covers a clean 5/5 build). Code already degrades gracefully on the cap. After raising it (or after 2026-07-01),
  run the clean 5/5 staging build-to-100% + the live dark-mode lesson check that the cap blocked.

- **✅ B3 — DONE (2026-06-26, `bda97ee` on `origin/staging`): build durability (502/404 ship-blocker) FIXED + latency work landed.**
  **PART A — durability (the ship-blocker):**
  (1) **`/api/module` 502 → 202/poll (`server.ts`).** The PUBLIC per-module endpoint no longer synthesizes a ~16k-tok Sonnet
  body SYNCHRONOUSLY (that exceeded Render's gateway timeout → 502 / a ~120s hang). It now: serves the `module_cache` hit →
  serves the module if the persisted artifact already has it (renders + caches) → else returns **`202 {building:true}`** and a
  deduped off-request worker `ensureModuleBuild()` synthesizes it; the iframe POLLS. If a `runBuildJob` is already building the
  artifact (`hasActiveBuildForArtifact` in `lib/jobs.ts`), IT stays the builder (no double-build). `render/runtime.ts` `pump()`
  handles the 202 (re-queue + poll every 2.5s, 5-min backstop). Verified on the staging host: **202 in <1s** (was ~120s sync).
  (2) **`runBuildJob` per-module resilience (`orchestrator.ts`).** Each module builds in a try/catch — one module that errors
  (502/overload-exhausted/parse) becomes a STUB and the build CONTINUES to a usable 100% (remaining stubs build on demand via
  /api/module). **Credit now charges ONLY on FULL success** (`failCount===0`) — NOT on a partial/failed build; "charge once,
  only on full success, never on failure/partial" preserved. Verified locally: a forced single-module failure → build still
  reaches done (4/5 ok, 1 stub) and **balance unchanged** (no charge); a clean 5/5 build charges exactly 1.
  (3) **`pollJob` 404 (`public/app.js`).** A Render restart that drops the in-memory job mid-build no longer reverts the UI to
  0%/failed — 404 now reveals the PERSISTED lesson (`/api/artifact/:id`, built modules + self-building stubs) + reloads the
  dashboard. (Modules persist to Postgres incrementally; `runBuildJob` promotes `kind` at the start, so the lesson is already
  in My Lessons.)
  **PART B — latency (all landed):** (a) **prompt caching** — `cache_control:{type:"ephemeral"}` on `MODULE_SYSTEM` (~7k tok,
  byte-identical across module calls) via `@langchain/anthropic` in `runDeepDive` (`nodes.ts`); `runBuildJob` builds **module 1
  first** (writes the cache) THEN fans out modules 2..N which READ it. Verified locally: **`cache_read=8641` on modules 2..N**
  (`[module-cache]` log; `withStructuredOutput(..., {includeRaw:true})`). (b) **`MAX_MODULE_CONCURRENCY` 3→5** (env-overridable).
  (c) **planner Opus 4.8 → Sonnet 4.6** (`nodes.ts` `plannerLLM` — the slow overview leg; env-overridable via
  `ANTHROPIC_MODEL_SONNET`). (d) **honest progress copy** (`app.js` STAGE_TEXT + gen overlay). (e) **per-stage wall-clock
  logging** (`[timing]` in `orchestrator.ts`: profiler/retriever/planner/architect + per-module + totals).
  **MEASURED (local, working key + staging DB):** overview ~75s (profiler 6s · retriever 0.3s · **planner 22s** · **architect
  46s ← now the dominant leg**); build **307s → 5/5 = 100%** (was timing out at **3/5 after >480s** BEFORE; module 1 ~200s incl.
  a transient retry, modules 2-5 ~80-105s in one cached parallel wave). Overview is improved (~82s→~75s) but still over the
  <60s target — the bottleneck is now the **architect** skeleton call (46s), which was NOT in the approved caching scope.
  **LIVE STAGING (2026-06-27, cap raised):** a full build COMPLETED **5/5 = 100%** and **charged exactly once (25→24)** —
  durability + charge-once-on-full-success verified on the real Render host. BUT latency this run was slow (overview ~249s,
  ~160s/module, build ~13 min). **Cause = the under-resourced STAGING Render instance (Starter 512 MB), NOT rate-limiting and
  NOT a code regression** — confirmed: the org is on **Scale tier** (Sonnet 2M OTPM / 10K RPM; the build uses ~4% of OTPM), and
  the 2026-06-25 "🐢 STAGING PERF" note already documents staging module-builds crawling (~1 module / ~7 min) vs **prod
  (Standard 2 GB) doing the whole build in 3.5–6 min**, with "NOT a code/stack problem." The CPU-heavy local ONNX embedder +
  concurrent 16k streams crawl on 512 MB. **Real numbers = local 307s / prod 3.5–6 min.** To get a representative staging
  latency, bump the staging service to Standard (2 GB); longer-term, move RAG embeddings to a hosted API (the one fragile
  CPU-heavy piece). The optimization is sound; it's masked on the small staging box.
  **NO changes to the gate/credit logic, the 7 Blueprint gates, or the overview→build HITL flow.** Changed files (all in
  `bda97ee`): `src/server.ts` · `src/agent/orchestrator.ts` · `src/agent/nodes.ts` · `src/lib/jobs.ts` · `src/render/runtime.ts`
  · `public/app.js`. **PROMOTE TO PROD (after the staging cap resets + a clean 5/5 staging re-QA):** `git checkout origin/staging
  -- src/server.ts src/agent/orchestrator.ts src/agent/nodes.ts src/lib/jobs.ts src/render/runtime.ts public/app.js` into
  `main`. **No DB migration.** ⚠️ `agent/orchestrator.ts` is now shared with the visuals item (#3 above) — promote the current
  file (it contains both). Prod has the SAME Render gateway-timeout exposure, so this should land with/before the other three.
  **⚠️ OPEN — staging Anthropic spend cap:** the staging `ANTHROPIC_API_KEY` hit its specified usage limit during verification
  (`400: regain access 2026-07-01 00:00 UTC`), so a clean 5/5 build on the Render host couldn't be captured. Builds degrade
  gracefully (partial, not charged) meanwhile. Raise the key's limit or re-QA after 2026-07-01. (This is the HANDOFF's
  long-noted "USER-side: Anthropic spend cap".)
- **🩹 Prod-UAT Batch 1 fixes — ON STAGING, AWAITING REVIEW BEFORE PROD (2026-06-26; commit `3ad0e1e`).** Seven UAT items,
  each verified locally (Playwright + curl). **B2** SPA history fallback: a catch-all (`app.get(/.*/)` registered LAST in
  `server.ts`) serves `index.html` for non-API/non-asset GETs so `/pricing /library /community /builder /llm-skills` survive
  refresh/deep-link/share; `routeFromUrl()` (app.js) maps those paths to their tab (NO URL-push — by decision). **B6** load
  401 race: `loadDashboard()` returns early until the Supabase token is attached (`applySession` re-runs it) → 0 boot 401s.
  **B5** stale "Building… X%": `loadDashboard` is now SERVER-AUTHORITATIVE (a completed build absent from `/api/jobs/active`
  can't show a stale badge from a dead local poller); the `X%` itself was reading-progress (working as designed). **B8**
  Library/Community knowledge checks now grade for REAL: `/api/check` resolves the prebuilt/community Blueprint **by slug**
  (`{slug,source}`), and the artifact runtime sends the slug for `/api/lesson/*` + `/api/community/lesson/*` pages (was
  `!ARTIFACT_ID` → "Saved (grading needs the live app)"). **B9** (i) popover: `closePopover()` on vertical module nav +
  a visible `×`. **B4** mobile header (375px): CSS-only — the 9-tab bar becomes a horizontal-scroll strip + reflow (no
  overlap/overflow); also fixed a Home feature-row grid overflow (`minmax(0,1fr)` + `min-width:0`). **Download mid-build:**
  `/api/artifact/:id/full` serves best-available HTML immediately when modules are stubs (no 30s hang); a completed lesson
  downloads full. **B7 (community ♥) needed NO change** — it works; the UAT's "no network call" was the per-browser like
  dedupe on an already-liked lesson (verified: like fires, count 2→3). Files: `server.ts` · `render/{runtime,tokens}.ts` ·
  `public/{app.js,styles.css,home.css}`. NO DB migration. **Still pending (separate sign-off):** B3 latency (plan), B1 DNS.
  **PROMOTE TO PROD (after review):** `checkout origin/staging --` those 6 files into `main` (no migration).
- **📊 Lesson visuals ("Visualize this") — ON STAGING, AWAITING FINAL REVIEW BEFORE PROD (2026-06-26; commit `2a200fe`).**
  A small **"Visualize this"** CTA on a lesson module opens a ~65% popup with a curated, self-contained concept diagram
  (inline SVG; no iframe/external fetch). Additive: a deterministic retrieval post-step + one OPTIONAL `module.visual
  {title,svg}` schema field + a CTA/popup in the renderer — the lesson-gen model output, the 7 gates, and the credit flow
  are UNCHANGED. **Diagram source = `~/Documents/KB - Visuals/custom-html-v5` (129; the high-quality REPLACEMENT for the
  earlier low-quality v3/v4 set — swapped 2026-06-26, commit `2402f53`).** v5 is a pure DATA swap: same `visual_id` /
  `kb_identifier_keys` / `keywords` per concept (so retrieval + schema + renderer are untouched), only the SVG bytes +
  shared CSS changed (now `assets/diagram.css`). **Migration `0018_lesson_visuals.sql` (pgvector 384d + HNSW,
  RLS-on/no-policies) is APPLIED to the STAGING DB**, and the v5 set is ingested (129 rows, all embedded) + backfilled
  (library: 96/100 lessons, 132 visuals) on STAGING. Files: `src/lib/visuals.ts` (retrieveVisual: keyword/identifier match →
  embedding fallback @0.84, symmetric embedPassages; env-tuneable `VISUAL_SIM_THRESHOLD`/`VISUAL_KEYWORD_MIN`),
  `scripts/ingest-visuals.ts` (FOLDERS=`[custom-html-v5]`; reads `assets/diagram.css` per folder; extract `<svg>` + INLINE
  CSS SCOPED under `.viz-svg` so page rules can't leak), `scripts/backfill-visuals.ts` (no regen — re-renders from blueprint;
  now CLEARS a module's stale visual before re-attaching → idempotent across diagram swaps),
  `src/render/{schema,components,tokens,runtime}.ts`, `src/agent/orchestrator.ts` (auto-attach per module on new builds;
  try/catch never fails a build). Verified locally + on the STAGING onrender host (Playwright desktop+mobile): CTA → 65%
  popup with the new clean v5 diagram, ✕/Esc/backdrop close, NO CSS leak, correct concept per unchanged identifiers, 0
  console errors, tsc clean. **TO RE-SWAP a future diagram set:** drop it in a folder, point `FOLDERS` at it, then per env:
  `delete from lesson_visuals;` → `ingest-visuals.ts` → `backfill-visuals.ts`. **MINOR (pre-existing, non-visible):** the
  standalone artifact at 375px reports a ~117px phantom scroll while the viz modal is open (the modal/diagram render fine;
  the artifact is normally iframed) — modal CSS unchanged by the swap; left as-is.
  **PROD: NOT YET — the visuals feature isn't on `main`/prod** (no `0018`, no visuals code on `main`). When the feature is
  promoted: `checkout origin/staging --` the ~11 paths into `main`, then `DATABASE_URL="$PROD_URL" npm run migrate &&
  DATABASE_URL="$PROD_URL" npx tsx scripts/ingest-visuals.ts && DATABASE_URL="$PROD_URL" npx tsx scripts/backfill-visuals.ts`
  (already v5 from the start — no separate prod swap needed).
- **🧩 LLM Skills tab — ON STAGING, AWAITING FINAL REVIEW BEFORE PROD (2026-06-26; commits `e4be14c` + `da61062`).** A new
  top-nav **"LLM Skills"** dropdown (mirrors the Trainer dropdown) with two items: **Build a Skill** and **My Skills**.
  *Build a Skill* turns a free-text brief (LLM interface · task · data sources · access method + 4 optional fields, NO
  dropdowns) + optional file/repo references into an installable **Agent Skill** (`SKILL.md` + scripts), shown IN-TAB as a
  3-module + Sources result (syntax-highlighted preview · per-file download · Download-all .zip). Grounded by the **"Agent
  Skills" KB category** (`retrieve()` gained an additive `category` filter); generates ungrounded (logged) if the KB is
  absent. *My Skills* lists each user's saved skills like My Lessons (open / delete). **FREE in v1**, **Sonnet**
  (`makeLLM("sonnet").withStructuredOutput(SkillPackageSchema)` — model emits STRUCTURED JSON only, app renders escaped).
  Files: `src/lib/skillgen.ts` (schema + detached job + SKILL.md sanitize + persist), `src/rag/retrieve.ts` (category
  filter), `src/server.ts` (`/api/skill/generate` · `/api/skill/job/:id` · `/api/skills` · `/api/skill/saved/:id`),
  `public/skills.js` + `skills.css` (own files; avoid app.js/styles.css contention), `public/index.html` (nav + tab).
  **Migration `0017_generated_skills.sql` is APPLIED to the STAGING DB** (generated_skills, RLS-on/no-policies). Verified
  locally (Playwright desktop): tab/form (no dropdowns, blue band) · upload chip · generate→result · rail switching ·
  SKILL.md frontmatter (kebab `name` + "Use when…" desc) · per-file + zip download · grounded sources · My Skills
  save/list/open/delete · 0 console errors · tsc clean. **PROMOTE TO PROD (after review):** `checkout origin/staging --`
  the 7 paths into `main`, then `DATABASE_URL="$PROD_URL" npm run migrate` to apply `0017` to the PROD DB.
- **🖼️ Catalog thumbnails moved PixelBin CDN → Supabase Storage (2026-06-26, ON STAGING AND PROD; promote `d5cb676`).** The
  Library/Community card covers (`.lib-cover` background `--cov-img`) no longer use `cdn.pixelbin.io`. They now load from each
  environment's OWN **Supabase Storage public bucket `lesson-thumbs`** (CDN-backed, edge-cached) — 10 optimized webp images
  (~5–10KB each), one per category (`agents/rag/llms/frameworks/generative/evaluation/infrastructure/safety/foundations/build`).
  `app.js` `setThumbBase(cfg.supabaseUrl)` (called in `bootAuth` after `/api/config`) builds
  `<supabaseUrl>/storage/v1/object/public/lesson-thumbs/<key>.webp`, so staging + prod each serve from their own project; cards
  fall back to the flat category colour if Supabase is unavailable. **Bucket setup is CONTENT, not a migration** (object bytes
  can't live in SQL): the `lesson-thumbs` bucket (`public=true`) + the 10 webp were created on BOTH Supabase projects. To
  re-create/refresh (e.g. new categories): the `.env` has NO service-role key, so upload as a signed-in user — (1) SQL on the
  target DB: `insert into storage.buckets (id,name,public) values ('lesson-thumbs','lesson-thumbs',true) on conflict (id) do
  update set public=true;` + a TEMP scoped policy `create policy tmp_thumb_upload on storage.objects for all to authenticated
  using (bucket_id='lesson-thumbs' and auth.uid()='<qa-user-id>'::uuid) with check (…same…);` (2) `POST
  <supabaseUrl>/storage/v1/object/lesson-thumbs/<k>.webp` with a fresh QA-user `Bearer` JWT + `Content-Type: image/webp` +
  `x-upsert: true`; (3) `drop policy tmp_thumb_upload on storage.objects;`. QA users: staging `pojidov934@divahd.com`, prod
  `grz1q@web-library.net` (secrets file). NOTE: NO new persisted secret was added; PixelBin can be retired for thumbnails.
- **🏷️ Credit balance unit "lessons" → "credits" (2026-06-26, ON STAGING AND PROD; promote `44af30e`).** Pure terminology: the
  user-facing BALANCE now reads "credits", not "lessons". Changed 3 displays — the nav credit pill (`#credit-count` span in
  `public/index.html`: `&nbsp;Lessons` → `&nbsp;Credits`, + tooltip "Your credits — click to buy more"), the Account "Credits
  remaining" value (`app.js` `set("acct-credits", … credit…)`), and the pricing balance note (`app.js` `loadCredits`: "You have
  X credits"). The pricing page already explains **1 credit = 1 lesson**, so the conversion is clear. UNCHANGED on purpose: the
  **My Lessons** tab name, the Library/Community "lessons", and the "1 credit = 1 generated lesson" pricing copy. No behaviour /
  DB change (the credit ledger + `/api/credits`/`/api/account` already return a numeric `balance`; the unit was always a
  client-side label). Verified: pill renders "5 Credits".
  schema, the 7 gates, or the credit flow. On an ELIGIBLE lesson a `⚡ Get Hands on · Beta` button (after the Concept/Functional/
  Code toggles) opens a new tab (`/hands-on?lesson=…&module=…`) with a JupyterLab page that runs Python ENTIRELY in the browser
  via Pyodide (the server NEVER runs generated code). FREE (no credit spend). Notebooks are generated LAZILY on click and
  CACHED per (lesson, module).
  - **v2 enhancements (owner-requested, 2026-06-26):** (1) every CODE cell carries a `heading` + `explain` (what it does + what
    output to expect), rendered ABOVE the editor; (2) a SECOND Haiku agent verifies/fixes the code (up to 2 passes) so it runs
    error-free + prints output — re-validated for safety, graceful fallback; (3) the button shows a `Beta` tag; (4) code cells
    render as a JupyterLab notebook via CodeMirror 5 (Python syntax colours, `In[n]:`/`Out[n]:` prompts); (5) the gen prompt
    forces every cell to PRINT illustrative output that demonstrates the concept (agent steps, retrieval results, metrics…);
    (6) the notebook spans 80% of the screen width. `SCHEMA_VERSION` bumped to `v2` (invalidated the old cache).
  - **DEPLOY STATE:** code pushed to `staging`; migration `0015` (table `hands_on_notebooks`) **applied to the STAGING Supabase
    only** (`npm run migrate`; durable DB cache verified — survives a server restart). **PROD (`main`) has neither.** Promote to
    prod on owner approval: cherry-pick the Hands-On commits → `main`, then `DATABASE_URL="$PROD_URL" npm run migrate` BEFORE the
    prod deploy (the lib degrades gracefully if the table is missing — in-memory cache only — but the durable cache needs it).
  - **New files:** `src/render/eligibility.ts` (`handsOnEligible(bp, module?)` — deterministic $0 blocker-regex gate, shared by
    renderer + server); `src/lib/handson.ts` (NotebookSchema, server-side code-cell VALIDATION + 1 stricter retry [covers a
    parse-throw OR validation fail] + safe fallback, Haiku gen, DB+memory cache, `resolveBlueprint` [user lessons / Library
    slug / Community slug], in-memory job registry); `public/hands-on.html` (auth via /api/config + getSession; %-progress;
    cells; Pyodide v0.26.4 from CDN, lazy numpy/pandas; Run + Shift+Enter; matches the app's Plus-Jakarta/blue look + mobile);
    `supabase/migrations/0015_handson.sql` (`hands_on_notebooks` cache table, RLS-on/no-policies like 0013/0014, idempotent).
  - **Additive touch-points (Hands-On only):** `components.ts` (gated launch button after `contentToggles`, vertical + horizontal
    headers); `tokens.ts` (`.handson-btn` CSS); `runtime.ts` (`.handson-btn` click → postMessage `als-handson` to parent +
    standalone `window.open` fallback; `HANDSON_LESSON` URL matcher for artifact/lesson/community); `app.js` (`als-handson`
    listener → opens the tab); `server.ts` (`POST /api/hands-on/start` + `GET /api/hands-on/job/:id`, both requireAuth +
    heavyLimiter; `GET /hands-on` page route).
  - **DB / migration NOT applied (per owner guardrail "DO NOT run the migration on any cloud DB until I approve"):** the lib
    degrades gracefully — if `hands_on_notebooks` is missing the DB cache is skipped and an in-process MEMORY cache serves
    repeats (so "second click = instant" works locally without the table). Apply `0015` to **staging** (not prod) on approval to
    make the cache durable: `npm run migrate`.
  - **Verified locally (:5070, tsc clean, Playwright):** button shows on eligible lessons (the-agent-loop, tokenization,
    chunking, rag-eval, llm-as-judge) and is ABSENT on ineligible ones (fine-tuning, rlhf, gpus, deploy/vllm, openai-sdk);
    `/start` returns a cache hit instantly, else a jobId; live Haiku gen produced valid 3–5-cell notebooks (the-agent-loop,
    tokenization, llm-as-judge, chunking — all `source:"live"`, no fallback after the retry fix); 422 on an ineligible lesson,
    404 unknown, 401 unauth; the page renders cells, Pyodide kernel goes ready, Run ▶ AND Shift+Enter execute Python in-browser
    and print output (tokenizer demo printed tokens + count); ineligible → "Not available here" notice; button-click opens the
    correct new tab; mobile (375px) reflows with no overflow. 0 console errors (only an expected 422 network log + favicon 404).
  - **✅ Phase 2 — SELF-GROWING KB (2026-06-26, ON STAGING AND PROD; migration `0016` on BOTH DBs).** Instead of a hand-curated
    template library, the KB is LEARNED from generations: in `src/lib/handson.ts`, every generated notebook's topic text
    (`embedTextFor` = topic + module title + summary) is embedded (bge-small/384d via `src/rag/embed` `embedPassages` —
    SYMMETRIC, NOT the query prefix) and stored on the row; before generating, `searchKB` cosine-matches the nearest prior
    notebook (hnsw index) and REUSES it when `sim >= KB_SIM_THRESHOLD` (0.86) → `source:'retrieved'`, $0, no model call, and it
    re-stores under the new key+embedding so the KB grows around the topic. Fallbacks store no embedding (never reused);
    pre-`0016` rows have NULL embedding (exact-cache only). Migration `0016_handson_kb.sql` = `embed_text` + `embedding(384)` +
    `hands_on_notebooks_embedding_hnsw` (cosine); additive/idempotent; graceful if the embedder/DB is down. Verified: RAG-eval
    metrics↔faithfulness (0.89) → retrieved the same notebook; embeddings/vector-search (<0.67) → fresh; exact re-request still
    instant. (Promote commit `00c2608`.) FUTURE: tune the threshold from real traffic; optional Regenerate (bypass-cache) control.
- **🩹 Lesson toolbar alignment fix (2026-06-26, ON `staging` ONLY — NOT yet on `main`/prod).** In the artifact's inner
  vertical-mode top bar (`.topbar` rendered by `components.ts renderBody` — the toolbar that sits BELOW the host "Ask more"
  viewer bar), a long lesson title in `.tb-center .brand-mini` widened the bar and pushed the Concept/Functional/Code/
  Explain-syntax toggles + progress onto extra rows (see owner screenshot of "Building a Voice-Enabled Customer Support Agent
  with LangChain & LangGraph"). **FIX:** removed the `.tb-center`/`.brand-mini` title element entirely (one-line delete in
  `components.ts`); the lesson title still shows in the HOST viewer bar (`#viewer-title`), so nothing is lost. Now `.tb-left`
  (← Overview) + `.tb-right` (toggles + progress) split the bar and the toolbar stays on ONE row regardless of title length.
  Artifacts RE-RENDER from the stored blueprint, so existing lessons pick it up too. Verified locally (:5070): `tsc --noEmit`
  clean, 0 console errors, all toolbar buttons at the same top offset in BOTH the overview and workbench views.
  **STATUS: pushed to `staging` (origin/staging) — NOT promoted to `main`/prod.** Promote with the usual staging→prod pattern
  once the owner verifies on the staging site.
  - **NOTE — reverted UI restyle:** a separate UI-restyle exploration (Source Sans 3 font + Coursera-style nav/builder/
    my-lessons/trainer redesign across `index.html`/`styles.css`/`app.js`/`tokens.ts`/`runtime.ts`/`index.ts`) was built then
    **REVERTED at the owner's request** (the earlier Plus-Jakarta look is kept). The mockups stay untracked in `public/mockups/`
    (unshipped). The ONLY thing that shipped to staging is the toolbar title-removal above.
- **🩹 "Lesson still building" overview banner (2026-06-26, on `staging`→`main`/prod).** Opening a lesson mid-build (e.g. "Open"
  from My Lessons before the build finishes) landed on the overview with no signal. Added `buildBanner()` in `components.ts`
  (shown in BOTH the vertical + horizontal overview when any module `!isBuilt`; suppressed when `previewOnly`): "Just a little
  bit longer — your trainer is getting your lesson ready." Runtime `updateBuildBanner()` (`runtime.ts`) hides `#build-banner`
  once no `.navitem.building` remain. CSS `.build-banner` in `tokens.ts`. Verified locally w/ Playwright (renders for a building
  blueprint, absent when built/preview, 0 console errors). Re-renders from stored blueprint → applies to existing lessons too.
- **🎨 UI REDESIGN MOCKUPS (2026-06-26, LOOK-AND-FEEL exploration — NOT wired to the app, UNTRACKED, local-only).** Owner wants a
  more professional, Coursera/Udemy-inspired look (visual only, no UX/feature change). Variation 1 (Coursera-inspired) built as
  static mockups in **`public/mockups/`** (`index/home/builder/trainer/my-lessons.html` + `mock.css`) — **Source Sans 3** (Coursera's
  font), professional blue (`--brand:#0b5cff`), catalog cards w/ gradient thumbnails + ratings, clean nav/hero/footer. View at
  `localhost:5070/mockups/index.html` or open the files (relative paths). These are NOT committed/deployed (throwaway). NEXT:
  owner to pick a direction → optionally generate 8–10 real thumbnail/hero images via the **PixelBin connector (nanoBanana)**
  (the MCP gate needs an estimate-prediction-cost confirmation first) → then apply the chosen look to the REAL app
  (`public/index.html`/`styles.css`/`home.css` + the artifact renderer) as a proper styling pass. Possible variations: a
  Udemy-style (darker, denser, purple accent) alternative if requested.
- **🩹 SYNTHESIS "Putting it together" was near-empty (2026-06-26, fix NOW ON `staging` AND `main`/prod — promote `94ff2c7`).** A lesson's
  final Synthesis pane showed only the lone capstone line ("Try it: Apply what you learned to <topic>") — confirmed by data:
  the stored blueprint had `recap`/`buildOrder`/`checklist` all EMPTY (the generic capstone is `coerceSkeleton`'s default,
  `nodes.ts:368`). ROOT CAUSE: the **overview-prose pass (`writeOverviewProse`, `nodes.ts:716`) that fills synthesis during
  the build had failed/produced nothing** for that lesson (errors are caught → `return null` → build completes anyway leaving
  synthesis empty). NOTE: the earlier subagent's "`needSynthesis` is false because buildOrder:[] exists" theory was WRONG —
  `[] && 0` is falsy so `needSynthesis` is already true; the real cause is the LLM pass silently failing. **FIX (renderer-side,
  high-leverage):** `synthesisInner` in `components.ts` now, when synthesis is fully empty, calls new `derivedSynthesis(bp)` to
  build a "throughline" recap (each module's `title` + `summary`) + a "Decisions this lesson raised" checklist (modules'
  `decisionItForces`). Deterministic, $0, and — because artifacts RE-RENDER from the stored blueprint on every view — it fixes
  **every existing thin-synthesis lesson instantly, no regeneration**. (`.synth-lead`/`.recap-list` CSS in tokens.ts.) Verified
  against the real prod lesson "GraphQL as a Data-Fetching Layer for Agents" → 5-item recap + checklist render. (Secondary: the
  generation reliability of `writeOverviewProse` could be hardened with a retry/deterministic-fill, but the renderer fallback
  makes a thin synthesis undisplayable, so not urgent.)
- **✅ COMPLIANCE (India legal pages + complaint/grievance/consent system) — NOW ON `staging` AND `main`/prod (2026-06-26, prod
  promote `31a258e`; migration `0014` applied to BOTH DBs).** Pages live at `/{security,privacy,terms,report-issue,complaint,
  grievance}`. Individual-operator (Anand Pareek, NOT a company; GST/registered-office = N/A) legal pages + a general
  complaint/grievance/data-rights intake. Contact address shows "available on request — findkailash@gmail.com" (swap in a real
  postal address when available). The "not legal advice" disclaimer was removed (owner getting own legal review). STILL: set
  Resend env on Render for live complaint emails (optional — complaints save to `support_requests` regardless); lawyer review
  before payments. **Migration is `0014_compliance_support.sql`** (the spec said 0013, but 0013 is
  credits_billing) — `support_requests` + `consent_events`, RLS-on/no-policies (like 0008/0013), indexed; applied to
  **STAGING only** (`npm run migrate`) — **PROD NEEDS IT before the prod deploy** (`DATABASE_URL="$PROD_URL" npm run migrate`).
  - **Pages** (static, served at pretty URLs via `PAGE_ROUTES` in `server.ts`; NOT nav tabs — linked only from the home
    footer): `public/{security,privacy,terms,report-issue}.html` + shared `public/policy.css`. Routes: `/security` `/privacy`
    `/terms` `/report-issue` (+ `/complaint` `/grievance` → report-issue). "Last updated: 25 June 2026" + the not-legal-advice
    disclaimer on each. `TODO_CONTACT_ADDRESS` placeholder left in Terms (user fills). Forbidden words (company/Pvt Ltd/LLP/
    directors/corporate entity) verified absent; "incorporated"/"registered office" only in the N/A-negation + future-entity uses.
  - **Backend**: `src/lib/support.ts` (saveSupportRequest/saveConsent, **sha256-HASHED ip**, CONSENT_VERSION='2026-06-25',
    SUPPORT_CATEGORIES) · `src/lib/email.ts` (Resend via REST — no SDK dep; **graceful-optional**: complaint is ALWAYS stored
    in DB, email is best-effort + logs payload when `RESEND_API_KEY` unset, so nothing is dropped) · `POST /api/support/complaint`
    (Zod, **5/hr/IP** `supportLimiter`, 503 only if the DB save itself fails) · `POST /api/consent`. `.env.example` adds
    `RESEND_API_KEY`/`SUPPORT_FROM_EMAIL`/`SUPPORT_TO_EMAIL=findkailash@gmail.com` (all optional).
  - **Frontend**: home footer gains Security/Privacy/Terms/Report links (`#tab-home .foot-legal`); the auth PAGE signup mode
    gains a REQUIRED, never-pre-ticked "I agree to the Terms and acknowledge the Privacy Notice" checkbox (`#auth-consent`) →
    `logSignupConsent()` → `/api/consent`. (Existing `/api/community/report` flow untouched.)
  - **Verified locally (:5070):** tsc clean; all 6 routes 200; complaint valid→200+id / missing-consent→400 / bad-category→400;
    consent→200; rows in DB with `ip_hash` 64-char (hashed, not raw); email logs payload (no key); no new nav tabs; footer links
    render; consent checkbox shows only in signup + not pre-checked; browser form submit → success + reference id. Test rows cleaned.
  - **CHECKLIST.md** updated (legal pages PARTIAL/lawyer-review-TODO; complaint+consent DONE; company/GST = N/A for individual beta).
  - **TO RESUME / FINISH (next session):** (1) fill `TODO_CONTACT_ADDRESS` in `terms.html`; (2) run migration `0014` on the
    PROD DB (`PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-); DATABASE_URL="$PROD_URL" npm run migrate`) BEFORE any
    prod promotion (else `/api/support/complaint` 503s on prod); (3) then promote staging→prod (cherry-pick / `checkout
    origin/staging -- public src supabase` pattern); (4) optional: set `RESEND_API_KEY`/`SUPPORT_FROM_EMAIL` on Render for
    real complaint emails (without it, complaints still save to `support_requests`); (5) lawyer review before taking payments/scaling.
  - The "not legal advice" disclaimer was **REMOVED from all 4 pages per the owner's decision** (2026-06-26) — owner will get
    the pages legally reviewed themselves. (`.policy-disclaimer` CSS left in place but unused.)
- **✅ GOOGLE OAUTH ENABLED (2026-06-26) — on BOTH Supabase projects, verified working.** Enabled `external_google`
  on prod (`kdgtlbnlyscdldogxorb`) + staging (`ydgiysthvxhlfpzxyrmy`) via the Supabase **Management API**
  (`PATCH /v1/projects/{ref}/config/auth`, token was user-supplied, NOT persisted). Client ID
  `531095044572-693tek38p9v87qrsat8d4spglck1ppc6.apps.googleusercontent.com` (secret lives only in Supabase).
  Verified end-to-end: GoTrue `/auth/v1/settings` → `google:true` on both; the live prod auth page shows the
  "Continue with Google" button; and Supabase's `/auth/v1/authorize?provider=google` → Google **accepts** the
  redirect (`…supabase.co/auth/v1/callback` is in the Google client's Authorized redirect URIs — no mismatch).
  **APPLE = deferred** (needs the paid Apple Developer account + Services ID/.p8/JWT secret; button stays hidden
  until enabled — no code change needed then; the frontend gates buttons on GoTrue's enabled-providers list).
  - **🩹 SITE-URL FIX (2026-06-26):** after Google sign-in users were bounced to `http://localhost:3000/#access_token=…`
    (ERR_CONNECTION_REFUSED) — the projects still had Supabase's DEFAULT `site_url=http://localhost:3000` and an EMPTY
    `uri_allow_list`, so the OAuth redirect fell back to that dead default. Fixed via Management API `PATCH …/config/auth`:
    **staging** `site_url=https://agentic-learning-studio-1.onrender.com`, allow-list = staging + `localhost:5070`;
    **prod** `site_url=https://prathibhax.com`, allow-list = prathibhax.com + www + `agentic-learning-studio.onrender.com` +
    `localhost:5070` (all with `/**`). Not a custom-domain issue. (`oauthSignIn` sends `redirectTo=origin+"/"`; the client's
    default `detectSessionInUrl` picks up the `#access_token` on return — no code change needed.)
- **✅ ALL "BATCH 2 + SEO + OAuth-gating" WORK IS NOW ON STAGING AND PROD.** `origin/main 9292cb0` == `origin/staging
  d40544c` for `public/`+`src/` (byte-identical; verified `git diff`). Only un-promoted file = `scripts/qa.mjs`
  (a 6-line test-harness tweak, non-runtime). Prod = `agentic-learning-studio.onrender.com`, staging = `…-1.onrender.com`.
- **🆕 BATCH 2 — 3 bugs + 3 improvements (2026-06-26, on `staging` AND `main`/prod — promoted `9292cb0`):**
  - **Bug 1 — dark-mode blue text.** Artifact dark mode (`[data-theme="dark"]` in `tokens.ts`) never overrode `--accent`/
    `--accent-2`, so accent TEXT stayed dark-blue (low contrast). Fix: lift `--accent-2`→`#9db8ff` in the dark block +
    light overrides (`#7aa2ff`) for the `--accent` TEXT selectors (`a`,`.eyebrow`,`.deeper-toggle`,`.hx-see`,`.ov-covers li::before`).
    `--accent` itself stays saturated so filled chips/buttons keep readable white text. (App shell has no dark mode — artifact only.)
  - **Bug 2 — code syntax highlighting (VS Code Dark+).** `components.ts` now has a self-contained, language-agnostic
    single-pass tokenizer `highlightCode()` (no CDN/JS — the artifact is sandboxed); `codeBlock` wraps tokens in
    `<span class="tk-*">` (every token esc()'d → Copy still yields verbatim source). Token CSS in `tokens.ts`
    (`pre.code .tk-c/.tk-s/.tk-k/.tk-n/.tk-f/.tk-t`). Verified: keyword #569cd6, string #ce9178, number #b5cea8, fn #dcdcaa.
  - **Bug 3 — reading a lesson bounced to Overview when a WIP module finished.** Cause: `pollJob` (app.js) `reloadViewer()`s
    the iframe on each new `builtModules`, and the fresh render defaulted to overview. Fix = preserve position: runtime tracks
    `curMod` (set in `showPane`/`enterWorkbench`/`showOverview`), reports it in the `als-progress` postMessage; host stores
    `currentViewModule` + appends `?module=` in `reloadViewer`; `/api/artifact/:id` reads `?module=` → `renderArtifact`
    `opts.currentModuleId` → lesson-config → runtime restores that module on init instead of the overview. (Couldn't repro the
    live build-reload locally w/o spending a credit, but runtime JS is valid — 0 console errors — and the chain is wired end-to-end.)
  - **Imp 1 — Sign in/up is now a dedicated full PAGE** (`#tab-auth`, 50/50 split: product story left, form right) with
    **Google + Apple OAuth** (`sb.auth.signInWithOAuth`) + email/password. The modal (`#auth-overlay`) was removed; `openAuth()`
    now `switchTab("auth")` so every gated-action call site is unchanged; `closeAuth()` returns to Home. ⚠️ **OAuth needs the
    providers ENABLED in Supabase** (Auth→Providers) for staging AND prod projects — Google needs an OAuth client; Apple needs
    an Apple Developer Service ID + key. Until enabled, the buttons show a provider-not-enabled error (email/password works).
  - **Imp 2 — nav polish.** Credit pill is now borderless (no box, matches the nav) with a **graduation-cap** icon (was a star).
    The community share popup + name input were already enlarged in Batch 1 (`.share-card`/`.share-name`).
  - **Imp 3 —** configurator hero "What do you want to understand?" → **"What do you want to learn?"**.
  - **SEO refined with REAL DataforSEO data (done; on `staging` AND prod).** Creds now in `~/.claude/secrets/als-qa-creds` (working).
    US monthly volumes (KD): **what is agentic ai 33,100** · agentic ai (broad) 110,000/KD56 · agentic ai definition/define 14,800 ·
    **agentic ai vs generative ai 4,400/KD11** · **agentic ai course 3,600/KD9** · **agentic ai examples 1,600/KD10** ·
    **agentic ai frameworks 1,000/KD7** · how to build ai agents 1,600 · **ai learning platform 1,000/LOW-comp** · agentic ai
    certification 1,300 · **"interactive ai learning" only 10/mo** (was over-weighted in Batch-1 — now removed). Applied on the
    landing: title/meta/OG/Twitter now lead with "AI learning platform" + "agentic AI course"; kw-chips swapped to
    "Agentic AI course"/"AI learning platform"; hero sub reworded; **2 new FAQ Q&As + matching FAQPage schema** ("What is agentic
    AI?" → the 33k cluster; "How is agentic AI different from generative AI?" → 4,400/KD11) for the big informational + GEO win;
    SoftwareApplication gained a `keywords` field + platform-worded description. Verified: 1 H1, valid JSON-LD (7 FAQ Qs, all
    visible-matched), title 61 chars. **Winnable next targets (low KD): agentic-ai-vs-generative-ai, agentic-ai-examples,
    agentic-ai-frameworks, agentic-ai-course** — candidates for dedicated content pages later.
  - **Verified locally:** `tsc --noEmit` clean; `node --check public/app.js` OK; Playwright — auth page (50/50 + Google/Apple),
    dark-mode accent text light, code = VS Code Dark+, pill borderless, hero text. **Not run:** `npm run qa` (creds in
    `~/.claude/secrets/als-qa-creds`); the live Bug-3 build-reload (needs a paid generation).
- **🆕 3 FIXES (2026-06-26, on `staging` AND `main`/prod — cherry-picked `eef06e7`):**
  - **(1) Account = full PAGE at `/account`** (was the `#acct-overlay` MODAL). New `<section id="tab-account">` full-width
    panel (Profile card: name·email·Account ID(UUID)·plan·credits-remaining + Top-up; Usage card: 3 stat tiles
    lessons-generated·credits-spent·credits-purchased + member-since). `app.js`: `account` in `TAB_PANELS`; `openAccount()`
    → `gotoAccount()` does `switchTab('account')` + `history.pushState('/account')` + `loadAccount()`; `popstate` +
    `routeFromUrl()` (called from `applySession`) deep-link/refresh handling; `switchTab` resets URL→`/` when leaving account
    and never persists `account` to `als-toptab`. Server: **`GET /api/account`** (auth) → `getAccountSummary()` in
    `credits.ts` (credit_ledger spent/purchased + lessons count + getBalance + member-since); **`app.get('/account')` SPA
    fallback** serves index.html (none existed → a direct hit/refresh would 404). The old modal markup/CSS/handlers removed.
  - **(2) Community Share reward = 1 FREE LESSON** (was a 30%-off discount code). `community.ts shareLesson`:
    `addCredits(userId,1,{reason:'grant',planId:'community-share',lsOrderId:'share:<lessonId>'})` — idempotent per shared
    lesson + per-user `SHARE_REWARD_CAP=20`; returns `rewarded`. Discount-code minting + `discountCode()` removed (the
    `discount_codes` table is now unused but left in place; no migration needed). Server share route returns `rewarded`.
    UI: every "Share & save 30%" / "Community Share — 30% off" → "Community Share — 1 Free Lesson"; share-modal popup +
    name input ENLARGED (`.share-card`/`.share-name`); success popup repurposed to "1 free lesson added!" (`#code-sub`,
    dynamic on `rewarded`); `loadCredits()` refreshes the pill after a rewarded share. (`code-box`/`code-hint`/`code-copy` removed.)
  - **(3) Landing SEO** (via `seo-pro` skill; NOTE: the DataforSEO creds the task pointed at DON'T exist —
    `SEO Codex final/.../methodology.json` says "No live DataForSEO credential"; used Google Suggest for keyword grounding).
    Collapsed **2 H1s → 1** (home hero H1 kept, keyword-forward "Learn agentic AI…"; configurator `#hero-title` demoted to
    `<h2 class="hero-title">`, CSS selector broadened so it looks identical). New `<title>`/meta + canonical
    (`https://prathibhax.com/`) + robots meta + OG/Twitter + **JSON-LD `@graph`** (Organization·WebSite·SoftwareApplication·
    FAQPage mirroring the 5 visible Q&As). New **`public/robots.txt` + `public/sitemap.xml`** (served statically; sitemap
    Disallows `/api/`+`/account`). Hero copy enriched for "agentic-AI lessons / interactive AI learning".
  - **Verified:** `tsc --noEmit` clean; local :5070 — 1 `<h1>`, valid JSON-LD (4 types), title/meta/canonical present,
    `/robots.txt`+`/sitemap.xml`+`/account` 200, `/api/account` 401 gated; Playwright eyeball of the account page + share
    modal (0 console errors, correct layout/labels). **NOT run: `npm run qa`** (needs `QA_PASSWORD` — user has the staging
    test acct; run after the staging deploy). **Watch:** the preview tool launches `npm start` from the MAIN repo
    (`agentic-learning-studio`), not this worktree — verify the worktree server directly, not via `preview_start`.
- **🧪 QA PASS (2026-06-25, on staging+prod `main 71cf976`):** parameterized Playwright harness `scripts/qa.mjs`
  (`npm run qa`, env `QA_BASE_URL/QA_EMAIL/QA_PASSWORD`, no committed creds) — auth, rapid nav/state, credit pill,
  generation progress, no-console-errors/no-full-reload guards. 13/13 on staging. Fixes shipped this pass:
  (1) **sign-out resets the workspace → Home** (`resetWorkspace()` in app.js — was leaving the previous user's
  lesson on screen); (2) **`als-progress` source guard** (`e.source === viewerFrame.contentWindow` — stale iframe
  can't mis-attribute progress); (3) **central credit refresh** on focus/visibilitychange; (4) **`GET /api/jobs/active`**
  (exposes `jobs.ts activeJobs()`) merged into `loadDashboard` so a build continuing after a refresh still shows
  progress in My Lessons (light self-poll when no client poller is active). OPEN: lesson-click flicker
  (module→overview) — needs a fully-built lesson to repro; AbortController on loaders (low-impact); nested-control
  click-bubble has no explicit automated assertion yet.
  - **QA TEST ACCOUNTS (throwaway temp-mail, QA-only):** STAGING = `pojidov934@divahd.com`;
    PROD = `grz1q@web-library.net`. Passwords are deliberately NOT committed here (they'd live in git history) — pass
    them via `QA_EMAIL`/`QA_PASSWORD` env to `npm run qa`. The owner holds them; they're in the session prompt that set
    up this work. (Prod password ends in `@1989`, not `#1989`.)
- **🩹 GENERATION FIX (2026-06-25, on staging+prod) — capstone.prompt.** Overviews were FAILING ("Couldn't design
  an overview") on BOTH envs: the skeleton schema requires `synthesis.capstone.prompt`, but the model sometimes
  returns a `capstone` object without it; `coerceSkeleton` (nodes.ts) only defaulted a wholly-missing capstone, so
  a present-but-promptless one failed validation → no blueprint (after ~2 architect retries ≈ the 60s "hang").
  Fix: `coerceSkeleton` now ALWAYS fills `capstone.prompt`. Verified: a skeleton that failed now validates;
  staging overview ~49s. (Watch for OTHER required-but-omitted skeleton fields surfacing similarly.)
- **🐢 STAGING PERF (2026-06-25):** the **staging Render service is under-resourced** vs prod's Standard 2GB —
  `/healthz` ~2.2s, overview ~49s, and **module builds crawl (~1 module / ~7 min)** vs prod's whole build in
  3.5–6 min. NOT a code/stack problem (Anthropic key healthy, all 3 models 200 in ~1.5s). Action: bump the staging
  tier to match prod. Also: the local embedding model (Transformers.js/onnx) crashed with a `mutex lock failed`
  under repeated use locally — the one fragile, CPU-heavy piece (candidate to harden / move to a hosted embed API).
  **Langfuse "no traces" on staging = `LANGFUSE_*` env simply not set on staging Render** (benign; prod has them).
- **💳 BILLING / LESSON CREDITS (2026-06-25) — on STAGING + PROD (code `main dcb62f2`). Awaiting prod LS env.**
  Phase-1 "money path": per-user lesson credits gate `/api/build` (HTTP 402 when balance < 1;
  1 completed build = 1 credit; overview/preview stays free; every signed-in user gets 1 free credit). Lemon
  Squeezy hosted checkout via the Lemon.js overlay + signed webhook `/api/lemonsqueezy/webhook` (raw-body route
  mounted BEFORE `express.json`, HMAC-SHA256 verify, idempotent on `ls_order_id`). Prices + store currency come
  LIVE from LS via `GET /api/pricing` (no hardcoded USD; LS localizes the final charge per country at checkout).
  - Code: `src/lib/credits.ts` (lots model: `getBalance`/`ensureFreeGrant`/`addCredits`/`spendOne`) ·
    `src/lib/lemonsqueezy.ts` (checkout, webhook verify, `fetchPricing`) · routes `/api/credits|checkout|pricing`
    + webhook in `server.ts` · spend in `runBuildJob` (orchestrator.ts, BEFORE `job.status="done"`) ·
    front-end Pricing tab + nav credit pill + profile menu (`public/{index.html,app.js,styles.css}`).
  - **Migration `0013`** (`credit_lots` w/ 12-month `expires_at` + `credit_ledger`, RLS on) applied to **staging DB
    AND prod DB** (verified). LS env set on STAGING Render (test mode, verified end-to-end). **PROD Render still
    needs the LS env** (`LEMONSQUEEZY_API_KEY/_WEBHOOK_SECRET/_STORE_ID=416599/_TRIAL_VARIANT_ID/_PAYG_VARIANT_ID`
    + `APP_URL=https://prathibhax.com`) → until set, `billingEnabled=false` on prod (gate still works on the free
    credit; buying is off). Live webhook URL MUST be the **full path** `…/api/lemonsqueezy/webhook` (a bare-domain
    URL 404s "Cannot POST /" — that was the test-mode bug) and its signing secret must match the env secret.
  - **Verified on staging (test mode):** real LS purchase credited the buyer (idempotent webhook, valid sig). The
    checkout-404 was a pasted `#` in the store id (code now digit-sanitizes all LS ids).
  - **PENDING — Phase 2 (NOT built): discount codes + admin panel.** Admin-defined promo codes (e.g. `WB30` =
    30% off the $0.99/lesson) via an **apply-code box** on Pricing, managed in an **admin panel gated to
    `anandp.pareek6@gmail.com`** (env `ADMIN_EMAILS`). Plan: new `promo_codes` table mirrored to LS native
    discounts · `POST /api/discount/validate` · admin-gated `GET/POST/DELETE /api/admin/codes` + `/api/admin/me`
    probe · an admin tab in the UI shown only to that email. Credits stay = quantity (a discount changes the
    PRICE only, never the credit count). Full spec is in the 2026-06-25 session plan.
- **📦 DEPLOY STATUS (2026-06-23, updated EOD) — what's on PROD vs PENDING:**
  - **ON PROD** (`main` `ecb78cd` → prathibhax.com + prod Supabase `kdgtlbnlyscdldogxorb`):
    - **Wizbit UI** redesign.
    - **KB-curator service** + `documents.curator_change` flag + `kb_curator_runs` run-log (migrations **0010/0011/0012 on prod DB**). Cron NOT armed (needs only the Actions secrets).
    - **`kb/` corpus + `src/rag` pipeline + `kb-build/scripts` + IP/policy docs** on main. **RAG KB DATA: prod = 88 docs / 214 chunks** (backup `kb-build/backups/prod-2026-06-23T05-59-57-353Z.sql`).
    - **Knowledge-check Tier-A retention + Objective control + "Builder" rename** — cherry-picked to main (`97935e8`/`1b7395c`).
    - **Trainer rework (2026-06-23):** multi-tab workspace (≤5) + one-row My Lessons (`b2f3c84`) · horizontal **per-module-tabs** redesign — examples-below-with-"See details" popup + per-module check tab (`9bce078`) · **2-bar chrome consolidation** — Dark on bar 2, tabs as blocks below it (`ecb78cd`). Front-end/renderer only, no DB. ⚠ horizontal is **v1**: the ≤25%-empty FILL is a generation-side tuning item still PENDING (see below).
    - **Library v4-rich lessons (DB only):** per `05d2ab0` the 78 v4-rich lessons were seeded to **staging AND prod** DBs → prod users see v4-rich content. But the prod **git** (`main`) still has the OLD lesson JSONs — see PENDING #1.
  - **PENDING (NOT fully on prod):**
    1. **Library re-enrichment GIT source** — the 98 v4-rich `prebuilt/lessons/*.json` (+ `_exemplar`/`ENHANCE_SPEC`/`ENHANCED`/`scripts/validate-lesson.ts`) are on **staging** (merged `ebf4c2d`), **NOT on `main`**. Prod DB is already v4-rich, but main's JSONs are stale → **a future re-seed of prod from main would OVERWRITE v4-rich with old**. Reconcile: promote the lesson JSONs to main so git matches the DB.
    2. **Horizontal-fill generation tuning** — tune the generation prompt so horizontal lessons paginate to ≤25% empty per tab (concept padding + example-preview length + how many tabs). The renderer frame is shipped; content density is the lever.
    3. **Arm the KB-curator cron** — set repo Actions secrets (`DATABASE_URL` + `ANTHROPIC_API_KEY`); optional `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` on prod Render.
  - **Git note:** staging and main diverged via worktree cherry-picks (KB-curator + the app features have DIFFERENT hashes but IDENTICAL content). Do NOT do a plain `staging→main` merge — **cherry-pick the real deltas** (that's how `b2f3c84`/`9bce078`/`ecb78cd` reached main).
- **KB enrichment — MLOps / LLMOps / AI-analytics + role-based course tracks (QUEUED Jun 2026 — do via a SEPARATE Codex run; another session owns the curator, do NOT touch `services/kb-curator` or curator code for this).** Additive KB content (NOT a rebuild): new docs + embeddings pushed to **staging Supabase ONLY** (`DATABASE_URL`=staging; do NOT truncate, do NOT touch prod). Method = the established Codex pattern: dedupe against the LIVE KB first (`documents.title`/`category`), then source-priority cascade (official docs → permissive OSS [MIT/Apache/BSD/CC-BY] → reputable blogs/arXiv), ORIGINAL prose only (no verbatim, ≤1 short attributed quote), `KB_IP_AUDIT.md` (🔴 dropped), Markdown+frontmatter (title/category/url/license/verdict/as_of_date), local bge-small embed via `npm run ingest`. New categories: `MLOps & production ML`, `LLMOps`, `AI analytics`, `Course`.
  - **Topics (skip any already covered):** MLOps overview + lifecycle (train→package→serve→monitor→retrain) · model packaging/containerization (Docker, runtime pinning) · serving & inference at scale (REST/gRPC, dynamic batching, latency↔throughput — cross-link existing vllm/litellm/ai_infrastructure_serving) · model+data versioning & registries (DVC/MLflow/lakeFS) · feature stores (Feast; when you don't need one) · CI/CD + Continuous Training + orchestration (Kubeflow/ZenML/Metaflow/Dagster/Airflow) · experiment tracking & reproducibility (MLflow/W&B) · production monitoring — data/concept drift, perf decay, alerting (Evidently/NannyML) · GPU/CPU config & cost (autoscaling, right-sizing, spot) · serving on K8s + when it's overkill (KServe/Seldon) · ML failure modes (silent degradation, training-serving skew, pipeline breakage, stale features; Hidden Technical Debt / Rules of ML / ML Test Score papers) · **LLMOps** (prompt/version mgmt, eval pipelines, RAG infra, token-cost/latency monitoring; cross-link langfuse/promptfoo) · **AI analytics** (NL-to-SQL, semantic layers, automated insights, forecasting, anomaly detection — dbt semantic layer/Vanna/Prophet).
  - **Course tracks (kind `Course`, original curriculum outlines: who-it's-for · prerequisites · ordered modules mapping to KB · capstone):** AI Product Manager · AI Solution Architect · AI Engineer · ML/MLOps Engineer · AI Data Analyst.
  - **Verify (staging):** retrieval smoke test on ~8 new queries; `count(*) chunks` before/after; report added-vs-skipped-as-dupe. Promote staging→prod only after user OK (same copy pattern as the library promote). The full Codex prompt + topic list lives in the chat the user has.
- **Library content enhancement (IN PROGRESS Jun 2026 — "the hook for new users"):** the 98 prebuilt
  lessons were authored on the OLD prompts and are pedagogically weak (no `mentalMap.structureType`, no
  node `orient` hooks, thin on failure-modes/verify-AI/recall). We're bringing them to the SAME bar a
  freshly-generated lesson hits. **The app Anthropic balance is EMPTY** (the pipeline route
  `rebuild-library.ts` 400s with "credit balance too low" — and that ALSO breaks live generation on
  prod until topped up). So we enhance via **agents** (a Workflow of subagents using the session model —
  ZERO app-API cost), editing each `prebuilt/lessons/<slug>.json` Blueprint in place, then `seed-library.ts`
  validates+renders+upserts. Invariant holds (agents emit Blueprint JSON, renderer makes HTML).
  - **Infra (committed-able, reusable):** `prebuilt/ENHANCE_SPEC.md` (the quality bar + 8 schema gates +
    per-lesson procedure — the agent brief), `scripts/validate-lesson.ts` (validates ONE file: Zod +
    validateBlueprint + render smoke-test; agents self-check with it), `prebuilt/_exemplar.json`
    (`the-agent-loop`, an already-enhanced lesson = the target; throwaway ref, don't seed), `prebuilt/ENHANCED.json`
    (durable progress manifest — `done[]` slugs).
  - **Workflow:** `enhance-library-batch` (run id `wf_4fcea690-47d`) — one agent per lesson, parallel,
    edit-in-place + self-validate loop. Persisted script under the session `workflows/scripts/`.
  - **Batch 1 (this session) = 20 slugs, 2 per category:** ai-vs-ml-vs-deep-learning,
    embeddings-learned-representations, prompt-engineering-foundations, tokenization-context-windows,
    what-is-rag, embeddings-vector-search, tool-use-action-boundaries, planning-and-reflection,
    crewai-role-based-agents, claude-tool-use-agent-patterns, ai-evaluation-foundations, llm-as-judge,
    image-generation-workflows, multimodal-prompting, deployment-patterns-ai-apps, model-gateways-litellm,
    hallucinations-grounding, guardrails-validators, build-document-qa-bot, build-tool-calling-chatbot.
  - **After a batch:** `npx tsx scripts/seed-library.ts` (to `.env`=STAGING; invalid files are skipped +
    logged to `prebuilt/INVALID.md`, old DB row kept) → add slugs to `prebuilt/ENHANCED.json` →
    `update prebuilt_lessons set content_version='v3-agent-2026-06' where slug = any(...)` → verify a few
    render → **promote staging→prod when the user approves** (copy `prebuilt_lessons` staging→prod, same as
    the KB copy pattern). `.env`/local repo currently point at STAGING (`ydgiysthvxhlfpzxyrmy`).
  - **STATUS (Jun 2026): ~96/98 enhanced once the Codex branch merges.**
    - Batch 1 = the 20 above, enhanced + **committed & pushed to `staging`** (`92fc18e`) + tagged
      `content_version='v3-agent-2026-06'` + in `prebuilt/ENHANCED.json done[]`. Plus the 2 prior v2.
    - **Codex batch = 76 lessons on branch `library-rich-codex`** (off staging), enhanced to the v4-rich bar,
      committed there (NOT yet merged/seeded). `git diff --name-only staging..library-rich-codex -- prebuilt/lessons`
      lists them. **Pending: review → merge to staging → seed → tag `v4-rich-2026-06`** (see the LIBRARY REVIEW
      prompt the user has). Prefer a clean **git worktree** for the merge so the uncommitted KB working-tree files
      don't ride along.
    - **2 still pending (skipped by Codex — were dirty):** `browser-computer-use-agents`, `multi-agent-orchestration`
      (currently uncommitted in the working tree — verify/finish + include them).
    - NOT promoted to prod yet (awaits user OK after staging review).
  - **⭐ RICHER BAR (v4-rich-2026-06) is now the standard** — after user feedback, `ENHANCE_SPEC.md` gained a
    "CONTENT RICHNESS" section: a concrete problem-statement anchor, a BIG fully-worked example (esp.
    beginner), real code examples, a case study, two framings per idea, substantial bodies. The hook must be
    genuinely rich, not just structurally sound. **Batch 1's 20 are at the LIGHTER v3-agent bar** (structure +
    hooks + a predict-then-reveal + failure/verify notes) — they likely want a rich top-up pass to v4-rich for
    uniform quality; user to decide after reviewing staging.
  - **RATE-LIMIT lesson (important):** a 20-wide agent fan-out tripped the SHARED model rate limit
    ("Server is temporarily limiting requests — not your usage limit"); 6 agents never started. **Throttle
    every enhancement workflow to ~3 concurrent** (loop slugs in chunks of 3, `parallel()` each chunk).
    Do NOT run multiple enhancement sessions in parallel — single-session, sequential, throttled.
  - **REMAINING: 78 lessons** (stale, NOT in `ENHANCED.json done[]`). Continue ONE session at a time at the
    v4-rich bar — see the self-contained continuation prompt the user was given (it selects the next ~12,
    enhances throttled, seeds, marks `v4-rich-2026-06`, and emits the next prompt). `scripts/validate-lesson.ts`
    + `scripts/_render-sample.ts` are the per-lesson check + eyeball tools.
- **RAG knowledge-base REBUILD (Codex, Jun 2026 — staging done, PROD PENDING):** Codex rebuilt the KB from a
  curated registry. New tooling in **`kb-build/scripts/`**: `sources.mjs` + `fetch_sources.mjs` (curated sources),
  `build_from_registry.mjs`, `audit_kb.mjs` (license/quality audit — expect docs:69, red:0, orange:0),
  `backup_kb.mjs` (dumps `chunks`+`documents` to `kb-build/backups/*.sql`), `replace_kb.mjs` (truncate+reingest;
  gated by `KB_ALLOW_DB_MUTATION=1` + `KB_STAGING_VERIFIED=1` + `KB_ENV_NAME`), `smoke_retrieve.ts` (retrieval check).
  KB content lives in **`kb/`** (10 category dirs + `kb/manifest.yaml`); provenance in **`KB_IP_AUDIT.md`** +
  **`KB_CONTENT_POLICY.md`**; `skipped.log` = excluded sources. `src/rag/{loaders,chunkers,ingest,retrieve}.ts`
  were updated for the new pipeline.
  - **STAGING KB: REPLACED from scratch (not appended) → 69 documents / 179 chunks.** Backup of the *prior* staging
    KB at `kb-build/backups/staging-2026-06-22T15-38-51-498Z.sql`. Verify: `audit_kb.mjs` + `smoke_retrieve.ts` (chunks=179).
  - **PROD KB: NOT touched** (still the older 39 docs / 380 chunks copied earlier). Migration = `backup_kb.mjs`
    on prod → `replace_kb.mjs` with the gates → `smoke_retrieve.ts` on prod. See the KB→PROD prompt the user has.
  - **Prod DB URL is in `.env` as `PROD_DATABASE_URL`** (prod ref `kdgtlbnlyscdldogxorb`, ap-southeast-2) so prod
    migrations don't have to prompt for it. Load it explicitly for the migration commands
    (`PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)` then `DATABASE_URL="$PROD_URL" …`). The app +
    all default tooling still use `DATABASE_URL` (STAGING, ref `ydgiysthvxhlfpzxyrmy`) — **NEVER point the app's
    `DATABASE_URL` at prod.**
  - **UNCOMMITTED:** all of the above (`kb/`, `kb-build/`, `KB_*.md`, `src/rag/*`, `.gitignore`) is in the working
    tree, not committed — commit it (its own commit, separate from the library lessons) so it's durable.
  - **Known gotcha:** the ingest can exit nonzero from an ONNX native-teardown crash AFTER a successful run —
    verify by DB counts + smoke retrieval, not exit code.
- **KB CURATOR — daily GitHub Actions job (Jun 2026; PUSHED TO PROD `main` commit `d58084f`; cron PENDING only the Actions secrets):**
  - **Added/modified flag (migration `0011`):** `documents.curator_change` = `'added'` (new documents row) | `'modified'`
    (existing row updated) + `documents.curator_changed_at`. Stamped by `apply.ts` around `upsertSource` (existence
    check before; UPDATE after) — `src/rag/store.ts` untouched. **0010 + 0011 applied to BOTH staging AND prod DBs.**
    (New TOPICS still go to `kb/_pending` and aren't embedded, so DB writes are normally `modified`; `added` is set if/when
    a pending topic is later embedded.)
  - **Daily run-log (migration `0012`):** `kb_curator_runs` — ONE row per non-dry run (a heartbeat so a missing day shows):
    `started_at`, `ok`, `sources_polled`, `added`/`updated`/`skipped`/`dropped`, `chunks`, `items` jsonb (the docs it brought:
    `[{outcome,path,chunks}]`), `errors`, `dry_run`. Written by `writeRunLog` (apply.ts), called every run by index.ts even
    on 0 changes. Applied to staging + prod. **Daily view:** `select started_at, ok, sources_polled, added, updated, dropped,
    chunks, items from kb_curator_runs order by started_at desc;` (the existing per-run `kb_updates` audit row is kept too).
  A SEPARATE additive service (no web-app runtime code touched) that keeps the KB fresh automatically. Path
  **`services/kb-curator/`** (`index.ts` orchestrator + `detect`/`fetch`/`ipgate`/`synthesize`/`apply`/`report` +
  `types.ts` + `sources.yaml`). Run: **`npm run kb:curate -- [--since 24h] [--dry-run] [--only <id>]`**.
  - **What it does:** scans a FIXED license-vetted allowlist (`sources.yaml`, ~28 sources: github/rss/arxiv/sitemap)
    for ONLY last-24h changes (time-gated + content-hash vs `kb_sources.last_hash`), fetches (plain fetch →
    Playwright lazy → Firecrawl behind `KB_FETCHER=firecrawl`), IP/license-gates (`ipgate.ts`: MIT/Apache/BSD/CC-BY/
    official-docs allow; 🔴 non-permissive → DROPPED, never embedded, logged to `KB_IP_AUDIT.md`), synthesizes
    IP-clean notes (deterministic template; OPTIONAL Claude `ANTHROPIC_MODEL_HAIKU` when funded, token-capped),
    embeds LOCALLY (reuses `src/rag/embed` bge-small/384 + `src/rag/store` `upsertSource` — same `documents`/`chunks`/
    `kb_updates` schema), and upserts to `process.env.DATABASE_URL`. NEW topics → `kb/_pending/` (NOT auto-embedded).
  - **State table:** migration **`0010_kb_sources.sql`** (per-source `last_checked`/`last_hash`; RLS on). Applied to staging.
  - **Schedule:** `.github/workflows/kb-curate.yml` — cron `30 15 * * *` (15:30 UTC = **9 PM IST**) + `workflow_dispatch`;
    ubuntu/node20/`npm ci`; HF model cached (`actions/cache` key `hf-bge-small-v1`, `TRANSFORMERS_CACHE=.cache/huggingface`);
    **NO `NODE_EXTRA_CA_CERTS` in CI** (corp-MITM is local-only); secrets `DATABASE_URL`(→staging by default)/
    `ANTHROPIC_API_KEY`/`SLACK_WEBHOOK`?/`FIRECRAWL_API_KEY`? (`GITHUB_TOKEN` auto); concurrency guard; `timeout-minutes:30`;
    fails non-zero on any 🔴-IP item or DB error.
  - **GO-LIVE (user):** (1) set the repo **Actions secrets** (above); (2) **merge the workflow file to `main`** —
    GitHub cron ONLY fires from the default branch (first run = next 15:30 UTC; schedules auto-disable after 60d
    repo inactivity); (3) keep `DATABASE_URL`=staging until trusted, then flip to prod or add a weekly prod-promote.
  - **Verified on staging:** `tsc` clean; `0010` applied (`kb_sources`+RLS); `--dry-run --only langgraph` runs
    end-to-end writing NOTHING to the DB, correct frontmatter/license, and the IP gate drops a planted non-permissive
    fixture + exits non-zero. `package.json` adds `kb:curate` + `js-yaml`/`fast-xml-parser`/`playwright`.
- **Prebuilt diagram component library (⚠️ INCOMPLETE — IN PROGRESS, NOT COMMITTED, branch `feature/diagram-component-library`):**
  - DONE so far: `src/render/diagrams.ts` (**9 templates**: neuralNetwork · pipeline · agentLoop · graph · sequence · layeredArchitecture · **tree** (hierarchy, tidy top-down layout) · **matrix** (labelled grid/heatmap, intensity-coloured) · **barProportion** (stacked proportion bar + legend) — all data-only → static inline SVG, theme-aware, escaped, `fitText` auto-wrap+auto-shrink that prefers shrinking over mid-word breaks so labels never spill); `diagram` block in schema.ts (discriminated `template` + flexible all-optional `data`, incl. recursive `tree`, `matrix{rows,cols,cells}`, `segments[]`); wired into components.ts (`diagramBlock`) + tokens.ts (`.diagram`, `.hmodal .diagram`); prompts.ts archetype→template mapping (MODULE_SYSTEM "INTERACTIVE VISUALS & DIAGRAMS" + moduleUserPrompt) covers all 9. Verified: tsc clean, fixtures 6/6 both modes, **0 overflows across 22 stress cases** (geometry-checked live), XSS-safe, dark OK. Review gallery: `scripts/diagram-gallery.ts` → `diagram-gallery.html` (throwaway, not committed).
  - **STILL TODO before commit/push:** (1) ONE real lesson generation with Visuals ON to confirm the model actually emits the right template on-topic (USES CREDITS — user runs it); (2) optional minor GAPs still open (see below) — decide if worth it; (3) Mermaid/Kroki fallback (deliverable 5, deferred). Do NOT push until the user approves the gallery + the live generation.
  - **CONCEPT → DIAGRAM COVERAGE (grounded in the live RAG KB — 39 docs, queried Jun 2026).** What the curriculum keeps needing a picture for, mapped to a template (✓ covered) or a GAP (no clean template yet):
    - *Foundations / how LLMs work:* neural-net structure → **neuralNetwork** ✓ · transformer block stack (N× layers) → **layeredArchitecture** ✓ · tokenization (text→tokens→ids) → **pipeline** ✓ · embedding/semantic space → **interactiveScatter** ✓ · training loop (forward→loss→backward→update) → **agentLoop** ✓ · self-attention weights (token×token), confusion matrix → **matrix** ✓ · **backprop forward+backward pass → GAP (annotated bidirectional flow; pipeline + reverse edge is a stopgap)**.
    - *Generative / multimodal:* diffusion denoise steps → **pipeline** ✓ · GAN gen/discriminator, VAE enc→latent→dec → **graph/pipeline** ✓ · multimodal fusion (image+text encoders→fuse) → **graph** ✓.
    - *RAG & retrieval (reference area):* index pipeline (ingest→chunk→embed→store) + query pipeline (retrieve→augment→generate) → **pipeline** ✓ · ANN/vector search nearest-neighbours → **interactiveScatter** ✓ · Graph-RAG entity graph → **graph** ✓ · hybrid search (BM25+vector→fuse), rerank stage → **pipeline/graph** ✓ · **chunking strategies (document split) → GAP (minor)**.
    - *Agentic:* ReAct loop (thought→act→observe), tool-calling loop, browser/computer-use loop → **agentLoop** ✓ · multi-agent topology (supervisor/worker, hierarchical, network), LangGraph state graph w/ conditional edges → **graph** ✓ · MCP architecture (host↔client↔server↔tools) → **graph/layeredArchitecture** ✓ · MCP/tool request lifecycle, human-in-the-loop approval → **sequence** ✓ · durable workflow (steps/retries/checkpoints) → **graph** ✓ · agent memory read/write (working vs long-term) → **graph/sequence** ✓ · task decomposition / planning tree → **tree** ✓.
    - *Training / fine-tuning:* LoRA (frozen base + low-rank A×B adapters) → **layeredArchitecture** ✓ · fine-tune pipeline (pretrain→SFT→RLHF/DPO) → **pipeline** ✓ · RLHF loop (policy→reward model→PPO) → **agentLoop/graph** ✓.
    - *Prompting:* prompt-chaining / chain-of-thought → **pipeline** ✓ · structured output / function calling → **sequence** ✓ · context-window layout (system/user/context stacked) → **layeredArchitecture** ✓ · context-window/token budget allocation → **barProportion** ✓.
    - *Eval & observability:* eval pipeline (dataset→run→score→report), regression flow → **pipeline** ✓ · LLM-as-judge → **graph/sequence** ✓ · Langfuse request trace (ordered spans) → **sequence** ✓ · nested span/trace TREE (span hierarchy) → **tree** ✓.
    - *Infra / serving:* serving stack (gateway→router→model replicas), deployment topology → **layeredArchitecture/graph** ✓ · LLM gateway routing (LiteLLM across providers) → **graph** ✓ · request path through the stack → **sequence** ✓ · **batching/KV-cache timeline → GAP (minor, timeline/queue)**.
    - *Safety / guardrails:* guardrails pipeline (input check→LLM→output check), moderation flow → **pipeline** ✓ · NeMo rails (input/dialog/output) → **graph/pipeline** ✓ · defense-in-depth → **layeredArchitecture** ✓.
  - **GAPS NOW CLOSED (built Jun 2026):** ✅ **`tree`** (hierarchy — task decomposition, trace-span nesting, taxonomy) · ✅ **`matrix`** (labelled grid/heatmap — attention weights, confusion matrix, similarity grid) · ✅ **`barProportion`** (stacked proportion bar — context/token budget, cost split). All three in the gallery with typical/stress/edge cases.
  - **MINOR GAPS still open (optional, low priority):** backprop *bidirectional* forward+backward flow (pipeline + a reverse edge is a stopgap; could add an annotated-flow variant) · a *timeline/queue* visual (batching, KV-cache, request queue). Neither recurs often; skip unless a lesson clearly needs it.
- **Lesson CONTENT + overview quality** (DONE Jun 2026): overview is now a true concept/process map of **uniform SQUARE blocks** (`mentalMap()` in components.ts; `.map`/`.map-path`/`.map-conn` + `#overview` no-scroll in tokens.ts) — corner badge (number for ordered, icon for conceptual/comparative) with its centre ON the top-left corner; ordered maps = ONE non-wrapping row of equal squares joined by **animated arrows** (`.map-conn` spark, motion-safe); conceptual/comparative = wrapping rows of squares. Card = headline (label, 4–6 words) + description (`orient`, 10–15 words) only; deeper detail opens in the module. No-scroll holds (squares flex/clamp to fit); both reading modes + click-to-deepdive verified.
  - PROMPTS: SKELETON_SYSTEM carries the **7-questions arc** (WHAT/WHY/PIECES early → HOW mid → WHEN-IT-BREAKS late → KNOW-IT/WHAT-NEXT in synthesis; #2/#5/#6/#7 are the under-weighted ones to protect) and **scenario shaping** mirrored in PROFILER_SYSTEM (S1 one-thing→understand_mechanism deep-single-subject · S2 portfolio→compare_and_choose · S3 how-to→how_to_build/procedural · S4 build-an-app→how_to_build + buildGoal threaded, capstone=their artifact, weight failure-modes/verify-AI). MODULE_SYSTEM adds the **WHY-IT-EXISTS orientation hook** + pieces-before-steps + forward bridge. `orient` is now a 10–15 word description (was a locator).
  - Verified live: `test-structure.ts` → procedural/comparative/dependency classify right; a full build-an-app generation produced per-module orientation hooks, failure-mode blocks, verify-AI notes, spaced recall + predictThenReveal, and a buildGoal-threaded capstone.
- **Ask speed + upload-401 (DONE Jun 2026):** `/api/ask` no longer does RAG (instant follow-ups; see §5); `/api/upload` + `/api/upload-repo` are now public so signed-out learners can attach files/repos in the open Configurator (`public/app.js` file-input also calls `openAuth("signin")` on a 401, mirroring the repo handler). Verified: signed-out `curl /api/upload` → 200 + docId/chunkCount; browser signed-out attach → "1 chunk" chip with no sign-in error; signed-out Generate still opens the sign-in modal.
  - **ENV (Render) to confirm — code is correct:** a SIGNED-IN user's gated calls still need a valid token, so `SUPABASE_URL` + `SUPABASE_ANON_KEY` on Render must be the NEW project (`kdgtlbnlyscdldogxorb`). A wrong/old value makes `verifyToken` reject the front-end token → 401 on every gated route (same env-mismatch family as the `DATABASE_URL` `%40` issue).
- **Human-in-the-loop overview gate (DONE Jun 2026):** the Configurator CTA is now "Generate Overview — Free" → builds only the overview (free, preview-only draft) and lands on Trainer with progress → on ready, shows **Generate Lesson** + **Edit overview** CTAs. Generate Lesson promotes the draft and builds all bodies, sending the user to My Lessons (the prior build flow). Edit overview reopens the Configurator feedback as a modal and regenerates the overview. See §3/§4/§5. **Decision (note for the user):** the gate operates on a SINGLE lesson — auto course-splitting was retired from the live generate flow (gating a multi-lesson course behind one overview was awkward + costly); existing course artifacts still render/open. Verified: tsc clean; runOverviewJob→draft(overview-draft, preview-only, stubs)→runBuildJob→promoted(learning-artifact, 5/5 built); /api/overview + /api/build gated (401); UI CTAs/modal wired, no console errors.
- **Library rebuilt through the live pipeline (IN PROGRESS Jun 2026):** `scripts/rebuild-library.ts` re-generates each prebuilt lesson with the CURRENT pipeline (profiler→retriever→architect→runDeepDive ALL modules→renderArtifact) and upserts fresh `{blueprint, html}` keyed by slug; inputs reconstructed from the stored row + old blueprint's learnerProfile (level from row, readingMode=vertical); slug/category/level/description/title preserved, est_minutes refreshed. SAFETY: default = DRY RUN; needs `--slug`/`--category`/`--all` (and `--all` needs `--yes`); resumable via `content_version` (skip current unless `--force`); per-lesson failure logs + CONTINUES leaving old html intact. `/api/lesson/:slug` now re-renders from the stored blueprint (migration 0005 adds content_version/rebuilt_at; `blueprint` col already existed). Run with `NODE_EXTRA_CA_CERTS=…`. **Verified:** tsc clean; migration applied; rebuilt `vector-databases-compared` (comparative, 5/5, eyeballed concept-map overview + 7-question coverage), `the-agent-loop` (procedural, 6/6); a transient module-parse failure on `build-document-qa-bot` correctly left the old html intact. **NEXT (user's cost call):** run `--category "<X>"` per category, then `--all --yes` (~100 lessons; bump `CONTENT_VERSION` if the pipeline changes again).
- **Library "course tile" cards (Jun 2026):** the Library thumbnails are image-free, CSS-only tiles (front-end only — no images/DB). Each card = a flat CATEGORY-COLORED cover (`aspect-ratio:3/4`, one swappable CSS line) with a faint inline-SVG icon watermarked top-right, the title (bold) + a 2-line clamped `description` on the cover, then a compact meta row (category pill · level · est min). Per-category palette + icon live in `CATEGORY_STYLE` (app.js) — `{bg, icon, text, svg}` for all 10 categories + a DEFAULT; covers are fixed-light tiles (dark title `--cov-text`, description blends `text↔bg`) so they read in light AND dark host. `.lib-grid` = `repeat(auto-fill, minmax(220px,1fr))`. Filter chips + search unchanged. No icon-font dependency.
- **Community Courses + sharing + progress (Jun 2026):** new **Community** tab (browse-anywhere, like the Library) — learner-shared lessons as course-tiles (reuse `CATEGORY_STYLE`) with "by &lt;name&gt;" + a like button; a **Featured = top-10-by-likes** row + free-text search. Likes are anonymous, deduped per-browser via `localStorage("als-liked")`. **My Lessons** is now one ROW per course (title · %-completed bar · Open/Download/**Community Share — 30% off**). **Sharing** (`/api/community/share`, auth): snapshots the owner's lesson into `community_lessons` (lessons expire in 30d, shares must NOT — so we COPY blueprint+html; category derived by keyword; submitter name asked in the share popup), mints a 30%-off code into `discount_codes` (functionality only — checkout redemption is a billing TODO in checklist.MD §1), shows it in a popup. **Progress is server-persisted**: the artifact iframe (unauthenticated) `postMessage`s progress to the host (`src/render/runtime.ts` setProgress), the host relays it to `POST /api/progress` (authed) → `lesson_progress` table → `% completed` in My Lessons. After **2 modules** of an OWNED lesson, the Trainer fires the share-&-save popup once (guarded by `currentLessonOwned` + `localStorage("als-shared")`). Migration **0006** = `community_lessons` + `discount_codes` + `lesson_progress`. DB-layer in `src/lib/community.ts`; tab/rows/popups in `public/app.js` + `index.html` + `styles.css`.
- **Build for Community + Community Drivers + About + smaller tabs (Jun 2026):** main nav tabs shrunk (smaller font/padding, wrap). New **About** tab (static `#tab-about` — mission/how-it-works/principles). The **Community** tab now has two sub-views (`.comm-subtab`): **Community Courses** (existing grid) + **Community Drivers** (contributor directory → click a card → in-place profile with bio/expertise/link + their published courses). New **Build for Community** tab: one-time contributor **registration** (full name · background/expertise → bio · areas they teach · why-contribute radios + other · optional profile link · originality/AI-disclosure checkbox → `contributors` table, migration **0007**), then a trimmed Configurator (title · level · description · **required** content upload · optional builder prompt) that **reuses the overview→build gate** with `referOnly:true` + empty cards; on build completion the front-end **auto-publishes** to Community crediting the contributor (`/api/community/share {contributor:true}` → no discount). Gate states in `loadBuildCommunity()` (signed-out / register / build) via `/api/contributor/me`. Drivers/profile = `/api/community/drivers` + `/community/driver/:id` (public). NOTE: contributor courses auto-publish with **no moderation** yet (report/review = TODO, see CHECKLIST). All UI eyeballed locally; auth-gated flows verified by gating + wiring (full signed-in run happens on Render). **Migration 0007 must run on prod.**
- DESIGN_SPEC.md not updated for recent phases (this HANDOFF is canonical).
- Obsolete branch `hybrid-opus-skeleton-and-proofreader` (broken Opus structured-output path + proofreader) — superseded by `main`; safe to delete.

---

## 8. What shipped (compressed history)
Durable DB-backed artifacts · per-user dashboard + ratings + preferences · Supabase auth (on-demand
modal) · sign-up profile (gap-fill, never overrides subject) · landing dropdowns (level/coverage/
examples/density/extras/lessonType/framework[code-only]/reading) · document + GitHub-repo grounding ·
background jobs + multi-lesson courses · public Library · structure-typed overview · level=scaffolding
+ code-enforced density + level×density coupling · gated knowledge checks · vertical+horizontal reading
modes · Configurator/Trainer/My-Lessons tabs · hardened `/full` download · Ask-More (crisp answer +
append-a-module) · Opus-4.8 skeleton (raw parse) · pedagogy upgrade (one spine, spaced recall,
worked→completion→solo, failure modes, verify-AI-output, contextualize via inputs).
