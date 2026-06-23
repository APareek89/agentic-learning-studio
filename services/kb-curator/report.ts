/**
 * # report — summarize a curator run (console + optional Slack)
 *
 * Builds a compact human summary of what the run did — added / updated / skipped
 * / dropped(red) / sources polled / errors — and prints it. When SLACK_WEBHOOK is
 * set, it also POSTs the same summary to Slack (best-effort; a webhook failure
 * never fails the run).
 */

import type { RunReport } from "./types";

/** Format the run summary as a plain multi-line string (for logs + Slack). */
export function formatReport(r: RunReport, opts: { dryRun: boolean; sinceLabel: string } = { dryRun: false, sinceLabel: "24h" }): string {
  const head = `KB Curator${opts.dryRun ? " (dry-run)" : ""} — since ${opts.sinceLabel}`;
  const lines = [
    head,
    `  sources polled : ${r.sources}`,
    `  added (new)    : ${r.added}`,
    `  updated        : ${r.updated}`,
    `  skipped        : ${r.skipped}`,
    `  dropped (🔴 IP): ${r.dropped}`,
    `  errors         : ${r.errors.length}`,
  ];
  if (r.errors.length) {
    lines.push("  ── error detail ──");
    for (const e of r.errors.slice(0, 20)) lines.push(`   • ${e}`);
    if (r.errors.length > 20) lines.push(`   • …and ${r.errors.length - 20} more`);
  }
  return lines.join("\n");
}

/** Print the report to the console. */
export function printReport(r: RunReport, opts: { dryRun: boolean; sinceLabel: string }): void {
  console.log("\n" + formatReport(r, opts) + "\n");
}

/**
 * POST the report to Slack when SLACK_WEBHOOK is configured. Best-effort: returns
 * false (and logs a warning) on any failure, never throws.
 */
export async function postSlack(r: RunReport, opts: { dryRun: boolean; sinceLabel: string }): Promise<boolean> {
  const webhook = process.env.SLACK_WEBHOOK;
  if (!webhook) return false;
  const emoji = r.dropped > 0 || r.errors.length > 0 ? ":warning:" : ":books:";
  const text =
    `${emoji} *KB Curator${opts.dryRun ? " (dry-run)" : ""}* — since ${opts.sinceLabel}\n` +
    `• sources: ${r.sources}  • added: ${r.added}  • updated: ${r.updated}  ` +
    `• skipped: ${r.skipped}  • dropped(🔴): ${r.dropped}  • errors: ${r.errors.length}` +
    (r.errors.length ? `\n\`\`\`${r.errors.slice(0, 10).join("\n")}\`\`\`` : "");
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      console.warn(`[report] Slack POST failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[report] Slack POST error: ${(err as Error).message}`);
    return false;
  }
}
