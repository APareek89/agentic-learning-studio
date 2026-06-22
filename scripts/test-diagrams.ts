/**
 * # Diagram-library render proof (NO credits) — renders a fixture lesson whose modules each
 * carry ONE diagram template, in BOTH vertical and horizontal modes, so the prebuilt diagram
 * components (render/diagrams.ts) can be eyeballed in a browser (theming, layout, modal).
 *
 * Run: npx tsx scripts/test-diagrams.ts
 *   → writes /tmp/als-diagrams-vertical.html + /tmp/als-diagrams-horizontal.html
 */
import { writeFileSync } from "node:fs";
import { renderArtifact } from "../src/render/index";
import type { Blueprint, Block } from "../src/render/schema";

// One module per diagram template, each with realistic agentic-AI data.
const DIAGRAMS: { id: string; title: string; orient: string; icon: string; block: Block }[] = [
  {
    id: "m_loop", title: "The agent loop", icon: "🔁", orient: "How an agent plans, acts and observes in a cycle",
    block: {
      id: "d_loop", kind: "diagram", template: "agentLoop",
      title: "The agent loop", caption: "The agent repeats plan → act → observe until the goal is met.",
      data: { steps: [
        { label: "Plan", sub: "decide next step" },
        { label: "Act", sub: "call a tool" },
        { label: "Observe", sub: "read the result" },
        { label: "Reflect", sub: "done? else loop" },
      ] },
    },
  },
  {
    id: "m_pipe", title: "The RAG pipeline", icon: "➡️", orient: "The one-pass flow from documents to a grounded answer",
    block: {
      id: "d_pipe", kind: "diagram", template: "pipeline",
      title: "RAG ingestion → answer", caption: "Documents flow left to right into a grounded generation.",
      data: { stages: [
        { label: "Ingest", sub: "load docs" },
        { label: "Chunk", sub: "split text" },
        { label: "Embed", sub: "to vectors" },
        { label: "Store", sub: "vector DB" },
        { label: "Retrieve", sub: "top-k" },
        { label: "Generate", sub: "grounded" },
      ] },
    },
  },
  {
    id: "m_graph", title: "LangGraph state graph", icon: "🕸️", orient: "Nodes and conditional edges that route the run",
    block: {
      id: "d_graph", kind: "diagram", template: "graph",
      title: "A LangGraph state graph", caption: "Solid edges always fire; the dashed edge is conditional.",
      data: {
        nodes: [
          { id: "start", label: "START", col: 0, row: 1 },
          { id: "plan", label: "Planner", col: 1, row: 1 },
          { id: "tool", label: "Tool node", col: 2, row: 0 },
          { id: "answer", label: "Responder", col: 2, row: 2 },
          { id: "end", label: "END", col: 3, row: 1 },
        ],
        edges: [
          { from: "start", to: "plan" },
          { from: "plan", to: "tool", label: "needs tool", kind: "conditional" },
          { from: "plan", to: "answer", label: "can answer", kind: "conditional" },
          { from: "tool", to: "plan", label: "result" },
          { from: "answer", to: "end" },
        ],
      },
    },
  },
  {
    id: "m_seq", title: "How Langfuse traces a run", icon: "📡", orient: "The request path captured span by span",
    block: {
      id: "d_seq", kind: "diagram", template: "sequence",
      title: "A traced request", caption: "Each arrow is a span Langfuse records in order.",
      data: {
        actors: ["User", "App", "LLM", "Langfuse"],
        messages: [
          { from: "User", to: "App", label: "ask question" },
          { from: "App", to: "Langfuse", label: "start trace" },
          { from: "App", to: "LLM", label: "prompt" },
          { from: "LLM", to: "App", label: "completion" },
          { from: "App", to: "Langfuse", label: "log span" },
          { from: "App", to: "User", label: "answer" },
        ],
      },
    },
  },
  {
    id: "m_arch", title: "A RAG app's architecture", icon: "🏛️", orient: "The tiers a production agent stacks up",
    block: {
      id: "d_arch", kind: "diagram", template: "layeredArchitecture",
      title: "System tiers", caption: "Each tier depends on the one below it.",
      data: { tiers: [
        { name: "Interface", items: ["Chat UI", "API"] },
        { name: "Orchestration", items: ["Agent loop", "Router", "Tools"] },
        { name: "Models", items: ["LLM", "Embeddings"] },
        { name: "Data", items: ["Vector DB", "Doc store", "Cache"] },
      ] },
    },
  },
  {
    id: "m_net", title: "A neural network", icon: "🧠", orient: "The fully-connected layers behind an embedding model",
    block: {
      id: "d_net", kind: "diagram", template: "neuralNetwork",
      title: "A small feed-forward net", caption: "Every node in one layer connects to every node in the next.",
      data: { layers: [3, 5, 5, 2], labels: ["Input", "Hidden", "Hidden", "Output"] },
    },
  },
];

function makeBlueprint(readingMode: "vertical" | "horizontal"): Blueprint {
  return {
    schemaVersion: "1.0",
    meta: { topic: "Agentic AI diagrams", title: "Picturing Agentic AI", thesis: "Some ideas only click as a picture — here are the six the curriculum keeps needing.", estTotalMinutes: 14 },
    learnerProfile: {
      level: "beginner", depth: "conceptual_technical", examples: "functional", topic: "Agentic AI",
      inferred: false, expandAcronymsOnFirstUse: true, showTermPopovers: true, density: "medium",
      visualsRequested: true, explainSyntax: false, readingMode,
      lessonTypes: readingMode === "horizontal" ? ["content", "knowledge_check"] : ["content"],
    },
    mentalMap: {
      title: "Six shapes worth a diagram", oneLineThesis: "Pick the picture that matches the idea's shape.", structureType: "conceptual",
      nodes: DIAGRAMS.map((d, i) => ({ id: `n${i}`, label: d.title, icon: d.icon, orient: d.orient, moduleId: d.id })),
      edges: [],
    },
    modules: DIAGRAMS.map((d, i) => ({
      id: d.id, order: i + 1, title: d.title, icon: d.icon, sub: "A shape prose can't convey",
      summary: `A worked picture of ${d.title.toLowerCase()}.`,
      objectives: [`Recognise ${d.title.toLowerCase()} at a glance`],
      termIds: [], loadState: "full" as const, citations: [],
      blocks: [
        { id: `${d.id}-c`, kind: "conceptual" as const, title: "Why a picture here", analogy: "A map beats a paragraph when you need to see how parts connect.", body: [{ t: "p" as const, spans: [{ text: `This idea is easier to grasp as a diagram than as prose, so the lesson shows one.` }] }] },
        d.block,
        ...(readingMode === "horizontal"
          ? [{ id: `${d.id}-kc`, kind: "knowledgeCheck" as const, title: `Check: ${d.title}`, questions: [
              { id: `${d.id}-q1`, kind: "mcq" as const, prompt: `Is "${d.title}" best shown as a diagram?`, options: [{ text: "Yes", correct: true }, { text: "No" }], explanation: "Its shape is hard to convey in prose alone." },
            ] } as Block]
          : []),
      ],
    })),
    glossary: {},
    synthesis: {
      recap: [{ t: "p", spans: [{ text: "Match the idea's SHAPE to a template: loop→agentLoop, flow→pipeline, topology→graph, trace→sequence, stack→layeredArchitecture, net→neuralNetwork." }] }],
      buildOrder: DIAGRAMS.map((d, i) => ({ step: i + 1, label: d.title })),
      checklist: [{ id: "c1", label: "Does the idea have a shape prose can't convey?" }],
      capstone: { prompt: "For your next lesson, pick the one concept that needs a diagram and name its template." },
    },
    citations: {},
  };
}

const v = renderArtifact(makeBlueprint("vertical"));
const h = renderArtifact(makeBlueprint("horizontal"));
writeFileSync("/tmp/als-diagrams-vertical.html", v);
writeFileSync("/tmp/als-diagrams-horizontal.html", h);

const templates = DIAGRAMS.map((d) => d.block.kind === "diagram" ? d.block.template : "?");
const svgCount = (s: string) => (s.match(/class="dgm-svg"/g) || []).length;
console.log("vertical:", v.length, "bytes · diagrams rendered:", svgCount(v), "/", DIAGRAMS.length);
console.log("horizontal:", h.length, "bytes · diagrams rendered:", svgCount(h), "/", DIAGRAMS.length);
console.log("templates:", templates.join(", "));
console.log("no raw empty-state leaked:", !v.includes("Diagram unavailable") && !h.includes("Diagram unavailable"));
console.log("files: /tmp/als-diagrams-vertical.html  /tmp/als-diagrams-horizontal.html");
