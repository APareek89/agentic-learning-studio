/**
 * backup-lessons.mjs — dump prebuilt_lessons (+ community_lessons) to a JSON file ($0, read-only).
 * A safety net before a bulk flip/rebuild so any lesson can be restored byte-for-byte.
 *
 * Run: DATABASE_URL="$PROD_URL" NODE_EXTRA_CA_CERTS=... npx tsx scripts/backup-lessons.mjs [outfile]
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { query, dbEnabled, rawPool } from "../src/lib/db";

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }
  const out = process.argv[2] || `/tmp/lessons-backup-${(await query(`select current_database() as d`).catch(() => [{ d: "db" }]))[0]?.d}-${Date.now()}.json`;
  const db = (await query(`select current_database() as d`).catch(() => [{ d: "?" }]))[0]?.d;
  const prebuilt = await query(`select slug, title, description, category, level, est_minutes, blueprint, html, content_version, rebuilt_at from prebuilt_lessons order by slug`).catch((e) => { console.error("prebuilt query failed:", e.message); return []; });
  const community = await query(`select slug, title, blueprint, html from community_lessons order by slug`).catch(() => []);
  const payload = { backedUpAt: new Date().toISOString(), db, counts: { prebuilt: prebuilt.length, community: community.length }, prebuilt, community };
  writeFileSync(out, JSON.stringify(payload));
  const mb = (JSON.stringify(payload).length / 1048576).toFixed(1);
  console.log(`✓ backed up ${prebuilt.length} prebuilt + ${community.length} community from "${db}" → ${out} (${mb} MB)`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 200).unref();
}
main().catch((e) => { console.error(e); process.exit(1); });
