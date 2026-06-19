/**
 * # Store — embed chunks and upsert them into Postgres (idempotent)
 *
 * For each source we compute a whole-source content hash. If a `documents` row
 * already exists with the same hash, we skip the source entirely (no re-embed).
 * Otherwise we delete its old chunks, embed the new ones locally, and insert
 * them — so re-running ingestion only does work for changed files.
 *
 * Vectors are written as the pgvector TEXT literal `'[…]'` (pooler-safe).
 */

import { rawPool, ragEnabled } from "../lib/db";
import { localEmbeddings, toVectorLiteral } from "./embed";
import { contentHash } from "../lib/hash";
import { chunkSource } from "./chunkers";
import type { LoadedSource } from "./loaders";

export interface UpsertResult {
  added: number;
  skipped: number;
  source: string;
}

/** Embed + upsert one loaded source. Returns counts; no-op when RAG is off. */
export async function upsertSource(src: LoadedSource): Promise<UpsertResult> {
  const pool = rawPool();
  if (!pool || !ragEnabled()) return { added: 0, skipped: 0, source: src.sourceId };

  const chunks = chunkSource(src);
  if (chunks.length === 0) return { added: 0, skipped: 0, source: src.sourceId };

  // Whole-source fingerprint = hash of all chunk texts joined. Lets us skip
  // unchanged sources without re-embedding.
  const srcHash = contentHash(chunks.map((c) => c.content).join(""));

  const client = await pool.connect();
  try {
    const existing = await client.query(`select id, content_hash from documents where source_id = $1`, [src.sourceId]);
    if (existing.rowCount && existing.rows[0].content_hash === srcHash) {
      return { added: 0, skipped: chunks.length, source: src.sourceId }; // unchanged
    }

    await client.query("begin");
    // Upsert the document row.
    const doc = await client.query(
      `insert into documents (source_id, title, source_type, category, content_hash, mtime)
       values ($1,$2,$3,$4,$5, now())
       on conflict (source_id) do update set title=excluded.title, source_type=excluded.source_type,
         category=excluded.category, content_hash=excluded.content_hash, mtime=now()
       returning id`,
      [src.sourceId, src.title, src.sourceType, src.category ?? null, srcHash]
    );
    const documentId: string = doc.rows[0].id;

    // Replace this source's chunks.
    await client.query(`delete from chunks where source_id = $1`, [src.sourceId]);

    // Embed all chunk texts locally (one batch).
    const vectors = await localEmbeddings.embedPassages(chunks.map((c) => c.content));

    let added = 0;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const hash = contentHash(c.content);
      await client.query(
        `insert into chunks (document_id, source_id, chunk_index, content_kind, title, category, url, content, verdict, license, as_of_date, embedding, content_hash)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::vector,$13)
         on conflict (content_hash) do nothing`,
        [
          documentId,
          src.sourceId,
          i,
          c.contentKind,
          c.title ?? null,
          c.category ?? null,
          c.url ?? null,
          c.content,
          c.verdict ?? null,
          c.license ?? null,
          c.asOfDate ?? null,
          toVectorLiteral(vectors[i]),
          hash,
        ]
      );
      added++;
    }
    await client.query("commit");
    return { added, skipped: 0, source: src.sourceId };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
