/**
 * # Lesson visuals — retrieve a curated concept diagram for a lesson module.
 *
 * Two-stage match (precision first), mirroring the Hands-On KB's symmetric
 * embedding approach:
 *   1. KEYWORD / IDENTIFIER match — the module/lesson text + category vs each
 *      visual's identifier_keys / keywords / category. High precision; this is the
 *      primary path (the diagrams were authored with explicit identifier keys).
 *   2. EMBEDDING fallback — embed the module text the SAME way the visuals were
 *      stored (embedPassages, NOT the asymmetric query prefix), take the nearest
 *      by cosine, keep only if similarity ≥ VISUAL_SIM_THRESHOLD.
 *
 * Returns null (no CTA) on no match / DB or embedder down — never throws.
 */

import { query, dbEnabled } from "./db";
import { localEmbeddings, toVectorLiteral } from "../rag/embed";

/** Cosine similarity floor for the embedding fallback (env-tuneable). */
const VISUAL_SIM_THRESHOLD = Number(process.env.VISUAL_SIM_THRESHOLD) || 0.84;
/** Minimum keyword/identifier score to accept the precise match (env-tuneable). */
const VISUAL_KEYWORD_MIN = Number(process.env.VISUAL_KEYWORD_MIN) || 3;

export interface VisualCtx {
  topic: string;
  moduleTitle?: string;
  moduleSummary?: string;
  category?: string;
}
export interface VisualHit {
  visualId: string;
  title: string;
  svg: string;
}

interface Candidate {
  visualId: string;
  title: string;
  category: string;
  keys: string[];
  keywords: string[];
}

let candidateCache: Candidate[] | null = null;

/** Drop the in-memory candidate list (call after re-ingesting). */
export function clearVisualCache(): void { candidateCache = null; }

function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

async function loadCandidates(): Promise<Candidate[]> {
  if (candidateCache) return candidateCache;
  if (!dbEnabled()) return [];
  const rows = await query<{ visual_id: string; title: string; category: string | null; identifier_keys: string[] | null; keywords: string[] | null }>(
    `select visual_id, title, category, identifier_keys, keywords from lesson_visuals`
  ).catch(() => []);
  candidateCache = rows.map((r) => ({
    visualId: r.visual_id,
    title: r.title,
    category: r.category ?? "",
    keys: (r.identifier_keys ?? []).map((k) => norm(k.split("/").pop() || k)),
    keywords: (r.keywords ?? []).map((k) => norm(k)).filter((k) => k.length >= 4),
  }));
  return candidateCache;
}

/** Fetch one visual's self-contained SVG by visual_id. */
export async function getVisualSvg(visualId: string): Promise<string | null> {
  if (!dbEnabled() || !visualId) return null;
  const rows = await query<{ svg: string }>(`select svg from lesson_visuals where visual_id = $1 limit 1`, [visualId]).catch(() => []);
  return rows[0]?.svg ?? null;
}

/** Best-matching curated visual for a module, or null. */
export async function retrieveVisual(ctx: VisualCtx): Promise<VisualHit | null> {
  if (!dbEnabled()) return null;
  const text = norm([ctx.topic, ctx.moduleTitle, ctx.moduleSummary].filter(Boolean).join(" "));
  const cat = norm(ctx.category || "");
  if (!text) return null;

  // 1) KEYWORD / IDENTIFIER match (high precision).
  try {
    const cands = await loadCandidates();
    let best: Candidate | null = null;
    let bestScore = 0;
    for (const c of cands) {
      let score = 0;
      for (const k of c.keys) if (k && (text.includes(k) || k.includes(text))) score += 3;       // identifier key segment
      for (const kw of c.keywords) if (kw && text.includes(kw)) score += kw.length >= 9 ? 2 : 1;   // longer phrase = stronger
      if (cat && norm(c.category) === cat) score += 1;
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= VISUAL_KEYWORD_MIN) {
      const svg = await getVisualSvg(best.visualId);
      if (svg) return { visualId: best.visualId, title: best.title, svg };
    }
  } catch (e) {
    console.warn("[visuals] keyword match failed:", (e as Error).message?.slice(0, 100));
  }

  // 2) EMBEDDING fallback (symmetric: embed the search text as a PASSAGE).
  try {
    const embedText = [ctx.topic, ctx.moduleTitle, ctx.moduleSummary].filter(Boolean).join(" — ").slice(0, 800);
    const [vec] = await localEmbeddings.embedPassages([embedText]);
    const lit = toVectorLiteral(vec);
    const rows = await query<{ visual_id: string; title: string; svg: string; sim: number | string }>(
      `select visual_id, title, svg, 1 - (embedding <=> $1::vector) as sim
         from lesson_visuals
        where embedding is not null
        order by embedding <=> $1::vector
        limit 1`,
      [lit]
    );
    if (rows.length && Number(rows[0].sim) >= VISUAL_SIM_THRESHOLD) {
      return { visualId: rows[0].visual_id, title: rows[0].title, svg: rows[0].svg };
    }
  } catch (e) {
    console.warn("[visuals] embedding match failed:", (e as Error).message?.slice(0, 100));
  }
  return null;
}
