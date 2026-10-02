/** PostgreSQL connection and authenticated data scope. Public catalog reads do not need an actor. */
import pg from "pg";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";

const actors = new AsyncLocalStorage<{ userId: string }>();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only call at a trusted session boundary, or for a previously authenticated queued job. */
export function runWithUser<T>(userId: string, fn: () => T): T {
  if (!UUID.test(userId)) throw Object.assign(new Error("Authentication required"), { status: 401 });
  return actors.run({ userId }, fn);
}
export function currentUserId(): string | undefined { return actors.getStore()?.userId; }
export function requireUserId(expectedId?: string): string {
  const userId = currentUserId();
  if (!userId) throw Object.assign(new Error("Authentication required"), { status: 401 });
  if (expectedId !== undefined && expectedId !== userId) throw Object.assign(new Error("Access denied"), { status: 403 });
  return userId;
}

let pool: pg.Pool | null | undefined;
function getPool(): pg.Pool | null {
  if (pool !== undefined) return pool;
  const url = process.env.DATABASE_URL;
  if (!url || url.includes("[YOUR-PASSWORD]")) return pool = null;
  const connection = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(connection.hostname);
  // Prevent URL sslmode flags from overriding the explicit verified TLS configuration.
  for (const key of [...connection.searchParams.keys()]) if (key.toLowerCase().startsWith("ssl")) connection.searchParams.delete(key);
  if (process.env.DATABASE_SSL === "disable" && !local) throw new Error("Unencrypted database connections require loopback");
  const caFile = process.env.DATABASE_SSL_CA_FILE;
  pool = new pg.Pool({
    connectionString: connection.toString(),
    ssl: process.env.DATABASE_SSL === "disable" ? false : caFile ? { ca: readFileSync(caFile, "utf8"), rejectUnauthorized: true } : { rejectUnauthorized: true },
    max: 6,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
  });
  return pool;
}
export function dbEnabled(): boolean { return getPool() !== null; }
export function ragEnabled(): boolean { return dbEnabled(); }
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const p = getPool();
  if (!p) return [];
  return (await p.query(text, params as never[])).rows as T[];
}
export function rawPool(): pg.Pool | null { return getPool(); }
/** Used by isolated test processes and orderly shutdown, never while requests are running. */
export async function closePool(): Promise<void> { if (pool) await pool.end(); pool = undefined; }
