/**
 * # Calibration test — PROVE level × density, don't claim it.
 *
 * Generates one module for every (level × density) combination on a fixed topic,
 * then reports ACTUAL prose stats vs the tier target: word total, median sentence
 * length, longest sentence, % of sentences over the hard ceiling, and PASS/FAIL.
 * Stats are post-enforcement (the density validator+repair runs inside runDeepDive).
 *
 * Run: NODE_EXTRA_CA_CERTS=... npx tsx scripts/test-calibration.ts
 * (Uses Anthropic credits — ~9 module generations.)
 */
import "dotenv/config";
import { runDeepDive } from "../src/agent/nodes";
import { measureModule } from "../src/agent/density";
import { DENSITY, LEVEL, type Level, type Density } from "../src/agent/calibration";
import { rawPool } from "../src/lib/db";
import type { Blueprint } from "../src/render/schema";

const LEVELS: Level[] = ["beginner", "intermediate", "advanced"];
const DENSITIES: Density[] = ["low", "medium", "high"];

function makeBlueprint(level: Level, density: Density): Blueprint {
  return {
    schemaVersion: "1.0",
    meta: { topic: "AI agents and tool use", title: "Calibration probe" },
    learnerProfile: {
      level, depth: "conceptual_technical", examples: "functional", topic: "AI agents and tool use",
      inferred: false, expandAcronymsOnFirstUse: level !== "advanced", showTermPopovers: true,
      density, visualsRequested: false, explainSyntax: false, lessonTypes: ["content"],
    },
    mentalMap: { title: "Map", oneLineThesis: "Agents act in a loop.", nodes: [{ id: "n1", label: "Agent loop" }], edges: [] },
    modules: [{
      id: "m1", order: 1, title: "How AI agents use tools to take actions",
      summary: "How an agent decides on, calls, and learns from tools inside its reasoning loop.",
      objectives: ["Explain the observe–decide–act–update loop", "Decide when a task warrants an agent vs a script"],
      termIds: [], loadState: "stub", blocks: [], citations: [],
    }],
    glossary: {}, synthesis: { buildOrder: [], checklist: [], capstone: { prompt: "Build one." } }, citations: {},
  } as Blueprint;
}

function pad(s: string, n: number) { return (s + " ".repeat(n)).slice(0, n); }

async function main() {
  console.log("\nGenerating 9 (level × density) module samples…\n");
  const rows: string[][] = [];
  for (const level of LEVELS) {
    for (const density of DENSITIES) {
      const bp = makeBlueprint(level, density);
      const { ok } = await runDeepDive(bp, "m1", {});
      const D = DENSITY[density];
      if (!ok) { rows.push([level, density, "—", "—", "—", "—", `≤${D.medianSentenceWords}/≤${D.hardCeilingWords}`, "GEN FAIL"]); continue; }
      const s = measureModule(bp.modules[0], density);
      const medianOk = s.medianWords <= D.medianSentenceWords + 3;
      const ceilOk = s.pctOver <= 0.1;
      const pass = medianOk && ceilOk;
      rows.push([
        level, density, String(s.words), String(s.medianWords), String(s.longest),
        `${Math.round(s.pctOver * 100)}%`, `≤${D.medianSentenceWords}/≤${D.hardCeilingWords}`,
        pass ? "PASS" : `FAIL(${medianOk ? "" : "median "}${ceilOk ? "" : "ceiling"})`,
      ]);
      console.log(`  done ${level} × ${density}: median ${s.medianWords}w, longest ${s.longest}w, ${Math.round(s.pctOver * 100)}% over`);
    }
  }

  const head = ["Level", "Density", "Words", "Median", "Longest", "%>ceil", "Target med/ceil", "Result"];
  const widths = [13, 8, 7, 7, 8, 7, 16, 18];
  console.log("\n" + head.map((h, i) => pad(h, widths[i])).join("| "));
  console.log(widths.map((w) => "-".repeat(w)).join("+-"));
  for (const r of rows) console.log(r.map((c, i) => pad(c, widths[i])).join("| "));
  console.log("\n(median target allows +3 tolerance; ceiling target = ≤10% of sentences over the hard cap)\n");

  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 300).unref();
}
main().catch((e) => { console.error(e); process.exit(1); });
