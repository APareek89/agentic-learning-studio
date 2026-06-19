/**
 * # Local embeddings — turn text into vectors, for free, on this machine
 *
 * "Embedding" = converting a piece of text into a list of numbers (a "vector")
 * that captures its meaning, so we can find similar text by comparing vectors.
 * RAG (Retrieval-Augmented Generation) needs this: we embed the knowledge-base
 * chunks once, embed the learner's query at request time, and find the closest
 * chunks.
 *
 * We use a FREE, open-source model — `bge-small-en-v1.5` — run locally via
 * `@huggingface/transformers` (Transformers.js). No API key, no per-call cost. The
 * model weights (~130 MB) download once on first use and cache to disk.
 *
 * ## The one easy-to-forget detail: BGE is ASYMMETRIC
 * The bge models expect a QUERY to be prefixed with a special instruction, while
 * PASSAGES (the stored chunks) are embedded raw. Getting this wrong quietly hurts
 * retrieval quality. So we expose two separate functions — `embedQuery` (adds the
 * prefix) and `embedPassages` (no prefix) — making it impossible to mix up.
 *
 * The `EmbeddingProvider` interface means we can swap in a hosted model later
 * (e.g. a free Google tier) by implementing the same three members — no other code
 * changes.
 */

import { pipeline, env } from "@huggingface/transformers";

// The ONNX-converted model that runs in Node, its output dimension, and the BGE
// query instruction prefix.
const MODEL_ID = "Xenova/bge-small-en-v1.5";
export const EMBED_DIM = 384;
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

// Point the weight cache at our configured folder (so it's predictable + gitignored).
if (process.env.TRANSFORMERS_CACHE) {
  // `env` is Transformers.js's global config; `cacheDir` is where weights live.
  (env as { cacheDir?: string }).cacheDir = process.env.TRANSFORMERS_CACHE;
}

// LAZY SINGLETON: build the feature-extraction pipeline at most once. We cache the
// PROMISE (not the resolved value) so concurrent first-callers all await the same
// single load instead of triggering several downloads.
let extractorPromise: Promise<unknown> | undefined;
function getExtractor(): Promise<unknown> {
  if (!extractorPromise) extractorPromise = pipeline("feature-extraction", MODEL_ID);
  return extractorPromise;
}

/** Run the model over a batch of texts → an array of 384-number vectors. */
async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const extractor = (await getExtractor()) as (
    t: string[],
    o: { pooling: "mean"; normalize: boolean }
  ) => Promise<{ tolist(): number[][] }>;
  // `pooling: "mean"` averages the per-token vectors into one per text; `normalize`
  // scales each to unit length so cosine similarity == dot product.
  const output = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

/** The pluggable shape any embedding provider must implement. */
export interface EmbeddingProvider {
  dim: number;
  embedQuery(text: string): Promise<number[]>;
  embedPassages(texts: string[]): Promise<number[][]>;
}

/** The free local provider (default). */
export const localEmbeddings: EmbeddingProvider = {
  dim: EMBED_DIM,
  async embedQuery(text: string): Promise<number[]> {
    const [vec] = await embedBatch([QUERY_PREFIX + text]);
    return vec;
  },
  async embedPassages(texts: string[]): Promise<number[][]> {
    return embedBatch(texts);
  },
};

/**
 * Warm the model at server boot so the first real request isn't slow (and so a
 * load failure is visible early). Returns false instead of throwing — RAG then
 * stays gracefully off rather than crashing requests.
 */
export async function warmEmbeddings(): Promise<boolean> {
  try {
    await getExtractor();
    return true;
  } catch (err) {
    console.warn("[embed] local embedding model failed to load — RAG disabled:", (err as Error).message);
    return false;
  }
}

/**
 * Format a vector as a pgvector TEXT literal `'[v0,v1,…]'`. We pass vectors this
 * way (not as a binary param) because the Supabase connection pooler is finicky
 * about binary parameters.
 */
export function toVectorLiteral(vec: number[]): string {
  return "[" + vec.join(",") + "]";
}
