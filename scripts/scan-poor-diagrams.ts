/**
 * # Scan the prebuilt library for POOR / EMPTY diagram blocks ($0 — no LLM calls)
 *
 * Loads every blueprint in the prebuilt_lessons table (DATABASE_URL = staging|prod)
 * and walks modules → blocks. A `diagram` block is the only block the renderer turns
 * into a relationship map (components.ts `miniMap`), so a diagram with <2 nodes renders
 * as a single lonely box (or empty row) — visually "poor". We also defensively count any
 * legacy count-bearing fields (steps / rows / a `data` bag) in case an older-shape diagram
 * block survives in the stored JSONB.
 *
 * Run:  npx tsx scripts/scan-poor-diagrams.ts            # scans DATABASE_URL
 *       SCAN_LOCAL=1 npx tsx scripts/scan-poor-diagrams.ts  # scans prebuilt/lessons/*.json instead
 *
 * Output: a table of slug · module id · block id · nodeCount, plus a JSON dump to
 * /tmp/als-poor-diagrams.json that the fix step consumes.
 */

import "dotenv/config";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { query, dbEnabled, rawPool } from "../src/lib/db";

const THRESHOLD = 2; // <2 nodes/steps/rows ⇒ poor

interface Flag {
  slug: string;
  moduleId: string;
  moduleTitle: string;
  blockId: string;
  title?: string;
  nodeCount: number;
  detail: string;
}

/** Count the "items" a diagram block carries, across current + legacy shapes. */
function diagramItemCount(b: any): { count: number; detail: string } {
  const counts: string[] = [];
  let max = 0;
  const tally = (arr: unknown, name: string) => {
    if (Array.isArray(arr)) {
      counts.push(`${name}=${arr.length}`);
      max = Math.max(max, arr.length);
    }
  };
  tally(b.nodes, "nodes");
  tally(b.edges, "edges");
  // legacy/9-template shapes that may live in stored JSONB
  tally(b.steps, "steps");
  tally(b.rows, "rows");
  if (b.data && typeof b.data === "object") {
    tally(b.data.nodes, "data.nodes");
    tally(b.data.steps, "data.steps");
    tally(b.data.rows, "data.rows");
    tally(b.data.layers, "data.layers");
    tally(b.data.bars, "data.bars");
    if (Object.keys(b.data).length === 0) counts.push("data={}");
  }
  return { count: max, detail: counts.join(" ") || "(no count fields)" };
}

function scanBlueprint(slug: string, bp: any, flags: Flag[]) {
  for (const m of bp?.modules ?? []) {
    for (const b of m?.blocks ?? []) {
      if (b?.kind !== "diagram") continue;
      const { count, detail } = diagramItemCount(b);
      if (count < THRESHOLD) {
        flags.push({
          slug,
          moduleId: m.id,
          moduleTitle: m.title ?? "",
          blockId: b.id ?? "(no id)",
          title: b.title,
          nodeCount: count,
          detail,
        });
      }
    }
  }
}

async function loadFromDb(): Promise<{ slug: string; bp: any }[]> {
  if (!dbEnabled()) {
    console.error("✗ DATABASE_URL not set.");
    process.exit(1);
  }
  const rows = await query<{ slug: string; blueprint: any }>(
    `select slug, blueprint from prebuilt_lessons order by slug`
  );
  return rows.map((r) => ({
    slug: r.slug,
    bp: typeof r.blueprint === "string" ? JSON.parse(r.blueprint) : r.blueprint,
  }));
}

async function loadFromLocal(): Promise<{ slug: string; bp: any }[]> {
  const dir = fileURLToPath(new URL("../prebuilt/lessons/", import.meta.url));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const out: { slug: string; bp: any }[] = [];
  for (const f of files) {
    out.push({ slug: f.replace(/\.json$/, ""), bp: JSON.parse(await readFile(dir + f, "utf8")) });
  }
  return out;
}

async function main() {
  const local = process.env.SCAN_LOCAL === "1";
  const src = local ? await loadFromLocal() : await loadFromDb();
  const where = local
    ? "prebuilt/lessons/*.json"
    : process.env.DATABASE_URL?.includes("kdgtlbnl")
    ? "PROD DB"
    : process.env.DATABASE_URL?.includes("ydgiyst")
    ? "STAGING DB"
    : "DB";
  console.log(`Scanning ${src.length} prebuilt lessons from ${where} (threshold: <${THRESHOLD} items)\n`);

  const flags: Flag[] = [];
  let totalDiagrams = 0;
  for (const { slug, bp } of src) {
    for (const m of bp?.modules ?? []) for (const b of m?.blocks ?? []) if (b?.kind === "diagram") totalDiagrams++;
    scanBlueprint(slug, bp, flags);
  }

  console.log(`Total diagram blocks: ${totalDiagrams}`);
  console.log(`Poor diagram blocks (<${THRESHOLD}): ${flags.length}\n`);

  if (flags.length) {
    console.log("slug".padEnd(42) + "module".padEnd(14) + "block".padEnd(14) + "count  detail");
    console.log("-".repeat(110));
    for (const f of flags) {
      console.log(
        f.slug.padEnd(42) +
          f.moduleId.padEnd(14) +
          f.blockId.padEnd(14) +
          String(f.nodeCount).padEnd(7) +
          f.detail
      );
    }
    const byslug = [...new Set(flags.map((f) => f.slug))];
    console.log(`\nAffected lessons: ${byslug.length}`);
  } else {
    console.log("✓ No poor diagram blocks found.");
  }

  await writeFile("/tmp/als-poor-diagrams.json", JSON.stringify(flags, null, 2));
  console.log(`\n→ /tmp/als-poor-diagrams.json`);

  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 150).unref();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
