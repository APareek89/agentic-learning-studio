/**
 * # Artifact registry — durable, user-scoped store for generated lessons
 *
 * Each generation produces a self-contained interactive HTML "artifact" plus the
 * Blueprint that backs on-demand module builds. We persist both to Postgres (the
 * `lessons` table) so they survive a server restart — the old in-memory-only Map
 * lost everything on every Render redeploy, which is what caused "Artifact not
 * found (it may have expired on restart)" and the broken Download button.
 *
 * Design: a small in-memory LRU-ish cache sits in front of the DB so the viewer's
 * immediate post-generation fetch is instant; on a cache miss (e.g. after a
 * restart) we hydrate from the DB. When no DATABASE_URL is configured we degrade
 * gracefully to memory-only (single-process dev), exactly as before.
 *
 * Recurring terms (defined once):
 *   - "artifact": one generated interactive learning page.
 *   - "id": a unique label so we can find an artifact again later.
 *   - "Blueprint": the typed JSON the renderer turns into the page.
 */

import { randomUUID } from "node:crypto";
import type { Blueprint } from "../render/schema";
import { dbEnabled, query, requireUserId } from "./db";

/** The shape of one stored artifact. */
export interface StoredArtifact {
  id: string;
  kind: string; // e.g. "learning-artifact"
  title: string;
  html: string;
  blueprint?: Blueprint;
  // The learner's upload context, so on-demand module builds ground the same way.
  uploadIds?: string[];
  referOnly?: boolean;
  // Ownership + dashboard context (persisted; optional for memory-only mode).
  userId?: string;
  userEmail?: string;
  prompt?: string;
  cards?: Record<string, unknown>;
  profile?: unknown;
  // Multi-lesson course position (null for a standalone lesson).
  course?: { id: string; index: number; total: number; title?: string };
}

// In-memory cache (also the only store when the DB is off).
const cache = new Map<string, StoredArtifact>();

/** Coerce a jsonb column to a string[] — older rows stored upload_ids as `{}`/null/a
 *  JSON string, which crashed `ids.some(...)`. Anything that isn't an array → undefined. */
function toStringArray(v: unknown): string[] | undefined {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  if (typeof v === "string") {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : undefined; } catch { return undefined; }
  }
  return undefined;
}
/** Parse a jsonb column that may arrive as a string (driver/encoding differences). */
function maybeParse<T>(v: unknown): T | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") { try { return JSON.parse(v) as T; } catch { return undefined; } }
  return v as T;
}

/**
 * `registerArtifact` — save the HTML (+ Blueprint + ownership) and return a
 * lightweight reference. Persistence succeeds before the cache is published.
 */
export async function registerArtifact(input: {
  kind: string;
  title: string;
  html: string;
  blueprint?: Blueprint;
  uploadIds?: string[];
  referOnly?: boolean;
  userId?: string;
  userEmail?: string;
  prompt?: string;
  cards?: Record<string, unknown>;
  profile?: unknown;
  course?: { id: string; index: number; total: number; title?: string };
}): Promise<{ id: string; kind: string; title: string }> {
  const userId = requireUserId(input.userId);
  const id = randomUUID();
  const art: StoredArtifact = { id, ...input, userId };
  await persist(art);
  cache.set(id, art);
  return { id, kind: input.kind, title: input.title };
}

/** Look one artifact up by id — cache first, then hydrate from the DB. */
export async function getArtifact(id: string, expectedUserId?: string): Promise<StoredArtifact | undefined> {
  const userId = requireUserId(expectedUserId);
  const hit = cache.get(id);
  if (hit) return hit.userId === userId ? hit : undefined;
  if (!dbEnabled()) return undefined;
  const rows = await query<{
    id: string; kind: string; title: string; html: string;
    blueprint: Blueprint | null; upload_ids: string[] | null; refer_only: boolean | null;
    user_id: string | null; user_email: string | null; prompt: string | null;
    cards: Record<string, unknown> | null; profile: unknown;
  }>(
    `select id, kind, title, html, blueprint, upload_ids, refer_only,
            user_id, user_email, prompt, cards, profile
       from lessons where id = $1 and user_id = $2`,
    [id, userId]
  ).catch(() => []);
  if (!rows.length) return undefined;
  const r = rows[0];
  const art: StoredArtifact = {
    id: r.id, kind: r.kind, title: r.title, html: r.html,
    blueprint: maybeParse<Blueprint>(r.blueprint),
    uploadIds: toStringArray(r.upload_ids),
    referOnly: r.refer_only ?? undefined,
    userId: r.user_id ?? undefined, userEmail: r.user_email ?? undefined,
    prompt: r.prompt ?? undefined, cards: maybeParse<Record<string, unknown>>(r.cards), profile: maybeParse<unknown>(r.profile) ?? r.profile,
  };
  cache.set(id, art);
  return art;
}

/** Merge a patch into a stored artifact (e.g. refreshed html after building modules). */
export async function updateArtifact(id: string, patch: Partial<Omit<StoredArtifact, "id" | "userId" | "userEmail">>, expectedUserId?: string): Promise<void> {
  const userId = requireUserId(expectedUserId);
  const a = await getArtifact(id, userId);
  if (!a) return;
  const next = { ...a, ...patch, userId: a.userId, userEmail: a.userEmail };
  if (!dbEnabled()) { cache.set(id, next); return; }
  // Only the fields that change on a rebuild need updating. `kind` is included so the
  // overview-draft → real-lesson promotion (build stage) persists.
  const updated = await query(
    `update lessons set kind = $2, blueprint = $3, html = $4, updated_at = now() where id = $1 and user_id = $5 returning id`,
    [id, next.kind, next.blueprint ?? null, next.html, userId]
  );
  if (updated.length) cache.set(id, next);
}

/** Insert (or upsert) a freshly-generated artifact into the durable store. */
async function persist(a: StoredArtifact): Promise<void> {
  requireUserId(a.userId);
  if (!dbEnabled()) return;
  await query(
    `insert into lessons (id, user_id, user_email, kind, title, prompt, cards, profile, blueprint, html, upload_ids, refer_only,
                          course_id, course_index, course_total, course_title)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     on conflict (id) do update set
       title = excluded.title, blueprint = excluded.blueprint, html = excluded.html, updated_at = now()
       where lessons.user_id = excluded.user_id`,
    [
      a.id, a.userId ?? null, a.userEmail ?? null, a.kind, a.title,
      a.prompt ?? null, JSON.stringify(a.cards ?? {}), a.profile ? JSON.stringify(a.profile) : null,
      a.blueprint ? JSON.stringify(a.blueprint) : null, a.html,
      JSON.stringify(a.uploadIds ?? []), !!a.referOnly,
      a.course?.id ?? null, a.course?.index ?? null, a.course?.total ?? null, a.course?.title ?? null,
    ]
  );
}
