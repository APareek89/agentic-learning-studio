/**
 * # index — the KB Curator orchestrator + CLI
 *
 *   npm run kb:curate -- --since 24h            # CI default (NOT dry-run)
 *   npm run kb:curate -- --dry-run              # write NOTHING (DB or prod)
 *   npm run kb:curate -- --only gh-langgraph-releases --since 7d
 *
 * Pipeline (per source): detect → fetch → ipgate → synthesize → apply → report.
 *
 * Flags:
 *   --since <dur>   lookback window (default "24h"). Accepts 30m / 24h / 7d.
 *   --dry-run       do everything EXCEPT writing to the DB or prod kb/ (reports
 *                   intent only). Useful for previewing a run safely.
 *   --only <id>     restrict to ONE source id from sources.yaml.
 *
 * Exit code: NON-ZERO on any 🔴 (red) IP item OR a DB/fatal error — so CI fails
 * loudly when something needs human attention. A clean run exits 0.
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { dbEnabled } from "../../src/lib/db";
import { warmEmbeddings } from "../../src/rag/embed";
import type { SourceDef, DetectedItem, RunReport } from "./types";
import { detectSource, loadState, saveState } from "./detect";
import { fetchItem } from "./fetch";
import { classifyLicense, appendAudit } from "./ipgate";
import { synthesizeItem, resetSynthBudget } from "./synthesize";
import { applyNote, tallyApply, writeRunAudit, writeRunLog, type AppliedItem } from "./apply";
import { printReport, postSlack } from "./report";

const SOURCES_PATH = fileURLToPath(new URL("./sources.yaml", import.meta.url));

interface Cli {
  since: string;
  sinceMs: number;
  dryRun: boolean;
  only?: string;
}

/** Parse a duration like "24h" / "30m" / "7d" to milliseconds (default 24h). */
function parseDuration(s: string): number {
  const m = s.trim().match(/^(\d+)\s*(m|h|d)$/i);
  if (!m) return 24 * 3600_000;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return n * (unit === "m" ? 60_000 : unit === "h" ? 3600_000 : 86_400_000);
}

/** Parse argv into the CLI options (with the CI-friendly defaults). */
function parseArgs(argv: string[]): Cli {
  let since = "24h";
  let dryRun = false;
  let only: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--since") since = argv[++i] ?? "24h";
    else if (a === "--dry-run") dryRun = true;
    else if (a === "--only") only = argv[++i];
  }
  const sinceMs = Date.now() - parseDuration(since);
  return { since, sinceMs, dryRun, only };
}

/**
 * Resolve `--only <q>` to source(s). Prefers an EXACT id match; otherwise falls
 * back to a case-insensitive substring match so the convenient shorthand works
 * (e.g. `--only langgraph` finds `gh-langgraph-releases`). An ambiguous substring
 * (multiple hits) throws so the caller is explicit.
 */
function selectOnly(all: SourceDef[], q: string): SourceDef[] {
  const exact = all.filter((s) => s.id === q);
  if (exact.length) return exact;
  const ql = q.toLowerCase();
  const partial = all.filter((s) => s.id.toLowerCase().includes(ql));
  if (partial.length > 1) {
    throw new Error(`--only "${q}" is ambiguous — matched: ${partial.map((s) => s.id).join(", ")}`);
  }
  return partial;
}

/** Load + validate the allowlist from sources.yaml. */
async function loadSources(): Promise<SourceDef[]> {
  const raw = await readFile(SOURCES_PATH, "utf8");
  const parsed = yaml.load(raw);
  if (!Array.isArray(parsed)) throw new Error("sources.yaml must be a YAML list of source definitions");
  return parsed.filter((s): s is SourceDef => !!s && typeof s === "object" && "id" in s && "type" in s);
}

/** The orchestrated run. Returns the report + whether any red item was seen. */
export async function run(cli: Cli): Promise<{ report: RunReport; redSeen: boolean; dbError: boolean }> {
  resetSynthBudget();
  const startedAt = new Date().toISOString();

  const all = await loadSources();
  const sources = cli.only ? selectOnly(all, cli.only) : all;
  if (cli.only && sources.length === 0) {
    throw new Error(`--only "${cli.only}" matched no source in sources.yaml`);
  }

  // Warm the local embedding model once (so the first upsert isn't slow). Non-fatal.
  if (!cli.dryRun && dbEnabled()) await warmEmbeddings();

  const errors: string[] = [];
  const auditErrors: { source: string; error: string }[] = [];
  const applied: AppliedItem[] = [];
  let redSeen = false;
  let dbError = false;

  for (const src of sources) {
    try {
      const state = await loadState(src.id);
      const items = await detectSource(src, state, cli.sinceMs);

      // The change cursor = the NEWEST detected item's hash (items are sorted
      // newest-first in detect.detectSource). Default to the prior cursor when
      // nothing new was detected.
      const newestHash = items.length && items[0].hash ? items[0].hash : state.lastHash;

      for (const item of items as DetectedItem[]) {
        // --- IP GATE first (cheapest; a red item is dropped before fetching) ---
        const verdict = classifyLicense(src.license);
        await appendAudit(src.id, item.title, item.url, verdict, cli.dryRun);
        if (verdict.risk === "red" || !verdict.allowed) {
          redSeen = true;
          applied.push({ outcome: "dropped" });
          continue;
        }

        // --- FETCH ---
        const doc = await fetchItem(src, item);
        if (!doc.content || doc.content.length < 40) {
          applied.push({ outcome: "skipped" });
          continue;
        }

        // --- SYNTHESIZE ---
        const synth = await synthesizeItem(src, item, doc, verdict);

        // --- APPLY (embed for updates; stage new topics; honor dry-run) ---
        const result = await applyNote(synth, verdict, cli.dryRun);
        applied.push(result);
      }

      // Persist the source's cursor (last_checked always; last_hash if advanced).
      if (!cli.dryRun) {
        await saveState(src, { lastChecked: new Date().toISOString(), lastHash: newestHash });
      }
    } catch (err) {
      const msg = `${src.id}: ${(err as Error).message}`;
      errors.push(msg);
      auditErrors.push({ source: src.id, error: (err as Error).message });
      // A DB-connection class error is fatal-worthy (non-zero exit).
      if (/database|connection|econnrefused|password|pg|ssl/i.test((err as Error).message)) dbError = true;
    }
  }

  const tally = tallyApply(applied);

  // ONE audit row per run (skipped under dry-run / no DB).
  try {
    await writeRunAudit(tally, auditErrors, `since=${cli.since}${cli.only ? ` only=${cli.only}` : ""}`, cli.dryRun);
  } catch (err) {
    errors.push(`audit: ${(err as Error).message}`);
    dbError = true;
  }

  // Daily run-log row (migration 0012): one per non-dry run — whether it ran + what it brought.
  try {
    await writeRunLog({
      startedAt,
      ok: !redSeen && !dbError && errors.length === 0,
      since: cli.since,
      only: cli.only,
      dryRun: cli.dryRun,
      sourcesPolled: sources.length,
      tally,
      applied,
      errors,
    });
  } catch (err) {
    errors.push(`runlog: ${(err as Error).message}`);
  }

  const report: RunReport = {
    added: tally.added,
    updated: tally.updated,
    skipped: tally.skipped,
    dropped: tally.dropped,
    sources: sources.length,
    errors,
  };
  return { report, redSeen, dbError };
}

// ---- CLI entry --------------------------------------------------------------
const cli = parseArgs(process.argv.slice(2));
try {
  const { report, redSeen, dbError } = await run(cli);
  printReport(report, { dryRun: cli.dryRun, sinceLabel: cli.since });
  await postSlack(report, { dryRun: cli.dryRun, sinceLabel: cli.since });

  // Exit NON-ZERO on any red IP item or DB error (CI signal). Other per-source
  // fetch errors are reported but don't fail the whole run.
  if (redSeen || dbError) {
    console.error(`✗ Curator exiting non-zero (${redSeen ? "red IP item dropped" : ""}${redSeen && dbError ? "; " : ""}${dbError ? "DB error" : ""}).`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`✗ KB Curator fatal: ${(err as Error).message}`);
  process.exit(1);
}
