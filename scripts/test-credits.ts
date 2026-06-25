/**
 * test-credits — exercises the credit mechanics against the configured DB (staging).
 * NO model credits used. Creates rows under a throwaway user id and cleans them up.
 *
 *   NODE_EXTRA_CA_CERTS=... npx tsx scripts/test-credits.ts
 */
import "dotenv/config";
import { getBalance, ensureFreeGrant, addCredits, spendOne } from "../src/lib/credits";
import { query, rawPool } from "../src/lib/db";

const U = `test-credits-${process.pid}-${Math.floor(Math.random() * 1e6)}`;
let fails = 0;
function check(name: string, cond: boolean, got?: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.log(`  ✗ ${name}  (got: ${JSON.stringify(got)})`); fails++; }
}

async function main() {
  console.log(`\nTest user: ${U}\n`);

  check("fresh balance is 0", (await getBalance(U)) === 0);

  const g1 = await ensureFreeGrant(U);
  check("free grant → balance 1", g1 === 1, g1);
  const g2 = await ensureFreeGrant(U);
  check("free grant is idempotent (still 1)", g2 === 1, g2);

  const buy = await addCredits(U, 10, { reason: "purchase", planId: "trial-launch", amountUsd: 5, lsOrderId: "test-order-1" });
  check("purchase 10 → credited true, balance 11", buy.credited === true && buy.balance === 11, buy);

  const dup = await addCredits(U, 10, { reason: "purchase", planId: "trial-launch", amountUsd: 5, lsOrderId: "test-order-1" });
  check("duplicate order → credited false, balance still 11 (idempotent)", dup.credited === false && dup.balance === 11, dup);

  const s1 = await spendOne(U); const s2 = await spendOne(U); const s3 = await spendOne(U);
  check("spend 3 → ok each, balance 8", s1.ok && s2.ok && s3.ok && s3.balance === 8, [s1, s2, s3]);

  // FIFO: the oldest lot (the 1-credit free grant) should be exhausted first.
  const lots = await query<{ plan_id: string; lessons_remaining: number; lessons_total: number }>(
    `select plan_id, lessons_remaining, lessons_total from credit_lots where user_id=$1 order by created_at asc`, [U]
  );
  const free = lots.find((l) => l.plan_id === "free-grant");
  const trial = lots.find((l) => l.plan_id === "trial-launch");
  check("FIFO: free-grant lot drained to 0 first", !!free && free.lessons_remaining === 0, free);
  check("FIFO: trial lot took the rest (8 of 10)", !!trial && trial.lessons_remaining === 8, trial);

  // Expiry: an already-expired lot must NOT count toward the balance.
  const exp = await addCredits(U, 5, { reason: "purchase", planId: "lessons-payg", lsOrderId: "test-expired", ttl: "-1 hour" });
  check("expired lot credited but excluded from balance (still 8)", exp.credited === true && exp.balance === 8, exp);

  // Ledger sanity: +1 grant, +10 purchase, -1 ×3 generation, +5 expired purchase = 13.
  // (The expired lot's purchase still belongs in the audit trail — only the balance excludes it.)
  const led = await query<{ s: string }>(`select coalesce(sum(delta),0) s from credit_ledger where user_id=$1`, [U]);
  check("ledger sums to 13 (1+10-3+5, audit independent of expiry)", Number(led[0]?.s) === 13, led[0]);

  // ---- cleanup ----
  await query(`delete from credit_lots where user_id=$1`, [U]);
  await query(`delete from credit_ledger where user_id=$1`, [U]);
  console.log(`\n${fails === 0 ? "✓ ALL PASS" : `✗ ${fails} FAILED`}\n`);
  await rawPool()?.end();
  process.exit(fails === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
