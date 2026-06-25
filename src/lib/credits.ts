/**
 * # Lesson credits — balance, top-up, spend (graceful-optional)
 *
 * One completed lesson build (`/api/build` success) costs ONE credit. The free
 * overview/preview costs nothing. Credits are stored as LOTS (see migration 0013):
 * each purchase/grant is a row with its own `expires_at` + `lessons_remaining`, so
 * 12-month expiry needs no sweep job — expired lots just drop out of the balance
 * query. A spend decrements the OLDEST non-expired lot (FIFO).
 *
 * Graceful-optional: with no DATABASE_URL every function is a safe no-op
 * (`getBalance` → 0, `spendOne` → false) so local/auth-off dev keeps working and
 * the gate naturally disables itself.
 */

import { query, rawPool, dbEnabled } from "./db";

/** Lots (and the free grant) expire 12 months after they're created. */
const CREDIT_TTL = "12 months";
/** Every signed-in user gets this many free lesson credits, once. */
export const FREE_GRANT_LESSONS = 1;

export interface AddCreditsOpts {
  reason: "purchase" | "grant" | "admin";
  planId?: string;
  amountUsd?: number;
  code?: string;
  /** UNIQUE per top-up → webhook retries are idempotent. */
  lsOrderId?: string;
  /** Override the default 12-month TTL (null = never expires). */
  ttl?: string | null;
}

/** Current spendable balance: sum of non-expired lots with credits left. */
export async function getBalance(userId: string): Promise<number> {
  if (!userId || !dbEnabled()) return 0;
  const rows = await query<{ bal: string }>(
    `select coalesce(sum(lessons_remaining), 0) as bal
       from credit_lots
      where user_id = $1
        and lessons_remaining > 0
        and (expires_at is null or expires_at > now())`,
    [userId]
  );
  return Number(rows[0]?.bal ?? 0);
}

/**
 * Add a top-up. INSERTs the lot then a matching +N ledger row, atomically. The
 * `ls_order_id` UNIQUE constraint makes this idempotent: a duplicate webhook (or a
 * second free-grant) inserts nothing and writes no ledger row. Returns whether new
 * credit was actually added (false = duplicate/no-op).
 */
export async function addCredits(
  userId: string,
  lessons: number,
  opts: AddCreditsOpts
): Promise<{ credited: boolean; balance: number }> {
  if (!userId || lessons <= 0 || !dbEnabled()) return { credited: false, balance: 0 };
  const pool = rawPool();
  if (!pool) return { credited: false, balance: 0 };
  const ttl = opts.ttl === undefined ? CREDIT_TTL : opts.ttl;
  const expiresExpr = ttl == null ? "null" : `now() + interval '${ttl}'`;
  const client = await pool.connect();
  try {
    await client.query("begin");
    const ins = await client.query(
      `insert into credit_lots
         (user_id, lessons_remaining, lessons_total, reason, plan_id, amount_usd, code, ls_order_id, expires_at)
       values ($1, $2, $2, $3, $4, $5, $6, $7, ${expiresExpr})
       on conflict (ls_order_id) do nothing
       returning id`,
      [userId, lessons, opts.reason, opts.planId ?? null, opts.amountUsd ?? null, opts.code ?? null, opts.lsOrderId ?? null]
    );
    const credited = (ins.rowCount ?? 0) > 0;
    if (credited) {
      await client.query(
        `insert into credit_ledger (user_id, delta, reason, plan_id, amount_usd, ls_order_id)
         values ($1, $2, $3, $4, $5, $6)`,
        [userId, lessons, opts.reason, opts.planId ?? null, opts.amountUsd ?? null, opts.lsOrderId ?? null]
      );
    }
    await client.query("commit");
    const balance = await getBalance(userId);
    return { credited, balance };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Grant the one-time free credit. Idempotent via ls_order_id = 'grant:<userId>',
 * so calling it on every page load / build is safe — only the first one credits.
 */
export async function ensureFreeGrant(userId: string): Promise<number> {
  if (!userId || !dbEnabled()) return 0;
  const { balance } = await addCredits(userId, FREE_GRANT_LESSONS, {
    reason: "grant",
    planId: "free-grant",
    lsOrderId: `grant:${userId}`,
  });
  return balance;
}

/**
 * Spend one credit off the OLDEST non-expired lot, atomically (row-locked so two
 * concurrent builds can't double-spend the same lot). Writes a −1 ledger row.
 * Returns false when the user has no spendable credit.
 */
export async function spendOne(userId: string): Promise<{ ok: boolean; balance: number }> {
  if (!userId || !dbEnabled()) return { ok: false, balance: 0 };
  const pool = rawPool();
  if (!pool) return { ok: false, balance: 0 };
  const client = await pool.connect();
  try {
    await client.query("begin");
    const upd = await client.query(
      `update credit_lots
          set lessons_remaining = lessons_remaining - 1
        where id = (
          select id from credit_lots
           where user_id = $1
             and lessons_remaining > 0
             and (expires_at is null or expires_at > now())
           order by created_at asc
           for update skip locked
           limit 1
        )
       returning id`,
      [userId]
    );
    const ok = (upd.rowCount ?? 0) > 0;
    if (ok) {
      await client.query(
        `insert into credit_ledger (user_id, delta, reason) values ($1, -1, 'generation')`,
        [userId]
      );
    }
    await client.query("commit");
    const balance = await getBalance(userId);
    return { ok, balance };
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
