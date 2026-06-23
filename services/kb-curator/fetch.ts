/**
 * # fetch — get one detected item's plain-text content (cheap → expensive)
 *
 * Escalation ladder (only as far as needed):
 *   1. plain `fetch` (HTML stripped to text) — covers most release notes, RSS
 *      bodies, arXiv abstracts, docs pages.
 *   2. Playwright — LAZY dynamic import of the OPTIONAL `playwright` dep; used only
 *      for JS-rendered pages and only if the dep is installed.
 *   3. Firecrawl — used only when KB_FETCHER=firecrawl AND FIRECRAWL_API_KEY is set.
 *
 * Many items already carry their text from the detector (a release body, an RSS
 * summary, an arXiv abstract). When that's present and substantial we skip the
 * network entirely. We also:
 *   - rate-limit per host (polite spacing between requests to the same domain),
 *   - respect robots.txt for the page-fetch path (best-effort, cached per host),
 *   - cache the raw fetched bytes to an os.tmpdir() subdir (ephemeral) for audit.
 */

import { mkdir, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sha256 } from "../../src/lib/hash";
import type { SourceDef, DetectedItem, FetchedDoc } from "./types";

const UA = "agentic-learning-studio-kb-curator/0.1 (+https://github.com/APareek89/agentic-learning-studio)";
const MIN_HOST_GAP_MS = 1200; // polite spacing between hits to the same host
const RAW_CACHE_DIR = join(tmpdir(), "als-kb-curator-cache");

// Per-host last-request timestamp (rate limiter) + robots cache (per process).
const lastHit = new Map<string, number>();
const robotsCache = new Map<string, RobotsRules>();

interface RobotsRules {
  /** Disallow path prefixes that apply to `*` (or our UA). Empty = allow all. */
  disallow: string[];
}

/** Sleep helper for the rate limiter. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Throttle: ensure at least MIN_HOST_GAP_MS between requests to the same host. */
async function throttle(host: string): Promise<void> {
  const prev = lastHit.get(host) ?? 0;
  const wait = prev + MIN_HOST_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastHit.set(host, Date.now());
}

/** Strip HTML to plain text (mirrors src/rag/loaders' stripHtml, kept local). */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Best-effort robots.txt parse: collect Disallow lines under `*` (or our UA). */
function parseRobots(txt: string): RobotsRules {
  const disallow: string[] = [];
  let applies = false;
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [kRaw, ...rest] = line.split(":");
    const k = kRaw.trim().toLowerCase();
    const v = rest.join(":").trim();
    if (k === "user-agent") {
      applies = v === "*" || /kb-curator/i.test(v);
    } else if (k === "disallow" && applies && v) {
      disallow.push(v);
    }
  }
  return { disallow };
}

/** Fetch + cache a host's robots.txt; default to allow-all on any error. */
async function getRobots(origin: string): Promise<RobotsRules> {
  const cached = robotsCache.get(origin);
  if (cached) return cached;
  let rules: RobotsRules = { disallow: [] };
  try {
    const res = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA } });
    if (res.ok) rules = parseRobots(await res.text());
  } catch {
    /* allow-all on failure */
  }
  robotsCache.set(origin, rules);
  return rules;
}

/** True when robots.txt allows fetching `url` for our UA (best-effort). */
async function robotsAllows(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const rules = await getRobots(u.origin);
    return !rules.disallow.some((p) => u.pathname.startsWith(p));
  } catch {
    return true; // malformed URL handled by the fetch itself
  }
}

/** Write the raw content to the ephemeral tmp cache (for audit); never throws. */
async function cacheRaw(item: DetectedItem, content: string): Promise<void> {
  try {
    await mkdir(RAW_CACHE_DIR, { recursive: true });
    const file = join(RAW_CACHE_DIR, `${item.sourceId}-${sha256(item.url).slice(0, 16)}.txt`);
    await writeFile(file, content, "utf8");
  } catch {
    /* cache is best-effort */
  }
}

/** Read a previously-cached raw blob if present (used as a last-resort fallback). */
async function readCache(item: DetectedItem): Promise<string | null> {
  try {
    const file = join(RAW_CACHE_DIR, `${item.sourceId}-${sha256(item.url).slice(0, 16)}.txt`);
    await access(file);
    return await readFile(file, "utf8");
  } catch {
    return null;
  }
}

/** Text the detector already captured (release body / RSS summary / abstract). */
function inlineText(item: DetectedItem): string {
  const raw = item.raw as { summary?: string; content?: string } | undefined;
  if (!raw) return "";
  const html = (raw.content && raw.content.length > (raw.summary?.length ?? 0) ? raw.content : raw.summary) ?? "";
  return stripHtml(html);
}

/** Tier 1: plain fetch + strip. Returns "" on any failure (caller escalates). */
async function fetchPlain(url: string): Promise<string> {
  try {
    const u = new URL(url);
    await throttle(u.host);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25_000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
      if (!res.ok) return "";
      const ct = res.headers.get("content-type") ?? "";
      const body = await res.text();
      return /html|xml/i.test(ct) ? stripHtml(body) : body.replace(/\s+/g, " ").trim();
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return "";
  }
}

/** Tier 2: Playwright (LAZY optional import). Returns "" if dep missing/fails. */
async function fetchPlaywright(url: string): Promise<string> {
  try {
    // Optional dependency — import dynamically so a missing package can't break tsc/runtime.
    const mod: unknown = await import("playwright").catch(() => null);
    if (!mod) return "";
    const { chromium } = mod as { chromium: { launch(o?: unknown): Promise<PwBrowser> } };
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await (await browser.newContext({ userAgent: UA })).newPage();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      const text = await page.evaluate(() => document.body?.innerText ?? "");
      return text.replace(/\s+/g, " ").trim();
    } finally {
      await browser.close();
    }
  } catch {
    return "";
  }
}

// Minimal structural typing for the lazily-imported Playwright surface we touch.
interface PwBrowser {
  newContext(o?: unknown): Promise<{ newPage(): Promise<PwPage> }>;
  close(): Promise<void>;
}
interface PwPage {
  goto(url: string, o?: unknown): Promise<unknown>;
  evaluate(fn: () => string): Promise<string>;
}

/** Tier 3: Firecrawl scrape API (only when configured). Returns "" otherwise. */
async function fetchFirecrawl(url: string): Promise<string> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (process.env.KB_FETCHER !== "firecrawl" || !key) return "";
  try {
    const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: ["markdown"] }),
    });
    if (!res.ok) return "";
    const data = (await res.json()) as { data?: { markdown?: string } };
    return (data.data?.markdown ?? "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

/**
 * Fetch one detected item's plain-text content.
 *
 * Order: inline detector text → plain fetch → Playwright → Firecrawl → cache.
 * Robots is checked only for the network page-fetch path. The result is cached to
 * tmp and returned as a FetchedDoc; content may be "" if everything failed (the
 * caller then drops the item).
 */
export async function fetchItem(_src: SourceDef, item: DetectedItem): Promise<FetchedDoc> {
  const fetchedAt = new Date().toISOString();
  const base: Omit<FetchedDoc, "content"> = { sourceId: item.sourceId, url: item.url, title: item.title, fetchedAt };

  // 1. Inline text the detector already has (release body / summary / abstract).
  const inline = inlineText(item);
  // Substantial inline text is enough — skip the network entirely.
  if (inline.length >= 240) {
    await cacheRaw(item, inline);
    return { ...base, content: inline };
  }

  // 2–4. Network escalation, robots-gated.
  let content = "";
  if (await robotsAllows(item.url)) {
    content = await fetchPlain(item.url);
    if (content.length < 240) {
      const pw = await fetchPlaywright(item.url);
      if (pw.length > content.length) content = pw;
    }
    if (content.length < 240) {
      const fc = await fetchFirecrawl(item.url);
      if (fc.length > content.length) content = fc;
    }
  }

  // Fall back to whatever inline text we had, then to a prior cache.
  if (content.length < 80 && inline.length > content.length) content = inline;
  if (content.length < 80) content = (await readCache(item)) ?? content;

  if (content) await cacheRaw(item, content);
  return { ...base, content };
}
