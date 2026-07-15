/**
 * migrate-reading-mode.mjs — INTERIM design flip: readingMode → "world" ($0, NO model calls).
 *
 * Flips `learnerProfile.readingMode` to "world" on stored blueprints and RE-RENDERS + persists
 * the html, so the whole library (+ community) shows the new world design without re-generating
 * content. Deterministic: pure data flip + the same renderArtifact the app uses. The Phase-4
 * content rebuilds later OVERWRITE each lesson with upgraded content (this leaves content_version
 * untouched so those rebuilds still fire).
 *
 * ELIGIBILITY (safety): every module loadState==="full" with blocks; skips courses/multi-lesson,
 * partial builds, and lessons already "world". Idempotent.
 *
 * Covers BOTH prebuilt_lessons (library) and community_lessons (community).
 *
 * Modes:
 *   (default)         DRY RUN — list eligible vs skipped (+reason), change nothing.
 *   --out-dir <dir>   LOCAL VERIFY — re-render flipped lessons to <dir>/<slug>.html (+ .json), NO DB writes.
 *   --apply           PERSIST — update blueprint+html in the DB (DATABASE_URL — point at PROD for the interim).
 * Filters: --library | --community (default both) · --slugs a,b,c · --limit N
 *
 * Run (point DATABASE_URL where you want; NODE_EXTRA_CA_CERTS required):
 *   npx tsx scripts/migrate-reading-mode.mjs --library --slugs the-agent-loop,what-is-rag --out-dir /tmp/mig
 *   DATABASE_URL="$PROD_URL" npx tsx scripts/migrate-reading-mode.mjs --apply           # flip all (both tables)
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import { renderArtifact } from "../src/render/index";

const arg = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "") : undefined; };
const flag = (n) => process.argv.includes(n);

function parseBp(v) { if (v == null) return null; if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v; }

/** Only flip lessons that are safe: fully built, single-lesson, not already world. */
function eligibility(bp) {
  if (!bp) return { ok: false, reason: "no blueprint" };
  if (Array.isArray(bp.lessons) && bp.lessons.length) return { ok: false, reason: "course/multi-lesson" };
  const mods = Array.isArray(bp.modules) ? bp.modules : [];
  if (!mods.length) return { ok: false, reason: "no modules" };
  const allFull = mods.every((m) => m && m.loadState === "full" && Array.isArray(m.blocks) && m.blocks.length > 0);
  if (!allFull) return { ok: false, reason: "partial build" };
  if ((bp.learnerProfile || {}).readingMode === "world") return { ok: false, reason: "already world", already: true };
  return { ok: true };
}

async function processTable(table, kind, opts) {
  const rows = await query(`select slug, title, blueprint from ${table} order by slug`).catch((e) => {
    console.error(`  ✗ ${table} query failed: ${e.message}`); return [];
  });
  let candidates = rows.map((r) => ({ ...r, bp: parseBp(r.blueprint) }));
  if (opts.slugList.length) { const set = new Set(opts.slugList); candidates = candidates.filter((r) => set.has(r.slug)); }

  const eligible = [], skipped = [];
  for (const r of candidates) {
    const e = eligibility(r.bp);
    (e.ok ? eligible : skipped).push({ ...r, reason: e.reason, already: e.already });
  }
  const todo = opts.limit ? eligible.slice(0, opts.limit) : eligible;

  console.log(`\n## ${kind} (${table}) — ${candidates.length} rows · ${eligible.length} eligible · ${skipped.length} skipped`);
  const alreadyN = skipped.filter((s) => s.already).length;
  const realSkips = skipped.filter((s) => !s.already);
  if (alreadyN) console.log(`   (already world: ${alreadyN})`);
  for (const s of realSkips) console.log(`   ⤫ skip ${s.slug} — ${s.reason}`);

  if (opts.isDry) {
    for (const r of todo) console.log(`   • would flip ${r.slug}`);
    return { flipped: 0, failed: 0, eligible: eligible.length };
  }

  let flipped = 0, failed = 0;
  for (const r of todo) {
    try {
      const bp = r.bp;
      bp.learnerProfile = bp.learnerProfile || {};
      bp.learnerProfile.readingMode = "world";
      const html = renderArtifact(bp);
      if (opts.outDir) {
        mkdirSync(opts.outDir, { recursive: true });
        writeFileSync(join(opts.outDir, `${r.slug}.html`), html);
        writeFileSync(join(opts.outDir, `${r.slug}.json`), JSON.stringify(bp, null, 2));
      } else {
        // PERSIST — flip design only; DO NOT touch content_version (Phase-4 rebuild must still fire).
        await query(`update ${table} set blueprint = $2, html = $3 where slug = $1`,
          [r.slug, JSON.stringify(bp), html]);
      }
      flipped++;
      console.log(`   ✓ ${r.slug} · ${(html.length / 1024) | 0}KB${opts.outDir ? ` → ${r.slug}.html` : ""}`);
    } catch (e) {
      failed++;
      console.log(`   ✗ ${r.slug} — ${(e.message || "").slice(0, 120)}`);
    }
  }
  return { flipped, failed, eligible: eligible.length };
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }
  const outDir = arg("--out-dir");
  const apply = flag("--apply");
  const isDry = !outDir && !apply;
  const doLib = flag("--library") || !flag("--community");
  const doComm = flag("--community") || !flag("--library");
  const slugsArg = arg("--slugs");
  const slugList = slugsArg ? slugsArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const limit = arg("--limit") ? Math.max(0, parseInt(arg("--limit"), 10) || 0) : 0;
  const opts = { outDir, isDry, slugList, limit };

  const dbInfo = await query(`select current_database() as d`).catch(() => [{ d: "?" }]);
  console.log(`readingMode → "world" migration · DB=${dbInfo[0]?.d} · mode=${isDry ? "DRY" : outDir ? "LOCAL(" + outDir + ")" : "APPLY(DB WRITE)"}`);

  const totals = { flipped: 0, failed: 0, eligible: 0 };
  if (doLib) { const t = await processTable("prebuilt_lessons", "library", opts); totals.flipped += t.flipped; totals.failed += t.failed; totals.eligible += t.eligible; }
  if (doComm) { const t = await processTable("community_lessons", "community", opts); totals.flipped += t.flipped; totals.failed += t.failed; totals.eligible += t.eligible; }

  if (outDir && totals.flipped) {
    writeFileSync(join(outDir, "index.html"), `<!doctype html><meta charset=utf8><title>readingMode→world preview</title><body style="font:15px system-ui;max-width:720px;margin:40px auto"><h1>readingMode → world (design flip, $0)</h1><p>Open any lesson — same content, new world design.</p></body>`);
  }
  console.log(`\n${isDry ? "DRY: " + totals.eligible + " eligible to flip" : "✓ flipped " + totals.flipped + (totals.failed ? " · " + totals.failed + " failed" : "")}${outDir ? " → " + outDir + "/ (no DB writes)" : ""}.`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 200).unref();
}
main().catch((e) => { console.error(e); process.exit(1); });
