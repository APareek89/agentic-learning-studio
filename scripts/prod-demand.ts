/**
 * # Prod demand miner ($0, READ-ONLY) — Phase 2 input
 *
 * Reads DISTINCT learner prompts from the PROD `lessons` table (real demand) to
 * ground the new-topic proposal. SELECT-only. Point DATABASE_URL at PROD for this
 * one command (per HANDOFF §2):
 *   PROD_URL=$(grep '^PROD_DATABASE_URL=' .env | cut -d= -f2-)
 *   NODE_EXTRA_CA_CERTS=".../system-ca-bundle.pem" DATABASE_URL="$PROD_URL" npx tsx scripts/prod-demand.ts
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { query, dbEnabled, rawPool } from "../src/lib/db";

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }
  const dbInfo = await query<{ d: string; inet: string | null }>(
    `select current_database() as d, inet_server_addr()::text as inet`
  ).catch(() => [] as any[]);
  console.log(`DB: ${dbInfo[0]?.d} (server ${dbInfo[0]?.inet ?? "local"})\n`);

  // Distinct prompts + how many times each was asked + kinds + recency.
  const rows = await query<{ prompt: string; n: string; kinds: string; first_at: string; last_at: string }>(
    `select btrim(prompt) as prompt,
            count(*)::text as n,
            string_agg(distinct kind, ',') as kinds,
            min(created_at)::text as first_at,
            max(created_at)::text as last_at
       from lessons
      where prompt is not null and btrim(prompt) <> ''
      group by btrim(prompt)
      order by count(*) desc, max(created_at) desc`
  ).catch((e) => { console.error("query failed:", (e as Error).message); return []; });

  const totalGen = await query<{ n: string }>(`select count(*)::text as n from lessons`).catch(() => [{ n: "?" }]);
  const byKind = await query<{ kind: string; n: string }>(
    `select kind, count(*)::text as n from lessons group by kind order by count(*) desc`
  ).catch(() => []);

  console.log(`Total lessons rows: ${totalGen[0]?.n} · distinct prompts: ${rows.length}`);
  console.log(`By kind: ${byKind.map((k) => `${k.kind}=${k.n}`).join(" · ")}\n`);
  console.log(`${"×".padEnd(5)}${"kinds".padEnd(24)}prompt`);
  console.log("-".repeat(110));
  for (const r of rows) {
    console.log(`${String(r.n).padEnd(5)}${(r.kinds || "").slice(0, 22).padEnd(24)}${(r.prompt || "").replace(/\s+/g, " ").slice(0, 120)}`);
  }

  writeFileSync("docs/prod-demand.json", JSON.stringify({ generatedAt: new Date().toISOString(), db: dbInfo[0]?.d, totalRows: Number(totalGen[0]?.n) || 0, distinctPrompts: rows.length, prompts: rows }, null, 2));
  console.log(`\n✓ → docs/prod-demand.json`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 200).unref();
}
main().catch((e) => { console.error(e); process.exit(1); });
