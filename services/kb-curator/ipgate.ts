/**
 * # ipgate — the license / IP gate before anything enters the KB
 *
 * Every detected item carries the VETTED license recorded on its `SourceDef`
 * (set by a human in sources.yaml — we never guess from the upstream). This gate
 * turns that license into a traffic-light verdict and a hard allow/block:
 *
 *   green   — permissive OSS (MIT/Apache/BSD/…), CC-BY, or official docs whose
 *             FACTS we summarize. Allowed.
 *   orange  — caution licenses (copyleft/source-available/research abstracts):
 *             allowed as FACTS-ONLY (no verbatim copying — enforced in synthesize).
 *   red     — paywalled / proprietary / unknown / all-rights-reserved. BLOCKED:
 *             dropped, NEVER embedded.
 *
 * It STAMPS each item's verdict {license, risk, allowed} and APPENDS a line to
 * KB_IP_AUDIT.md so every decision is auditable. This is provenance discipline,
 * not legal advice — when unsure, a license is treated as red.
 */

import { appendFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { IpVerdict } from "./types";

// Repo-root audit file (resolved relative to this file URL).
const AUDIT_PATH = fileURLToPath(new URL("../../KB_IP_AUDIT.md", import.meta.url));

// ----------------------------------------------------------------------------
// License classification (case/spacing-insensitive matching on a normalized key).
// ----------------------------------------------------------------------------

// GREEN: permissive OSS + CC-BY + official docs (facts summarized, attributed).
const GREEN = [
  "mit",
  "apache-2.0",
  "apache2.0",
  "apache 2.0",
  "bsd",
  "bsd-2-clause",
  "bsd-3-clause",
  "isc",
  "postgresql",
  "cc-by",
  "cc-by-4.0",
  "cc0",
  "unlicense",
  "official-docs",
  "official_docs",
  "public domain",
  "u.s. government work",
];

// ORANGE: allowed but FACTS-ONLY (no expression copied). Copyleft, source-available,
// research abstracts, model cards with non-permissive terms.
const ORANGE = [
  "cc-by-sa",
  "cc-by-sa-4.0",
  "gpl",
  "gpl-3.0",
  "agpl",
  "lgpl",
  "mpl",
  "mpl-2.0",
  "epl",
  "bsl",
  "bsl-1.1",
  "busl",
  "sspl",
  "elastic-2.0",
  "elastic 2.0",
  "arxiv-abstract",
  "arxiv abstract",
  "research paper",
  "facts only",
  "facts-only",
  "official engineering note",
  "official_engineering_blog",
];

/** Normalize a license string for matching (lowercase, collapse whitespace). */
function norm(license: string): string {
  return license.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Does the normalized license contain any token from `list`? */
function matches(n: string, list: string[]): boolean {
  return list.some((tok) => n.includes(tok));
}

/**
 * Classify a license string into an IpVerdict. Unknown / restrictive / paywalled
 * → red (blocked). Order matters: red signals first, then green, then orange,
 * then unknown→red.
 */
export function classifyLicense(license: string): IpVerdict {
  const n = norm(license);

  // Hard-block signals override everything (a "GPL paywalled" string is red).
  if (!n || matches(n, ["all rights reserved", "proprietary", "paywall", "subscription required", "no-license", "unknown"])) {
    return {
      license,
      risk: "red",
      allowed: false,
      note: "Non-permissive / unknown license — blocked from the KB (never embedded).",
    };
  }

  if (matches(n, GREEN) && !matches(n, ORANGE)) {
    return { license, risk: "green", allowed: true, note: "Permissive/official — summarized with attribution." };
  }

  if (matches(n, ORANGE) || matches(n, GREEN)) {
    return {
      license,
      risk: "orange",
      allowed: true,
      note: "Caution license — FACTS-ONLY synthesis (no verbatim copying, ≤1 short attributed quote).",
    };
  }

  // Default: anything we can't positively place is treated as red.
  return { license, risk: "red", allowed: false, note: "Unrecognized license — treated as restrictive (blocked)." };
}

// ----------------------------------------------------------------------------
// Audit log — append one row per gated item to KB_IP_AUDIT.md.
// ----------------------------------------------------------------------------

const RISK_ICON: Record<IpVerdict["risk"], string> = { green: "🟢", orange: "🟠", red: "🔴" };

/** Ensure the audit file has a "Curator runs" appendix section header (once). */
async function ensureAuditSection(): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(AUDIT_PATH, "utf8");
  } catch {
    /* file may not exist yet — append will create it */
  }
  if (!existing.includes("## Curator runs (auto-appended)")) {
    await appendFile(
      AUDIT_PATH,
      `\n\n## Curator runs (auto-appended)\n\n` +
        `Each row = one item the KB curator gated. 🔴 items are DROPPED (never embedded).\n\n` +
        `| When (UTC) | Source | Item | License | Risk | Allowed | Note |\n` +
        `| --- | --- | --- | --- | --- | --- | --- |\n`,
      "utf8"
    );
  }
}

/** Escape pipes/newlines so a value can't break the Markdown table row. */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

/**
 * Append one audit row to KB_IP_AUDIT.md. Best-effort: a logging failure never
 * fails the run. Under `dryRun` it writes NOTHING (the audit file is a prod
 * artifact, and dry-run must not touch prod).
 */
export async function appendAudit(
  sourceId: string,
  itemTitle: string,
  itemUrl: string,
  verdict: IpVerdict,
  dryRun = false
): Promise<void> {
  if (dryRun) return;
  try {
    await ensureAuditSection();
    const row =
      `| ${new Date().toISOString()} | ${cell(sourceId)} | ${cell(itemTitle)} (${cell(itemUrl)}) | ` +
      `${cell(verdict.license)} | ${RISK_ICON[verdict.risk]} ${verdict.risk} | ${verdict.allowed ? "yes" : "no"} | ${cell(verdict.note ?? "")} |\n`;
    await appendFile(AUDIT_PATH, row, "utf8");
  } catch {
    /* audit is best-effort */
  }
}
