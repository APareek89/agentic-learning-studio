/**
 * # Backfill curated visuals into EXISTING lessons (no regeneration).
 *
 * For each prebuilt (library) lesson — and, with --all, community lessons — parse
 * the stored Blueprint, attach `module.visual` to each module that strongly matches
 * a curated diagram (deterministic retrieval), then UPDATE the blueprint + re-render
 * the html. `/api/lesson/:slug` and `/api/community/lesson/:slug` re-render from the
 * blueprint, so updating it is enough. One visual per module, deduped per lesson.
 *
 * Idempotent (re-running just refreshes). Targets DATABASE_URL (staging-local);
 * re-run with DATABASE_URL="$PROD_URL" for prod.
 *
 *   npx tsx scripts/backfill-visuals.ts          # prebuilt (library) lessons
 *   npx tsx scripts/backfill-visuals.ts --all     # + community lessons
 */

import "dotenv/config";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import { renderArtifact } from "../src/render/index";
import { retrieveVisual, clearVisualCache } from "../src/lib/visuals";
import type { Blueprint } from "../src/render/schema";

const ALSO_COMMUNITY = process.argv.includes("--all");

function parseBp(v: unknown): Blueprint | null {
  if (!v) return null;
  try { return (typeof v === "string" ? JSON.parse(v) : v) as Blueprint; } catch { return null; }
}

/** Attach visuals to a lesson's modules (deduped). Returns how many were attached. */
async function attachToLesson(bp: Blueprint, category?: string): Promise<number> {
  let n = 0;
  const used = new Set<string>();
  // CLEAR any previously-attached visual first, then re-attach from the CURRENT lesson_visuals
  // table. This makes the backfill correctly idempotent across diagram swaps: re-running replaces
  // a stale SVG (e.g. an older diagram set) with the fresh one — retrieveVisual is deterministic,
  // so unchanged identifiers re-match the same concept, now carrying the new SVG bytes.
  for (const m of bp.modules) m.visual = undefined;
  for (const m of bp.modules) {
    try {
      const hit = await retrieveVisual({ topic: bp.meta.title, moduleTitle: m.title, moduleSummary: m.summary, category });
      if (hit && !used.has(hit.visualId)) {
        m.visual = { title: hit.title, svg: hit.svg };
        used.add(hit.visualId);
        n++;
      }
    } catch { /* skip this module */ }
  }
  return n;
}

async function backfillTable(table: string, label: string): Promise<void> {
  const rows = await query<{ slug: string; category: string | null; blueprint: unknown }>(
    `select slug, category, blueprint from ${table} where blueprint is not null`
  ).catch((e) => { console.warn(`• ${label}: ${(e as Error).message}`); return []; });
  let lessons = 0, visuals = 0, updated = 0;
  for (const r of rows) {
    const bp = parseBp(r.blueprint);
    if (!bp || !Array.isArray(bp.modules)) continue;
    lessons++;
    const hadBefore = bp.modules.some((m) => !!m.visual); // so a now-unmatched lesson gets its stale visual CLEARED too
    const n = await attachToLesson(bp, r.category ?? undefined);
    if (n > 0 || hadBefore) {
      visuals += n;
      try {
        await query(`update ${table} set blueprint = $1::jsonb, html = $2 where slug = $3`, [JSON.stringify(bp), renderArtifact(bp), r.slug]);
        updated++;
        console.log(`  ✓ ${r.slug}: +${n} visual${n === 1 ? "" : "s"}`);
      } catch (e) { console.warn(`  ✗ ${r.slug}: update failed (${(e as Error).message})`); }
    }
  }
  console.log(`• ${label}: ${updated}/${lessons} lessons updated, ${visuals} visuals attached.`);
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set — cannot backfill."); process.exit(1); }
  clearVisualCache();
  await backfillTable("prebuilt_lessons", "Library");
  if (ALSO_COMMUNITY) await backfillTable("community_lessons", "Community");
  await rawPool()?.end().catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
