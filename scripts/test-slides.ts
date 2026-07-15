/**
 * # Slides view + fast-overview brief render proof (NO credits) — renders:
 *   1. a FULL lesson (from the prebuilt exemplar Blueprint) → the "▶ Slides" toggle + stage
 *   2. a FAST-OVERVIEW draft (fixture brief) rendered previewOnly → the bullets-only preview
 *
 * Run: npx tsx scripts/test-slides.ts
 *   → writes /tmp/als-slides-lesson.html + /tmp/als-brief-preview.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderArtifact } from "../src/render/index";
import { BlueprintSchema, type Blueprint } from "../src/render/schema";

// ---- 1. full lesson: the repo's prebuilt exemplar (real generated content) ----
// The exemplar predates the current diagram block schema — drop blocks that no longer
// validate (the app renders stored blueprints leniently; the fixture just needs content).
const raw = JSON.parse(readFileSync(new URL("../prebuilt/_exemplar.json", import.meta.url), "utf8"));
for (const m of raw.modules ?? []) m.blocks = (m.blocks ?? []).filter((b: { kind?: string; nodes?: unknown }) => !(b.kind === "diagram" && !Array.isArray(b.nodes)));
const lesson = BlueprintSchema.parse(raw) as Blueprint;
lesson.learnerProfile.readingMode = "vertical";
writeFileSync("/tmp/als-slides-lesson.html", renderArtifact(lesson));
console.log("wrote /tmp/als-slides-lesson.html —", lesson.modules.length, "modules,", lesson.modules.reduce((n, m) => n + m.blocks.length, 0), "blocks");

// ---- 2. fast-overview draft: a minimal brief blueprint, exactly as coverageBrief builds it ----
const draft: Blueprint = BlueprintSchema.parse({
  schemaVersion: "1.0",
  meta: { topic: "Retrieval-Augmented Generation", title: "RAG for E-commerce Search Teams", thesis: "Ground an LLM in your own product docs so answers are accurate." },
  learnerProfile: {
    level: "beginner", depth: "conceptual_technical", examples: "functional_code", topic: "RAG",
    industry: "e-commerce", inferred: false, expandAcronymsOnFirstUse: true, showTermPopovers: true,
    density: "medium", visualsRequested: false, explainSyntax: false, readingMode: "vertical", lessonTypes: ["content"],
  },
  mentalMap: {
    title: "RAG — the map", oneLineThesis: "Retrieve, then generate.", structureType: "conceptual",
    nodes: [1, 2, 3, 4, 5].map((i) => ({ id: `n${i}`, label: `Section ${i}`, moduleId: `m${i}` })),
    edges: [], willCover: ["What RAG is", "Chunking & embeddings", "Retrieval quality", "Grounded generation"],
  },
  modules: [
    { id: "m1", order: 1, title: "Why plain LLMs fail on your catalog", summary: "Hallucinations, stale data, and why retrieval fixes both.", objectives: [], termIds: [], citations: [], blocks: [], loadState: "stub" },
    { id: "m2", order: 2, title: "Chunking & embedding your documents", summary: "Turning product docs into searchable vectors.", objectives: [], termIds: [], citations: [], blocks: [], loadState: "stub" },
    { id: "m3", order: 3, title: "Retrieval: finding the right context", summary: "Vector search, hybrid search, and top-k tuning.", objectives: [], termIds: [], citations: [], blocks: [], loadState: "stub" },
    { id: "m4", order: 4, title: "Grounded generation & citations", summary: "Feeding chunks to the model and citing sources.", objectives: [], termIds: [], citations: [], blocks: [], loadState: "stub" },
    { id: "m5", order: 5, title: "Evaluating your RAG pipeline", summary: "Faithfulness, relevance, and where pipelines break.", objectives: [], termIds: [], citations: [], blocks: [], loadState: "stub" },
  ],
  glossary: {}, citations: {},
  synthesis: { buildOrder: [], checklist: [], capstone: { prompt: "Apply what you learned to your product search." } },
  brief: {
    framing: "This lesson shows you how Retrieval-Augmented Generation grounds an LLM in your own product catalog — so search answers are accurate, current, and cited.",
    concepts: [
      { label: "What RAG is and why it beats fine-tuning here", why: "Choose the right tool before you build" },
      { label: "Chunking strategies for product docs", why: "Bad chunks are the #1 cause of bad answers" },
      { label: "Embeddings & vector search", why: "How 'similar meaning' becomes findable" },
      { label: "Hybrid retrieval & top-k tuning", why: "The dials that control answer quality" },
      { label: "Grounded generation with citations", why: "Answers your team can trust and verify" },
    ],
    examples: [
      "A product-spec Q&A bot over your catalog PDFs",
      "Handling a 'compare these two SKUs' query end-to-end",
      "Debugging a retrieval miss with real telemetry",
    ],
    outcomes: [
      "Design a RAG pipeline for your catalog from scratch",
      "Tune chunking and top-k to cut hallucinations",
      "Evaluate faithfulness before shipping",
    ],
  },
});
writeFileSync("/tmp/als-brief-preview.html", renderArtifact(draft, { previewOnly: true }));
console.log("wrote /tmp/als-brief-preview.html — brief preview (previewOnly)");
