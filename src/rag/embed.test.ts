/**
 * # Embedder smoke test  (run: `npm run embed:test`)
 *
 * Verifies the free local model loads, downloads its weights, and produces
 * 384-dimension vectors — and that semantically related text scores higher than
 * unrelated text (a basic sanity check that retrieval will actually work).
 */

import "dotenv/config";
import { localEmbeddings, EMBED_DIM } from "./embed";

/** Cosine similarity of two unit vectors == their dot product. */
function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

console.log("[embed:test] loading model (first run downloads ~130MB)…");
const t0 = Date.now();

const query = await localEmbeddings.embedQuery("How do I give an AI agent long-term memory?");
const [related, unrelated] = await localEmbeddings.embedPassages([
  "Agent memory can be stored in a vector database or a knowledge graph for long-term recall.",
  "The recipe calls for two cups of flour and a pinch of salt.",
]);

console.log(`[embed:test] model ready in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`[embed:test] vector dimension: ${query.length} (expected ${EMBED_DIM})`);
console.log(`[embed:test] similarity to RELATED passage:   ${dot(query, related).toFixed(3)}`);
console.log(`[embed:test] similarity to UNRELATED passage: ${dot(query, unrelated).toFixed(3)}`);

const ok = query.length === EMBED_DIM && dot(query, related) > dot(query, unrelated);
console.log(ok ? "\n✓ Embeddings work and rank meaning correctly.\n" : "\n✗ Something looks off — check the output above.\n");
process.exit(ok ? 0 : 1);
