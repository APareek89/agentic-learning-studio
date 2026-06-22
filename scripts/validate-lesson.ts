/**
 * Validate ONE prebuilt lesson Blueprint file against the app's own gates.
 * Used by the library-enhancement agents to self-check before finishing.
 * No DB, no model, no network — just schema + the 8 validateBlueprint gates +
 * a render smoke-test (renderArtifact must not throw).
 *
 *   npx tsx scripts/validate-lesson.ts <slug>
 *
 * Exit 0 = valid (+ renders). Exit 1 = invalid/render-fail (errors printed).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateBlueprint } from "../src/render/schema";
import { renderArtifact } from "../src/render/index";

async function main() {
  const slug = process.argv[2];
  if (!slug) { console.error("usage: npx tsx scripts/validate-lesson.ts <slug>"); process.exit(2); }
  const file = fileURLToPath(new URL(`../prebuilt/lessons/${slug}.json`, import.meta.url));

  let raw: unknown;
  try { raw = JSON.parse(await readFile(file, "utf8")); }
  catch (e) { console.log(`PARSE-FAIL ${slug}: ${(e as Error).message}`); process.exit(1); }

  const res = validateBlueprint(raw);
  if (!res.ok) {
    console.log(`INVALID ${slug} — ${res.errors.length} error(s):`);
    for (const e of res.errors) console.log(`  - ${e}`);
    if (res.warnings?.length) for (const w of res.warnings) console.log(`  warn: ${w}`);
    process.exit(1);
  }
  try {
    const html = renderArtifact(res.blueprint!);
    const bp = res.blueprint!;
    const orient = bp.mentalMap.nodes.filter((n) => (n as { orient?: string }).orient).length;
    console.log(`OK ${slug} — valid + renders (${html.length} bytes)`);
    console.log(`   modules=${bp.modules.length} structureType=${bp.mentalMap.structureType || "(none)"} orientHooks=${orient}/${bp.mentalMap.nodes.length}`);
    if (res.warnings?.length) for (const w of res.warnings) console.log(`   warn: ${w}`);
    process.exit(0);
  } catch (e) {
    console.log(`RENDER-FAIL ${slug}: ${(e as Error).message}`);
    process.exit(1);
  }
}
main();
