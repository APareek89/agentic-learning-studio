/** Cheap profiler-only proof of gap-fill precedence + horizontal→knowledge_check. */
import "dotenv/config";
import { profiler } from "../src/agent/nodes";
import { rawPool } from "../src/lib/db";

async function run(label: string, state: Record<string, unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: any = await profiler(state as any, {} as any);
  const p = out.profile;
  console.log(`\n[${label}]`);
  console.log("  topic:", p.topic);
  console.log("  level:", p.level, "| readingMode:", p.readingMode, "| lessonTypes:", JSON.stringify(p.lessonTypes), "| industry:", p.industry ?? "(none)");
}

async function main() {
  // 1) Non-technical role, NO level selected, neutral subject → cautious BEGINNER, subject unchanged.
  await run("PM asks about RAG (no level)", {
    userPrompt: "explain how retrieval augmented generation works", cards: {}, levels: [], lessonTypes: [],
    userProfile: { role: "product manager", industry: "real estate" }, readingMode: "",
  });
  // 2) Technical role, NO level → cautious INTERMEDIATE (never advanced).
  await run("Senior engineer asks about RAG (no level)", {
    userPrompt: "explain how retrieval augmented generation works", cards: {}, levels: [], lessonTypes: [],
    userProfile: { role: "senior software engineer" }, readingMode: "",
  });
  // 3) Explicit level selection WINS over role inference.
  await run("PM picks Advanced (selection wins)", {
    userPrompt: "explain how retrieval augmented generation works", cards: {}, levels: ["advanced"], lessonTypes: [],
    userProfile: { role: "product manager" }, readingMode: "",
  });
  // 4) Horizontal reading → knowledge_check folded in automatically.
  await run("Horizontal reading mode", {
    userPrompt: "explain how vector databases work", cards: {}, levels: ["intermediate"], lessonTypes: ["content"],
    userProfile: {}, readingMode: "horizontal",
  });
}

main().then(() => rawPool()?.end()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
