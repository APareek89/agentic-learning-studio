/**
 * # Chunkers — split a source into small searchable pieces
 *
 * Two strategies:
 *   - records  → each catalog item is already one chunk (don't split it).
 *   - prose    → heading/paragraph-aware windows of ~450 "tokens" with ~80 overlap,
 *                so a retrieved chunk has enough context but stays focused.
 *
 * We approximate tokens as words/0.75 (~4 chars/token); good enough for sizing.
 */

import type { LoadedSource } from "./loaders";

export interface Chunk {
  content: string;
  contentKind: "prose" | "record";
  title?: string;
  category?: string;
  url?: string;
  verdict?: string;
  license?: string;
  asOfDate?: string;
}

const TARGET_WORDS = 320; // ~450 tokens
const OVERLAP_WORDS = 60; // ~80 tokens

/** Break prose into overlapping word windows, preferring paragraph boundaries. */
function chunkProse(text: string): string[] {
  const paras = text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let buf: string[] = []; // current window, as words
  for (const para of paras) {
    const words = para.split(" ");
    if (buf.length + words.length > TARGET_WORDS && buf.length > 0) {
      chunks.push(buf.join(" "));
      // start the next window with an overlap tail for continuity
      buf = buf.slice(Math.max(0, buf.length - OVERLAP_WORDS));
    }
    buf.push(...words);
    // a single very long paragraph: hard-split it
    while (buf.length > TARGET_WORDS * 1.6) {
      chunks.push(buf.slice(0, TARGET_WORDS).join(" "));
      buf = buf.slice(TARGET_WORDS - OVERLAP_WORDS);
    }
  }
  if (buf.length) chunks.push(buf.join(" "));
  return chunks.filter((c) => c.trim().length > 0);
}

/** Turn a loaded source into chunks ready for embedding + storage. */
export function chunkSource(src: LoadedSource): Chunk[] {
  if (src.kind === "records" && src.records) {
    return src.records.map((r) => ({
      content: r.text,
      contentKind: "record" as const,
      title: r.title,
      category: r.category,
      url: r.url,
      verdict: r.verdict,
      license: r.license,
      asOfDate: r.asOfDate,
    }));
  }
  return chunkProse(src.text ?? "").map((content) => ({
    content,
    contentKind: "prose" as const,
    title: src.title,
    category: src.category,
    url: src.url,
    verdict: src.verdict,
    license: src.license,
    asOfDate: src.asOfDate,
  }));
}
