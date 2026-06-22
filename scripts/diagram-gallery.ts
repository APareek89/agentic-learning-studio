/**
 * # Diagram gallery (NO credits) — renders every prebuilt diagram template with TYPICAL,
 * LONG-TEXT STRESS, and EDGE-CASE data into ONE self-contained HTML page (light/dark toggle)
 * so the templates can be reviewed + refined before they go into real lessons.
 *
 * Run: npx tsx scripts/diagram-gallery.ts  → writes ./diagram-gallery.html (+ public/_gallery.html)
 */
import { writeFileSync } from "node:fs";
import { renderDiagram, type DiagramTemplate } from "../src/render/diagrams";
import { ARTIFACT_CSS } from "../src/render/tokens";

type Case = { heading: string; note?: string; template: DiagramTemplate; data: any };

const CASES: Case[] = [
  // ---- neuralNetwork ----
  { heading: "neuralNetwork · typical", template: "neuralNetwork", data: { layers: [3, 5, 5, 2], labels: ["Input", "Hidden", "Hidden", "Output"] } },
  { heading: "neuralNetwork · long labels", template: "neuralNetwork", data: { layers: [4, 8, 8, 3], labels: ["Token embeddings", "Self-attention", "Feed-forward", "Output logits"] } },
  { heading: "neuralNetwork · edge (big layer → '+N more')", template: "neuralNetwork", data: { layers: [10, 6, 1] } },

  // ---- pipeline ----
  { heading: "pipeline · typical (RAG)", template: "pipeline", data: { stages: [{ label: "Ingest" }, { label: "Chunk" }, { label: "Embed" }, { label: "Store" }, { label: "Retrieve" }, { label: "Generate" }] } },
  { heading: "pipeline · long labels + subs", template: "pipeline", data: { stages: [
    { label: "Ingest source documents", sub: "PDFs, HTML, Markdown" },
    { label: "Recursive chunking", sub: "500 tokens · 50 overlap" },
    { label: "Embed with bge-small", sub: "384-dim vectors" },
    { label: "Upsert to vector store", sub: "Supabase pgvector" },
  ] } },
  { heading: "pipeline · short (3 stages)", template: "pipeline", data: { stages: [{ label: "Retrieve", sub: "top-k chunks" }, { label: "Augment", sub: "stuff context" }, { label: "Generate", sub: "grounded answer" }] } },

  // ---- agentLoop ----
  { heading: "agentLoop · typical", template: "agentLoop", data: { steps: [{ label: "Plan" }, { label: "Act" }, { label: "Observe" }, { label: "Reflect" }] } },
  { heading: "agentLoop · long labels + subs", template: "agentLoop", data: { steps: [
    { label: "Plan the next action", sub: "reason over state" },
    { label: "Call an external tool", sub: "API · search · code" },
    { label: "Observe the result", sub: "parse + validate" },
    { label: "Decide: done or continue", sub: "check the goal" },
  ] } },

  // ---- graph ----
  { heading: "graph · typical (LangGraph, conditional edges)", template: "graph", data: {
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
  } },
  { heading: "graph · long labels + multi-agent topology", template: "graph", data: {
    nodes: [
      { id: "sup", label: "Supervisor / router agent", col: 0, row: 1 },
      { id: "res", label: "Research worker agent", col: 1, row: 0 },
      { id: "wri", label: "Writer worker agent", col: 1, row: 2 },
      { id: "crit", label: "Quality critic", col: 2, row: 1 },
      { id: "human", label: "Human approval gate", col: 3, row: 1 },
    ],
    edges: [
      { from: "sup", to: "res", label: "needs more research", kind: "conditional" },
      { from: "sup", to: "wri", label: "ready to draft", kind: "conditional" },
      { from: "res", to: "crit" },
      { from: "wri", to: "crit" },
      { from: "crit", to: "sup", label: "revise", kind: "conditional" },
      { from: "crit", to: "human", label: "approved" },
    ],
  } },

  // ---- sequence ----
  { heading: "sequence · typical (Langfuse trace)", template: "sequence", data: {
    actors: ["User", "App", "LLM", "Langfuse"],
    messages: [
      { from: "User", to: "App", label: "ask question" },
      { from: "App", to: "Langfuse", label: "start trace" },
      { from: "App", to: "LLM", label: "prompt" },
      { from: "LLM", to: "App", label: "completion" },
      { from: "App", to: "Langfuse", label: "log span" },
      { from: "App", to: "User", label: "answer" },
    ],
  } },
  { heading: "sequence · long message labels + self-call", template: "sequence", data: {
    actors: ["Client", "RAG service", "Vector DB", "LLM"],
    messages: [
      { from: "Client", to: "RAG service", label: "request answer for user query" },
      { from: "RAG service", to: "Vector DB", label: "retrieve top-k relevant chunks" },
      { from: "Vector DB", to: "RAG service", label: "matching passages" },
      { from: "RAG service", to: "RAG service", label: "rerank" },
      { from: "RAG service", to: "LLM", label: "prompt with stuffed context" },
      { from: "LLM", to: "Client", label: "stream grounded completion" },
    ],
  } },

  // ---- layeredArchitecture ----
  { heading: "layeredArchitecture · typical", template: "layeredArchitecture", data: { tiers: [
    { name: "Interface", items: ["Chat UI", "API"] },
    { name: "Orchestration", items: ["Agent loop", "Router", "Tools"] },
    { name: "Models", items: ["LLM", "Embeddings"] },
    { name: "Data", items: ["Vector DB", "Doc store", "Cache"] },
  ] } },
  { heading: "layeredArchitecture · the LoRA case (long tier name — the reported bug)", template: "layeredArchitecture", data: { tiers: [
    { name: "Frozen Base Model Weights (unchanged)", items: ["Attention layers", "Feed-forward layers", "Embedding layer"] },
    { name: "LoRA Adapters (trained)", items: ["Matrix A (small)", "Matrix B (small)", "A × B added to frozen output"] },
    { name: "Output", items: ["Fine-tuned behavior, no base model change"] },
  ] } },
  { heading: "layeredArchitecture · many items (row wrap)", template: "layeredArchitecture", data: { tiers: [
    { name: "Interface", items: ["Web chat", "Mobile", "Slack bot", "Voice", "API", "Widget"] },
    { name: "Orchestration", items: ["Router", "Planner", "Memory", "Tool registry", "Guardrails"] },
    { name: "Data", items: ["pgvector", "Postgres", "Redis cache", "Object store"] },
  ] } },

  // ---- tree (NEW) ----
  { heading: "tree · typical (task decomposition)", template: "tree", data: { tree: {
    label: "Build a research agent", children: [
      { label: "Ingest sources", children: [{ label: "Fetch URLs" }, { label: "Parse PDFs" }] },
      { label: "Reason", children: [{ label: "Plan steps" }, { label: "Call tools" }] },
      { label: "Write report", children: [{ label: "Draft" }, { label: "Cite" }] },
    ],
  } } },
  { heading: "tree · nested trace spans + long labels", template: "tree", data: { tree: {
    label: "HTTP request /chat", sub: "1.8 s total", children: [
      { label: "retrieve context", sub: "320 ms", children: [
        { label: "embed user query", sub: "40 ms" },
        { label: "vector search top-k", sub: "120 ms" },
        { label: "rerank passages", sub: "160 ms" },
      ] },
      { label: "LLM generation call", sub: "1.4 s", children: [
        { label: "prompt assembly", sub: "20 ms" },
        { label: "stream completion tokens", sub: "1.36 s" },
      ] },
    ],
  } } },
  { heading: "tree · deep + uneven (taxonomy)", template: "tree", data: { tree: {
    label: "Agent memory", children: [
      { label: "Short-term", children: [{ label: "Scratchpad" }, { label: "Conversation buffer" }] },
      { label: "Long-term", children: [
        { label: "Episodic", children: [{ label: "Past runs" }] },
        { label: "Semantic", children: [{ label: "Vector store" }, { label: "Knowledge graph" }] },
      ] },
    ],
  } } },

  // ---- matrix (NEW) ----
  { heading: "matrix · attention weights (0–1)", template: "matrix", data: { matrix: {
    rows: ["The", "cat", "sat", "on", "mat"],
    cols: ["The", "cat", "sat", "on", "mat"],
    cells: [
      [0.7, 0.1, 0.05, 0.1, 0.05],
      [0.2, 0.6, 0.1, 0.05, 0.05],
      [0.1, 0.3, 0.4, 0.1, 0.1],
      [0.05, 0.1, 0.2, 0.5, 0.15],
      [0.05, 0.4, 0.1, 0.15, 0.3],
    ],
  } } },
  { heading: "matrix · confusion matrix (counts) + long labels", template: "matrix", data: { matrix: {
    rows: ["Actual: spam", "Actual: not spam", "Actual: promo"],
    cols: ["Pred: spam", "Pred: not spam", "Pred: promo"],
    cells: [[182, 12, 6], [9, 240, 11], [7, 14, 95]],
  } } },

  // ---- barProportion (NEW) ----
  { heading: "barProportion · context-window budget", template: "barProportion", data: { segments: [
    { label: "System prompt", value: 1200, sub: "instructions" },
    { label: "Retrieved context", value: 5200, sub: "RAG chunks" },
    { label: "Conversation", value: 1800 },
    { label: "Reserved for output", value: 1800, sub: "max_tokens" },
  ] } },
  { heading: "barProportion · cost split (many small slices)", template: "barProportion", data: { segments: [
    { label: "LLM tokens", value: 62 }, { label: "Embeddings", value: 8 },
    { label: "Vector DB", value: 14 }, { label: "Serving", value: 11 }, { label: "Observability", value: 5 },
  ] } },
];

function fig(c: Case): string {
  const svg = renderDiagram(c.template, c.data, c.heading.replace(/[^a-z0-9]/gi, "").slice(0, 18));
  return `<section class="case"><h2>${c.heading}</h2>${c.note ? `<p class="muted">${c.note}</p>` : ""}<figure class="diagram" data-template="${c.template}"><div class="dgm-scroll">${svg}</div></figure></section>`;
}

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Diagram template gallery</title><style>${ARTIFACT_CSS}
body{padding:0}
.wrap{max-width:880px;margin:0 auto;padding:28px 22px 80px}
.gallery-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:8px}
.gallery-head h1{font-size:26px;margin:0}
.case{margin:30px 0}
.case h2{font-size:15px;margin:0 0 8px;color:var(--ink-soft);font-family:var(--font-body);font-weight:700}
.case .muted{margin:0 0 8px;font-size:13px}
#themeToggle{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13px;padding:7px 14px;border-radius:9px;cursor:pointer}
</style></head>
<body data-theme="light">
<div class="wrap">
  <div class="gallery-head"><h1>Diagram template gallery</h1><button id="themeToggle">☾ Dark</button></div>
  <p class="muted">Every prebuilt template with typical, long-text stress, and edge-case data. Labels auto-wrap + auto-shrink to fit their boxes; toggle dark to check theming.</p>
  ${CASES.map(fig).join("\n")}
</div>
<script>
  var t=document.getElementById('themeToggle');
  t.addEventListener('click',function(){
    var b=document.body, d=b.getAttribute('data-theme')==='dark';
    b.setAttribute('data-theme', d?'light':'dark');
    t.textContent = d?'☾ Dark':'☀ Light';
  });
</script>
</body></html>`;

writeFileSync("diagram-gallery.html", html);
writeFileSync("public/_gallery.html", html);
console.log("wrote diagram-gallery.html (" + html.length + " bytes) + public/_gallery.html · cases:", CASES.length);
