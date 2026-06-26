/**
 * # Ingest curated lesson visuals (Codex-produced concept diagrams) into the DB.
 *
 * For each manifest asset in BOTH source folders (v3 + v4): read the diagram HTML,
 * extract the <svg>…</svg>, INLINE assets/v3.css as a SCOPED <style> child of the
 * SVG (so it's standalone — classes resolve with no external stylesheet, and the
 * page-level rules can't leak into the lesson), embed its identifier text with the
 * SAME local model the RAG `chunks` use (free, $0), and upsert by visual_id.
 *
 * Re-runnable (idempotent upsert). Targets DATABASE_URL (staging-local); re-run with
 * DATABASE_URL="$PROD_URL" for prod.
 *
 *   npx tsx scripts/ingest-visuals.ts
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { query, dbEnabled, rawPool } from "../src/lib/db";
import { localEmbeddings, toVectorLiteral } from "../src/rag/embed";

const BASE = process.env.VISUALS_DIR || "/Users/anandpareek/Documents/KB - Visuals";
// v5 is the high-quality drop-in replacement: ONE folder now holds every concept (same
// visual_id / kb_identifier_keys / keywords as v3+v4), with a new shared `assets/diagram.css`.
const FOLDERS = ["custom-html-v5"];
// The shared stylesheet filename per folder (v5 → diagram.css; older sets used v3.css). The
// ingester reads it from the SAME folder the diagrams come from and inlines it (scoped).
const CSS_CANDIDATES = ["diagram.css", "v3.css"];

interface Asset {
  visual_id: string;
  title: string;
  category?: string;
  kb_identifier_keys?: string[];
  kb_identifier_keywords?: string[];
  diagram_type?: string;
  scenario?: string;
  html_path: string;
}

/**
 * Turn the standalone v3.css into a block SCOPED under `.viz-svg`, dropping the
 * page-level rules (html, body, universal, .board, svg) that would otherwise leak
 * globally (an inline-SVG style applies document-wide, so :root/body would clash
 * with the lesson's own --ink/--muted tokens). The :root vars move onto `.viz-svg`
 * so they inherit only to the diagram's descendants.
 */
function scopeCss(css: string, scope = ".viz-svg"): string {
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: string[] = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) {
    const decls = m[2].trim();
    if (!decls) continue;
    for (const sel of m[1].split(",").map((s) => s.trim()).filter(Boolean)) {
      if (/^(html|body|\*|html\s*,\s*body)$/i.test(sel)) continue; // page chrome → drop
      if (sel === ".board" || sel === "svg") continue; // wrapper / sizing handled by our CSS
      if (sel === ":root") { out.push(`${scope}{${decls}}`); continue; }
      out.push(`${scope} ${sel}{${decls}}`);
    }
  }
  return out.join("");
}

/** Extract the <svg>…</svg>, add the viz-svg class, and inline the scoped CSS. */
function buildStandaloneSvg(html: string, scopedCss: string): string | null {
  const match = html.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  let svg = match[0];
  // add the scope class (preserve any existing class)
  if (/^<svg[^>]*\bclass\s*=/.test(svg)) svg = svg.replace(/(<svg[^>]*\bclass\s*=\s*["'])/i, `$1viz-svg `);
  else svg = svg.replace(/^<svg\b/i, '<svg class="viz-svg"');
  // inject the scoped <style> as the first child
  svg = svg.replace(/^(<svg\b[^>]*>)/i, `$1<style>${scopedCss}</style>`);
  return svg;
}

async function main() {
  if (!dbEnabled()) { console.error("✗ DATABASE_URL not set — cannot ingest."); process.exit(1); }
  let total = 0, ok = 0, skipped = 0;
  for (const folder of FOLDERS) {
    const folderPath = join(BASE, folder);
    let manifest: { assets?: Asset[] };
    try {
      manifest = JSON.parse(await readFile(join(folderPath, "custom_visuals_manifest.json"), "utf8"));
    } catch (e) {
      console.warn(`• ${folder}: no manifest (${(e as Error).message}) — skipping`);
      continue;
    }
    // Read the shared stylesheet from THIS folder (v5 → diagram.css; older → v3.css) and scope it.
    let css = "";
    for (const name of CSS_CANDIDATES) {
      css = await readFile(join(folderPath, "assets", name), "utf8").catch(() => "");
      if (css) break;
    }
    const scopedCss = scopeCss(css);
    const assets = manifest.assets ?? [];
    console.log(`• ${folder}: ${assets.length} assets`);
    for (const a of assets) {
      total++;
      try {
        const html = await readFile(join(folderPath, a.html_path), "utf8");
        const svg = buildStandaloneSvg(html, scopedCss);
        if (!svg) { console.warn(`  ✗ ${a.visual_id}: no <svg> in ${a.html_path}`); skipped++; continue; }
        const keywords = (a.kb_identifier_keywords ?? []).map((k) => k.toLowerCase());
        const keys = a.kb_identifier_keys ?? [];
        const embedText = [a.title, a.category, a.scenario, keywords.join(" ")].filter(Boolean).join(" — ").slice(0, 800);
        let embeddingLit: string | null = null;
        try { const [vec] = await localEmbeddings.embedPassages([embedText]); embeddingLit = toVectorLiteral(vec); }
        catch (e) { console.warn(`  · ${a.visual_id}: embed failed (${(e as Error).message}) — storing without vector`); }
        await query(
          `insert into lesson_visuals (visual_id, title, category, diagram_type, scenario, identifier_keys, keywords, svg, embed_text, embedding)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${embeddingLit ? "$10::vector" : "null"})
           on conflict (visual_id) do update set
             title = excluded.title, category = excluded.category, diagram_type = excluded.diagram_type,
             scenario = excluded.scenario, identifier_keys = excluded.identifier_keys, keywords = excluded.keywords,
             svg = excluded.svg, embed_text = excluded.embed_text, embedding = excluded.embedding`,
          embeddingLit
            ? [a.visual_id, a.title, a.category ?? null, a.diagram_type ?? null, a.scenario ?? null, keys, keywords, svg, embedText, embeddingLit]
            : [a.visual_id, a.title, a.category ?? null, a.diagram_type ?? null, a.scenario ?? null, keys, keywords, svg, embedText]
        );
        ok++;
      } catch (e) {
        console.warn(`  ✗ ${a.visual_id}: ${(e as Error).message}`); skipped++;
      }
    }
  }
  const cnt = await query<{ n: string; emb: string }>(`select count(*)::text as n, count(embedding)::text as emb from lesson_visuals`).catch(() => []);
  console.log(`\n✓ ingested ${ok}/${total} (skipped ${skipped}). Table now: ${cnt[0]?.n ?? "?"} rows, ${cnt[0]?.emb ?? "?"} with embeddings.`);
  await rawPool()?.end().catch(() => {});
}

main().catch((e) => { console.error(e); process.exit(1); });
