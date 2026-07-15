/**
 * # Library + Community inventory ($0, READ-ONLY)
 *
 * Phase 1 of the library refresh. Reads prebuilt_lessons (Library) and
 * community_lessons / contributors (Community) from whatever DATABASE_URL points
 * at (STAGING per .env) and prints:
 *   - per-lesson: slug, title, category, level, content_version, readingMode,
 *     module count, built-ness (modules fully built), render family (classic
 *     vertical/horizontal vs world), est_minutes, rebuilt_at
 *   - summaries: by category, by readingMode/render-family, by content_version,
 *     built vs partial.
 * Also writes a machine-readable snapshot to docs/library-inventory.json for the
 * later migration/rebuild phases.
 *
 * Run:
 *   NODE_EXTRA_CA_CERTS=".../system-ca-bundle.pem" npx tsx scripts/inventory.ts
 *   (add --json to only (re)write the snapshot quietly)
 */

import "dotenv/config";
import { writeFileSync } from "node:fs";
import { query, dbEnabled, rawPool } from "../src/lib/db";

function parseBp(v: unknown): any | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

interface Analyzed {
  slug: string;
  title: string;
  category: string | null;
  level: string | null;
  estMinutes: number | null;
  contentVersion?: string | null;
  rebuiltAt?: string | null;
  submitter?: string | null;
  likes?: number | null;
  hidden?: boolean | null;
  readingMode: string;
  modules: number;
  builtModules: number;
  fullyBuilt: boolean;
  structureType: string | null;
  renderFamily: "world" | "classic-vertical" | "classic-horizontal";
  bpMissing: boolean;
  isCourse: boolean;
}

function analyze(row: any, opts: { library: boolean }): Analyzed {
  const bp = parseBp(row.blueprint);
  const lp = bp?.learnerProfile ?? {};
  const readingMode: string = lp.readingMode ?? (bp ? "vertical" : "?");
  const modules: any[] = Array.isArray(bp?.modules) ? bp.modules : [];
  const builtModules = modules.filter((m) => m?.loadState === "full" && Array.isArray(m?.blocks) && m.blocks.length > 0).length;
  const fullyBuilt = modules.length > 0 && builtModules === modules.length;
  // A "course"/multi-lesson artifact carries a top-level lessons[] array (legacy auto-split); single lessons don't.
  const isCourse = Array.isArray((bp as any)?.lessons) && (bp as any).lessons.length > 0;
  const renderFamily =
    readingMode === "world" ? "world" : readingMode === "horizontal" ? "classic-horizontal" : "classic-vertical";
  return {
    slug: row.slug,
    title: row.title,
    category: row.category ?? null,
    level: row.level ?? null,
    estMinutes: row.est_minutes ?? null,
    contentVersion: opts.library ? (row.content_version ?? null) : undefined,
    rebuiltAt: opts.library ? (row.rebuilt_at ? String(row.rebuilt_at) : null) : undefined,
    submitter: opts.library ? undefined : (row.submitter_name ?? null),
    likes: opts.library ? undefined : (row.likes ?? 0),
    hidden: opts.library ? undefined : (row.hidden ?? false),
    readingMode,
    modules: modules.length,
    builtModules,
    fullyBuilt,
    structureType: bp?.mentalMap?.structureType ?? null,
    renderFamily,
    bpMissing: !bp,
    isCourse,
  };
}

function pad(s: string | number | null | undefined, n: number): string {
  const str = s == null ? "" : String(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str.padEnd(n);
}

function tally<T>(rows: T[], key: (r: T) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = key(r); out[k] = (out[k] ?? 0) + 1; }
  return out;
}
function printTally(title: string, t: Record<string, number>) {
  console.log(`\n${title}`);
  for (const k of Object.keys(t).sort((a, b) => t[b] - t[a])) console.log(`  ${pad(k, 28)} ${t[k]}`);
}

async function main() {
  const jsonOnly = process.argv.includes("--json");
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }

  // Which DB are we pointed at (sanity — must be STAGING).
  const dbInfo = await query<{ current_database: string; inet: string | null }>(
    `select current_database() as current_database, inet_server_addr()::text as inet`
  ).catch(() => [] as any[]);

  // ---- Library ----
  const libRows = await query<any>(
    `select slug, title, description, category, level, est_minutes, blueprint, content_version, rebuilt_at
       from prebuilt_lessons order by category nulls last, level, slug`
  ).catch((e) => { console.error("prebuilt_lessons query failed:", (e as Error).message); return []; });
  const lib = libRows.map((r) => analyze(r, { library: true }));

  // ---- Community ----
  const commRows = await query<any>(
    `select slug, title, description, category, level, est_minutes, blueprint, submitter_name, likes, hidden, created_at
       from community_lessons order by created_at desc`
  ).catch((e) => { console.error("community_lessons query failed:", (e as Error).message); return []; });
  const comm = commRows.map((r) => analyze(r, { library: false }));

  const contribCount = await query<{ n: string }>(`select count(*)::text as n from contributors`).catch(() => [{ n: "?" }]);

  if (!jsonOnly) {
    console.log(`\n================ DB: ${dbInfo[0]?.current_database ?? "?"} (server ${dbInfo[0]?.inet ?? "local"}) ================`);

    // ===== LIBRARY =====
    console.log(`\n\n########## LIBRARY (prebuilt_lessons) — ${lib.length} lessons ##########`);
    console.log(`\n${pad("slug", 42)}${pad("cat", 16)}${pad("lvl", 13)}${pad("ver", 26)}${pad("read", 8)}${pad("mods", 8)}${pad("built", 7)}${pad("family", 18)}`);
    console.log("-".repeat(140));
    for (const l of lib) {
      console.log(
        pad(l.slug, 42) + pad(l.category, 16) + pad(l.level, 13) + pad(l.contentVersion, 26) +
        pad(l.readingMode, 8) + pad(l.modules, 8) + pad(`${l.builtModules}/${l.modules}`, 7) +
        pad(l.renderFamily, 18) + (l.fullyBuilt ? "" : "  ⚠ PARTIAL") + (l.bpMissing ? "  ⚠ NO-BP" : "") + (l.isCourse ? "  ⚠ COURSE" : "")
      );
    }
    printTally(`LIBRARY by category (${lib.length} total):`, tally(lib, (l) => l.category ?? "?"));
    printTally("LIBRARY by level:", tally(lib, (l) => l.level ?? "?"));
    printTally("LIBRARY by readingMode / render family:", tally(lib, (l) => l.renderFamily));
    printTally("LIBRARY by content_version:", tally(lib, (l) => l.contentVersion ?? "(null)"));
    const libPartial = lib.filter((l) => !l.fullyBuilt);
    console.log(`\nLIBRARY built-ness: ${lib.filter((l) => l.fullyBuilt).length}/${lib.length} fully built${libPartial.length ? ` · PARTIAL: ${libPartial.map((l) => l.slug).join(", ")}` : ""}`);

    // ===== COMMUNITY =====
    console.log(`\n\n########## COMMUNITY (community_lessons) — ${comm.length} lessons · ${contribCount[0]?.n} contributors ##########`);
    if (comm.length) {
      console.log(`\n${pad("slug", 46)}${pad("cat", 16)}${pad("lvl", 13)}${pad("by", 16)}${pad("♥", 5)}${pad("read", 8)}${pad("built", 7)}${pad("family", 18)}`);
      console.log("-".repeat(140));
      for (const c of comm) {
        console.log(
          pad(c.slug, 46) + pad(c.category, 16) + pad(c.level, 13) + pad(c.submitter, 16) + pad(c.likes, 5) +
          pad(c.readingMode, 8) + pad(`${c.builtModules}/${c.modules}`, 7) + pad(c.renderFamily, 18) +
          (c.hidden ? "  ⚠ HIDDEN" : "") + (c.fullyBuilt ? "" : "  ⚠ PARTIAL") + (c.bpMissing ? "  ⚠ NO-BP" : "") + (c.isCourse ? "  ⚠ COURSE" : "")
        );
      }
      printTally("COMMUNITY by category:", tally(comm, (c) => c.category ?? "?"));
      printTally("COMMUNITY by readingMode / render family:", tally(comm, (c) => c.renderFamily));
      const commPartial = comm.filter((c) => !c.fullyBuilt);
      console.log(`\nCOMMUNITY built-ness: ${comm.filter((c) => c.fullyBuilt).length}/${comm.length} fully built${commPartial.length ? ` · PARTIAL: ${commPartial.map((c) => c.slug).join(", ")}` : ""}`);
    } else {
      console.log("\n  (no community lessons)");
    }

    // ===== MIGRATION-READINESS =====
    console.log(`\n\n########## MIGRATION READINESS (readingMode → world) ##########`);
    const libClassicFull = lib.filter((l) => l.renderFamily !== "world" && l.fullyBuilt && !l.isCourse);
    const commClassicFull = comm.filter((c) => c.renderFamily !== "world" && c.fullyBuilt && !c.isCourse);
    console.log(`  LIBRARY classic + fully-built (eligible to flip if not rebuilt): ${libClassicFull.length}/${lib.length}`);
    console.log(`  COMMUNITY classic + fully-built (eligible to flip): ${commClassicFull.length}/${comm.length}`);
    const skipCourse = [...lib, ...comm].filter((x) => x.isCourse);
    const skipPartial = [...lib, ...comm].filter((x) => !x.fullyBuilt);
    if (skipCourse.length) console.log(`  ⚠ SKIP (course/multi-lesson): ${skipCourse.map((x) => x.slug).join(", ")}`);
    if (skipPartial.length) console.log(`  ⚠ SKIP (partial build): ${skipPartial.map((x) => x.slug).join(", ")}`);
  }

  // ---- snapshot ----
  const snapshot = {
    generatedAt: new Date().toISOString(),
    db: dbInfo[0]?.current_database ?? null,
    library: lib,
    community: comm,
    contributors: Number(contribCount[0]?.n) || 0,
  };
  writeFileSync("docs/library-inventory.json", JSON.stringify(snapshot, null, 2));
  if (!jsonOnly) console.log(`\n\n✓ snapshot → docs/library-inventory.json (${lib.length} library + ${comm.length} community)`);

  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 200).unref();
}

main().catch((e) => { console.error(e); process.exit(1); });
