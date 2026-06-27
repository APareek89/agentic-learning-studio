/**
 * # Fix poor / dead-shape diagram blocks in the prebuilt library ($0 — no LLM calls)
 *
 * A `diagram` block in the CURRENT schema is { layout, nodes[min 1], edges }. Some lessons
 * (notably prod's `the-agent-loop`) still carry the dead 9-template shape
 * { template, data:{steps|stages|...} } with NO nodes/edges — these FAIL validateBlueprint
 * and make renderArtifact() throw, so the live page can only fall back to frozen stored HTML
 * (and is locked out of every renderer fix).
 *
 * This script DETERMINISTICALLY migrates each such block to the current shape, preserving its
 * content (every step/stage → a node with label+sub; sequential edges; loop templates close the
 * cycle). A diagram block with no usable items at all is REMOVED (it's optional/additive).
 *
 * Then it re-validates + re-renders the whole lesson and (only with APPLY=1) writes blueprint+html
 * back to whatever DATABASE_URL points at.
 *
 *   npx tsx scripts/fix-poor-diagrams.ts                       # DRY RUN on DATABASE_URL (staging)
 *   APPLY=1 npx tsx scripts/fix-poor-diagrams.ts               # write to DATABASE_URL (staging)
 *   DATABASE_URL="$PROD_URL" APPLY=1 npx tsx scripts/fix-poor-diagrams.ts   # write to prod
 */

import "dotenv/config";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import { validateBlueprint } from "../src/render/schema";
import { renderArtifact } from "../src/render/index";

const APPLY = process.env.APPLY === "1";

const LAYOUT_BY_TEMPLATE: Record<string, "stack" | "flow" | "tree" | "grid"> = {
  agentLoop: "flow",
  pipeline: "flow",
  sequence: "flow",
  flow: "flow",
  neuralNetwork: "flow",
  tree: "tree",
  graph: "grid",
  matrix: "grid",
  layeredArchitecture: "grid",
  barProportion: "grid",
};

/** Does this diagram block already satisfy the current schema (a real nodes array + layout)? */
function isCurrentShape(b: any): boolean {
  return (
    Array.isArray(b.nodes) &&
    b.nodes.length >= 1 &&
    b.nodes.every((n: any) => n && typeof n.label === "string") &&
    typeof b.layout === "string"
  );
}

/** Pull the best source array of {label,sub}-ish items from a dead-shape diagram block. */
function sourceItems(b: any): any[] | null {
  const d = b.data && typeof b.data === "object" ? b.data : {};
  const candidates = [
    d.nodes, d.steps, d.stages, d.rows, d.layers, d.bars,
    b.steps, b.stages, b.nodes, // sometimes hoisted onto the block
  ];
  for (const c of candidates) if (Array.isArray(c) && c.length) return c;
  return null;
}

/** Migrate ONE diagram block to the current { layout, nodes, edges } shape.
 *  Returns the new block, or null when the block is empty and should be dropped. */
function migrateBlock(b: any): any | null {
  if (isCurrentShape(b)) {
    // valid nodes but maybe missing edges array — normalise.
    return { ...b, edges: Array.isArray(b.edges) ? b.edges : [] };
  }
  const items = sourceItems(b);
  if (!items) return null; // genuinely empty → remove

  const nodes = items.map((it: any, i: number) => {
    const label = String(it?.label ?? it?.name ?? it?.title ?? it?.text ?? (typeof it === "string" ? it : `Step ${i + 1}`)).trim();
    const subRaw = it?.sub ?? it?.detail ?? it?.note ?? it?.desc;
    const node: any = { id: String(it?.id ?? `d${i + 1}`), label: label || `Step ${i + 1}` };
    if (subRaw != null && String(subRaw).trim()) node.sub = String(subRaw).trim();
    return node;
  });

  const isLoop = b.template === "agentLoop" || /\b(loop|cycle)\b/i.test(String(b.title ?? ""));
  const edges: any[] = nodes.slice(0, -1).map((n: any, i: number) => ({ from: n.id, to: nodes[i + 1].id }));
  if (isLoop && nodes.length > 1) edges.push({ from: nodes[nodes.length - 1].id, to: nodes[0].id, label: "repeat" });

  const layout = LAYOUT_BY_TEMPLATE[b.template] ?? "flow";

  const out: any = { id: String(b.id ?? `diagram`), kind: "diagram", layout, nodes, edges };
  if (b.title) out.title = b.title;
  for (const k of ["visibleWhen", "termIds", "sources", "depthTier"]) if (b[k] != null) out[k] = b[k];
  return out;
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }
  const where = process.env.DATABASE_URL?.includes("kdgtlbnl") ? "PROD" : process.env.DATABASE_URL?.includes("ydgiyst") ? "STAGING" : "DB";
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} on ${where}\n`);

  const rows = await query<{ slug: string; blueprint: any }>(`select slug, blueprint from prebuilt_lessons order by slug`);
  let changedLessons = 0, migrated = 0, removed = 0, writeOk = 0;

  for (const r of rows) {
    const bp = typeof r.blueprint === "string" ? JSON.parse(r.blueprint) : r.blueprint;
    let lessonChanged = false;
    let lMig = 0, lRem = 0;

    for (const m of bp.modules ?? []) {
      const newBlocks: any[] = [];
      for (const b of m.blocks ?? []) {
        if (b?.kind !== "diagram" || isCurrentShape(b)) { newBlocks.push(b); continue; }
        const fixed = migrateBlock(b);
        if (fixed === null) { lRem++; lessonChanged = true; continue; } // drop empty
        newBlocks.push(fixed); lMig++; lessonChanged = true;
      }
      m.blocks = newBlocks;
    }

    if (!lessonChanged) continue;
    changedLessons++; migrated += lMig; removed += lRem;

    const v = validateBlueprint(bp);
    if (!v.ok || !v.blueprint) {
      console.log(`  ✗ ${r.slug} — STILL INVALID after fix (${v.errors.length} errors): ${v.errors.slice(0, 3).join("; ")}`);
      continue;
    }
    let html = "";
    try { html = renderArtifact(v.blueprint); }
    catch (e: any) { console.log(`  ✗ ${r.slug} — render threw after fix: ${e.message}`); continue; }

    console.log(`  ✓ ${r.slug} — migrated ${lMig}, removed ${lRem} · valid · html ${html.length}b`);

    if (APPLY) {
      await query(`update prebuilt_lessons set blueprint=$2, html=$3, rebuilt_at=now() where slug=$1`,
        [r.slug, JSON.stringify(v.blueprint), html]);
      writeOk++;
    }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`lessons changed: ${changedLessons} | blocks migrated: ${migrated} | blocks removed: ${removed}`);
  if (APPLY) console.log(`rows written: ${writeOk}`);
  else console.log(`(dry run — no writes. Set APPLY=1 to persist.)`);

  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 150).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
