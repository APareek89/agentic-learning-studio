/**
 * Smoke test: the OPUS planner → SONNET architect split.
 * Runs profiler → retriever → planner → architect for ONE query, times each LLM stage,
 * and confirms the planner produced lean STRUCTURE and the architect (Sonnet) filled the PROSE.
 * Run: NODE_EXTRA_CA_CERTS=... npx tsx scripts/test-split.ts   (USES CREDITS — one overview)
 */
import "dotenv/config";
import { profiler, retriever, planner, architect, writeOverviewProse } from "../src/agent/nodes";
import { rawPool } from "../src/lib/db";

const PROMPT = "explain langchain and langgraph to build a customer support agent";

async function main() {
  const st: Record<string, unknown> = { userPrompt: PROMPT, cards: {}, uploadIds: [], referOnly: false, levels: [], lessonTypes: [], userProfile: {} };
  const t = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  let s = Date.now();
  Object.assign(st, await profiler(st as any, {} as any));   // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`profiler  : ${t(Date.now() - s)}`);
  s = Date.now();
  Object.assign(st, await retriever(st as any));             // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`retriever : ${t(Date.now() - s)}`);
  s = Date.now();
  Object.assign(st, await planner(st as any, {} as any));    // eslint-disable-line @typescript-eslint/no-explicit-any
  const planMs = Date.now() - s;
  const plan = st.plan as any;                               // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`planner   : ${t(planMs)}  (OPUS)  → plan chars=${plan ? JSON.stringify(plan).length : "NULL"}`);
  s = Date.now();
  Object.assign(st, await architect(st as any, {} as any));  // eslint-disable-line @typescript-eslint/no-explicit-any
  const archMs = Date.now() - s;
  const bp = st.blueprint as any;                            // eslint-disable-line @typescript-eslint/no-explicit-any
  console.log(`architect : ${t(archMs)}  (SONNET) → blueprint=${bp ? "OK" : "NULL"}`);
  console.log(`OVERVIEW TOTAL (planner+architect): ${t(planMs + archMs)}`);

  if (plan) {
    console.log(`\nPLAN (Opus, structure only): structureType=${plan.structureType} · modules=${(plan.modules || []).length} · terms=${(plan.glossaryTerms || []).length}`);
    console.log("  plan modules:", (plan.modules || []).map((m: any) => `${m.order}.${m.title}`).join(" | "));   // eslint-disable-line @typescript-eslint/no-explicit-any
    const planHasProse = JSON.stringify(plan).match(/laymanDefinition|"summary"|"objectives"|"orient"/);
    console.log("  plan contains prose fields (should be NONE):", planHasProse ? "⚠️ " + planHasProse[0] : "none ✓");
  }
  if (bp) {
    const nodes = bp.mentalMap?.nodes || [];
    const orientFilled = nodes.filter((n: any) => (n.orient || "").trim().length > 0).length;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const glossary = Object.values(bp.glossary || {});
    const defsFilled = glossary.filter((g: any) => (g.laymanDefinition || "").trim().length > 0).length;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const mods = bp.modules || [];
    const objFilled = mods.filter((m: any) => (m.objectives || []).length > 0).length;   // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log(`\nARCHITECT (Sonnet) prose-fill: orient ${orientFilled}/${nodes.length} nodes · glossary defs ${defsFilled}/${glossary.length} · objectives ${objFilled}/${mods.length} modules · synthesis ${bp.synthesis ? "present" : "MISSING"}`);
    console.log("  bp modules:", mods.map((m: any) => `${m.order}.${m.title}`).join(" | "));   // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log("  sample orient:", nodes[1]?.orient || nodes[0]?.orient || "(none)");
    console.log("  follows plan structure:", plan && mods.length === (plan.modules || []).length ? "module count matches ✓" : "⚠️ count differs");

    // DEFER CHECK: after the overview, glossary defs + synthesis should be EMPTY (deferred to build).
    const defsEmptyAfterOverview = glossary.filter((g: any) => !((g.laymanDefinition || "").trim())).length;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const synEmpty = !(bp.synthesis?.buildOrder?.length) && !bp.synthesis?.recap;
    console.log(`\nDEFER — after overview: glossary defs EMPTY ${defsEmptyAfterOverview}/${glossary.length} (want all empty) · synthesis empty: ${synEmpty}`);
    // Now run the build-time prose writer and confirm it FILLS them.
    s = Date.now();
    await writeOverviewProse(bp, {});
    const proseMs = Date.now() - s;
    const glossary2 = Object.values(bp.glossary || {});
    const defsFilled2 = glossary2.filter((g: any) => (g.laymanDefinition || "").trim()).length;   // eslint-disable-line @typescript-eslint/no-explicit-any
    const synFilled = !!(bp.synthesis?.buildOrder?.length) || !!bp.synthesis?.recap;
    console.log(`writeOverviewProse: ${t(proseMs)} (SONNET, runs IN PARALLEL with module builds) → glossary defs filled ${defsFilled2}/${glossary2.length} · synthesis filled: ${synFilled}`);
    console.log("  sample def:", (bp.glossary[(Object.keys(bp.glossary)[0])] as any)?.laymanDefinition || "(none)");   // eslint-disable-line @typescript-eslint/no-explicit-any
    console.log(`\n>>> NEW overview wall-clock (profiler+planner+architect): ${t(planMs + archMs)}  (architect was ${t(archMs)}; the deferred defs/synthesis no longer block the preview)`);
  }
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 300).unref();
}
main().catch((e) => { console.error("SMOKE FAILED:", e?.message || e); process.exit(1); });
