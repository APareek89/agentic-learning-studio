/**
 * # Backfill the single lesson-level knowledge check (bp.finalCheck) on the library
 *
 * S5 moved the KC to ONE lesson-level `bp.finalCheck` (id "_final_check"), rendered in a `_check`
 * pane before Sources and generated during a build by writeOverviewProse. Old library lessons have
 * no finalCheck — so their `_check` pane is stuck on the "still building…" placeholder (the library
 * has no server to build it) — and a few still carry stale per-module knowledgeCheck blocks.
 *
 * This script, for every prebuilt_lessons blueprint on DATABASE_URL:
 *   1. ensures learnerProfile.lessonTypes includes "knowledge_check"
 *   2. strips any per-module knowledgeCheck blocks (the lesson gets ONE end check instead)
 *   3. GENERATE mode (default): if no finalCheck, calls writeOverviewProse(bp) — the SAME logic the
 *      live build uses (4–5 Qs, mostly mcq + 1 freeText, retention flags, stable id "_final_check").
 *      COPY mode (FINALCHECK_SRC=<file.json>): applies finalChecks from a dump by slug — $0, no LLM
 *      (used to PROMOTE the staging-verified checks to prod without regenerating).
 *   4. re-validates + re-renders, and (APPLY=1) writes blueprint+html back. GENERATE+APPLY also
 *      dumps {slug: finalCheck} to FINALCHECK_OUT (default /tmp/als-finalchecks.json) for promotion.
 *
 *   npx tsx scripts/backfill-finalcheck.ts                         # DRY generate on DATABASE_URL
 *   SLUG=the-agent-loop npx tsx scripts/backfill-finalcheck.ts      # one lesson
 *   LIMIT=3 npx tsx scripts/backfill-finalcheck.ts                  # first 3
 *   APPLY=1 npx tsx scripts/backfill-finalcheck.ts                  # write to DATABASE_URL (staging)
 *   FINALCHECK_SRC=/tmp/als-finalchecks.json DATABASE_URL="$PROD_URL" APPLY=1 \
 *     npx tsx scripts/backfill-finalcheck.ts                        # promote (copy) to prod, $0
 */

import "dotenv/config";
import { writeFile, readFile } from "node:fs/promises";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import { validateBlueprint } from "../src/render/schema";
import { renderArtifact } from "../src/render/index";
import { writeOverviewProse } from "../src/agent/nodes";
import type { Blueprint } from "../src/render/schema";

const APPLY = process.env.APPLY === "1";
const SLUG = process.env.SLUG || "";
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : 0;
const SRC = process.env.FINALCHECK_SRC || "";
const OUT = process.env.FINALCHECK_OUT || "/tmp/als-finalchecks.json";
// GENERATE mode is API-bound (one Sonnet call per lesson), so run several in flight at once.
// COPY mode is $0/local; concurrency irrelevant. Kept modest so we don't burst the rate limit.
const CONCURRENCY = process.env.CONCURRENCY ? parseInt(process.env.CONCURRENCY, 10) : SRC ? 1 : 6;

/** Run `worker` over `items` with at most `n` in flight. Preserves no order; workers mutate
 *  shared counters synchronously after each await (safe — JS is single-threaded). */
async function pool<T>(items: T[], n: number, worker: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await worker(items[idx]); }
  });
  await Promise.all(runners);
}

function whereOf() {
  const u = process.env.DATABASE_URL || "";
  return u.includes("kdgtlbnl") ? "PROD" : u.includes("ydgiyst") ? "STAGING" : "DB";
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }
  const mode = SRC ? "COPY" : "GENERATE";
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} · ${mode} mode · ${whereOf()}\n`);

  const srcMap: Record<string, any> = SRC ? JSON.parse(await readFile(SRC, "utf8")) : {};
  if (SRC) console.log(`loaded ${Object.keys(srcMap).length} finalChecks from ${SRC}\n`);

  let rows = await query<{ slug: string; blueprint: any }>(`select slug, blueprint from prebuilt_lessons order by slug`);
  if (SLUG) rows = rows.filter((r) => r.slug === SLUG);
  if (LIMIT) rows = rows.slice(0, LIMIT);

  const dump: Record<string, any> = {};
  let ltAdded = 0, stripped = 0, generated = 0, copied = 0, alreadyHad = 0, missing = 0, wrote = 0, failed = 0;

  await pool(rows, CONCURRENCY, async (r) => {
    const bp = (typeof r.blueprint === "string" ? JSON.parse(r.blueprint) : r.blueprint) as Blueprint;

    // 1. ensure lessonTypes includes knowledge_check
    const lt = (bp.learnerProfile.lessonTypes ?? []) as string[];
    let ltChanged = false;
    if (!lt.includes("knowledge_check")) { bp.learnerProfile.lessonTypes = [...lt, "knowledge_check"] as any; ltAdded++; ltChanged = true; }

    // 2. strip per-module knowledgeCheck blocks
    let lStripped = 0;
    for (const m of bp.modules) {
      const before = m.blocks.length;
      m.blocks = m.blocks.filter((b) => b.kind !== "knowledgeCheck");
      lStripped += before - m.blocks.length;
    }
    stripped += lStripped;

    // 3. obtain finalCheck
    const had = !!(bp.finalCheck && bp.finalCheck.questions?.length);
    if (had) {
      alreadyHad++;
    } else if (mode === "COPY") {
      const fc = srcMap[r.slug];
      if (fc && fc.questions?.length) { bp.finalCheck = fc; copied++; }
      else { missing++; console.log(`  ⚠ ${r.slug} — no finalCheck in source dump`); }
    } else {
      // GENERATE — reuse the live build's writeOverviewProse (it only fills empties: glossary/
      // synthesis already exist on prebuilt lessons, so this generates ONLY the finalCheck).
      try {
        await writeOverviewProse(bp);
      } catch (e: any) {
        failed++; console.log(`  ✗ ${r.slug} — writeOverviewProse threw: ${e.message?.slice(0, 140)}`); return;
      }
      if (bp.finalCheck && bp.finalCheck.questions?.length) generated++;
      else { failed++; console.log(`  ✗ ${r.slug} — model returned no usable finalCheck (<3 Qs)`); return; }
    }

    // 4. validate + render
    const v = validateBlueprint(bp);
    if (!v.ok || !v.blueprint) { failed++; console.log(`  ✗ ${r.slug} — invalid after backfill: ${v.errors.slice(0, 3).join("; ")}`); return; }
    let html = "";
    try { html = renderArtifact(v.blueprint); } catch (e: any) { failed++; console.log(`  ✗ ${r.slug} — render threw: ${e.message}`); return; }

    const fcN = v.blueprint.finalCheck?.questions?.length ?? 0;
    const kinds = (v.blueprint.finalCheck?.questions ?? []).map((q) => q.kind).join(",");
    if (v.blueprint.finalCheck) dump[r.slug] = v.blueprint.finalCheck;

    console.log(`  ✓ ${r.slug} — lt${ltChanged ? "+" : "="} strip:${lStripped} fc:${fcN}Q [${kinds}]${had ? " (kept)" : mode === "COPY" ? " (copied)" : " (gen)"} html:${html.length}b`);

    if (APPLY) {
      await query(`update prebuilt_lessons set blueprint=$2, html=$3, rebuilt_at=now() where slug=$1`, [r.slug, JSON.stringify(v.blueprint), html]);
      wrote++;
    }
  });

  console.log(`\n${"-".repeat(64)}`);
  console.log(`lessons: ${rows.length} | lessonTypes+: ${ltAdded} | moduleKC stripped: ${stripped}`);
  console.log(`finalCheck → generated: ${generated} · copied: ${copied} · alreadyHad: ${alreadyHad} · missingInSrc: ${missing} · failed: ${failed}`);
  if (APPLY) console.log(`rows written: ${wrote}`);
  else console.log(`(dry run — no writes. Set APPLY=1 to persist.)`);

  if (mode === "GENERATE" && APPLY) { await writeFile(OUT, JSON.stringify(dump, null, 2)); console.log(`→ dumped ${Object.keys(dump).length} finalChecks to ${OUT}`); }

  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 200).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
