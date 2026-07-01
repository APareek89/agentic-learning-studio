/**
 * # Library (prebuilt) lessons — read helpers for the PUBLIC, crawlable SEO pages.
 *
 * A thin READ layer over `prebuilt_lessons` — the SAME table `/api/library` and
 * `/api/lesson/:slug` already use. Purely ADDITIVE: nothing here changes those API
 * routes. Graceful-optional (like community.ts / lessons.ts): every function degrades
 * to empty/null when the DB is off, so the server still boots and the SEO routes just
 * render an empty index instead of crashing.
 */

import { dbEnabled, query } from "./db";
import type { Blueprint } from "../render/schema";

/** A library lesson summary (for the /library index, related lists, and /sitemap.xml). */
export interface LibraryCard {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string | null;
  estMinutes: number | null;
  /** YYYY-MM-DD for <lastmod> (rebuilt_at ?? created_at); null when unavailable. */
  lastmod: string | null;
}

/** A full library lesson (the re-render source for /library/:slug). */
export interface LibraryLesson {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string | null;
  estMinutes: number | null;
  blueprint: Blueprint | null;
  html: string;
}

/** jsonb may arrive as an object (pg auto-parse) or a string — normalize to Blueprint|null. */
function parseBlueprint(v: unknown): Blueprint | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as Blueprint; } catch { return null; } }
  return v as Blueprint;
}

/** Every library lesson (for the /library index + /sitemap.xml). Ordered by category, then length. */
export async function listLibrary(): Promise<LibraryCard[]> {
  if (!dbEnabled()) return [];
  const rows = await query<{
    slug: string; title: string; description: string | null; category: string | null;
    level: string | null; est_minutes: number | null; lastmod: string | null;
  }>(
    `select slug, title, description, category, level, est_minutes,
            to_char(coalesce(rebuilt_at, created_at), 'YYYY-MM-DD') as lastmod
       from prebuilt_lessons
      order by category nulls last, est_minutes nulls last, title`
  ).catch(() => []);
  return rows.map((r) => ({
    slug: r.slug, title: r.title, description: r.description, category: r.category,
    level: r.level, estMinutes: r.est_minutes, lastmod: r.lastmod,
  }));
}

/** One library lesson by slug (re-render source for /library/:slug). Null when missing / DB off. */
export async function getLibraryLesson(slug: string): Promise<LibraryLesson | null> {
  if (!dbEnabled()) return null;
  const rows = await query<{
    slug: string; title: string; description: string | null; category: string | null;
    level: string | null; est_minutes: number | null; blueprint: unknown; html: string;
  }>(
    `select slug, title, description, category, level, est_minutes, blueprint, html
       from prebuilt_lessons where slug = $1 limit 1`,
    [slug]
  ).catch(() => []);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    slug: r.slug, title: r.title, description: r.description, category: r.category,
    level: r.level, estMinutes: r.est_minutes, blueprint: parseBlueprint(r.blueprint), html: r.html,
  };
}

/** A few OTHER lessons in the same category — for the "Related lessons" footer (internal links). */
export async function relatedLibrary(slug: string, category: string | null, limit = 4): Promise<LibraryCard[]> {
  if (!dbEnabled()) return [];
  const rows = await query<{
    slug: string; title: string; description: string | null; category: string | null;
    level: string | null; est_minutes: number | null;
  }>(
    `select slug, title, description, category, level, est_minutes
       from prebuilt_lessons
      where slug <> $1 and ($2::text is null or category = $2)
      order by est_minutes nulls last, title
      limit $3`,
    [slug, category, limit]
  ).catch(() => []);
  return rows.map((r) => ({
    slug: r.slug, title: r.title, description: r.description, category: r.category,
    level: r.level, estMinutes: r.est_minutes, lastmod: null,
  }));
}
