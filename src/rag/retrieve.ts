/**
 * # Retrieve — hybrid search over the knowledge base
 *
 * Combines two signals and fuses them with Reciprocal Rank Fusion (RRF):
 *   - VECTOR: nearest chunks by embedding cosine distance (semantic match).
 *   - KEYWORD: full-text match on `content_tsv` (rescues exact names like
 *     "LangGraph", "CrewAI" that embeddings can blur together).
 *
 * Returns the top chunks plus a `coverage` score in [0,1] — how well the KB
 * actually covers the query. The graph uses coverage to decide whether to lean
 * on retrieved sources or fall back to the model's own knowledge.
 */

import { query, ragEnabled } from "../lib/db";
import { localEmbeddings, toVectorLiteral } from "./embed";

export interface RetrievedChunk {
  id: string;
  content: string;
  title?: string;
  url?: string;
  category?: string;
  verdict?: string;
  asOfDate?: string;
  sim: number; // cosine similarity 0..1 (vector path; 0 if keyword-only)
}

interface Row {
  id: string;
  content: string;
  title: string | null;
  url: string | null;
  category: string | null;
  verdict: string | null;
  as_of_date: string | null;
  sim?: number;
}

const RRF_K = 60;

export async function retrieve(
  q: string,
  k = 8,
  opts: { category?: string } = {}
): Promise<{ chunks: RetrievedChunk[]; coverage: number }> {
  if (!ragEnabled() || !q.trim()) {
    // Grounding telemetry: a call that can't ground at all (RAG off / empty query) is ungrounded.
    console.log(`[retrieve] ungrounded · 0 chunks · ${!ragEnabled() ? "rag-disabled" : "empty-query"}`);
    return { chunks: [], coverage: 0 };
  }

  // Optional category scope (e.g. "Agent Skills") — ADDITIVE: when omitted the
  // queries are exactly as before, so existing callers are unaffected. When set,
  // both the vector and keyword paths are restricted to that KB category so a
  // feature can ground itself in just the slice of the KB it cares about.
  const cat = opts.category?.trim() || "";
  const catVec = cat ? `and category = $2` : "";
  const catKw = cat ? `and category = $2` : "";

  // ---- vector candidates ----
  let vec: Row[] = [];
  try {
    const qvec = await localEmbeddings.embedQuery(q);
    const lit = toVectorLiteral(qvec);
    vec = await query<Row>(
      `select id::text, content, title, url, category, verdict, as_of_date,
              1 - (embedding <=> $1::vector) as sim
         from chunks
        where embedding is not null
          ${catVec}
        order by embedding <=> $1::vector
        limit 20`,
      cat ? [lit, cat] : [lit]
    );
  } catch (err) {
    console.warn("[retrieve] vector search failed:", (err as Error).message);
  }

  // ---- keyword candidates ----
  let kw: Row[] = [];
  try {
    kw = await query<Row>(
      `select id::text, content, title, url, category, verdict, as_of_date
         from chunks
        where to_tsvector('english', concat_ws(' ', title, title, category, content)) @@ plainto_tsquery('english', $1)
          ${catKw}
        order by ts_rank(to_tsvector('english', concat_ws(' ', title, title, category, content)), plainto_tsquery('english', $1)) desc
        limit 20`,
      cat ? [q, cat] : [q]
    );
  } catch (err) {
    console.warn("[retrieve] keyword search failed:", (err as Error).message);
  }

  // ---- RRF fuse ----
  const score = new Map<string, number>();
  const byId = new Map<string, Row>();
  vec.forEach((r, i) => {
    score.set(r.id, (score.get(r.id) ?? 0) + 1 / (RRF_K + i));
    byId.set(r.id, r);
  });
  kw.forEach((r, i) => {
    score.set(r.id, (score.get(r.id) ?? 0) + 1 / (RRF_K + i));
    if (!byId.has(r.id)) byId.set(r.id, r);
  });

  // Postgres returns `date` columns as JS Date objects — coerce to YYYY-MM-DD
  // strings so they satisfy the (string) schema field downstream.
  const dateStr = (v: unknown): string | undefined => {
    if (!v) return undefined;
    try {
      return new Date(v as string).toISOString().slice(0, 10);
    } catch {
      return String(v);
    }
  };

  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
  const simById = new Map(vec.map((r) => [r.id, r.sim ?? 0]));
  const chunks: RetrievedChunk[] = ranked.map(([id]) => {
    const r = byId.get(id)!;
    return {
      id,
      content: r.content,
      title: r.title ?? undefined,
      url: r.url ?? undefined,
      category: r.category ?? undefined,
      verdict: r.verdict ?? undefined,
      asOfDate: dateStr(r.as_of_date),
      sim: simById.get(id) ?? 0,
    };
  });

  // ---- coverage: top similarity (50%) + share of strong hits (50%) ----
  const sims = chunks.map((c) => c.sim).filter((s) => s > 0);
  const topSim = sims.length ? Math.max(...sims) : 0;
  const strong = sims.filter((s) => s >= 0.45).length;
  const coverage = chunks.length ? 0.5 * topSim + 0.5 * Math.min(1, strong / Math.max(1, k * 0.4)) : 0;

  // Grounding telemetry — how often a retrieval lands KB chunks vs comes back empty. The home
  // page now markets the whole AI landscape, but `chunks` is agentic-AI-heavy, so many broad
  // topics will retrieve nothing (ungrounded). Log per call to measure that rate cheaply.
  const cov = Number(coverage.toFixed(3));
  console.log(`[retrieve] ${chunks.length ? "grounded" : "ungrounded"} · ${chunks.length} chunk(s) · coverage=${cov} · q="${q.replace(/\s+/g, " ").trim().slice(0, 70)}"`);

  return { chunks, coverage: cov };
}
