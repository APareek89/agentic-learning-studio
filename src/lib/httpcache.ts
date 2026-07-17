/**
 * # Public HTTP caching — headers for the CDN edge + a tiny origin render cache
 *
 * The bot crawl (Amazonbot, Semrush, Slack) re-renders public lesson pages from the
 * blueprint on every hit — pure wasted CPU/memory, and a contributor to the 2GB OOM
 * pressure. These helpers make those pages cacheable:
 *
 *   1. `publicCache(res, …)` sets Cache-Control so a CDN in front (Cloudflare) can serve
 *      a copy from its edge instead of hitting Render. `s-maxage` is the SHARED (CDN) TTL;
 *      `max-age` is the visitor's browser TTL; `stale-while-revalidate` lets the edge serve
 *      instantly while it refreshes in the background. ONLY for responses that are identical
 *      for every visitor and carry no auth/personalization — never an authed or per-user page.
 *   2. `cachedHtml(key, …)` memoises an expensive render in-process, so even a CDN MISS
 *      (each Cloudflare PoP fills its cache independently, and bots arrive from many regions)
 *      is cheap. Not shared across instances — the CDN is the real shared layer; this just
 *      keeps origin misses from re-rendering.
 *
 * Safe to cache here: library + community lessons and the SEO/guide pages are the SAME for
 * everyone and fully built (no in-progress stubs, unlike /api/artifact/:id). Rebuilds are
 * rare and manual, so a short TTL bounds any staleness to minutes.
 */

import type { Response } from "express";

/** Public, identical-for-everyone response. `browserS` = browser TTL (s), `edgeS` = CDN TTL (s). */
export function publicCache(res: Response, browserS: number, edgeS: number): void {
  res.setHeader(
    "Cache-Control",
    `public, max-age=${browserS}, s-maxage=${edgeS}, stale-while-revalidate=86400`,
  );
}

// Bounded in-process TTL cache. Insertion-order eviction (Map preserves it) once over MAX.
const store = new Map<string, { html: string; exp: number }>();
const MAX = 300;

/** Return a cached render for `key`, or run `make()`, store it for `ttlMs`, and return it.
 *  `make` must be pure w.r.t. `key` (same key ⇒ same HTML) — the lesson slug qualifies,
 *  since the render depends only on the stored blueprint. Only successful renders are cached
 *  (a throwing `make` is not stored). */
export function cachedHtml(key: string, ttlMs: number, make: () => string): string {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.exp > now) return hit.html;
  const html = make();
  store.set(key, { html, exp: now + ttlMs });
  if (store.size > MAX) {
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  return html;
}
