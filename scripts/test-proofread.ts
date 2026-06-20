/** Proofreader proof: feed a module with a DELIBERATE factual error, confirm the critic
 *  flags it (accuracy) and the opus repair pass corrects it. Uses credits. */
import "dotenv/config";
import { proofreadModule } from "../src/agent/nodes";
import { blockProse } from "../src/agent/density";
import type { Blueprint } from "../src/render/schema";
import { rawPool } from "../src/lib/db";

function bp(): Blueprint {
  return {
    schemaVersion: "1.0",
    meta: { topic: "Retrieval-Augmented Generation", title: "How RAG Works" },
    learnerProfile: { level: "beginner", depth: "conceptual_technical", examples: "functional", topic: "RAG", inferred: false, expandAcronymsOnFirstUse: true, showTermPopovers: true, density: "medium", visualsRequested: false, explainSyntax: false, readingMode: "vertical", lessonTypes: ["content"] },
    mentalMap: { title: "RAG", oneLineThesis: "Retrieve then generate.", structureType: "conceptual", nodes: [{ id: "n1", label: "How RAG works", moduleId: "m1" }], edges: [] },
    modules: [{
      id: "m1", order: 1, title: "What RAG does", summary: "How retrieval-augmented generation produces grounded answers.",
      objectives: ["Explain how RAG uses your documents to answer questions"], termIds: [], loadState: "full", citations: [],
      blocks: [{
        id: "b1", kind: "conceptual",
        // DELIBERATELY WRONG: RAG does NOT fine-tune/retrain the model at query time.
        body: [{ t: "p", spans: [{ text: "Retrieval-Augmented Generation works by fine-tuning and retraining the language model's weights on your documents every time a user asks a question. Because the model is retrained on the fly, it permanently memorizes your documents and no retrieval or external context is needed at answer time." }] }],
      }],
    }],
    glossary: {}, synthesis: { buildOrder: [], checklist: [], capstone: { prompt: "x" } }, citations: {},
  };
}

async function main() {
  const b = bp();
  console.log("BEFORE (deliberately wrong):\n  " + blockProse(b.modules[0].blocks[0]).join(" ").slice(0, 240) + "\n");
  await proofreadModule(b, "m1", [{ sid: "S1", kbChunkId: "", title: "RAG basics", content: "RAG retrieves relevant chunks from a vector store and injects them as context into the prompt; the model's weights are NOT changed. No fine-tuning happens at query time.", origin: "kb" }]);
  console.log("\nAFTER proofread+repair:\n  " + b.modules[0].blocks.map((bl) => blockProse(bl).join(" ")).join(" ").slice(0, 320));
  const fixed = JSON.stringify(b.modules[0].blocks).toLowerCase();
  console.log("\nstill claims fine-tuning/retraining?", /fine-?tun|retrain/.test(fixed));
  console.log("mentions retrieval/context now?", /retriev|context|chunk/.test(fixed));
}

main().then(() => rawPool()?.end()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
