/**
 * # SEO surfaces for the PUBLIC Library — crawlable, server-rendered pages.
 *
 * Purely ADDITIVE. Three renderers, all producing full HTML/XML with the real
 * content in the INITIAL response (no iframe, no client fetch), so Google indexes
 * our actual lessons instead of the ~6 thin SPA pages:
 *
 *   - renderLibraryLessonPage → one lesson at /library/:slug. REUSES the proven
 *     renderArtifact() (content already server-present for built lessons) and injects
 *     an SEO <head> (unique title/description/canonical + OpenGraph/Twitter + JSON-LD)
 *     plus a slim site header/footer with internal links + a "Generate your own lesson"
 *     CTA. The in-app SPA view stays canonical to "/"; THIS page is the indexable one.
 *   - renderLibraryIndexPage → the crawlable index at /library (links to every lesson).
 *   - renderSitemap → /sitemap.xml from the live lesson list + the static public pages.
 *
 * No content decisions are made here — titles/descriptions come straight from the
 * lesson row (or its Blueprint thesis); this is routing + <head> plumbing only.
 */

import { renderArtifact } from "./index";
import type { LibraryCard, LibraryLesson } from "../lib/library";

const SITE = "Agentic Learning Studio";
/** Canonical production origin (overridable for staging/preview). No trailing slash. */
const BASE = (process.env.PUBLIC_BASE_URL || "https://prathibhax.com").replace(/\/$/, "");
const OG_IMAGE = `${BASE}/wizbit-logo.png`;

// ---- tiny escapers (self-contained; renderArtifact has its own) --------------
function esc(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: unknown): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}
/** JSON-LD payload; escape "<" so a stray "</script>" in a field can't break out. */
function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}
/** A clean, ~155-char meta description from the lesson description (fallback: thesis/topic). */
function metaDesc(primary: string | null | undefined, fallback: string): string {
  const t = String(primary || fallback || "").replace(/\s+/g, " ").trim();
  if (t.length <= 155) return t;
  return t.slice(0, 152).replace(/[\s,;:.–—-]+\S*$/, "") + "…";
}
function isoDuration(min: number | null | undefined): string | undefined {
  return min && min > 0 ? `PT${Math.round(min)}M` : undefined;
}

// ---- shared site chrome CSS (scoped .seo-* classes; theme-independent colors) ----
const CHROME_CSS = `
.seo-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 18px;background:#0f1115;color:#fff;font:600 14px/1.3 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.seo-bar .seo-brand{color:#fff;text-decoration:none;font-weight:800;letter-spacing:-.01em}
.seo-cta{display:inline-block;background:#635bff;color:#fff !important;text-decoration:none;padding:7px 13px;border-radius:8px;font:600 13px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;white-space:nowrap}
.seo-cta:hover{background:#4f47e0}
.seo-foot{max-width:900px;margin:0 auto;padding:26px 20px 42px;border-top:1px solid #e6e6ef;font:400 14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#33353d;background:#fff}
.seo-foot h2{font-size:15px;margin:0 0 10px;color:#0f1115}
.seo-related ul{list-style:none;padding:0;margin:0 0 20px;display:grid;gap:8px}
.seo-related a{color:#4f47e0;text-decoration:none}
.seo-related a:hover{text-decoration:underline}
.seo-foot-cta{margin:6px 0 18px}
.seo-foot-links{display:flex;gap:16px;flex-wrap:wrap;margin:0 0 10px}
.seo-foot-links a{color:#5a5d67;text-decoration:none;font-size:13px}
.seo-foot-links a:hover{text-decoration:underline}
.seo-foot-copy{margin:0;color:#9498a3;font-size:12.5px}
`;

/** The slim top site-bar injected at the top of a lesson page (brand → home + CTA → builder). */
function lessonHeader(): string {
  return `<div class="seo-bar"><a class="seo-brand" href="/">${esc(SITE)}</a>` +
    `<a class="seo-cta" href="/builder">Generate your own lesson →</a></div>`;
}

/** The lesson-page footer: related lessons (internal links) + CTA + site links. */
function lessonFooter(lesson: LibraryLesson, related: LibraryCard[]): string {
  const rel = related.length
    ? `<nav class="seo-related" aria-label="Related lessons"><h2>Related lessons</h2><ul>` +
      related.map((r) => `<li><a href="/library/${escAttr(r.slug)}">${esc(r.title)}</a></li>`).join("") +
      `</ul></nav>`
    : "";
  return `<footer class="seo-foot">${rel}` +
    `<div class="seo-foot-cta"><a class="seo-cta" href="/builder">Generate your own lesson →</a></div>` +
    `<nav class="seo-foot-links"><a href="/">Home</a><a href="/library">All lessons</a>` +
    `<a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>` +
    `<p class="seo-foot-copy">© ${esc(SITE)}</p></footer>`;
}

/**
 * Render one Library lesson as a standalone, crawlable page.
 * Reuses renderArtifact (interactive + content in the initial HTML) and injects the
 * SEO head, site chrome, and the slug/source the knowledge-check runtime needs.
 */
export function renderLibraryLessonPage(lesson: LibraryLesson, related: LibraryCard[]): string {
  const url = `${BASE}/library/${lesson.slug}`;
  const titleText = `${lesson.title} — ${SITE}`;
  const desc = metaDesc(lesson.description, lesson.blueprint?.meta?.thesis || `A free, interactive lesson: ${lesson.title}.`);

  const ld = [
    {
      "@context": "https://schema.org", "@type": "LearningResource",
      name: lesson.title, description: desc, url,
      inLanguage: "en", isAccessibleForFree: true, learningResourceType: "lesson",
      ...(lesson.level ? { educationalLevel: lesson.level } : {}),
      ...(isoDuration(lesson.estMinutes) ? { timeRequired: isoDuration(lesson.estMinutes) } : {}),
      ...(lesson.category ? { about: lesson.category } : {}),
      image: OG_IMAGE,
      provider: { "@type": "Organization", name: SITE, url: BASE },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: "Library", item: `${BASE}/library` },
        { "@type": "ListItem", position: 3, name: lesson.title, item: url },
      ],
    },
  ];

  const headHtml =
    `<meta name="description" content="${escAttr(desc)}"/>` +
    `<meta name="robots" content="index,follow"/>` +
    `<link rel="canonical" href="${escAttr(url)}"/>` +
    `<link rel="icon" type="image/png" href="/wizbit-logo.png"/>` +
    `<meta property="og:type" content="article"/>` +
    `<meta property="og:site_name" content="${escAttr(SITE)}"/>` +
    `<meta property="og:title" content="${escAttr(titleText)}"/>` +
    `<meta property="og:description" content="${escAttr(desc)}"/>` +
    `<meta property="og:url" content="${escAttr(url)}"/>` +
    `<meta property="og:image" content="${escAttr(OG_IMAGE)}"/>` +
    `<meta name="twitter:card" content="summary"/>` +
    `<meta name="twitter:title" content="${escAttr(titleText)}"/>` +
    `<meta name="twitter:description" content="${escAttr(desc)}"/>` +
    `<meta name="twitter:image" content="${escAttr(OG_IMAGE)}"/>` +
    `<script type="application/ld+json">${jsonLd(ld)}</script>` +
    `<style>${CHROME_CSS}</style>`;

  const seo = {
    title: titleText, headHtml,
    bodyTop: lessonHeader(), bodyEnd: lessonFooter(lesson, related),
    slug: lesson.slug, source: "library" as const,
  };

  // Primary path: re-render from the Blueprint (mirrors /api/lesson/:slug) with SEO injected.
  if (lesson.blueprint) return renderArtifact(lesson.blueprint, { seo });
  // Fallback: no Blueprint on this row — inject the SEO/chrome into the stored HTML (still a full
  // page with content in the initial HTML; no iframe).
  return injectIntoStoredHtml(lesson.html, titleText, headHtml, seo.bodyTop, seo.bodyEnd);
}

/** Inject title/head/chrome into a pre-rendered stored HTML doc (Blueprint-less fallback). */
function injectIntoStoredHtml(html: string, titleText: string, headHtml: string, bodyTop: string, bodyEnd: string): string {
  let out = html;
  if (/<title>[\s\S]*?<\/title>/i.test(out)) out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(titleText)}</title>`);
  else out = out.replace(/<head[^>]*>/i, (m) => `${m}<title>${esc(titleText)}</title>`);
  out = out.replace(/<\/head>/i, `${headHtml}</head>`);
  out = out.replace(/(<body[^>]*>)/i, `$1${bodyTop}`);
  out = out.replace(/<\/body>/i, `${bodyEnd}</body>`);
  return out;
}

/**
 * Render the crawlable Library INDEX (/library): every lesson grouped by category,
 * each linking to /library/:slug. Lightweight semantic HTML — no heavy runtime.
 */
export function renderLibraryIndexPage(cards: LibraryCard[]): string {
  const url = `${BASE}/library`;
  const titleText = `AI & Agentic Engineering Lessons — ${SITE}`;
  const desc = metaDesc(
    `Browse ${cards.length} free, interactive lessons on AI, LLMs, RAG, and agents — from ${SITE}. Learn at your level; no signup to read.`,
    "Free, interactive AI and agentic-engineering lessons."
  );

  // Group by category, preserving the DB order (already category, then length).
  const groups: { category: string; items: LibraryCard[] }[] = [];
  for (const c of cards) {
    const cat = c.category || "Lessons";
    let g = groups.find((x) => x.category === cat);
    if (!g) { g = { category: cat, items: [] }; groups.push(g); }
    g.items.push(c);
  }

  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem", position: i + 1, url: `${BASE}/library/${c.slug}`, name: c.title,
    })),
  };
  const collection = {
    "@context": "https://schema.org", "@type": "CollectionPage",
    name: titleText, description: desc, url,
    isPartOf: { "@type": "WebSite", name: SITE, url: BASE },
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Library", item: url },
    ],
  };

  const sections = groups.map((g) =>
    `<section><h2>${esc(g.category)}</h2><ul class="lessons">` +
    g.items.map((c) => {
      const tags = [c.level, c.estMinutes ? `${c.estMinutes} min` : ""].filter(Boolean).map(esc).join(" · ");
      return `<li><a href="/library/${escAttr(c.slug)}">${esc(c.title)}</a>` +
        (c.description ? `<p class="desc">${esc(c.description)}</p>` : "") +
        (tags ? `<p class="tags">${tags}</p>` : "") + `</li>`;
    }).join("") +
    `</ul></section>`
  ).join("");

  const empty = cards.length === 0
    ? `<p class="lead">The library is loading — check back shortly.</p>` : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titleText)}</title>
<meta name="description" content="${escAttr(desc)}"/>
<meta name="robots" content="index,follow"/>
<link rel="canonical" href="${escAttr(url)}"/>
<link rel="icon" type="image/png" href="/wizbit-logo.png"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${escAttr(SITE)}"/>
<meta property="og:title" content="${escAttr(titleText)}"/>
<meta property="og:description" content="${escAttr(desc)}"/>
<meta property="og:url" content="${escAttr(url)}"/>
<meta property="og:image" content="${escAttr(OG_IMAGE)}"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${escAttr(titleText)}"/>
<meta name="twitter:description" content="${escAttr(desc)}"/>
<meta name="twitter:image" content="${escAttr(OG_IMAGE)}"/>
<script type="application/ld+json">${jsonLd([collection, breadcrumb, itemList])}</script>
<style>${CHROME_CSS}
body{margin:0;background:#fff;color:#22242b;font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:900px;margin:0 auto;padding:30px 20px 60px}
h1{font-size:30px;letter-spacing:-.02em;margin:18px 0 8px;color:#0f1115}
.lead{color:#565963;margin:0 0 26px;font-size:16px}
section h2{font-size:18px;margin:30px 0 10px;color:#0f1115;border-bottom:1px solid #ececf4;padding-bottom:6px}
ul.lessons{list-style:none;padding:0;margin:0;display:grid;gap:14px}
ul.lessons a{color:#4f47e0;text-decoration:none;font-weight:600;font-size:16px}
ul.lessons a:hover{text-decoration:underline}
.desc{color:#5c5f69;font-size:14px;margin:3px 0 0}
.tags{color:#9498a3;font-size:12.5px;margin:2px 0 0}
</style>
</head>
<body>
${lessonHeader()}
<main class="wrap">
<h1>AI &amp; Agentic Engineering Lessons</h1>
<p class="lead">${esc(cards.length)} free, interactive lessons — pick one to read instantly, or <a href="/builder">generate your own</a>.</p>
${empty}${sections}
</main>
${lessonFooter({ slug: "", title: "", description: null, category: null, level: null, estMinutes: null, blueprint: null, html: "" }, [])}
</body>
</html>`;
}

/** Generate /sitemap.xml from the live lesson list + the static public pages. */
export function renderSitemap(cards: LibraryCard[]): string {
  const staticPaths: { path: string; changefreq: string; priority: string }[] = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/library", changefreq: "weekly", priority: "0.9" },
    { path: "/hands-on", changefreq: "monthly", priority: "0.5" },
    { path: "/privacy", changefreq: "monthly", priority: "0.3" },
    { path: "/security", changefreq: "monthly", priority: "0.3" },
    { path: "/terms", changefreq: "monthly", priority: "0.3" },
    { path: "/report-issue", changefreq: "yearly", priority: "0.2" },
  ];
  const xmlEsc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const urls: string[] = [
    ...staticPaths.map((s) =>
      `  <url><loc>${BASE}${s.path}</loc><changefreq>${s.changefreq}</changefreq><priority>${s.priority}</priority></url>`),
    ...cards.map((c) =>
      `  <url><loc>${BASE}/library/${xmlEsc(c.slug)}</loc>` +
      (c.lastmod ? `<lastmod>${c.lastmod}</lastmod>` : "") +
      `<changefreq>monthly</changefreq><priority>0.7</priority></url>`),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

/** A real (non-SPA) 404 page for an unknown /library/:slug. */
export function renderNotFound(slug: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Lesson not found — ${esc(SITE)}</title>
<meta name="robots" content="noindex"/>
<link rel="icon" type="image/png" href="/wizbit-logo.png"/>
<style>${CHROME_CSS}
body{margin:0;background:#fff;color:#22242b;font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.nf{max-width:640px;margin:0 auto;padding:64px 20px;text-align:center}
.nf h1{font-size:26px;color:#0f1115;margin:0 0 10px}
.nf a{color:#4f47e0}
</style>
</head>
<body>
${lessonHeader()}
<div class="nf"><h1>That lesson doesn’t exist</h1>
<p>We couldn’t find “${esc(slug)}”. Browse the <a href="/library">full library</a> or <a href="/">start from home</a>.</p></div>
</body>
</html>`;
}
