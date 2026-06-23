/**
 * # apply — write the synthesized note + (for updates) embed it into the KB
 *
 * Policy (matches the task contract):
 *   - UPDATE to an EXISTING kb/ doc → overwrite the .md AND embed it to the live
 *     store via src/rag/store.upsertSource (which does the local bge-small embed +
 *     idempotent upsert — we NEVER re-embed manually).
 *   - NEW topic (no existing kb/ doc) → write to kb/_pending/<cat>/<slug>.md and
 *     DO NOT embed. New topics are staged for human review, never auto-promoted to
 *     prod retrieval.
 *
 * Idempotency: store.upsertSource skips a source whose whole-content hash is
 * unchanged, so re-running the curator embeds nothing new for an unchanged doc.
 * We also short-circuit the file write when the on-disk content already matches.
 *
 * State + audit: after applying a source's items we update kb_sources
 * (last_checked / last_hash) via detect.saveState, and the RUN writes exactly ONE
 * kb_updates audit row (see writeRunAudit, called once by index.ts).
 */

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rawPool } from "../../src/lib/db";
import { upsertSource } from "../../src/rag/store";
import type { LoadedSource } from "../../src/rag/loaders";
import { categoryDir } from "./synthesize";
import type { SynthResult, IpVerdict, ApplyResult } from "./types";

const KB_ROOT = fileURLToPath(new URL("../../kb/", import.meta.url));
const PENDING_ROOT = join(KB_ROOT, "_pending");

export interface AppliedItem {
  /** Outcome for this synthesized note. */
  outcome: "added" | "updated" | "skipped" | "dropped";
  /** The kb/ (or _pending/) path written, relative to the repo root. */
  path?: string;
  /** Chunks embedded (only for updates that changed). */
  chunks?: number;
}

/** Write a file only if its content differs (avoids needless churn). Returns changed?. */
async function writeIfChanged(absPath: string, content: string): Promise<boolean> {
  try {
    const existing = await readFile(absPath, "utf8");
    if (existing === content) return false;
  } catch {
    /* not present yet → write */
  }
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
  return true;
}

/**
 * Apply ONE synthesized note.
 *
 * @param synth     the synthesized result (markdown + frontmatter + isNewTopic).
 * @param verdict   the IP verdict (red ⇒ dropped, never embedded — caller should
 *                  not even reach here for red, but we double-guard).
 * @param dryRun    when true, write NOTHING (no file, no DB) — just report intent.
 */
export async function applyNote(synth: SynthResult, verdict: IpVerdict, dryRun: boolean): Promise<AppliedItem> {
  // Double-guard: a red verdict must NEVER be embedded or written to kb/.
  if (verdict.risk === "red" || !verdict.allowed) {
    return { outcome: "dropped" };
  }

  const dir = categoryDir(synth.category);

  // NEW topic → stage under kb/_pending/, do NOT embed.
  if (synth.isNewTopic) {
    const relPath = join("kb", "_pending", dir, `${synth.slug}.md`);
    if (dryRun) return { outcome: "added", path: relPath };
    const abs = join(PENDING_ROOT, dir, `${synth.slug}.md`);
    const changed = await writeIfChanged(abs, synth.markdown);
    return { outcome: changed ? "added" : "skipped", path: relPath };
  }

  // UPDATE to an existing kb/ doc → write + embed.
  const relPath = join("kb", dir, `${synth.slug}.md`);
  if (dryRun) return { outcome: "updated", path: relPath };

  const abs = join(KB_ROOT, dir, `${synth.slug}.md`);
  const changed = await writeIfChanged(abs, synth.markdown);

  // Embed via the SHARED store (local bge-small embed + idempotent upsert). The
  // sourceId is the repo-relative path — matching how ingest.ts keys documents,
  // so the curator updates the SAME `documents` row instead of creating a dupe.
  const loaded = toLoadedSource(synth, relPath);
  const existedBefore = await documentExists(loaded.sourceId);
  const res = await upsertSource(loaded);

  // res.added 0 + skipped>0 means the store saw an unchanged hash (idempotent).
  if (res.added === 0 && !changed) return { outcome: "skipped", path: relPath, chunks: 0 };
  // Stamp the new-vs-modified flag (migration 0011) so the DB shows exactly what
  // the curator ADDED vs MODIFIED. Pre-existing documents row ⇒ modified.
  await stampCuratorChange(loaded.sourceId, existedBefore ? "modified" : "added");
  return { outcome: "updated", path: relPath, chunks: res.added };
}

/** Did a `documents` row already exist for this source (⇒ modified, not added)? */
async function documentExists(sourceId: string): Promise<boolean> {
  const pool = rawPool();
  if (!pool) return false;
  const r = await pool.query(`select 1 from documents where source_id = $1`, [sourceId]);
  return (r.rowCount ?? 0) > 0;
}

/** Stamp the KB-curator change flag (migration 0011) on the documents row. */
async function stampCuratorChange(sourceId: string, kind: "added" | "modified"): Promise<void> {
  const pool = rawPool();
  if (!pool) return;
  await pool.query(
    `update documents set curator_change = $1, curator_changed_at = now() where source_id = $2`,
    [kind, sourceId]
  );
}

/** Build the LoadedSource the store expects from a synthesized note. */
function toLoadedSource(synth: SynthResult, relPath: string): LoadedSource {
  const fm = synth.frontmatter;
  const str = (k: string): string | undefined => {
    const v = fm[k];
    return v == null ? undefined : String(v);
  };
  // The store chunks `text` (prose). We pass the BODY only (strip the frontmatter
  // fence) so retrieval chunks are content, not YAML — mirrors loaders.parseFrontmatter.
  const body = synth.markdown.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
  return {
    sourceId: relPath, // stable repo-relative id — same scheme as ingest.ts
    sourceType: "md",
    title: str("title") ?? synth.slug,
    category: str("category"),
    url: str("url"),
    verdict: str("verdict"),
    license: str("license"),
    asOfDate: str("as_of_date"),
    kind: "prose",
    text: body,
  };
}

/** Aggregate per-item outcomes into the run's ApplyResult counts. */
export function tallyApply(items: AppliedItem[]): ApplyResult {
  const out: ApplyResult = { added: 0, updated: 0, skipped: 0, dropped: 0 };
  for (const it of items) out[it.outcome] += 1;
  return out;
}

/**
 * Write exactly ONE kb_updates audit row for the whole run. Best-effort + no-op
 * under dry-run / no DB. Mirrors ingest.ts's audit-row shape.
 */
export async function writeRunAudit(
  tally: ApplyResult,
  errors: { source: string; error: string }[],
  note: string,
  dryRun: boolean
): Promise<void> {
  if (dryRun) return;
  const pool = rawPool();
  if (!pool) return;
  await pool
    .query(
      `insert into kb_updates (source, added, updated, skipped, errors, note) values ('kb-curator',$1,$2,$3,$4,$5)`,
      [tally.added, tally.updated, tally.skipped, JSON.stringify(errors), note]
    )
    .catch(() => {});
}
