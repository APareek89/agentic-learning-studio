/**
 * # The database layer — Supabase as plain Postgres (graceful-optional)
 *
 * We talk to the existing Supabase project as plain Postgres through the `pg`
 * driver + a `DATABASE_URL` connection string — no Supabase API keys, no
 * row-level security. A server-side Postgres connection has full access, which is
 * what we want for ingestion + retrieval.
 *
 * ## Graceful-optional design (the load-bearing invariant of this whole app)
 * Everything is gated behind `dbEnabled()` / `ragEnabled()`. With no `DATABASE_URL`
 * the helpers do nothing and the app still generates learning artifacts from
 * Claude's own knowledge (just without retrieval/persistence). Only hard
 * requirement for the app: `ANTHROPIC_API_KEY`.
 *
 * Recurring terms (defined once):
 *   - "Postgres": the relational database (stores data in tables = rows × columns).
 *   - "a query": one request to the database (to store rows or read rows back).
 *   - "Promise": a placeholder for a value that isn't ready yet (a slow network
 *     call); `await` pauses for it; an `async` function may use `await`.
 *   - "pool": a set of reusable open connections, so we don't reopen one per query.
 *   - "TLS/SSL": the encryption securing the network connection.
 */

// DEFAULT import — grab the `pg` package's single main export (the Postgres driver).
import pg from "pg";

// ----------------------------------------------------------------------------
// THE CACHED CONNECTION POOL (the "lazy singleton").
// The three states encode our knowledge: a real Pool (DB on), `null` (checked,
// off), or `undefined` (not checked yet). Distinguishing the last two lets
// `getPool()` run its setup exactly once.
// ----------------------------------------------------------------------------
let pool: pg.Pool | null | undefined;

/** Build-once / reuse the pool, or `null` when the database isn't configured. */
function getPool(): pg.Pool | null {
  // If we've already decided once, return that decision and skip the setup below.
  if (pool !== undefined) return pool;
  const url = process.env.DATABASE_URL;
  // DB is OFF if the URL is missing or still the setup placeholder.
  if (!url || url.includes("[YOUR-PASSWORD]")) {
    pool = null;
    return pool;
  }
  // Real URL → build the live pool ONCE and cache it.
  //   - `ssl: { rejectUnauthorized: false }` — encrypt but skip local CA setup.
  //   - `max: 6` — a few connections is plenty for a single-user app.
  pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 6,
  });
  return pool;
}

/** True when a real `DATABASE_URL` is configured (used for saved generations). */
export function dbEnabled(): boolean {
  return getPool() !== null;
}

/**
 * True when RAG (retrieval) is available. Today this is the same condition as
 * `dbEnabled()` (the vector store lives in Postgres). It's a SEPARATE function on
 * purpose so the retriever/embedder can also flip it off later (e.g. if the local
 * embedding model fails to load) without touching the DB check.
 */
export function ragEnabled(): boolean {
  return dbEnabled();
}

/**
 * `query` — run one parameterized SQL statement and return the rows.
 *
 *   - `text` is the SQL with `$1`, `$2`, … placeholders.
 *   - `params` are the values that fill those placeholders. Using placeholders
 *     (instead of pasting values into the string) is what prevents "SQL injection"
 *     — malicious input can't change the command, only fill a slot.
 *   - `<T>` is a "generic": the caller can say what row shape comes back, e.g.
 *     `query<{ id: number }>(...)`, and TypeScript types `rows` accordingly.
 *   - Returns `[]` (and never throws) when the DB is disabled, so callers in the
 *     graceful-optional path don't need their own guard.
 */
export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const p = getPool();
  if (!p) return [];
  const res = await p.query(text, params as never[]);
  return res.rows as T[];
}

/** Hand back the raw pool for the rare case a caller needs a transaction client. */
export function rawPool(): pg.Pool | null {
  return getPool();
}
