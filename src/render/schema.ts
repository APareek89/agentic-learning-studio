/**
 * # The Blueprint schema — the single contract between the model and the renderer
 *
 * The whole robustness story of this app rests here. The agents produce a
 * **Blueprint** (this typed JSON shape) and NOTHING ELSE — never HTML, never
 * JavaScript. A separate, hand-written, deterministic renderer turns a valid
 * Blueprint into the interactive learning page. So the (i) popovers, mental map,
 * quizzes, decision matrices, and 27 learner variants always work, because a
 * tested template owns them — not a hopeful one-shot generation.
 *
 * We use Zod (a runtime schema library): the same definition both (a) constrains
 * what Claude may return via `.withStructuredOutput(...)` and (b) lets us VALIDATE
 * and fail closed before rendering, via `validateBlueprint()` at the bottom.
 *
 * Recurring terms (defined once):
 *   - "schema": a written description of the exact shape data must have.
 *   - "Zod": the library; `z.object`, `z.array`, `z.enum`, `z.discriminatedUnion`
 *     are its building blocks. `.optional()` marks a field allowed to be missing.
 *   - "discriminated union": a set of object shapes told apart by one shared field
 *     (here `kind`), so the renderer can switch on `kind` safely.
 *   - "term id": a short key into the `glossary` — each one drives an (i) popover.
 *   - "citation id": a short key into the `citations` registry (provenance).
 */

import { z } from "zod";

// ----------------------------------------------------------------------------
// 1. The three learner axes (their Cartesian product is the 27 combinations).
// ----------------------------------------------------------------------------
export const LevelSchema = z.enum(["beginner", "intermediate", "advanced"]);
export const DepthSchema = z.enum(["conceptual", "technical", "conceptual_technical"]);
export const ExamplesSchema = z.enum(["functional", "code", "functional_code"]);

/** The learner profile — carries the 27-combo selection + personalization. */
export const LearnerProfileSchema = z.object({
  level: LevelSchema,
  depth: DepthSchema,
  examples: ExamplesSchema,
  topic: z.string(),
  industry: z.string().optional(),
  buildGoal: z.string().optional(),
  /** the learner's PURPOSE for the lesson (landing "Objective" control). Curates emphasis,
   *  not subject: learning = concepts/mental-models; learn_and_apply = worked application;
   *  build = how-to + code toward an artifact; exam_prep = breadth + recall + definitions;
   *  interview_prep = tradeoffs + talking points; other = neutral. */
  objective: z.enum(["learning", "learn_and_apply", "build", "exam_prep", "interview_prep", "other"]).optional(),
  /** the learner's role + the role they aspire to (from sign-up) — personalize tone/depth. */
  role: z.string().optional(),
  aspiringRole: z.string().optional(),
  /** code-example framework when examples include code: e.g. "LangGraph", "Claude Agent SDK",
   *  or "Framework-agnostic" (pseudocode/plain). Drives the codeExample blocks. */
  framework: z.string().optional(),
  /** when the learner picked multiple levels, the full set (e.g. ["beginner","advanced"]);
   *  `level` above is the base (least-advanced) used for the 27-combo gating. */
  levels: z.array(LevelSchema).optional(),
  /** what to include — "content" and/or "knowledge_check" (the landing "Lesson Type"). */
  lessonTypes: z.array(z.enum(["content", "knowledge_check"])).optional(),
  /** true when no starter cards were chosen and the Profiler inferred the axes. */
  inferred: z.boolean().default(false),
  /** beginner/intermediate ⇒ true ⇒ validation HARD-fails on unexpanded acronyms. */
  expandAcronymsOnFirstUse: z.boolean(),
  showTermPopovers: z.boolean(),
  /** how verbose the lesson should be (landing "Text" control). low = sharp/direct;
   *  medium = balanced; high = thorough. Shapes the Architect's prose, not the renderer. */
  density: z.enum(["low", "medium", "high"]).default("medium"),
  /** when true (landing "Visuals & demos"), the Architect MUST add interactive visual
   *  blocks for genuinely-complex concepts. */
  visualsRequested: z.boolean().default(false),
  /** when true (landing "Explain syntax"), every codeExample carries a syntax[] breakdown
   *  that the in-lesson "Explain syntax" toggle reveals. */
  explainSyntax: z.boolean().default(false),
  /** how the rendered lesson behaves (landing "Reading" preference):
   *  - "vertical"   = the classic scrolling overview→workbench lesson (DEFAULT, unchanged)
   *  - "horizontal" = a fixed-viewport paged deck: swipe page-to-page with a Next button,
   *    heavy blocks open in a modal, and the last page is a knowledge check.
   *  Drives the renderer (components/tokens/runtime); does not change lesson CONTENT. */
  readingMode: z.enum(["vertical", "horizontal"]).default("vertical"),
});

// ----------------------------------------------------------------------------
// 2. Rich text — typed prose so the model NEVER emits raw HTML. The renderer
//    turns these nodes into markup; a `Span` may carry a `term` id (→ (i) popover).
// ----------------------------------------------------------------------------
export const SpanSchema = z.object({
  text: z.string(),
  /** reference to a glossary term id — the renderer wraps it as an (i) button. */
  term: z.string().optional(),
  em: z.boolean().optional(),
  strong: z.boolean().optional(),
  code: z.boolean().optional(),
});

/** One rich-text node. Flat (no deep nesting) to keep authoring + validation simple. */
export const RichNodeSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("p"), spans: z.array(SpanSchema) }),
  z.object({ t: z.literal("h"), level: z.union([z.literal(3), z.literal(4)]), spans: z.array(SpanSchema) }),
  z.object({ t: z.literal("ul"), items: z.array(z.array(SpanSchema)) }),
  z.object({ t: z.literal("ol"), items: z.array(z.array(SpanSchema)) }),
  z.object({
    t: z.literal("callout"),
    tone: z.enum(["info", "good", "warn", "danger"]).optional(),
    spans: z.array(SpanSchema),
  }),
]);
export const RichTextSchema = z.array(RichNodeSchema);

// ----------------------------------------------------------------------------
// 3. Glossary term — first-class so EVERY core term reliably gets an (i) popover.
// ----------------------------------------------------------------------------
export const TermSchema = z.object({
  id: z.string(),
  label: z.string(),
  aliases: z.array(z.string()).optional(),
  /** REQUIRED for ALL-CAPS acronyms when expandAcronymsOnFirstUse is on (gate 2). */
  acronymExpansion: z.string().optional(),
  laymanDefinition: z.string(),
  /** shown only when the learner's depth includes "technical". */
  technicalNote: z.string().optional(),
  /** cap noisy short terms; default "firstOnly", "all" for beginner. */
  wrapPolicy: z.enum(["firstOnly", "all"]).optional(),
  sources: z.array(z.string()).optional(),
});

// ----------------------------------------------------------------------------
// 4. Mental map — ALWAYS rendered first (advance organizer). Declarative graph;
//    the renderer does the layout. Nodes with a moduleId become clickable.
// ----------------------------------------------------------------------------
export const MapNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  sub: z.string().optional(),
  /** position in an ordered structure (1..N). Set for procedural/dependency maps;
   *  omit for conceptual/comparative. The overview shows it as the step number. */
  order: z.number().optional(),
  /** ONE short orientation line for the OVERVIEW (where this sits / what it's for) —
   *  NOT an explanation. The advance-organizer layer; detail lives behind the card. */
  orient: z.string().optional(),
  /** one sentence: WHAT this building block is (plain language). DETAIL layer —
   *  rendered inside the module, not on the overview map. */
  what: z.string().optional(),
  /** one sentence: how this block fits the learner's goal/context — why it matters HERE. */
  relevance: z.string().optional(),
  /** an everyday-analogy explanation (the "doorman" style) shown to beginner/intermediate
   *  learners so the overview reads in plain language, not jargon. */
  laymanExplanation: z.string().optional(),
  /** an emoji/icon hint for the node (renderer falls back to a default). */
  icon: z.string().optional(),
  moduleId: z.string().optional(),
  layer: z.string().optional(),
  emphasis: z.enum(["spine", "normal"]).optional(),
});
export const MapEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
});
export const MentalMapSchema = z.object({
  title: z.string(),
  caption: z.string().optional(),
  oneLineThesis: z.string(),
  /** The TRUE shape of the topic — drives how the overview is laid out:
   *  - "procedural": an ordered build/how-to path (steps 1..N with dependencies)
   *  - "dependency": a layered system ordered by what must be understood first
   *  - "conceptual": a relationship map (no forced order) — components / cause→effect / part-of
   *  - "comparative": options weighed along shared dimensions (not a path) */
  structureType: z.enum(["procedural", "dependency", "conceptual", "comparative"]).optional(),
  /** for ordered types: the single unambiguous starting node id (the "start here"). */
  entryNodeId: z.string().optional(),
  nodes: z.array(MapNodeSchema).min(1),
  edges: z.array(MapEdgeSchema),
  /** Overview "This lesson will cover" — up to 4 short learner-facing bullets (key concepts,
   *  the how-to, a worked example, when to use). Shown below the map; renderer falls back to
   *  module titles when absent. */
  willCover: z.array(z.string()).optional(),
});

// ----------------------------------------------------------------------------
// 5. Blocks — the closed component vocabulary. `visibleWhen` gates a block to
//    certain learner combos; absent = always visible (the "core" tier that
//    guarantees every combo shows SOMETHING — gate 7).
// ----------------------------------------------------------------------------
export const VisibleWhenSchema = z
  .object({
    level: z.array(LevelSchema).optional(),
    depth: z.array(DepthSchema).optional(),
    examples: z.array(ExamplesSchema).optional(),
  })
  .optional();

// Fields shared by every block variant.
const blockBase = {
  id: z.string(),
  visibleWhen: VisibleWhenSchema,
  termIds: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  depthTier: z.enum(["core", "deeper"]).optional(),
};

// A recursive decision-tree node (z.lazy enables the self-reference).
export type TreeNode = {
  question?: string;
  outcome?: string;
  branches?: { label: string; to: TreeNode }[];
};
export const TreeNodeSchema: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    question: z.string().optional(),
    outcome: z.string().optional(),
    branches: z.array(z.object({ label: z.string(), to: TreeNodeSchema })).optional(),
  })
);

/** One option row inside a decision matrix. Cells are an ARRAY (not a dynamic-keyed
 *  record) because models produce arrays of fixed-shape objects far more reliably. */
export const MatrixOptionSchema = z.object({
  name: z.string(),
  cells: z.array(z.object({ criterion: z.string(), text: z.string(), rating: z.enum(["good", "ok", "bad"]) })),
  whenToUse: z.string(), // the mandatory "When to choose" column
  cost: z.string().optional(),
  complexity: z.string().optional(),
  tradeoffs: z.string().optional(),
  recommendedFor: z.string().optional(),
});

// knowledgeCheck — a graded mini-quiz (4–5 Qs). MCQ is checked against the stored Blueprint
// server-side; freeText is graded by the LLM (POST /api/check). S5: this same shape is reused
// as the single lesson-level `finalCheck` (one knowledge check per lesson, on bp.finalCheck).
export const KnowledgeCheckBlockSchema = z.object({
  ...blockBase,
  kind: z.literal("knowledgeCheck"),
  title: z.string().optional(),
  intro: z.string().optional(),
  questions: z
    .array(
      z.object({
        id: z.string(),
        kind: z.enum(["mcq", "freeText"]),
        prompt: z.string(),
        options: z.array(z.object({ text: z.string(), correct: z.boolean().optional() })).optional(),
        acceptableAnswer: z.string().optional(), // freeText: the model-graded reference answer
        explanation: z.string(),
        /** retention (Tier A): make the learner RECALL from memory before the options/answer
         *  appear — a textarea + "I've thought about it" gate. Recall beats recognition. */
        freeRecallFirst: z.boolean().optional(),
        /** retention (Tier A): require a 3-point confidence pick before grading, so the
         *  learner calibrates (confidently-wrong is the highest-value review signal). */
        confidence: z.boolean().optional(),
        /** concept/term ids this question exercises — for interleaving + future spaced review.
         *  Free-form (NOT validated against the glossary) so prebuilt lessons can't break. */
        conceptTags: z.array(z.string()).optional(),
        /** the module this question came from — feedback links back to "review the source". */
        sourceModuleId: z.string().optional(),
      })
    )
    .min(3),
  /** marks the end-of-lesson interleaved retrieval set (questions mixed across modules). */
  cumulative: z.boolean().optional(),
});

export const BlockSchema = z.discriminatedUnion("kind", [
  z.object({ ...blockBase, kind: z.literal("conceptual"), title: z.string().optional(), body: RichTextSchema, analogy: z.string().optional() }),
  z.object({ ...blockBase, kind: z.literal("technical"), title: z.string().optional(), body: RichTextSchema, analogy: z.string().optional() }),
  z.object({
    ...blockBase,
    kind: z.literal("functionalExample"),
    title: z.string().optional(),
    body: RichTextSchema,
    personalizedFor: z.string().optional(),
  }),
  z.object({
    ...blockBase,
    kind: z.literal("codeExample"),
    title: z.string().optional(),
    filePath: z.string().optional(),
    language: z.string(),
    code: z.string(),
    explain: RichTextSchema.optional(),
    predictThenReveal: z.object({ prompt: z.string(), answer: z.string() }).optional(),
    /** plain-language syntax breakdown, revealed by the in-lesson "Explain syntax"
     *  toggle. Each item maps a construct/term in the code to what it does. */
    syntax: z.array(z.object({ part: z.string(), explains: z.string() })).optional(),
  }),
  z.object({
    ...blockBase,
    kind: z.literal("decisionCallout"),
    useWhen: z.string(),
    avoidWhen: z.string(),
    ruleOfThumb: z.string(),
  }),
  z.object({
    ...blockBase,
    kind: z.literal("decisionMatrix"),
    title: z.string().optional(),
    criteria: z.array(z.string()).min(1),
    options: z.array(MatrixOptionSchema).min(2),
    howToRead: z.string().optional(),
  }),
  z.object({ ...blockBase, kind: z.literal("decisionTree"), title: z.string().optional(), root: TreeNodeSchema }),
  z.object({
    ...blockBase,
    kind: z.literal("diagram"),
    title: z.string().optional(),
    layout: z.enum(["stack", "flow", "tree", "grid"]),
    nodes: z.array(MapNodeSchema).min(1),
    edges: z.array(MapEdgeSchema),
  }),
  z.object({ ...blockBase, kind: z.literal("scenario"), ask: z.string(), implies: z.string(), personalizedFor: z.string().optional() }),
  z.object({
    ...blockBase,
    kind: z.literal("walkthrough"),
    title: z.string().optional(),
    steps: z.array(z.object({ label: z.string(), detail: RichTextSchema })).min(1),
  }),
  z.object({
    ...blockBase,
    kind: z.literal("taxonomy"),
    title: z.string().optional(),
    groups: z.array(z.object({ name: z.string(), items: z.array(z.string()) })).min(1),
  }),
  z.object({ ...blockBase, kind: z.literal("note"), tone: z.enum(["info", "good", "warn", "danger"]).optional(), body: RichTextSchema }),
  z.object({
    ...blockBase,
    kind: z.literal("selfCheckQuiz"),
    prompt: z.string(),
    format: z.enum(["mcq", "predictThenReveal", "freeRecall", "applyToYourBuild"]),
    options: z.array(z.object({ text: z.string(), correct: z.boolean().optional() })).optional(),
    acceptableAnswer: z.string().optional(),
    explanation: z.string(),
    applyToYourBuildPrompt: z.string().optional(),
  }),
  // ---- Interactive visual blocks (opt-in; emitted only when visualsRequested). ----
  // The model supplies DATA only; the renderer + runtime own all SVG/HTML/JS, so a
  // bad payload can never break the page (it just renders fewer points/stops).
  //
  // interactiveScatter — points placed in a 0..100 plane by MEANING; picking a query
  // highlights its nearest points. Use for similarity / clustering / embedding-space /
  // classification-boundary concepts.
  z.object({
    ...blockBase,
    kind: z.literal("interactiveScatter"),
    title: z.string().optional(),
    caption: z.string().optional(),
    points: z.array(z.object({ label: z.string(), x: z.number(), y: z.number(), group: z.string().optional() })).min(3),
    queries: z.array(z.object({ label: z.string(), x: z.number(), y: z.number() })).min(1),
  }),
  // interactiveSlider — a value the learner drags; each "stop" explains what that value
  // means. Use for thresholds / tradeoffs / a parameter's effect (temperature, chunk
  // size, similarity cutoff, etc.).
  z.object({
    ...blockBase,
    kind: z.literal("interactiveSlider"),
    title: z.string().optional(),
    caption: z.string().optional(),
    min: z.number(),
    max: z.number(),
    unit: z.string().optional(),
    stops: z.array(z.object({ at: z.number(), label: z.string(), note: z.string() })).min(2),
  }),
  // steppedFlow — a multi-stage process the learner clicks through one step at a time.
  // Use for pipelines / lifecycles (ingest→chunk→embed→store, the agent loop, a request).
  z.object({
    ...blockBase,
    kind: z.literal("steppedFlow"),
    title: z.string().optional(),
    caption: z.string().optional(),
    steps: z.array(z.object({ label: z.string(), detail: z.string(), icon: z.string().optional() })).min(2),
  }),
  // knowledgeCheck — the graded mini-quiz block (defined once above as KnowledgeCheckBlockSchema
  // so the lesson-level bp.finalCheck can reuse the exact same shape). Still allowed in-module for
  // back-compat with prebuilt lessons, though S5 generates a single lesson-level check instead.
  KnowledgeCheckBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;

// ----------------------------------------------------------------------------
// 6. Module — the unit of progressive disclosure (stub first, full on click).
// ----------------------------------------------------------------------------
export const ModuleSchema = z.object({
  id: z.string(),
  order: z.number(),
  icon: z.string().optional(),
  title: z.string(),
  sub: z.string().optional(),
  eyebrow: z.string().optional(),
  summary: z.string(),
  /** the single decision this module forces → feeds the synthesis checklist. */
  decisionItForces: z.string().optional(),
  objectives: z.array(z.string()),
  termIds: z.array(z.string()),
  estMinutes: z.number().optional(),
  loadState: z.enum(["stub", "full"]),
  blocks: z.array(BlockSchema),
  citations: z.array(z.string()),
  /** OPTIONAL curated concept diagram attached post-generation (deterministic
   *  retrieval, NOT model output). When set, the module shows a "Visualize this"
   *  CTA + popup. `svg` is self-contained inline SVG (curated; rendered as-is). */
  visual: z.object({ title: z.string(), svg: z.string() }).optional(),
});
export type Module = z.infer<typeof ModuleSchema>;

// ----------------------------------------------------------------------------
// 7. DecisionDoc (optional), Synthesis (always last), WhatsNew, Citations.
// ----------------------------------------------------------------------------
export const DecisionDocSchema = z.object({
  title: z.string().optional(),
  themes: z.array(
    z.object({
      name: z.string(),
      questions: z.array(
        z.object({
          q: z.string(),
          why: z.string().optional(),
          opts: z.array(z.string()).optional(),
          rot: z.string().optional(), // rule of thumb
          sources: z.array(z.string()).optional(),
        })
      ),
    })
  ),
});

export const SynthesisSchema = z.object({
  recap: RichTextSchema.optional(),
  referenceArchitecture: z
    .object({ title: z.string().optional(), layout: z.enum(["stack", "flow", "tree", "grid"]), nodes: z.array(MapNodeSchema), edges: z.array(MapEdgeSchema) })
    .optional(),
  buildOrder: z.array(z.object({ step: z.number(), label: z.string(), detail: z.string().optional() })),
  checklist: z.array(z.object({ id: z.string(), label: z.string(), fromModuleId: z.string().optional() })),
  capstone: z.object({ prompt: z.string(), scopedTo: z.string().optional() }),
});

export const WhatsNewItemSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  summary: z.string(),
  date: z.string().optional(),
});

export const CitationSchema = z.object({
  id: z.string(),
  kind: z.enum(["kb", "liveSearch", "canonical", "upload"]), // "upload" = the learner's own document
  title: z.string(),
  url: z.string().optional(),
  kbChunkId: z.string().optional(),
  asOfDate: z.string().optional(),
  retrievedAt: z.string().optional(),
});

export const MetaSchema = z.object({
  topic: z.string(),
  title: z.string(),
  generatedAt: z.string().optional(),
  estTotalMinutes: z.number().optional(),
  thesis: z.string().optional(),
  accent: z.string().optional(), // optional per-industry accent hex
  // Provenance (set by the graph when the learner uploaded documents) → drives the banner.
  usedUpload: z.boolean().optional(),
  referOnly: z.boolean().optional(),
  uploadTitles: z.array(z.string()).optional(),
  // For a multi-lesson COURSE (lessons 2..N): a short recap of the previous lesson,
  // rendered as a card atop the overview so each part links back to the last.
  recap: z.object({ previousTitle: z.string(), points: z.array(z.string()) }).optional(),
  // Course position (set by the orchestrator); drives the lesson-tab strip.
  course: z.object({ index: z.number(), total: z.number(), title: z.string().optional() }).optional(),
});

// ----------------------------------------------------------------------------
// 8. The top-level Blueprint.
// ----------------------------------------------------------------------------
export const BlueprintSchema = z.object({
  schemaVersion: z.literal("1.0"),
  meta: MetaSchema,
  learnerProfile: LearnerProfileSchema,
  mentalMap: MentalMapSchema,
  modules: z.array(ModuleSchema).min(1),
  glossary: z.record(z.string(), TermSchema),
  decisionDoc: DecisionDocSchema.optional(),
  synthesis: SynthesisSchema,
  whatsNew: z.array(WhatsNewItemSchema).optional(),
  citations: z.record(z.string(), CitationSchema),
  /** S5 — the SINGLE lesson-level knowledge check (4–5 Qs covering the whole lesson), written
   *  during the build by writeOverviewProse. Replaces the old per-module knowledge checks. The
   *  renderer shows it as a `_check` pane BEFORE Sources (vertical) / final page (horizontal),
   *  and POST /api/check grades it by its (stable) block id. Absent on content-only lessons. */
  finalCheck: KnowledgeCheckBlockSchema.optional(),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

// ============================================================================
// validateBlueprint — the 7 fail-closed gates (run BEFORE rendering).
// Returns { ok, errors } so the caller can retry/repair rather than ship a
// broken artifact. We first run the Zod parse (shape), then the semantic gates.
// ============================================================================

const ACRONYM_RE = /^[A-Z0-9]{2,}$/;

/** Walk all spans in a rich-text array, collecting referenced term ids. */
function termsInRichText(rt: z.infer<typeof RichTextSchema> | undefined, out: Set<string>) {
  if (!rt) return;
  for (const node of rt) {
    if (node.t === "ul" || node.t === "ol") {
      for (const item of node.items) for (const s of item) if (s.term) out.add(s.term);
    } else {
      for (const s of node.spans) if (s.term) out.add(s.term);
    }
  }
}

/** Collect every term id and citation id a module's blocks reference. */
function refsInModule(m: Module): { terms: Set<string>; citations: Set<string> } {
  const terms = new Set<string>(m.termIds);
  const citations = new Set<string>(m.citations);
  for (const b of m.blocks) {
    (b.termIds ?? []).forEach((t) => terms.add(t));
    (b.sources ?? []).forEach((c) => citations.add(c));
    // pull term refs out of any rich-text body the block carries
    if ("body" in b) termsInRichText(b.body, terms);
    if (b.kind === "codeExample") termsInRichText(b.explain, terms);
    if (b.kind === "walkthrough") for (const step of b.steps) termsInRichText(step.detail, terms);
  }
  return { terms, citations };
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** non-blocking notes (e.g. an acronym missing an expansion). */
  warnings: string[];
  /** the parsed Blueprint when shape-valid (even if a semantic gate failed). */
  blueprint?: Blueprint;
}

/**
 * `repairBlueprint` — deterministically fix the common MECHANICAL gate failures
 * (dangling term/citation refs, an unaligned matrix, a module with no core block,
 * an unwired mental map). This runs BEFORE re-prompting, so most generations pass
 * on the first try with zero extra LLM latency. Mutates and returns the Blueprint.
 */
export function repairBlueprint(bp: Blueprint): Blueprint {
  const glossaryIds = new Set(Object.keys(bp.glossary));
  const citationIds = new Set(Object.keys(bp.citations));
  const moduleIds = new Set(bp.modules.map((m) => m.id));

  // gate4: make sure at least one map node links to a real module.
  if (!bp.mentalMap.nodes.some((n) => n.moduleId && moduleIds.has(n.moduleId)) && bp.mentalMap.nodes.length && bp.modules.length) {
    bp.mentalMap.nodes[0].moduleId = bp.modules[0].id;
  }

  const fixSpans = (spans: { term?: string }[]) => {
    for (const s of spans) if (s.term && !glossaryIds.has(s.term)) delete s.term;
  };
  const fixRich = (rt: { t: string; spans?: { term?: string }[]; items?: { term?: string }[][] }[] | undefined) => {
    if (!rt) return;
    for (const n of rt) {
      if ((n.t === "ul" || n.t === "ol") && n.items) for (const it of n.items) fixSpans(it);
      else if (n.spans) fixSpans(n.spans);
    }
  };

  for (const m of bp.modules) {
    m.termIds = m.termIds.filter((t) => glossaryIds.has(t)); // gate1
    m.citations = m.citations.filter((c) => citationIds.has(c)); // gate5
    if (m.blocks.length && !m.blocks.some((b) => !b.visibleWhen)) delete (m.blocks[0] as { visibleWhen?: unknown }).visibleWhen; // gate7
    // gate3: only enforce decision-coverage on a BUILT module — a stub (blocks:[]) keeps
    // its decisionItForces (it feeds the synthesis checklist + will get a decision block
    // when its body is written by runDeepDive).
    if (m.blocks.length && m.decisionItForces && !m.blocks.some((b) => b.kind === "decisionMatrix" || b.kind === "decisionCallout" || b.kind === "decisionTree")) {
      m.decisionItForces = undefined; // gate3
    }
    for (const b of m.blocks) {
      const bb = b as { termIds?: string[]; sources?: string[]; body?: unknown; explain?: unknown; steps?: { detail: unknown }[] };
      if (bb.termIds) bb.termIds = bb.termIds.filter((t) => glossaryIds.has(t));
      if (bb.sources) bb.sources = bb.sources.filter((c) => citationIds.has(c));
      if (bb.body) fixRich(bb.body as never);
      if (b.kind === "codeExample") fixRich(b.explain as never);
      if (b.kind === "walkthrough") for (const st of b.steps) fixRich(st.detail as never);
      if (b.kind === "decisionMatrix") {
        // Drop criteria that duplicate the renderer's built-in columns (the renderer
        // always adds "When to choose", "Cost", "Complexity"), so they don't repeat.
        b.criteria = b.criteria.filter((c) => !/^(when to choose|cost|complexity)$/i.test(c.trim()));
        // gate6: every option's cells must cover the criteria (fill gaps, drop extras).
        for (const opt of b.options) {
          const have = new Set(opt.cells.map((c) => c.criterion));
          for (const c of b.criteria) if (!have.has(c)) opt.cells.push({ criterion: c, text: "—", rating: "ok" });
          opt.cells = opt.cells.filter((c) => b.criteria.includes(c.criterion));
        }
      }
    }
  }
  return bp;
}

/**
 * Validate a candidate Blueprint object. `validKbChunkIds` (optional) is the set
 * of real chunk ids retrieved for THIS generation — citation integrity checks KB
 * citations against it so hallucinated sources are caught (gate 5).
 */
export function validateBlueprint(input: unknown, validKbChunkIds?: Set<string>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ---- Shape gate (Zod) ----
  const parsed = BlueprintSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `shape: ${i.path.join(".")} — ${i.message}`), warnings };
  }
  const bp = parsed.data;
  const profile = bp.learnerProfile;

  // ---- Gate 1: term integrity — every referenced term resolves in glossary ----
  const glossaryIds = new Set(Object.keys(bp.glossary));
  for (const m of bp.modules) {
    const { terms, citations } = refsInModule(m);
    for (const t of terms) if (!glossaryIds.has(t)) errors.push(`gate1 term-integrity: module "${m.id}" references unknown term "${t}"`);
    // ---- Gate 5: citation integrity ----
    for (const c of citations) {
      const cit = bp.citations[c];
      if (!cit) errors.push(`gate5 citation-integrity: module "${m.id}" references unknown citation "${c}"`);
      else if (cit.kind === "kb" && validKbChunkIds && cit.kbChunkId && !validKbChunkIds.has(cit.kbChunkId))
        errors.push(`gate5 citation-integrity: citation "${c}" points to a chunk not in this generation's retrieved set`);
    }
    // ---- Gate 7: 27-combo soundness — each module has ≥1 always-visible block ----
    if (m.blocks.length > 0 && !m.blocks.some((b) => !b.visibleWhen)) {
      errors.push(`gate7 combo-soundness: module "${m.id}" has no always-visible (core) block — some learner combos would see it empty`);
    }
    // ---- Gate 3: decision coverage — a BUILT module that forces a decision shows one.
    // Stub modules (blocks:[]) are exempt: the decision block arrives when the body does.
    if (m.blocks.length > 0 && m.decisionItForces && !m.blocks.some((b) => b.kind === "decisionMatrix" || b.kind === "decisionCallout" || b.kind === "decisionTree")) {
      errors.push(`gate3 decision-coverage: module "${m.id}" declares decisionItForces but has no decision block`);
    }
    // ---- Gate 6: matrix alignment — option cells must match criteria ----
    for (const b of m.blocks) {
      if (b.kind === "decisionMatrix") {
        const crit = new Set(b.criteria);
        for (const opt of b.options) {
          const keys = new Set(opt.cells.map((c) => c.criterion));
          for (const k of crit) if (!keys.has(k)) errors.push(`gate6 matrix-alignment: module "${m.id}" option "${opt.name}" missing cell "${k}"`);
        }
      }
    }
  }

  // ---- Gate 2: acronym policy (SOFT — a warning, not a hard fail) ----
  // The laymanDefinition still explains the term, so a missing expansion shouldn't
  // trigger an expensive re-generation; we surface it as a warning instead.
  if (profile.expandAcronymsOnFirstUse) {
    for (const [id, term] of Object.entries(bp.glossary)) {
      if (ACRONYM_RE.test(term.label) && !term.acronymExpansion)
        warnings.push(`gate2 acronym-policy: term "${id}" ("${term.label}") has no acronymExpansion`);
    }
  }

  // ---- Gate 4: mental-map wiring — ≥1 map node points to a real module ----
  const moduleIds = new Set(bp.modules.map((m) => m.id));
  const wired = bp.mentalMap.nodes.some((n) => n.moduleId && moduleIds.has(n.moduleId));
  if (!wired) errors.push(`gate4 mentalmap-wiring: no mental-map node links to a real module`);

  return { ok: errors.length === 0, errors, warnings, blueprint: bp };
}
