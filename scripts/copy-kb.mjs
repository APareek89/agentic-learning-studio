/**
 * Copy the RAG knowledge base (and other shareable reference tables) from one
 * Supabase project to another — e.g. PROD → STAGING so staging generations are
 * grounded without re-ingesting. Read-only on the SOURCE; idempotent on TARGET
 * (`on conflict do nothing`). Skips generated columns (e.g. chunks.content_tsv).
 *
 * Reference data only — NOT user lessons (use copy-user-data.mjs for those).
 *
 * Usage (TARGET = your .env DATABASE_URL, e.g. staging):
 *   SRC_DATABASE_URL="<prod session-pooler URI>" node scripts/copy-kb.mjs
 */
import "dotenv/config";
import pg from "pg";

const SRC = process.env.SRC_DATABASE_URL;
const DST = process.env.DATABASE_URL;
if (!SRC || !DST) { console.error("Need SRC_DATABASE_URL (source) and DATABASE_URL (target, from .env)."); process.exit(1); }
if (SRC === DST) { console.error("SRC and DST are the same DB — aborting."); process.exit(1); }

// Reference tables to copy (skipped silently if a table doesn't exist in the source).
const TABLES = ["documents", "chunks", "glossary", "kb_updates"];

const src = new pg.Client({ connectionString: SRC, ssl: { rejectUnauthorized: false } });
const dst = new pg.Client({ connectionString: DST, ssl: { rejectUnauthorized: false } });
await src.connect();
await dst.connect();

for (const table of TABLES) {
  // Real, non-generated columns only (you can't INSERT into a generated column like content_tsv).
  const colRes = await src.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name=$1 and is_generated='NEVER'
      order by ordinal_position`, [table]
  );
  if (!colRes.rows.length) { console.log(`= skip ${table} (not found)`); continue; }
  const cols = colRes.rows.map((r) => r.column_name);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  const params = cols.map((_, i) => `$${i + 1}`).join(", ");

  const rows = (await src.query(`select ${colList} from "${table}"`)).rows;
  let n = 0;
  for (const r of rows) {
    const vals = cols.map((c) => r[c]);
    await dst.query(`insert into "${table}" (${colList}) values (${params}) on conflict do nothing`, vals)
      .then(() => { n++; })
      .catch((e) => console.warn(`  ! ${table} row skipped: ${e.message.slice(0, 80)}`));
  }
  console.log(`✓ ${table}: copied ${n}/${rows.length}`);
}

await src.end();
await dst.end();
console.log("\n✓ KB copy done.\n");
