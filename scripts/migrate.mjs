/**
 * # Migration runner — applies every `supabase/migrations/*.sql` in order
 *
 * Generalized from the SEO agent's single-file runner: it now globs the
 * migrations folder, sorts the files by name (so `0001_…` runs before `0002_…`),
 * and runs each as ONE simple query over the Supabase Session pooler (which
 * dislikes multi-statement prepared batches). Idempotent SQL → safe to re-run.
 *
 * Usage: put your Session-pooler connection string in `.env` as DATABASE_URL, then
 *   npm run migrate
 */

import "dotenv/config";
import pg from "pg";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const url = process.env.DATABASE_URL;
if (!url || url.includes("[YOUR-PASSWORD]")) {
  console.error(
    "\n✗ DATABASE_URL is not set (or still has the [YOUR-PASSWORD] placeholder).\n" +
      "  Paste your Supabase Session-pooler URI into .env and run `npm run migrate` again.\n"
  );
  process.exit(1);
}

// Resolve the migrations folder relative to THIS script, then list + sort *.sql.
const dir = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
if (files.length === 0) {
  console.error("✗ No .sql files found in supabase/migrations/");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  for (const file of files) {
    const sql = await readFile(dir + file, "utf8");
    process.stdout.write(`  • applying ${file} … `);
    await client.query(sql); // one whole file = one simple query (pooler-safe)
    console.log("ok");
  }
  console.log("\n✓ All migrations applied.\n");
} catch (err) {
  console.error("\n✗ Migration failed:", err.message);
  console.error(
    '  Tip: if it is a connection error, use the IPv4 "Session pooler" URI from\n' +
      "  Supabase → Connect (the direct db.<ref> host is IPv6-only).\n"
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
