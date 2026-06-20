/**
 * # Reading-mode render proof (NO credits) — renders a fixture Blueprint in BOTH
 * vertical and horizontal modes so the layout/runtime can be eyeballed in a browser.
 *
 * Run: npx tsx scripts/test-horizontal.ts  → writes /tmp/als-vertical.html + /tmp/als-horizontal.html
 */
import { writeFileSync } from "node:fs";
import { renderArtifact } from "../src/render/index";
import type { Blueprint } from "../src/render/schema";

function makeBlueprint(readingMode: "vertical" | "horizontal"): Blueprint {
  return {
    schemaVersion: "1.0",
    meta: { topic: "Retrieval-Augmented Generation", title: "How RAG Works", thesis: "Ground an LLM in your own documents so answers are accurate and current.", estTotalMinutes: 12 },
    learnerProfile: {
      level: "beginner", depth: "conceptual_technical", examples: "functional_code", topic: "RAG",
      inferred: false, expandAcronymsOnFirstUse: true, showTermPopovers: true, density: "medium",
      visualsRequested: false, explainSyntax: false, readingMode,
      lessonTypes: readingMode === "horizontal" ? ["content", "knowledge_check"] : ["content"],
    },
    mentalMap: {
      title: "The RAG pipeline at a glance", oneLineThesis: "Retrieve, then generate.", structureType: "procedural",
      entryNodeId: "n1",
      nodes: [
        { id: "n1", label: "Chunk & embed", order: 1, icon: "✂️", orient: "Turn documents into searchable vectors", moduleId: "m1", emphasis: "spine" },
        { id: "n2", label: "Retrieve", order: 2, icon: "🔎", orient: "Find the most relevant chunks", moduleId: "m2", emphasis: "spine" },
        { id: "n3", label: "Generate", order: 3, icon: "🧠", orient: "Answer grounded in those chunks", moduleId: "m3", emphasis: "spine" },
      ],
      edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
    },
    modules: [
      mod("m1", 1, "Chunk & embed", "Split documents into pieces and turn each into a vector.", "kc1"),
      mod("m2", 2, "Retrieve", "Use the query vector to find the nearest chunks.", "kc2"),
      mod("m3", 3, "Generate", "Feed the retrieved chunks to the model as context.", "kc3"),
    ],
    glossary: {
      embedding: { id: "embedding", label: "embedding", laymanDefinition: "A list of numbers that captures the meaning of a piece of text." },
      chunk: { id: "chunk", label: "chunk", laymanDefinition: "A small slice of a document, sized to retrieve and feed to the model." },
    },
    synthesis: {
      recap: [{ t: "p", spans: [{ text: "RAG = retrieve relevant chunks, then generate an answer grounded in them." }] }],
      buildOrder: [{ step: 1, label: "Ingest & chunk" }, { step: 2, label: "Embed & index" }, { step: 3, label: "Retrieve & generate" }],
      checklist: [{ id: "c1", label: "Pick a chunk size" }, { id: "c2", label: "Choose an embedding model" }],
      capstone: { prompt: "Build a RAG bot over your team's docs." },
    },
    citations: {},
  };
}

function mod(id: string, order: number, title: string, summary: string, kcId: string) {
  return {
    id, order, title, summary, icon: "📦", sub: "A pipeline stage",
    objectives: [`Explain what ${title.toLowerCase()} does`, "Apply it in a small example"],
    termIds: ["embedding", "chunk"], loadState: "full" as const, citations: [],
    blocks: [
      { id: `${id}-c`, kind: "conceptual" as const, title: "What happens here", analogy: "Like a librarian filing books by topic so they're easy to find later.", body: [{ t: "p" as const, spans: [{ text: "This stage turns raw text into something the system can search. We work with " }, { text: "chunks", term: "chunk" }, { text: " and their " }, { text: "embeddings", term: "embedding" }, { text: "." }] }] },
      { id: `${id}-f`, kind: "functionalExample" as const, title: "Real-world example", body: [{ t: "p" as const, spans: [{ text: "Imagine a support bot indexing 500 help articles before it can answer a single ticket." }] }] },
      { id: `${id}-code`, kind: "codeExample" as const, title: "Code example", language: "python", code: "chunks = split(doc, size=500)\nvectors = embed(chunks)\nindex.add(vectors)" },
      { id: kcId, kind: "knowledgeCheck" as const, title: `Check: ${title}`, questions: [
        { id: `${kcId}-q1`, kind: "mcq" as const, prompt: `What is the main job of "${title}"?`, options: [{ text: "Make text searchable", correct: true }, { text: "Train the model" }], explanation: "It prepares/uses chunks so the right context can be found." },
        { id: `${kcId}-q2`, kind: "freeText" as const, prompt: "In one sentence, why does this stage matter?", acceptableAnswer: "It lets the system find or use the right context.", explanation: "Grounding depends on getting the relevant chunks." },
      ] },
    ],
  };
}

const v = renderArtifact(makeBlueprint("vertical"));
const h = renderArtifact(makeBlueprint("horizontal"));
writeFileSync("/tmp/als-vertical.html", v);
writeFileSync("/tmp/als-horizontal.html", h);
console.log("vertical:", v.length, "bytes →", v.includes('data-reading="vertical"') ? "data-reading ok" : "MISSING reading attr");
console.log("horizontal:", h.length, "bytes →", h.includes('data-reading="horizontal"') ? "data-reading ok" : "MISSING reading attr");
console.log("horizontal has h-track:", h.includes('class="h-track"'), "| final check page:", h.includes('data-panel="_check"'));
console.log("vertical has NO h-track:", !v.includes('class="h-track"'), "| vertical workbench:", v.includes('id="workbench"'));
