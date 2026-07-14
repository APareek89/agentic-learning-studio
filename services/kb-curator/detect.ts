/**
 * # detect — per-source adapters that find NEW items
 *
 * One adapter per `SourceDef.type` (github · rss · sitemap · arxiv). Each polls
 * its source's URL and returns the items that are either:
 *   - newer than `now - since` (default 24h), OR
 *   - whose content fingerprint changed vs the stored `kb_sources.last_hash`.
 *
 * The adapters are deliberately tiny + dependency-light: GitHub via its REST/atom
 * feeds (Authorization: Bearer GITHUB_TOKEN when set, to lift the 60/hr anon
 * limit), RSS/Atom + sitemaps via `fast-xml-parser`, arXiv via its Atom export
 * API. State (last_checked / last_hash) lives in the `kb_sources` table and is
 * read/written here via the repo's pg pool (src/lib/db) — the ONLY DB the curator
 * owns. (Learning content still lands in documents/chunks via src/rag/store.)
 */

import { XMLParser } from "fast-xml-parser";
import { rawPool } from "../../src/lib/db";
import { sha256 } from "../../src/lib/hash";
import type { SourceDef, SourceState, DetectedItem } from "./types";

// A single shared XML parser (config: keep attributes, flatten to plain objects).
// `processEntities` limits are raised from fast-xml-parser's defaults (1000
// expansions / 100k chars) because GitHub release-feed (.atom) bodies legitimately
// contain MANY escaped HTML entities (&lt; &gt; &amp; in changelog markup) and
// tripped the default guard. These feeds come from our license-vetted ALLOWLIST
// (not untrusted user XML), so a generous-but-bounded cap keeps the XML-bomb
// protection meaningful while parsing real feeds.
const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  processEntities: { maxTotalExpansions: 1_000_000, maxExpandedLength: 50_000_000 },
});

/** A polite, identifiable UA so upstreams can attribute the curator's polling. */
const UA = "agentic-learning-studio-kb-curator/0.1 (+https://github.com/APareek89/agentic-learning-studio)";

// ----------------------------------------------------------------------------
// State (kb_sources) — load/save the per-source change cursor.
// ----------------------------------------------------------------------------

/** Read one source's persisted state (last_checked / last_hash). `{}` if none. */
export async function loadState(sourceId: string): Promise<SourceState> {
  const pool = rawPool();
  if (!pool) return {};
  const res = await pool.query<{ last_checked: string | null; last_hash: string | null }>(
    `select last_checked, last_hash from kb_sources where id = $1`,
    [sourceId]
  );
  if (!res.rowCount) return {};
  const row = res.rows[0];
  return {
    lastChecked: row.last_checked ? new Date(row.last_checked).toISOString() : undefined,
    lastHash: row.last_hash ?? undefined,
  };
}

/** Upsert one source's row, stamping last_checked (and last_hash when given). */
export async function saveState(src: SourceDef, state: SourceState): Promise<void> {
  const pool = rawPool();
  if (!pool) return;
  await pool.query(
    `insert into kb_sources (id, type, url, repo, category, license, last_checked, last_hash, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now())
     on conflict (id) do update set
       type=excluded.type, url=excluded.url, repo=excluded.repo, category=excluded.category,
       license=excluded.license, last_checked=excluded.last_checked,
       last_hash=coalesce(excluded.last_hash, kb_sources.last_hash), updated_at=now()`,
    [
      src.id,
      src.type,
      src.url,
      src.repo ?? null,
      src.category,
      src.license,
      state.lastChecked ?? new Date().toISOString(),
      state.lastHash ?? null,
    ]
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Fetch text with a timeout + our UA; throws on non-2xx so the source is logged. */
async function getText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** GitHub auth header when a token is configured (lifts the anon rate limit). */
function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } : {};
}

/** Normalize the parser's "maybe array, maybe single" shape into an array. */
function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** True when `iso` parses to a time within the [since, now] window. */
function withinWindow(iso: string | undefined, sinceMs: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return t >= sinceMs;
}

// ----------------------------------------------------------------------------
// Per-type detectors. Each returns the RAW candidate list (pre-window-filter).
// ----------------------------------------------------------------------------

/** GitHub releases via the `<repo>/releases.atom` feed (no API quota needed). */
async function detectGithub(src: SourceDef): Promise<DetectedItem[]> {
  const body = await getText(src.url, githubHeaders());
  const doc = xml.parse(body);
  const entries = asArray<Record<string, unknown>>(doc?.feed?.entry as never);
  return entries.map((e) => {
    const title = String(e.title ?? "").trim() || "release";
    const updated = String(e.updated ?? e.published ?? "");
    const link = e.link as { "@_href"?: string } | { "@_href"?: string }[] | undefined;
    const href = Array.isArray(link) ? link[0]?.["@_href"] : link?.["@_href"];
    const content = typeof e.content === "object" && e.content ? String((e.content as Record<string, unknown>)["#text"] ?? "") : String(e.content ?? "");
    return {
      sourceId: src.id,
      title: src.repo ? `${src.repo} ${title}` : title,
      url: href || src.url,
      timestamp: updated || new Date().toISOString(),
      kind: "release",
      hash: sha256(`${title}|${updated}`),
      raw: { summary: String(e.summary ?? ""), content },
    };
  });
}

/** RSS 2.0 (`channel.item`) or Atom (`feed.entry`) feeds. */
async function detectRss(src: SourceDef): Promise<DetectedItem[]> {
  const body = await getText(src.url);
  const doc = xml.parse(body);

  // RSS 2.0
  const rssItems = asArray<Record<string, unknown>>(doc?.rss?.channel?.item as never);
  if (rssItems.length) {
    return rssItems.map((it) => {
      const title = String(it.title ?? "").trim() || "post";
      const pub = String(it.pubDate ?? it["dc:date"] ?? "");
      const ts = pub ? new Date(pub).toISOString() : new Date().toISOString();
      return {
        sourceId: src.id,
        title,
        url: String(it.link ?? src.url),
        timestamp: ts,
        kind: "post",
        hash: sha256(`${title}|${pub}`),
        raw: { summary: String(it.description ?? it["content:encoded"] ?? "") },
      };
    });
  }

  // Atom
  const atomEntries = asArray<Record<string, unknown>>(doc?.feed?.entry as never);
  return atomEntries.map((e) => {
    const title = String(e.title ?? "").trim() || "post";
    const updated = String(e.updated ?? e.published ?? "");
    const link = e.link as { "@_href"?: string } | { "@_href"?: string }[] | undefined;
    const href = Array.isArray(link) ? link[0]?.["@_href"] : link?.["@_href"];
    return {
      sourceId: src.id,
      title,
      url: href || src.url,
      timestamp: updated || new Date().toISOString(),
      kind: "post",
      hash: sha256(`${title}|${updated}`),
      raw: { summary: String(e.summary ?? "") },
    };
  });
}

/** A sitemap.xml `<urlset>` — uses `<lastmod>` as the change signal per URL. */
async function detectSitemap(src: SourceDef): Promise<DetectedItem[]> {
  const body = await getText(src.url);
  const doc = xml.parse(body);
  const urls = asArray<Record<string, unknown>>(doc?.urlset?.url as never);
  return urls
    .map((u) => {
      const loc = String(u.loc ?? "").trim();
      if (!loc) return null;
      const lastmod = String(u.lastmod ?? "");
      const ts = lastmod ? new Date(lastmod).toISOString() : new Date().toISOString();
      return {
        sourceId: src.id,
        title: loc.replace(/^https?:\/\//, ""),
        url: loc,
        timestamp: ts,
        kind: "page",
        hash: sha256(`${loc}|${lastmod}`),
      } as DetectedItem;
    })
    .filter((x): x is DetectedItem => x !== null);
}

/** arXiv Atom export API (`feed.entry`) — the abstract is the synthesizable text. */
async function detectArxiv(src: SourceDef): Promise<DetectedItem[]> {
  const body = await getText(src.url);
  const doc = xml.parse(body);
  const entries = asArray<Record<string, unknown>>(doc?.feed?.entry as never);
  return entries.map((e) => {
    const title = String(e.title ?? "").replace(/\s+/g, " ").trim() || "paper";
    const published = String(e.published ?? e.updated ?? "");
    const ts = published ? new Date(published).toISOString() : new Date().toISOString();
    const id = String(e.id ?? "");
    const summary = String(e.summary ?? "").replace(/\s+/g, " ").trim();
    return {
      sourceId: src.id,
      title,
      url: id || src.url,
      timestamp: ts,
      kind: "paper",
      hash: sha256(`${title}|${id}`),
      raw: { summary },
    };
  });
}

// ----------------------------------------------------------------------------
// Public: detect a source's NEW items (window + last-hash gated).
// ----------------------------------------------------------------------------

/**
 * Detect new items for one source.
 *
 * @param src      the allowlist entry to poll.
 * @param state    its persisted cursor (loadState()).
 * @param sinceMs  epoch-ms lower bound (now - since). Items at/after this pass.
 *
 * Returns items that are inside the window OR whose hash differs from
 * `state.lastHash`. Always keeps the freshest item if its hash changed, so a
 * burst-then-quiet source still surfaces its latest once.
 */
export async function detectSource(src: SourceDef, state: SourceState, sinceMs: number): Promise<DetectedItem[]> {
  let items: DetectedItem[];
  switch (src.type) {
    case "github":
      items = await detectGithub(src);
      break;
    case "rss":
      items = await detectRss(src);
      break;
    case "sitemap":
      items = await detectSitemap(src);
      break;
    case "arxiv":
      items = await detectArxiv(src);
      break;
    default:
      return [];
  }

  // Sort newest-first so the "top item" is the change cursor.
  items.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const fresh = items.filter((it) => withinWindow(it.timestamp, sinceMs));

  // FIRST-EVER POLL (a never-checked source: no persisted cursor at all) → BACKFILL.
  // A newly-allowlisted source's latest item usually predates the 24h delta window,
  // so the change-cursor path below would surface only ONE item — and the source would
  // then trickle a single item per run forever. That is exactly the "curator only
  // refreshes, never adds breadth" failure from the KB gap report: adding a source did
  // little because it never backfilled. On first contact, seed the newest N (items are
  // already sorted newest-first) so a new source contributes real breadth immediately.
  // index.ts still caps this to KB_MAX_ITEMS_PER_SOURCE, so a cold run stays bounded.
  const neverChecked = !state.lastChecked && !state.lastHash;
  if (neverChecked && items.length > 0) {
    const backfill = Number(process.env.KB_FIRST_POLL_BACKFILL) || 8;
    return items.slice(0, Math.max(backfill, fresh.length));
  }

  // If nothing is in the window but the newest item's hash changed vs. last seen,
  // surface JUST that one (covers slow feeds on an ALREADY-known source).
  if (fresh.length === 0 && items.length > 0) {
    const top = items[0];
    if (top.hash && top.hash !== state.lastHash) return [top];
    return [];
  }
  return fresh;
}
