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
import { profiler, retriever, architect, runDeepDive } from "../src/agent/nodes";
import { renderArtifact } from "../src/render/index";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import type { Blueprint } from "../src/render/schema";

/** Bump when the pipeline/prompts change so `--force`-less runs re-do everything. */
const CONTENT_VERSION = "v2-2026-06-overview-7q";

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
    readingMode: "vertical",
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
  // Library is browse-anywhere with no build queue → every module MUST be fully built.
  const stub = bp.modules.find((m) => m.loadState !== "full" || m.blocks.length === 0);
  if (stub) throw new Error(`module "${stub.id}" never built (${built}/${total}) — not storing`);
  return { bp, built, total };
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set — cannot rebuild."); process.exit(1); }

  const slug = arg("--slug");
  const category = arg("--category");
  const all = flag("--all");
  const force = flag("--force");
  const dry = flag("--dry");
  const yes = flag("--yes");

  // Selection.
  let where = ""; const params: unknown[] = [];
  if (slug) { where = "where slug = $1"; params.push(slug); }
  else if (category) { where = "where category = $1"; params.push(category); }
  // else: all rows (used by --all OR the default dry run)

  const rows = await query<Row>(
    `select slug, title, description, category, level, est_minutes, blueprint, content_version
       from prebuilt_lessons ${where} order by category, est_minutes`,
    params
  ).catch((e) => { console.error("✗ query failed:", (e as Error).message); return [] as Row[]; });

  if (!rows.length) { console.log("No matching lessons."); await rawPool()?.end().catch(() => {}); return; }

  const hasSelection = !!(slug || category || all);
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

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const r = todo[i];
    const tag = `[${i + 1}/${todo.length}] ${r.slug}`;
    process.stdout.write(`${tag} … `);
    try {
      const { bp, built, total } = await generate(r);
      const html = renderArtifact(bp);
      const estMin = (bp.meta.estTotalMinutes && bp.meta.estTotalMinutes > 0) ? bp.meta.estTotalMinutes : r.est_minutes;
      // Preserve slug/category/level/description/title; refresh blueprint/html/est_minutes + version.
      await query(
        `update prebuilt_lessons
            set blueprint = $2, html = $3, est_minutes = $4, content_version = $5, rebuilt_at = now()
          where slug = $1`,
        [r.slug, JSON.stringify(bp), html, estMin, CONTENT_VERSION]
      );
      ok++;
      console.log(`✓ ${built}/${total} modules · ${bp.mentalMap.structureType || "conceptual"} · ${html.length} bytes`);
    } catch (e) {
      fail++;
      console.log(`✗ FAILED — ${(e as Error).message?.slice(0, 140)} (old html kept)`);
    }
  }

  console.log(`\n✓ Rebuilt ${ok}/${todo.length}${fail ? ` · ${fail} failed (left intact)` : ""}.\n`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 300).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
