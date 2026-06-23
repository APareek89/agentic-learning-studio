/**
 * # KB Curator — shared types
 *
 * The curator is an ADDITIVE service that keeps the knowledge base fresh from a
 * small, license-vetted ALLOWLIST of upstream sources. It runs as a scheduled
 * pipeline:
 *
 *   sources.yaml (SourceDef[])
 *     → detect new items per source         → DetectedItem[]
 *     → fetch each item's content           → FetchedDoc
 *     → check the source's license/IP risk  → IpVerdict
 *     → synthesize a KB note (template or Claude) → SynthResult
 *     → apply (reuse src/rag/store.upsertSource) → ApplyResult
 *     → one RunReport (+ a kb_updates audit row)
 *
 * These interfaces are the contract every stage shares. They are intentionally
 * small and serializable so a stage can be tested in isolation.
 */

/** One entry in the allowlist (`sources.yaml`). The unit the curator polls. */
export interface SourceDef {
  /** Stable id — primary key in the `kb_sources` table and the dedupe key. */
  id: string;
  /** What kind of upstream this is (decides the detector + fetcher). */
  type: "github" | "rss" | "arxiv" | "sitemap";
  /** The URL we poll (releases atom feed, RSS/Atom feed, arXiv query, or sitemap). */
  url: string;
  /** `owner/name` for github sources (used for release/changelog provenance). */
  repo?: string;
  /** The vetted license (MIT / Apache-2.0 / BSD / CC-BY / official-docs / …). */
  license: string;
  /** Fetch strategy: plain fetch first, escalating only when asked. */
  fetch: "auto" | "playwright" | "firecrawl";
  /** KB category bucket (matches the `kb/` folders + `documents.category`). */
  category: string;
}

/** Persisted curator state for a source (mirrors the `kb_sources` row). */
export interface SourceState {
  /** ISO timestamp of the last poll. */
  lastChecked?: string;
  /** Fingerprint of the newest item we've already processed (the change cursor). */
  lastHash?: string;
}

/** A candidate item the detector found for a source (a release, post, paper…). */
export interface DetectedItem {
  /** Which source produced it (back-reference to SourceDef.id). */
  sourceId: string;
  /** Human title (release name, post title, paper title). */
  title: string;
  /** Canonical URL for the item. */
  url: string;
  /** ISO timestamp of the item (published / released at). */
  timestamp: string;
  /** Item flavor, e.g. 'release' | 'post' | 'paper' | 'page'. */
  kind: string;
  /** Stable per-item fingerprint (used as the change cursor / dedupe key). */
  hash?: string;
  /** The raw upstream payload, if the detector wants to pass it through. */
  raw?: unknown;
}

/** The fetched, plain-text content for one detected item. */
export interface FetchedDoc {
  sourceId: string;
  url: string;
  title: string;
  /** Cleaned, plain-text content ready for synthesis (no markup). */
  content: string;
  /** ISO timestamp of when we fetched it. */
  fetchedAt: string;
}

/** The IP / licensing verdict for a source or item (the gate before we keep it). */
export interface IpVerdict {
  /** The license we evaluated. */
  license: string;
  /** Traffic-light risk: green = safe, orange = caution, red = do-not-ingest. */
  risk: "green" | "orange" | "red";
  /** Whether the item is allowed into the KB. */
  allowed: boolean;
  /** Optional human note (why it was flagged / how it's attributed). */
  note?: string;
}

/** A synthesized KB note ready to upsert (Markdown body + frontmatter meta). */
export interface SynthResult {
  /** URL-safe slug → becomes the source id / filename stem in the KB. */
  slug: string;
  /** KB category bucket. */
  category: string;
  /** The note body (Markdown). */
  markdown: string;
  /** Frontmatter fields (title, category, url, license, verdict, as_of_date, …). */
  frontmatter: Record<string, unknown>;
  /** True when this introduces a new topic (vs. updating an existing one). */
  isNewTopic: boolean;
}

/** Counts from applying a batch of synthesized notes to the KB. */
export interface ApplyResult {
  added: number;
  updated: number;
  skipped: number;
  /** Items intentionally dropped (e.g. red IP verdict, empty after fetch). */
  dropped: number;
}

/** The summary of one curator run (logged + used for the Slack/CI report). */
export interface RunReport {
  added: number;
  updated: number;
  skipped: number;
  dropped: number;
  /** How many sources were polled this run. */
  sources: number;
  /** Non-fatal error strings (one per failed source/item). */
  errors: string[];
}
