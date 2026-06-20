/**
 * # Seed the pre-built lesson library (DETERMINISTIC — no LLM calls)
 *
 * For each entry in prebuilt/index.json:
 *   1. load prebuilt/lessons/<slug>.json
 *   2. validateBlueprint() — the app's own gates. Invalid → logged + skipped +
 *      listed in prebuilt/INVALID.md (for Codex to redo; we never rewrite content).
 *   3. renderArtifact() — the same deterministic renderer the live app uses.
 *   4. upsert {slug,title,description,category,level,est_minutes,blueprint,html}
 *      into prebuilt_lessons.
 *
 * Run: npx tsx scripts/seed-library.ts
 */

import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateBlueprint } from "../src/render/schema";
import { renderArtifact } from "../src/render/index";
import { query, dbEnabled, rawPool } from "../src/lib/db";

interface IndexEntry { slug: string; title: string; description: string; category: string; level: string; estMinutes: number; }

const root = fileURLToPath(new URL("../prebuilt/", import.meta.url));

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set — cannot seed."); process.exit(1); }
  const index: IndexEntry[] = JSON.parse(await readFile(root + "index.json", "utf8"));
  console.log(`Loaded ${index.length} index entries.\n`);

  const invalid: { slug: string; errors: string[] }[] = [];
  let inserted = 0;

  for (const e of index) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(`${root}lessons/${e.slug}.json`, "utf8"));
    } catch {
      invalid.push({ slug: e.slug, errors: ["lesson file missing or unreadable"] });
      console.log(`  ✗ ${e.slug} — file missing`);
      continue;
    }
    const result = validateBlueprint(raw);
    if (!result.ok || !result.blueprint) {
      invalid.push({ slug: e.slug, errors: result.errors.slice(0, 5) });
      console.log(`  ✗ ${e.slug} — INVALID (${result.errors.length} errors)`);
      continue;
    }
    // Fully-built lessons only (a static library has no server to build stubs).
    const stub = result.blueprint.modules.find((m) => m.loadState !== "full" || m.blocks.length === 0);
    if (stub) {
      invalid.push({ slug: e.slug, errors: [`module "${stub.id}" is a stub (no blocks) — static lessons must be fully built`] });
      console.log(`  ✗ ${e.slug} — has stub module`);
      continue;
    }
    const html = renderArtifact(result.blueprint);
    await query(
      `insert into prebuilt_lessons (slug, title, description, category, level, est_minutes, blueprint, html)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (slug) do update set
         title=excluded.title, description=excluded.description, category=excluded.category,
         level=excluded.level, est_minutes=excluded.est_minutes, blueprint=excluded.blueprint, html=excluded.html`,
      [e.slug, e.title, e.description, e.category, e.level, e.estMinutes, JSON.stringify(result.blueprint), html]
    );
    inserted++;
    if (inserted % 20 === 0) console.log(`  …${inserted} seeded`);
  }

  if (invalid.length) {
    const md = `# Invalid pre-built lessons (skipped at seed time)\n\n_Generated ${new Date().toISOString().slice(0, 10)} — for Codex to redo. The app never rewrites lesson content._\n\n` +
      invalid.map((i) => `## ${i.slug}\n${i.errors.map((e) => `- ${e}`).join("\n")}`).join("\n\n") + "\n";
    await writeFile(root + "INVALID.md", md);
    console.log(`\n⚠ ${invalid.length} invalid → prebuilt/INVALID.md`);
  } else {
    console.log(`\n✓ All lessons valid.`);
  }
  console.log(`\n✓ Seeded ${inserted}/${index.length} lessons into prebuilt_lessons.\n`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 200).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
