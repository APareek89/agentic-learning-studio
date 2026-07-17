/**
 * audit-lesson-content.mjs — CONTENT-side extraction audit of a rendered world lesson.
 * Companion to qa-world.mjs (which checks element geometry); this one checks what the
 * templates SAY: duplicate SVGs, suspicious provider/model IDs, objective-stem stutter,
 * mid-clause ellipsis metadata, source parity, threshold conflicts, and size stats.
 *
 * Run:  node scripts/audit-lesson-content.mjs <artifactId | path-to-html>
 * Exit: 0 = clean · 1 = findings (printed)
 */
import { readFileSync } from "fs";
import { createHash } from "crypto";

const BASE = process.env.QA_BASE_URL || "http://localhost:5070";
const arg = process.argv[2];
if (!arg) { console.error("usage: node scripts/audit-lesson-content.mjs <artifactId|file.html>"); process.exit(2); }
// A full http(s) URL is fetched verbatim (library lessons serve at /api/lesson/:slug); a .html
// path is read locally; otherwise the arg is an artifactId under /api/artifact/:id.
const html = /^https?:\/\//.test(arg) ? await (await fetch(arg)).text()
  : arg.endsWith(".html") ? readFileSync(arg, "utf8")
  : await (await fetch(`${BASE}/api/artifact/${arg}`)).text();

const findings = [];
const flag = (sev, what) => { findings.push({ sev, what }); console.log(`  ${sev === "P0" ? "✗✗" : "✗"} [${sev}] ${what}`); };

// ---- extraction ----
const templates = [...html.matchAll(/<template id="(wpop-[^"]+)">([\s\S]*?)<\/template>/g)].map((m) => ({ id: m[1], html: m[2], text: m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() }));
const worldData = JSON.parse((html.match(/<script type="application\/json" id="world-data">([\s\S]*?)<\/script>/) || [])[1] || "[]");
console.log(`extracted: ${templates.length} templates · ${worldData.length} stages · ${Math.round(html.length / 1024)}KB html`);

// 1. duplicate SVGs across popups. KaTeX math renders stretchy glyphs (fraction bars,
// \u2016 delimiters, ...) as tiny identical inline SVGs (em-sized, xMinYMin) — sub-glyph
// artifacts, not curated visuals, so they're skipped (a repeated formula is legit content).
const svgHash = {};
const isMathGlyph = (svg) => /preserveAspectRatio="xMinYMin/.test(svg) && /width="[\d.]+em"/.test(svg);
for (const t of templates) for (const m of t.html.matchAll(/<svg[\s\S]*?<\/svg>/g)) {
  if (isMathGlyph(m[0])) continue;
  const h = createHash("md5").update(m[0]).digest("hex").slice(0, 12);
  (svgHash[h] = svgHash[h] || []).push(t.id);
}
for (const [h, ids] of Object.entries(svgHash)) if (ids.length > 2) flag("P1", `SVG ${h} repeated ${ids.length}×: ${ids.join(", ")}`);

// 2. suspicious provider/model IDs (same allowlist as the generation code-gate)
const PROVIDER_OK = [
  /^openai:(chat:|responses:|completion:|embedding[s]?:|assistant:)?(gpt-[45][\w.-]*|o[134][\w.-]*|text-embedding-[\w.-]+)$/i,
  /^anthropic:(messages:|completion:)?claude-[\w.-]+$/i,
];
// IMPORTANT: scan CODE with tags stripped to "" (not " ") — syntax-highlight spans split
// tokens like gpt-4o, and naive extraction invents phantom ids like "gpt-o-…" (this exact
// artifact produced a false P0 in two external audits of this lesson).
const provSeen = new Set();
const deTag = (h) => h.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
for (const t of templates) {
  const codeText = [...t.html.matchAll(/<pre class="code">([\s\S]*?)<\/pre>/g), ...t.html.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => deTag(m[1])).join("\n");
  for (const m of codeText.matchAll(/\b(openai|anthropic):[A-Za-z0-9:._-]+/g)) {
    const tok = m[0];
    if (!PROVIDER_OK.some((re) => re.test(tok)) && !provSeen.has(tok)) { provSeen.add(tok); flag("P0", `suspicious provider id "${tok}" in ${t.id}`); }
  }
}

// 3. objective-stem stutter
for (const t of templates.filter((x) => /-0$/.test(x.id)))
  if (/After this you.?ll be able to\s*(?:•\s*)?After this you.?ll be able to/i.test(t.text)) flag("P1", `doubled objective stem in ${t.id}`);

// 4. mid-clause ellipsis in learner-facing metadata
const ell = worldData.flatMap((s) => [s.tagline, ...(s.cards || []).flatMap((c) => [c.orient, c.capline])]).filter((x) => x && x.endsWith("…"));
if (ell.length > 2) flag("P1", `${ell.length} metadata strings end mid-clause with "…"`);

// 5. source parity (card label vs rendered list)
const srcStage = worldData.find((s) => s.id === "_sources");
if (srcStage) {
  const label = parseInt((srcStage.cards[0].orient.match(/^(\d+)/) || [])[1] || "0", 10);
  const listed = (templates.find((t) => t.id.startsWith(`wpop-${worldData.indexOf(srcStage)}-`))?.html.match(/<li/g) || []).length;
  if (label !== listed) flag("P1", `sources card says ${label}, list renders ${listed}`);
}

// 6. threshold conflicts (same metric name near different numbers)
const nums = {};
for (const t of templates) for (const m of t.text.matchAll(/\b(faithfulness|similarity|relevance)[^.]{0,25}?threshold[^.]{0,15}?(0\.\d{1,2})/gi)) {
  const k = m[1].toLowerCase();
  (nums[k] = nums[k] || new Set()).add(m[2]);
}
for (const [k, set] of Object.entries(nums)) if (set.size > 1) flag("P2", `"${k} threshold" carries ${set.size} different values: ${[...set].join(", ")} (verify each is explained)`);

// 7. leftover raw markdown in visible text
let mdLeaks = 0;
for (const t of templates) if (/\*\*[^*]+\*\*/.test(t.text) && !/tk-|\*\*2|\*\* ?2/.test(t.html)) mdLeaks++;
if (mdLeaks) flag("P1", `${mdLeaks} template(s) show literal **markdown**`);

console.log(`\n${findings.length ? `FINDINGS: ${findings.length}` : "CLEAN — content audit passed"}`);
process.exit(findings.length ? 1 : 0);
