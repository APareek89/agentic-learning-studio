/**
 * # synthesize — turn a fetched item into an ORIGINAL KB note (our format)
 *
 * Writes/updates a topic's `.md` in the SAME frontmatter contract the KB uses
 * (title · category · url · license · verdict · as_of_date · sources), with an
 * appended "What's new (<UTC date>)" section. The body is ORIGINAL prose — never
 * verbatim copying (at most ONE short attributed quote, ≤25 words, only when
 * needed) — matching KB_CONTENT_POLICY.md.
 *
 * Two synthesis paths:
 *   - DETERMINISTIC TEMPLATE (default, $0): a structured changelog-style note.
 *     This is the standalone path — it MUST work with no model and no balance.
 *   - OPTIONAL Claude prose (Haiku via ANTHROPIC_MODEL_HAIKU) when
 *     ANTHROPIC_API_KEY is set, behind a HARD per-run token cap. On ANY failure
 *     (no key, empty balance, cap hit, parse error) it gracefully falls back to
 *     the template — synthesis never throws.
 *
 * For an EXISTING topic doc we UPDATE in place: keep the original body, refresh
 * `as_of_date` + merge the source, and prepend the new "What's new" section under
 * the frontmatter. For a NEW topic we author the whole note.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceDef, DetectedItem, FetchedDoc, IpVerdict, SynthResult } from "./types";

// Repo-root kb/ (relative to this file URL via new URL()).
const KB_ROOT = fileURLToPath(new URL("../../kb/", import.meta.url));

// Per-run token budget for the OPTIONAL Claude path (input+output, approx).
const PER_RUN_TOKEN_CAP = Number(process.env.KB_SYNTH_TOKEN_CAP ?? 12_000);
let tokensUsedThisRun = 0;

/** Reset the per-run token meter (call once at the start of a run). */
export function resetSynthBudget(): void {
  tokensUsedThisRun = 0;
}

// ----------------------------------------------------------------------------
// Category ↔ folder mapping (explicit — the category names are a fixed allowlist
// and their folder forms are NOT a clean slugify, so we map them directly).
// ----------------------------------------------------------------------------
const CATEGORY_DIRS: Record<string, string> = {
  "Agent frameworks": "Agent-frameworks",
  "RAG tooling": "RAG-tooling",
  "Tool use / MCP": "Tool-use-MCP",
  "Vector DBs and clients": "Vector-DBs-and-clients",
  "Deployment & serving / gateways": "Deployment-serving-gateways",
  "Evaluation & observability": "Evaluation-observability",
  "Guardrails & security": "Guardrails-security",
  "Providers & models": "Providers-models",
  Foundations: "Foundations",
  "Prompting & context": "Prompting-and-context",
  Memory: "Memory",
  "Training & adaptation": "Training-adaptation",
  "Durable execution / orchestration": "Durable-execution-orchestration",
};

/** Map a category value to its kb/ folder; best-effort slugify for unknowns. */
export function categoryDir(category: string): string {
  return (
    CATEGORY_DIRS[category] ??
    category
      .replace(/&/g, " ")
      .replace(/[/]/g, " ")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
  );
}

/** URL-safe slug from a title (lowercase, alnum + single hyphens). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "untitled";
}

/** Today's UTC date as YYYY-MM-DD (the KB's as_of_date format). */
function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Best-effort token estimate (~4 chars/token) for the run budget. */
function estTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ----------------------------------------------------------------------------
// Existing-doc lookup — find a kb/ doc for this source/item if one exists.
// ----------------------------------------------------------------------------

interface ExistingDoc {
  path: string; // absolute
  frontmatter: string; // raw frontmatter block (without the --- fences)
  body: string; // everything after the closing fence
}

/** Read an existing kb/<dir>/<slug>.md if present (returns null otherwise). */
async function readExisting(category: string, slug: string): Promise<ExistingDoc | null> {
  const path = join(KB_ROOT, categoryDir(category), `${slug}.md`);
  try {
    const raw = await readFile(path, "utf8");
    const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
    if (!m) return { path, frontmatter: "", body: raw };
    return { path, frontmatter: m[1], body: m[2] };
  } catch {
    return null;
  }
}

/**
 * Pick the topic slug for an item. We derive it from the SOURCE's repo (so all
 * releases of a repo update ONE doc) when available, else from the item title.
 * This keeps changelog items mapped onto a stable per-project doc.
 */
function topicSlug(src: SourceDef): string {
  if (src.repo) return slugify(src.repo.split("/").pop() ?? src.repo);
  // Strip the leading `gh-`/`rss-`/`arxiv-`/`sitemap-` and trailing `-releases`/`-news`.
  return slugify(src.id.replace(/^(gh|rss|arxiv|sitemap)-/, "").replace(/-(releases|news|blog|docs)$/, ""));
}

// ----------------------------------------------------------------------------
// Deterministic template synthesis ($0) — the standalone path.
// ----------------------------------------------------------------------------

/** First N sentences of the fetched text, trimmed — our factual summary basis. */
function factualSummary(content: string, maxChars = 600): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return (lastStop > 200 ? cut.slice(0, lastStop + 1) : cut).trim() + " …";
}

/** Build the "What's new" section body for an item (deterministic). */
function whatsNewSection(item: DetectedItem, doc: FetchedDoc): string {
  const date = utcDate();
  const summary = factualSummary(doc.content);
  const kindLabel = item.kind === "release" ? "Release" : item.kind === "paper" ? "Paper" : item.kind === "post" ? "Announcement" : "Update";
  return (
    `## What's new (${date})\n\n` +
    `**${kindLabel}: ${item.title.replace(/\s+/g, " ").trim()}** — detected ${date} (item dated ${item.timestamp.slice(0, 10)}).\n\n` +
    (summary ? `In our words: ${summary}\n\n` : "") +
    `Source: ${item.url}\n`
  );
}

/** Compose a brand-new topic note body (deterministic). */
function newTopicBody(item: DetectedItem, doc: FetchedDoc, verdict: IpVerdict): string {
  const summary = factualSummary(doc.content, 900);
  return (
    `## What it is\n\n` +
    `${item.title.replace(/\s+/g, " ").trim()} — a newly tracked item in this area. ` +
    `This note is an original summary of factual, publicly available information; ` +
    `see the source for full detail.\n\n` +
    (summary ? `## Summary\n\n${summary}\n\n` : "") +
    `## Key links\n\n- ${item.url}\n\n` +
    whatsNewSection(item, doc) +
    (verdict.risk === "orange" ? `\n> Note: source is under a caution license — facts only, no verbatim text.\n` : "")
  );
}

// ----------------------------------------------------------------------------
// Optional Claude prose (graceful) — refine the "What's new" wording only.
// ----------------------------------------------------------------------------

/**
 * Try to rewrite the deterministic "What's new" prose with Haiku for nicer flow.
 * Returns null (so the caller keeps the template) on ANY problem: no key, budget
 * exhausted, balance empty, or a thrown/blank reply.
 */
async function tryClaudeProse(item: DetectedItem, doc: FetchedDoc): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (tokensUsedThisRun >= PER_RUN_TOKEN_CAP) return null;

  const factual = factualSummary(doc.content, 800);
  const prompt =
    `Write 2-4 sentences of ORIGINAL prose summarizing this update for a knowledge base about agentic AI. ` +
    `Do NOT copy the source's wording. Be factual and neutral. No headings, no markdown, no preamble.\n\n` +
    `Title: ${item.title}\nDate: ${item.timestamp.slice(0, 10)}\nFacts: ${factual}`;

  const budgetLeft = PER_RUN_TOKEN_CAP - tokensUsedThisRun;
  if (estTokens(prompt) + 300 > budgetLeft) return null;

  try {
    // Import lazily so the deterministic path has no LangChain dependency at load.
    const { makeLLM } = await import("../../src/agent/llm");
    const llm = makeLLM("haiku", 0, { maxTokens: 300 });
    const res = await llm.invoke(prompt);
    const text = (typeof res.content === "string" ? res.content : "").trim();
    tokensUsedThisRun += estTokens(prompt) + estTokens(text);
    if (!text || text.length < 40) return null;
    const date = utcDate();
    const kindLabel = item.kind === "release" ? "Release" : item.kind === "paper" ? "Paper" : item.kind === "post" ? "Announcement" : "Update";
    return (
      `## What's new (${date})\n\n` +
      `**${kindLabel}: ${item.title.replace(/\s+/g, " ").trim()}** — detected ${date}.\n\n` +
      `${text}\n\n` +
      `Source: ${item.url}\n`
    );
  } catch {
    return null; // graceful fallback to the template
  }
}

// ----------------------------------------------------------------------------
// Frontmatter assembly.
// ----------------------------------------------------------------------------

function buildFrontmatter(meta: {
  title: string;
  category: string;
  url: string;
  license: string;
  verdict: string;
  sources: { url: string; license: string; kind: string }[];
}): Record<string, unknown> {
  return {
    title: meta.title,
    category: meta.category,
    url: meta.url,
    license: meta.license,
    verdict: meta.verdict,
    as_of_date: utcDate(),
    sources: meta.sources,
  };
}

/** Render a frontmatter object back to the KB's YAML-ish block (scalars + sources list). */
function renderFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ["---"];
  for (const key of ["title", "category", "url", "license", "verdict", "as_of_date"]) {
    const v = fm[key];
    if (v != null && v !== "") lines.push(`${key}: ${String(v)}`);
  }
  const sources = fm.sources as { url: string; license: string; kind: string }[] | undefined;
  if (sources?.length) {
    lines.push("sources:");
    for (const s of sources) lines.push(`  - {url: "${s.url}", license: ${s.license}, kind: ${s.kind}}`);
  }
  lines.push("---");
  return lines.join("\n");
}

// ----------------------------------------------------------------------------
// Public: synthesize one item into a SynthResult.
// ----------------------------------------------------------------------------

/**
 * Synthesize a KB note for one allowed item.
 *
 * @param src      the source def (license/category/repo provenance).
 * @param item     the detected item.
 * @param doc      its fetched content.
 * @param verdict  the IP gate verdict (orange ⇒ facts-only wording).
 *
 * Returns a SynthResult (slug, category, full markdown incl. frontmatter,
 * frontmatter object, isNewTopic). For an existing doc the body is preserved and
 * the new "What's new" section is prepended under the frontmatter; for a new
 * topic the whole note is authored.
 */
export async function synthesizeItem(
  src: SourceDef,
  item: DetectedItem,
  doc: FetchedDoc,
  verdict: IpVerdict
): Promise<SynthResult> {
  const slug = topicSlug(src);
  const existing = await readExisting(src.category, slug);

  // Prefer Claude prose for the "What's new" block; fall back to the template.
  const whatsNew = (await tryClaudeProse(item, doc)) ?? whatsNewSection(item, doc);

  const sourceEntry = {
    url: item.url,
    license: src.license,
    kind: item.kind === "release" ? "oss_repo" : item.kind === "paper" ? "paper" : "official_docs",
  };

  if (existing) {
    // UPDATE in place: keep the original body, refresh as_of_date, merge source,
    // prepend the new section.
    const fmObj = parseExistingFrontmatter(existing.frontmatter);
    fmObj.as_of_date = utcDate();
    fmObj.sources = mergeSources((fmObj.sources as never) ?? [], sourceEntry);
    const fm = renderFrontmatter(fmObj);
    const markdown = `${fm}\n\n${whatsNew}\n${existing.body.trim()}\n`;
    return { slug, category: src.category, markdown, frontmatter: fmObj, isNewTopic: false };
  }

  // NEW topic note.
  const fmObj = buildFrontmatter({
    title: item.title.replace(/\s+/g, " ").trim().slice(0, 120),
    category: src.category,
    url: item.url,
    license: src.license,
    verdict: `Tracked source in ${src.category}; see source for current detail.`,
    sources: [sourceEntry],
  });
  const fm = renderFrontmatter(fmObj);
  const body = newTopicBody(item, doc, verdict);
  const markdown = `${fm}\n\n${body}\n`;
  return { slug, category: src.category, markdown, frontmatter: fmObj, isNewTopic: true };
}

/** Parse the scalar + sources fields from an existing frontmatter block. */
function parseExistingFrontmatter(block: string): Record<string, unknown> {
  const fm: Record<string, unknown> = {};
  const sources: { url: string; license: string; kind: string }[] = [];
  let inSources = false;
  for (const line of block.split("\n")) {
    if (/^sources:\s*$/.test(line)) {
      inSources = true;
      continue;
    }
    if (inSources) {
      const m = line.match(/url:\s*"?([^",}]+)"?.*?license:\s*([^,}]+).*?kind:\s*([^,}]+)/);
      if (m) sources.push({ url: m[1].trim(), license: m[2].trim(), kind: m[3].trim() });
      else if (/^\S/.test(line)) inSources = false; // dedented out of the list
    }
    if (!inSources) {
      const scalar = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.+?)\s*$/);
      if (scalar && scalar[1] !== "sources") fm[scalar[1]] = scalar[2].replace(/^['"]|['"]$/g, "");
    }
  }
  if (sources.length) fm.sources = sources;
  return fm;
}

/** Merge a new source entry into the existing list (dedupe by url). */
function mergeSources(
  existing: { url: string; license: string; kind: string }[],
  add: { url: string; license: string; kind: string }
): { url: string; license: string; kind: string }[] {
  if (existing.some((s) => s.url === add.url)) return existing;
  return [...existing, add];
}
