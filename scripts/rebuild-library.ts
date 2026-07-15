/**
 * # Rebuild the pre-built library THROUGH THE CURRENT GENERATION PIPELINE
 *
 * The prebuilt lessons were authored against the OLD prompts. This script
 * RE-GENERATES each one with the SAME pipeline a fresh lesson uses today —
 * profiler → retriever → architect (Opus skeleton, raw-parse) → runDeepDive on
 * EVERY module (no stubs — the library has no background build queue) →
 * renderArtifact — then upserts the fresh { blueprint, html } back into
 * prebuilt_lessons KEYED BY SLUG. slug/category/level/description are preserved;
 * est_minutes is refreshed from the new blueprint. Title is kept (curated, keeps
 * Library cards stable).
 *
 * Inputs for each lesson are reconstructed from its stored row + old blueprint's
 * learnerProfile (depth/examples/density/visuals/syntax/lessonTypes/framework),
 * with the row's level and readingMode = vertical.
 *
 * COST: Opus skeleton + ~5 Sonnet modules per lesson, ~100 lessons. So:
 *   - default (no filter flag) = DRY RUN (print what it would do, change nothing).
 *   - --slug <slug> | --category "<Category>" | --all to actually run.
 *   - --all additionally requires --yes (extra confirmation).
 *   - resumable: skips lessons already at CONTENT_VERSION unless --force.
 *   - per-lesson failures are logged and SKIPPED — the old html stays intact.
 *
 * Run (NODE_EXTRA_CA_CERTS required for Claude/Supabase/HF):
 *   NODE_EXTRA_CA_CERTS=".../system-ca-bundle.pem" npx tsx scripts/rebuild-library.ts --slug <slug>
 *   …                                                                      --category "RAG"
 *   …                                                                      --all --yes
 */

import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { profiler, retriever, architect, runDeepDive, writeOverviewProse } from "../src/agent/nodes";
import { renderArtifact } from "../src/render/index";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import type { Blueprint } from "../src/render/schema";

/** Bump when the pipeline/prompts change so `--force`-less runs re-do everything.
 *  v5.1 = v5 world + the writeOverviewProse fix (finalCheck knowledge check restored); the bump
 *  makes a resumable run re-do the 7 batch-1 lessons that shipped v5 WITHOUT a finalCheck. */
const CONTENT_VERSION = "v5.1-world-2026-07-finalcheck";

/** Local prebuilt seed dir — the offline source for `--out-dir` (local verify) mode. */
const PREBUILT = fileURLToPath(new URL("../prebuilt/", import.meta.url));

interface Row {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string | null;
  est_minutes: number | null;
  blueprint: unknown;
  content_version: string | null;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "") : undefined;
}
function flag(name: string): boolean { return process.argv.includes(name); }

function parseBlueprint(v: unknown): Blueprint | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as Blueprint; } catch { return null; } }
  return v as Blueprint;
}

/** Reconstruct the generation inputs for one prebuilt lesson from its stored row. */
function inputsFor(row: Row) {
  const old = parseBlueprint(row.blueprint);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lp: any = old?.learnerProfile ?? {};
  const level = row.level || lp.level || "beginner";
  const cards: Record<string, string> = {};
  if (lp.depth) cards.depth = lp.depth;
  if (lp.examples) cards.examples = lp.examples;
  if (lp.density) cards.density = lp.density;
  if (lp.visualsRequested) cards.visuals = "on";
  if (lp.explainSyntax) cards.syntax = "on";
  const desc = (row.description || "").trim();
  const userPrompt = desc ? `${row.title} — ${desc}` : row.title;
  return {
    userPrompt,
    cards,
    levels: [level],
    lessonTypes: Array.isArray(lp.lessonTypes) && lp.lessonTypes.length ? lp.lessonTypes : ["content"],
    framework: lp.framework || "",
    // World is the production template for all new generations (profiler folds in knowledge_check).
    readingMode: "world",
    industry: lp.industry || "",
    buildGoal: lp.buildGoal || "",
  };
}

/** Run the full current pipeline for one lesson; returns a fully-built Blueprint. */
async function generate(row: Row): Promise<{ bp: Blueprint; built: number; total: number }> {
  const inp = inputsFor(row);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const st: Record<string, any> = {
    userPrompt: inp.userPrompt, cards: inp.cards, uploadIds: [], referOnly: false,
    industry: inp.industry, buildGoal: inp.buildGoal, levels: inp.levels, lessonTypes: inp.lessonTypes,
    framework: inp.framework, readingMode: inp.readingMode, userProfile: {},
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(st, await profiler(st as any, {} as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(st, await retriever(st as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Object.assign(st, await architect(st as any, {} as any));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!(st.validation as any)?.ok && ((st.reviseCount as number) ?? 0) < 2) Object.assign(st, await architect(st as any, {} as any));
  const bp = st.blueprint as Blueprint | null;
  if (!bp) throw new Error("architect produced no blueprint (skeleton failed)");

  const total = bp.modules.length;
  let built = 0;
  for (const m of bp.modules) {
    const { ok } = await runDeepDive(bp, m.id, { uploadIds: [], referOnly: false });
    if (ok && m.loadState === "full" && m.blocks.length > 0) built++;
  }
  // Lesson-level prose the live build (runBuildJob) defers to writeOverviewProse: fills empty
  // glossary definitions + synthesis AND writes the S5 finalCheck knowledge check (world/horizontal
  // imply knowledge_check). WITHOUT this, rebuilt lessons ship with NO knowledge check.
  await writeOverviewProse(bp).catch((e) => console.warn(`  [overview-prose] ${(e as Error).message?.slice(0, 80)}`));
  // Library is browse-anywhere with no build queue → every module MUST be fully built.
  const stub = bp.modules.find((m) => m.loadState !== "full" || m.blocks.length === 0);
  if (stub) throw new Error(`module "${stub.id}" never built (${built}/${total}) — not storing`);
  return { bp, built, total };
}

/**
 * Offline source for `--out-dir` (local verify) mode: build the rebuild list from the local
 * `prebuilt/index.json` + `prebuilt/lessons/<slug>.json` files instead of the DB, so a local
 * preview build never reads or writes the staging/prod `prebuilt_lessons` table (RAG retrieval
 * still reads whatever DATABASE_URL points at — keep it on PROD read-only for prod-bound builds).
 */
function loadLocalRows(sel: { slug?: string; category?: string; slugs: string[] }): Row[] {
  const index: { slug: string; title: string; description?: string; category?: string; level?: string; estMinutes?: number }[] =
    JSON.parse(readFileSync(PREBUILT + "index.json", "utf8"));
  let entries = index;
  if (sel.slug) entries = entries.filter((e) => e.slug === sel.slug);
  else if (sel.slugs.length) { const set = new Set(sel.slugs); entries = entries.filter((e) => set.has(e.slug)); }
  else if (sel.category) entries = entries.filter((e) => e.category === sel.category);
  return entries.map((e) => {
    let bp: unknown = null;
    try { bp = JSON.parse(readFileSync(`${PREBUILT}lessons/${e.slug}.json`, "utf8")); } catch { bp = null; }
    return { slug: e.slug, title: e.title, description: e.description ?? null, category: e.category ?? null,
             level: e.level ?? null, est_minutes: e.estMinutes ?? null, blueprint: bp, content_version: null };
  });
}

async function main() {
  const slug = arg("--slug");
  const category = arg("--category");
  const slugsArg = arg("--slugs");        // comma-separated batch (both modes)
  const limitArg = arg("--limit");
  const outDir = arg("--out-dir");         // LOCAL file output mode — renders to <dir>/<slug>.{html,json}, NO DB writes
  const all = flag("--all");
  const force = flag("--force");
  const dry = flag("--dry");
  const yes = flag("--yes");
  const dumpDir = arg("--dump");           // DB-write mode: ALSO write html/json here (for QA), capped at 3 to respect the shared Anthropic account
  const concurrency = Math.min(3, Math.max(1, parseInt(arg("--concurrency") || "1", 10) || 1));
  const slugList = slugsArg ? slugsArg.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const limit = limitArg ? Math.max(0, parseInt(limitArg, 10) || 0) : 0;

  // Retrieval (RAG) always needs a DB read; only the WRITE path is DB-vs-file.
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set — needed for RAG retrieval."); process.exit(1); }

  // Selection → rows. `--out-dir` sources from local prebuilt files (never touches prebuilt_lessons).
  let rows: Row[];
  if (outDir) {
    rows = loadLocalRows({ slug, category, slugs: slugList });
  } else {
    let where = ""; const params: unknown[] = [];
    if (slug) { where = "where slug = $1"; params.push(slug); }
    else if (slugList.length) { where = "where slug = any($1)"; params.push(slugList); }
    else if (category) { where = "where category = $1"; params.push(category); }
    rows = await query<Row>(
      `select slug, title, description, category, level, est_minutes, blueprint, content_version
         from prebuilt_lessons ${where} order by category, est_minutes`,
      params
    ).catch((e) => { console.error("✗ query failed:", (e as Error).message); return [] as Row[]; });
  }
  if (limit) rows = rows.slice(0, limit);

  if (!rows.length) { console.log("No matching lessons."); await rawPool()?.end().catch(() => {}); return; }

  const hasSelection = !!(slug || category || all || slugList.length || limit);
  const isDryRun = dry || !hasSelection;

  // Resumability: skip lessons already at the current version unless --force.
  const todo = rows.filter((r) => force || r.content_version !== CONTENT_VERSION);
  const skipped = rows.length - todo.length;

  console.log(`\nLibrary rebuild — content version "${CONTENT_VERSION}"`);
  console.log(`  matched: ${rows.length} · to rebuild: ${todo.length}${skipped ? ` · already current (skipped): ${skipped}` : ""}${force ? " (--force)" : ""}\n`);

  if (isDryRun) {
    console.log(hasSelection ? "DRY RUN (--dry): would rebuild —" : "DRY RUN (no --slug/--category/--all given) — would rebuild:");
    for (const r of todo) console.log(`  • ${r.slug}  [${r.category || "?"} · ${r.level || "?"}]`);
    console.log(`\nTo run for real: --slug <slug> | --category "<Category>" | --all --yes  (add --force to redo current ones).`);
    await rawPool()?.end().catch(() => {});
    setTimeout(() => process.exit(0), 200).unref();
    return;
  }

  if (all && !yes) {
    console.log(`✋ Refusing --all without --yes (this rebuilds ${todo.length} lessons — Opus skeleton + ~5 Sonnet modules each).`);
    console.log(`   Re-run: npx tsx scripts/rebuild-library.ts --all --yes\n`);
    await rawPool()?.end().catch(() => {});
    setTimeout(() => process.exit(0), 200).unref();
    return;
  }

  console.log(`  concurrency: ${concurrency}${outDir ? ` · local → ${outDir}` : dumpDir ? ` · DB + dump → ${dumpDir}` : " · DB write"}\n`);
  if (outDir) mkdirSync(outDir, { recursive: true });
  if (dumpDir) mkdirSync(dumpDir, { recursive: true });

  let ok = 0, fail = 0, next = 0;
  async function rebuildOne(r: Row, n: number) {
    const t0 = Date.now();
    try {
      const { bp, built, total } = await generate(r);
      const html = renderArtifact(bp);
      const estMin = (bp.meta.estTotalMinutes && bp.meta.estTotalMinutes > 0) ? bp.meta.estTotalMinutes : r.est_minutes;
      if (outDir) {
        // LOCAL verify mode: write self-contained html + blueprint; NEVER touch prebuilt_lessons.
        writeFileSync(join(outDir, `${r.slug}.html`), html);
        writeFileSync(join(outDir, `${r.slug}.json`), JSON.stringify(bp, null, 2));
      } else {
        // Preserve slug/category/level/description/title; refresh blueprint/html/est_minutes + version.
        await query(
          `update prebuilt_lessons
              set blueprint = $2, html = $3, est_minutes = $4, content_version = $5, rebuilt_at = now()
            where slug = $1`,
          [r.slug, JSON.stringify(bp), html, estMin, CONTENT_VERSION]
        );
        if (dumpDir) { writeFileSync(join(dumpDir, `${r.slug}.html`), html); writeFileSync(join(dumpDir, `${r.slug}.json`), JSON.stringify(bp, null, 2)); }
      }
      ok++;
      const secs = Math.round((Date.now() - t0) / 1000);
      const mode = (bp.learnerProfile as { readingMode?: string })?.readingMode || "?";
      console.log(`[${n}/${todo.length}] ✓ ${r.slug} · ${built}/${total} mod · ${mode} · ${bp.mentalMap.structureType || "conceptual"} · ${(html.length / 1024) | 0}KB · ${secs}s`);
    } catch (e) {
      fail++;
      console.log(`[${n}/${todo.length}] ✗ ${r.slug} — ${(e as Error).message?.slice(0, 140)} (${outDir ? "no file" : "old kept"})`);
    }
  }
  // Bounded pool — up to `concurrency` lessons at once (each still builds its modules sequentially).
  async function worker() { while (true) { const i = next++; if (i >= todo.length) break; await rebuildOne(todo[i], i + 1); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, () => worker()));

  if (outDir && ok) {
    // A tiny local index so a human can click through the rebuilt batch (file://).
    const links = todo.map((r) => `<li><a href="./${r.slug}.html">${r.slug}</a> <small>[${r.category || "?"} · ${r.level || "?"}]</small></li>`).join("\n");
    writeFileSync(join(outDir, "index.html"), `<!doctype html><meta charset=utf8><title>Rebuilt library preview</title><style>body{font:15px system-ui;max-width:760px;margin:40px auto;padding:0 20px}h1{font-size:20px}li{margin:6px 0}small{color:#888}</style><h1>Rebuilt library preview — ${CONTENT_VERSION} · world</h1><ol>${links}</ol>`);
  }

  console.log(`\n✓ Rebuilt ${ok}/${todo.length}${fail ? ` · ${fail} failed (left intact)` : ""}${outDir ? ` → ${outDir}/ (local, no DB writes)` : ""}.\n`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 300).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
