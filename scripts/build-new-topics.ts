/**
 * # Build the NEW library topics THROUGH THE LIVE PIPELINE (Phase 5)
 *
 * Reads the approved manifest (docs/new-topics-proposal.json) and generates each NEW topic with the
 * SAME pipeline as a fresh lesson — profiler → retriever → architect (Opus skeleton) → runDeepDive on
 * every module → writeOverviewProse (glossary/synthesis/finalCheck) → renderArtifact — then INSERTS a
 * fresh row into prebuilt_lessons (slug/title/description/category/level/blueprint/html). readingMode
 * is "world"; quick-mode topics pass cards.quick="on" (density low + ~4 modules).
 *
 * SAFETY: default = DRY RUN. Needs --slugs / --category / --all (and --all needs --yes).
 *   --out-dir <dir>  local-only render (no DB writes) · --dump <dir> DB write + local copy for QA
 *   --concurrency N (≤3) · --limit N · --force (redo rows already at CONTENT_VERSION)
 * Resumable: skips slugs already present at CONTENT_VERSION unless --force.
 *
 * Run (writes go to whatever DATABASE_URL points at — use PROD per the owner directive):
 *   DATABASE_URL="$PROD_URL" NODE_EXTRA_CA_CERTS=... npx tsx scripts/build-new-topics.ts --category "Agents" --dump /tmp/new
 *   …                                                                                   --all --yes
 */
import "dotenv/config";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { profiler, retriever, architect, runDeepDive, writeOverviewProse } from "../src/agent/nodes";
import { renderArtifact } from "../src/render/index";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import type { Blueprint } from "../src/render/schema";

const CONTENT_VERSION = "v5.1-world-2026-07-new";
const MANIFEST = fileURLToPath(new URL("../docs/new-topics-proposal.json", import.meta.url));

interface Topic { slug: string; topic: string; category: string; level: string; mode: string; why?: string; }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "") : undefined;
}
const flag = (n: string) => process.argv.includes(n);
function slugify(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson"; }

/** Generate one NEW topic through the full current pipeline. */
async function generate(t: Topic): Promise<{ bp: Blueprint; built: number; total: number }> {
  const quick = t.mode === "quick";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const st: Record<string, any> = {
    userPrompt: t.topic, cards: quick ? { quick: "on" } : {}, uploadIds: [], referOnly: false,
    industry: "", buildGoal: "", levels: [t.level || "intermediate"], lessonTypes: ["content", "knowledge_check"],
    framework: "", readingMode: "world", userProfile: {},
  };
  Object.assign(st, await profiler(st as never, {} as never));
  Object.assign(st, await retriever(st as never));
  Object.assign(st, await architect(st as never, {} as never));
  if (!(st.validation as { ok?: boolean })?.ok && ((st.reviseCount as number) ?? 0) < 2) Object.assign(st, await architect(st as never, {} as never));
  const bp = st.blueprint as Blueprint | null;
  if (!bp) throw new Error("architect produced no blueprint (skeleton failed)");

  const total = bp.modules.length;
  let built = 0;
  for (const m of bp.modules) {
    const { ok } = await runDeepDive(bp, m.id, { uploadIds: [], referOnly: false });
    if (ok && m.loadState === "full" && m.blocks.length > 0) built++;
  }
  await writeOverviewProse(bp).catch((e) => console.warn(`  [overview-prose] ${(e as Error).message?.slice(0, 80)}`));
  const stub = bp.modules.find((m) => m.loadState !== "full" || m.blocks.length === 0);
  if (stub) throw new Error(`module "${stub.id}" never built (${built}/${total}) — not storing`);
  return { bp, built, total };
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set."); process.exit(1); }
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
  let topics: Topic[] = (manifest.topics ?? []).map((t: Topic) => ({ ...t, slug: t.slug || slugify(t.topic) }));

  const slug = arg("--slug"); const category = arg("--category"); const slugsArg = arg("--slugs");
  const outDir = arg("--out-dir"); const dumpDir = arg("--dump");
  const all = flag("--all"); const force = flag("--force"); const dry = flag("--dry"); const yes = flag("--yes");
  const concurrency = Math.min(3, Math.max(1, parseInt(arg("--concurrency") || "1", 10) || 1));
  const limit = arg("--limit") ? Math.max(0, parseInt(arg("--limit") as string, 10) || 0) : 0;
  const slugList = slugsArg ? slugsArg.split(",").map((s) => s.trim()).filter(Boolean) : [];

  if (slug) topics = topics.filter((t) => t.slug === slug);
  else if (slugList.length) { const set = new Set(slugList); topics = topics.filter((t) => set.has(t.slug)); }
  else if (category) topics = topics.filter((t) => t.category === category);
  if (limit) topics = topics.slice(0, limit);
  if (!topics.length) { console.log("No matching topics."); await rawPool()?.end().catch(() => {}); return; }

  // Resumability: skip topics whose slug already exists at CONTENT_VERSION (unless --force / local mode).
  let existing = new Set<string>();
  if (!outDir) {
    const rows = await query<{ slug: string }>(
      `select slug from prebuilt_lessons where slug = any($1) and content_version = $2`,
      [topics.map((t) => t.slug), CONTENT_VERSION]
    ).catch(() => []);
    existing = new Set(rows.map((r) => r.slug));
  }
  const todo = topics.filter((t) => force || !existing.has(t.slug));
  const hasSelection = !!(slug || category || all || slugList.length || limit);
  const isDry = dry || !hasSelection;

  console.log(`\nBuild NEW topics — content version "${CONTENT_VERSION}"`);
  console.log(`  matched: ${topics.length} · to build: ${todo.length}${topics.length - todo.length ? ` · already current: ${topics.length - todo.length}` : ""}`);
  console.log(`  concurrency: ${concurrency}${outDir ? ` · local → ${outDir}` : dumpDir ? ` · DB + dump → ${dumpDir}` : " · DB write"}\n`);

  if (isDry) {
    console.log(hasSelection ? "DRY RUN (--dry): would build —" : "DRY RUN (no --slugs/--category/--all) — would build:");
    for (const t of todo) console.log(`  • ${t.slug}  [${t.category} · ${t.level} · ${t.mode}]`);
    console.log(`\nRun for real: --category "<Cat>" | --slugs a,b | --all --yes`);
    await rawPool()?.end().catch(() => {}); setTimeout(() => process.exit(0), 200).unref(); return;
  }
  if (all && !yes) { console.log(`✋ Refusing --all without --yes (${todo.length} topics).`); await rawPool()?.end().catch(() => {}); setTimeout(() => process.exit(0), 200).unref(); return; }

  if (outDir) mkdirSync(outDir, { recursive: true });
  if (dumpDir) mkdirSync(dumpDir, { recursive: true });
  let ok = 0, fail = 0, next = 0;
  async function buildOne(t: Topic, n: number) {
    const t0 = Date.now();
    try {
      const { bp, built, total } = await generate(t);
      const html = renderArtifact(bp);
      const description = (bp.meta.thesis || t.why || "").toString().slice(0, 240);
      const estMin = (bp.meta.estTotalMinutes && bp.meta.estTotalMinutes > 0) ? bp.meta.estTotalMinutes : (t.mode === "quick" ? 15 : 30);
      if (outDir) {
        writeFileSync(join(outDir, `${t.slug}.html`), html);
        writeFileSync(join(outDir, `${t.slug}.json`), JSON.stringify(bp, null, 2));
      } else {
        await query(
          `insert into prebuilt_lessons (slug, title, description, category, level, est_minutes, blueprint, html, content_version, rebuilt_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
           on conflict (slug) do update set title=excluded.title, description=excluded.description, category=excluded.category,
             level=excluded.level, est_minutes=excluded.est_minutes, blueprint=excluded.blueprint, html=excluded.html,
             content_version=excluded.content_version, rebuilt_at=now()`,
          [t.slug, t.topic, description, t.category, t.level, estMin, JSON.stringify(bp), html, CONTENT_VERSION]
        );
        if (dumpDir) { writeFileSync(join(dumpDir, `${t.slug}.html`), html); writeFileSync(join(dumpDir, `${t.slug}.json`), JSON.stringify(bp, null, 2)); }
      }
      ok++;
      const fc = (bp.finalCheck && (bp.finalCheck as { questions?: unknown[] }).questions?.length) || 0;
      console.log(`[${n}/${todo.length}] ✓ ${t.slug} · ${built}/${total} mod · ${t.mode} · fc:${fc} · ${(html.length / 1024) | 0}KB · ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      fail++;
      console.log(`[${n}/${todo.length}] ✗ ${t.slug} — ${(e as Error).message?.slice(0, 130)}`);
    }
  }
  async function worker() { while (true) { const i = next++; if (i >= todo.length) break; await buildOne(todo[i], i + 1); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, () => worker()));

  console.log(`\n✓ Built ${ok}/${todo.length}${fail ? ` · ${fail} failed` : ""}${outDir || dumpDir ? ` → ${outDir || dumpDir}/` : ""}.\n`);
  await rawPool()?.end().catch(() => {});
  setTimeout(() => process.exit(0), 300).unref();
}
main().catch((e) => { console.error(e); process.exit(1); });
