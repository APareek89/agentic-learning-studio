/**
 * # Structure-classification proof — show the overview picks the TRUE shape.
 *
 * Runs profiler → retriever → architect (the skeleton) for a procedural, a
 * conceptual, and a comparative query, then prints the chosen structureType, the
 * start node, and the ordered nodes. Proves a procedural query yields an ordered
 * path with a clear step 1, and a conceptual query is NOT forced into steps.
 *
 * Run: NODE_EXTRA_CA_CERTS=... npx tsx scripts/test-structure.ts   (uses credits)
 */
import "dotenv/config";
import { profiler, retriever, architect } from "../src/agent/nodes";
import { rawPool } from "../src/lib/db";

const QUERIES: { kind: string; prompt: string }[] = [
  { kind: "procedural (expect ordered path)", prompt: "how to deploy and configure an ML model on Google Kubernetes Engine" },
  { kind: "conceptual (must NOT be forced into steps)", prompt: "how do transformer attention mechanisms actually work" },
  { kind: "comparative (expect options, not a path)", prompt: "LangGraph vs CrewAI vs AutoGen — which agent framework should I pick" },
];

async function run(prompt: string) {
  const st: Record<string, unknown> = { userPrompt: prompt, cards: {}, uploadIds: [], referOnly: false, levels: [], lessonTypes: [], userProfile: {} };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(st, await profiler(st as any, {} as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(st, await retriever(st as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(st, await architect(st as any, {} as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (st.blueprint as any)?.mentalMap;
}

async function main() {
  for (const q of QUERIES) {
    console.log("\n============================================================");
    console.log("QUERY:", q.prompt);
    console.log("EXPECT:", q.kind);
    const mm = await run(q.prompt);
    if (!mm) { console.log("  (no blueprint produced)"); continue; }
    console.log("→ structureType:", mm.structureType, "| entryNodeId:", mm.entryNodeId ?? "(none)");
    const nodes = (mm.nodes || []).slice().sort((a: { order?: number }, b: { order?: number }) => (a.order ?? 999) - (b.order ?? 999));
    for (const n of nodes) {
      console.log(`   ${n.order != null ? n.order + "." : "•"} ${n.label}${n.id === mm.entryNodeId ? "  [START]" : ""}  — ${n.orient || n.sub || ""}`);
    }
  }
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 300).unref();
}
main().catch((e) => { console.error(e); process.exit(1); });
