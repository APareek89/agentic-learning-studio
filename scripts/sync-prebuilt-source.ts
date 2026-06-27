/**
 * # Sync the prebuilt JSON SOURCE files to the live library fixes ($0 — no LLM calls)
 *
 * The finalCheck backfill + per-module knowledgeCheck strip were applied to the prebuilt_lessons
 * DB tables, NOT to the prebuilt/lessons/*.json files those tables are seeded from. So a future
 * `scripts/seed-library.ts` run would REGRESS both fixes. This writes the same changes back into
 * the JSON source so the seed path stays in sync:
 *   1. ensure learnerProfile.lessonTypes includes "knowledge_check"
 *   2. strip any per-module knowledgeCheck blocks
 *   3. add bp.finalCheck from the dump (slug → finalCheck) produced by backfill-finalcheck.ts
 *      (only when the file doesn't already have one)
 * then validateBlueprint() each file and (APPLY=1) rewrite it with the repo's exact formatting
 * (2-space indent + trailing newline — verified byte-identical on round-trip).
 *
 * Diagram fix note: the broken diagram blocks existed only in PROD's 6-module the-agent-loop
 * (an unmerged feature-branch variant), NOT in any JSON source file — the local sources have no
 * poor diagrams (scan-poor-diagrams.ts SCAN_LOCAL=1 = 0), so there's nothing diagram-related to sync.
 *
 *   npx tsx scripts/sync-prebuilt-source.ts            # DRY RUN
 *   APPLY=1 npx tsx scripts/sync-prebuilt-source.ts    # rewrite the JSON files
 */

import "dotenv/config";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateBlueprint } from "../src/render/schema";

const APPLY = process.env.APPLY === "1";
const SRC = process.env.FINALCHECK_SRC || "/tmp/als-finalchecks.json";

async function main() {
  const dir = fileURLToPath(new URL("../prebuilt/lessons/", import.meta.url));
  const dump: Record<string, any> = JSON.parse(await readFile(SRC, "utf8"));
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} · ${Object.keys(dump).length} finalChecks in ${SRC}\n`);

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  let ltAdded = 0, stripped = 0, fcAdded = 0, fcHad = 0, fcMissing = 0, wrote = 0, invalid = 0, unchanged = 0;

  for (const f of files) {
    const slug = f.replace(/\.json$/, "");
    const orig = await readFile(dir + f, "utf8");
    const bp: any = JSON.parse(orig);
    let changed = false;

    // 1. lessonTypes
    const lt = (bp.learnerProfile?.lessonTypes ?? []) as string[];
    if (bp.learnerProfile && !lt.includes("knowledge_check")) { bp.learnerProfile.lessonTypes = [...lt, "knowledge_check"]; ltAdded++; changed = true; }

    // 2. strip per-module knowledgeCheck blocks
    let lStripped = 0;
    for (const m of bp.modules ?? []) {
      const before = (m.blocks ?? []).length;
      m.blocks = (m.blocks ?? []).filter((b: any) => b.kind !== "knowledgeCheck");
      lStripped += before - m.blocks.length;
    }
    if (lStripped) { stripped += lStripped; changed = true; }

    // 3. finalCheck
    if (bp.finalCheck && bp.finalCheck.questions?.length) {
      fcHad++;
    } else if (dump[slug] && dump[slug].questions?.length) {
      bp.finalCheck = dump[slug]; fcAdded++; changed = true;
    } else {
      fcMissing++; console.log(`  ⚠ ${slug} — no finalCheck in dump`);
    }

    // validate
    const v = validateBlueprint(bp);
    if (!v.ok) { invalid++; console.log(`  ✗ ${slug} — INVALID after sync: ${v.errors.slice(0, 3).join("; ")}`); continue; }

    if (!changed) { unchanged++; continue; }

    const next = JSON.stringify(bp, null, 2) + "\n";
    console.log(`  ✓ ${slug} — lt${lt.includes("knowledge_check") ? "=" : "+"} strip:${lStripped} fc:${bp.finalCheck?.questions?.length ?? 0}Q ${orig.length}→${next.length}b`);
    if (APPLY) { await writeFile(dir + f, next); wrote++; }
  }

  console.log(`\n${"-".repeat(60)}`);
  console.log(`files: ${files.length} | lessonTypes+: ${ltAdded} | moduleKC stripped: ${stripped}`);
  console.log(`finalCheck → added: ${fcAdded} · alreadyHad: ${fcHad} · missingInDump: ${fcMissing} · invalid: ${invalid} · unchanged: ${unchanged}`);
  console.log(APPLY ? `files written: ${wrote}` : `(dry run — no writes. Set APPLY=1 to persist.)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
