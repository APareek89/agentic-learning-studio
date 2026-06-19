/**
 * # Loaders — read a file of any supported type into normalized content
 *
 * Each loader returns a `LoadedSource`: either `prose` (free text we'll chunk by
 * headings) or `records` (a catalog of structured items — e.g. the framework
 * candidate list — where each item becomes its own searchable chunk).
 *
 * Supported: pdf · docx · md/txt/html · json (catalog or generic) · csv.
 */

import { readFile } from "node:fs/promises";
import { extname, basename } from "node:path";

export interface CatalogRecord {
  title: string;
  text: string;
  category?: string;
  url?: string;
  verdict?: string;
  license?: string;
  asOfDate?: string;
}

export interface LoadedSource {
  sourceId: string; // stable id (we use the path relative to the KB root)
  sourceType: string; // pdf | docx | md | txt | html | json | csv
  title: string;
  category?: string;
  kind: "prose" | "records";
  text?: string;
  records?: CatalogRecord[];
}

/** Code / plain-text extensions read verbatim as prose (for user uploads). */
const TEXT_EXTS = new Set([
  ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".py", ".java", ".go", ".rb", ".rs",
  ".c", ".cpp", ".h", ".hpp", ".cs", ".php", ".sh", ".css", ".scss", ".yaml", ".yml",
  ".toml", ".ini", ".sql", ".env", ".xml", ".rst", ".log",
]);

/** Strip tags from HTML to plain text (good-enough for ingestion). */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build one searchable sentence from a catalog record (using whatever fields exist). */
function recordToText(r: Record<string, unknown>): string {
  const s = (k: string) => (r[k] == null ? "" : String(r[k]));
  const parts: string[] = [];
  if (s("name")) parts.push(s("name"));
  if (s("category")) parts.push(`(${s("category")})`);
  if (s("one_line")) parts.push(`— ${s("one_line")}`);
  if (s("agentic_context_description")) parts.push(s("agentic_context_description"));
  if (s("primary_language")) parts.push(`Language: ${s("primary_language")}.`);
  if (s("license")) parts.push(`License: ${s("license")}.`);
  if (s("stars")) parts.push(`Stars: ${s("stars")}.`);
  if (s("latest_release")) parts.push(`Latest release: ${s("latest_release")}.`);
  if (s("verdict")) parts.push(`Verdict: ${s("verdict")}.`);
  if (s("weaknesses")) parts.push(`Weaknesses: ${s("weaknesses")}`);
  if (s("closest_alternative")) parts.push(`Closest alternative: ${s("closest_alternative")}.`);
  return parts.join(" ").trim();
}

/** Detect + load a JSON file as either a catalog of records or generic prose. */
function loadJson(raw: string, sourceId: string, title: string): LoadedSource {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { sourceId, sourceType: "json", title, kind: "prose", text: raw };
  }
  // Find the array (top-level, or the first array-valued property).
  const arr = Array.isArray(data)
    ? data
    : typeof data === "object" && data
      ? (Object.values(data).find(Array.isArray) as unknown[] | undefined)
      : undefined;
  // A "catalog" = array of objects that look like records (have name/title).
  const looksCatalog = arr && arr.length > 0 && typeof arr[0] === "object" && arr[0] !== null && ("name" in (arr[0] as object) || "title" in (arr[0] as object));
  if (looksCatalog && arr) {
    const records: CatalogRecord[] = arr
      .map((item) => {
        const r = item as Record<string, unknown>;
        const text = recordToText(r);
        if (!text) return null;
        return {
          title: String(r.name ?? r.title ?? "item"),
          text,
          category: r.category != null ? String(r.category) : undefined,
          url: r.github_url != null ? String(r.github_url) : r.url != null ? String(r.url) : undefined,
          verdict: r.verdict != null ? String(r.verdict) : undefined,
          license: r.license != null ? String(r.license) : undefined,
          asOfDate: r.as_of_date != null ? String(r.as_of_date) : undefined,
        } as CatalogRecord;
      })
      .filter((x): x is CatalogRecord => x !== null);
    return { sourceId, sourceType: "json", title, kind: "records", records };
  }
  // Otherwise treat the pretty-printed JSON as prose.
  return { sourceId, sourceType: "json", title, kind: "prose", text: JSON.stringify(data, null, 1) };
}

/**
 * Load one file. Returns null for unsupported/empty files (callers skip nulls).
 * `sourceId` is the stable id we dedupe on (pass the path relative to the KB root).
 */
export async function loadSource(absPath: string, sourceId: string): Promise<LoadedSource | null> {
  const ext = extname(absPath).toLowerCase();
  const title = basename(absPath);
  try {
    if (ext === ".pdf") {
      // Import the inner module directly to avoid pdf-parse's debug self-test.
      const pdf = (await import("pdf-parse/lib/pdf-parse.js")).default as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdf(await readFile(absPath));
      return { sourceId, sourceType: "pdf", title, kind: "prose", text: data.text };
    }
    if (ext === ".docx") {
      const mammoth = (await import("mammoth")).default as { extractRawText(o: { path: string }): Promise<{ value: string }> };
      const { value } = await mammoth.extractRawText({ path: absPath });
      return { sourceId, sourceType: "docx", title, kind: "prose", text: value };
    }
    if (ext === ".md" || ext === ".txt") {
      return { sourceId, sourceType: ext.slice(1), title, kind: "prose", text: await readFile(absPath, "utf8") };
    }
    if (ext === ".html" || ext === ".htm") {
      return { sourceId, sourceType: "html", title, kind: "prose", text: stripHtml(await readFile(absPath, "utf8")) };
    }
    if (ext === ".json") {
      return loadJson(await readFile(absPath, "utf8"), sourceId, title);
    }
    // Code / plain-text source files (common when a learner uploads their own code) →
    // treat as prose so they can ground the lesson.
    if (TEXT_EXTS.has(ext)) {
      return { sourceId, sourceType: ext.slice(1) || "txt", title, kind: "prose", text: await readFile(absPath, "utf8") };
    }
    // .csv intentionally skipped here — ingest() prefers a same-stem .json mirror.
    return null;
  } catch (err) {
    console.warn(`[loaders] failed to read ${sourceId}: ${(err as Error).message}`);
    return null;
  }
}
