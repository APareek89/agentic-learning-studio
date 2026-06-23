/**
 * # Ingest — load a folder (or file) of documents into the knowledge base
 *
 *   npm run ingest -- "/Users/anandpareek/Documents/AI Knowledge base"
 *
 * Walks the path, skips noise (images, .DS_Store, and a .csv when a same-stem
 * .json mirror exists), loads + chunks + embeds + upserts each file, and writes
 * one `kb_updates` audit row. Re-runnable: unchanged files are skipped.
 */

import "dotenv/config";
import { readdir, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { rawPool, ragEnabled } from "../lib/db";
import { loadSource } from "./loaders";
import { upsertSource } from "./store";

const SKIP_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ds_store"]);
const SKIP_NAME = new Set([".DS_Store"]);
// Planning / meta artifacts are ABOUT the KB, not learning content — they're
// retrieval noise (e.g. a "Research Plan" or an ingest manifest). Skip them.
const SKIP_META_RE = /^(CONFIG_|manifest\.ya?ml$|_manifest\.json$|KB_IP_AUDIT\.md$|KB_CONTENT_POLICY\.md$)/i;

/** Recursively list files under a directory (or just return the one file). */
async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function rec(dir: string) {
    for (const name of await readdir(dir)) {
      const p = join(dir, name);
      const s = await stat(p);
      if (s.isDirectory()) await rec(p);
      else out.push(p);
    }
  }
  const s = await stat(root);
  if (s.isDirectory()) await rec(root);
  else out.push(root);
  return out;
}

export async function ingest(root: string): Promise<void> {
  if (!ragEnabled()) {
    console.error("✗ No DATABASE_URL configured — set it in .env to ingest into the knowledge base.");
    process.exitCode = 1;
    return;
  }

  const files = await walk(root);
  // Prefer a .json over a same-stem .csv (the JSON is the richer mirror).
  const jsonStems = new Set(files.filter((f) => extname(f) === ".json").map((f) => f.slice(0, -5)));
  const candidates = files.filter((f) => {
    const ext = extname(f).toLowerCase();
    if (SKIP_EXT.has(ext) || SKIP_NAME.has(basename(f))) return false;
    if (SKIP_META_RE.test(basename(f))) return false; // planning/meta artifacts → noise
    if (ext === ".csv" && jsonStems.has(f.slice(0, -4))) return false;
    return true;
  });

  let added = 0,
    skipped = 0,
    errors = 0;
  const errorList: { file: string; error: string }[] = [];

  console.log(`\nIngesting ${candidates.length} file(s) from ${root}\n`);
  for (const abs of candidates) {
    const sourceId = relative(root, abs) || basename(abs);
    try {
      const loaded = await loadSource(abs, sourceId);
      if (!loaded) {
        console.log(`  · skip   ${sourceId} (unsupported)`);
        continue;
      }
      const res = await upsertSource(loaded);
      added += res.added;
      skipped += res.skipped;
      console.log(`  ${res.added ? "✓ add  " : "= same "} ${sourceId}  (+${res.added} chunks${res.skipped ? `, ${res.skipped} unchanged` : ""})`);
    } catch (err) {
      errors++;
      errorList.push({ file: sourceId, error: (err as Error).message });
      console.warn(`  ✗ error  ${sourceId}: ${(err as Error).message}`);
    }
  }

  // Audit row.
  const pool = rawPool();
  if (pool) {
    await pool
      .query(`insert into kb_updates (source, added, updated, skipped, errors, note) values ('ingest',$1,0,$2,$3,$4)`, [
        added,
        skipped,
        JSON.stringify(errorList),
        `root=${root}`,
      ])
      .catch(() => {});
  }

  console.log(`\n✓ Ingest done — ${added} chunks added, ${skipped} unchanged, ${errors} errors.\n`);
}

// CLI entry: `npm run ingest -- "<path>"`
const target = process.argv[2];
if (target) {
  await ingest(target);
  process.exit(process.exitCode ?? 0);
} else {
  console.error('Usage: npm run ingest -- "/path/to/docs"');
  process.exit(1);
}
