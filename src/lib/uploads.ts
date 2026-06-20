/**
 * # Uploaded-document store — the learner's own files, used to ground a lesson
 *
 * When a learner uploads PDFs/docs/code, we parse → chunk → embed them LOCALLY
 * (bge-small, free, no API) and keep them in an in-memory Map for the life of the
 * server process. They are NEVER written to the shared knowledge base (the `chunks`
 * table) — a user's file shouldn't pollute the global KB. The front-end remembers
 * the returned ids for the browser session and passes them with each generation.
 *
 * Retrieval over these is a plain cosine scan in JS (vectors are unit-normalized, so
 * cosine == dot product) — fine for the handful of chunks one upload produces.
 */

import { localEmbeddings } from "../rag/embed";
import { chunkSource } from "../rag/chunkers";
import type { LoadedSource } from "../rag/loaders";

interface UploadChunk {
  content: string;
  embedding: number[];
  title?: string;
}
interface StoredUpload {
  id: string;
  title: string;
  sourceType: string;
  chunks: UploadChunk[];
}

// docId → parsed+embedded upload. Module-level singleton (whole process).
const uploads = new Map<string, StoredUpload>();

export interface UploadHit {
  content: string;
  title?: string;
  sim: number; // cosine similarity 0..1
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/** Parse → chunk → embed an uploaded source and store it under `id`. */
export async function addUpload(id: string, src: LoadedSource): Promise<{ id: string; title: string; chunkCount: number }> {
  const chunks = chunkSource(src);
  const vectors = await localEmbeddings.embedPassages(chunks.map((c) => c.content));
  uploads.set(id, {
    id,
    title: src.title,
    sourceType: src.sourceType,
    chunks: chunks.map((c, i) => ({ content: c.content, embedding: vectors[i], title: c.title })),
  });
  return { id, title: src.title, chunkCount: chunks.length };
}

/** Split text into ~`words`-word chunks (simple, for repo files). */
function splitText(text: string, words = 280): string[] {
  const toks = text.split(/\s+/).filter(Boolean);
  if (toks.length <= words) return toks.length ? [text.trim()] : [];
  const out: string[] = [];
  for (let i = 0; i < toks.length; i += words) out.push(toks.slice(i, i + words).join(" "));
  return out;
}

/** Ingest a cloned GitHub repo as ONE upload doc (chunks tagged with their file path). */
export async function addRepoUpload(id: string, title: string, files: { path: string; content: string }[], maxChunks = 220): Promise<{ id: string; title: string; chunkCount: number }> {
  const raw: { content: string; title: string }[] = [];
  for (const f of files) {
    for (const part of splitText(f.content, 280)) {
      raw.push({ content: `[file: ${f.path}]\n${part}`, title: f.path });
      if (raw.length >= maxChunks) break;
    }
    if (raw.length >= maxChunks) break;
  }
  if (!raw.length) { uploads.set(id, { id, title, sourceType: "repo", chunks: [] }); return { id, title, chunkCount: 0 }; }
  const vectors = await localEmbeddings.embedPassages(raw.map((c) => c.content));
  uploads.set(id, { id, title, sourceType: "repo", chunks: raw.map((c, i) => ({ content: c.content, embedding: vectors[i], title: c.title })) });
  return { id, title, chunkCount: raw.length };
}

/** Titles for the given ids (used for the provenance banner). */
export function getUploadTitles(ids: string[] | undefined): string[] {
  if (!ids) return [];
  return ids.map((id) => uploads.get(id)?.title).filter((t): t is string => !!t);
}

/** True when at least one of the ids resolves to a stored upload. */
export function hasUploads(ids: string[] | undefined): boolean {
  return !!(ids && ids.some((id) => uploads.has(id)));
}

/** Top-k chunks from the given uploads, by cosine similarity to the query. */
export async function retrieveFromUploads(query: string, ids: string[] | undefined, k = 6): Promise<UploadHit[]> {
  if (!ids || !ids.length || !query.trim()) return [];
  const pool: UploadChunk[] = [];
  for (const id of ids) {
    const u = uploads.get(id);
    if (u) pool.push(...u.chunks);
  }
  if (!pool.length) return [];
  const q = await localEmbeddings.embedQuery(query);
  return pool
    .map((c) => ({ content: c.content, title: c.title, sim: dot(q, c.embedding) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, k);
}
