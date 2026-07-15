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
/** Strip markdown/HTML markers so JSON-LD + the sr-only lede carry clean plain text. */
function plain(s: unknown): string {
  return String(s ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [text](url) → text
    .replace(/[`*_#>~]+/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
/** What the lesson teaches → schema.org LearningResource.teaches (module titles). */
function teaches(bp: LibraryLesson["blueprint"]): string[] {
  return (bp?.modules ?? []).map((m) => plain(m.title)).filter(Boolean).slice(0, 10);
}
/**
 * Genuine Q&A from the lesson's built-in knowledge check → FAQPage. Only real questions
 * (prompt ends with "?") with a substantive answer (correct option + explanation, or the
 * reference answer). GEO win: AI engines lift these near-verbatim. Returns [] if <2 qualify.
 */
function faqFromCheck(bp: LibraryLesson["blueprint"]): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = [];
  for (const q of bp?.finalCheck?.questions ?? []) {
    // Strip quiz recall-cues ("From memory:", "Predict:", "Stop —") so the FAQ reads naturally.
    let question = plain(q.prompt).replace(/^(from memory|predict|recall|quick check|stop)\b[\s:—–-]*/i, "");
    question = question.charAt(0).toUpperCase() + question.slice(1);
    if (!question.endsWith("?")) continue;
    const correct = q.options?.find((o) => o.correct)?.text;
    const expl = plain(q.explanation);
    const ref = plain(q.acceptableAnswer);
    let answer = correct ? [plain(correct), expl].filter(Boolean).join(". ") : [ref, expl].filter(Boolean).join(" ");
    answer = answer.trim();
    if (answer.length >= 20) out.push({ question, answer });
  }
  return out.length >= 2 ? out.slice(0, 8) : [];
}
/** sr-only page heading: the missing <h1> (+ a lede) for crawlers, zero visual footprint. */
function lessonH1(lesson: LibraryLesson): string {
  const lede = metaDesc(lesson.description, lesson.blueprint?.meta?.thesis || "");
  return `<header class="seo-h1"><h1>${esc(lesson.title)}</h1>${lede ? `<p>${esc(lede)}</p>` : ""}</header>`;
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
/* Crawlable page heading + lede. Screen-reader-only: present in the DOM for search/LLM
   crawlers (adds the previously-missing top-level heading) with ZERO visual footprint,
   so the immersive world lesson renders exactly as before. */
.seo-h1{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
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

  const objectives = teaches(lesson.blueprint);
  const ld: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org", "@type": "LearningResource",
      name: lesson.title, description: desc, url,
      inLanguage: "en", isAccessibleForFree: true, learningResourceType: "lesson",
      ...(lesson.level ? { educationalLevel: lesson.level } : {}),
      ...(isoDuration(lesson.estMinutes) ? { timeRequired: isoDuration(lesson.estMinutes) } : {}),
      ...(lesson.category ? { about: lesson.category } : {}),
      ...(objectives.length ? { teaches: objectives } : {}),
      keywords: [lesson.category, lesson.level, "AI", "LLM", "agents"].filter(Boolean).join(", "),
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
  // FAQPage from the lesson's OWN knowledge check — a strong GEO signal (ChatGPT / Perplexity
  // / AI Overviews lift structured Q&A). Only emitted when ≥2 genuine questions exist.
  const faq = faqFromCheck(lesson.blueprint);
  if (faq.length) {
    ld.push({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question", name: f.question,
        acceptedAnswer: { "@type": "Answer", text: f.answer },
      })),
    });
  }

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
    bodyTop: lessonHeader() + lessonH1(lesson), bodyEnd: lessonFooter(lesson, related),
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
<p class="lead">${esc(cards.length)} free, interactive lessons — pick one to read instantly, browse by <a href="/guides">guide</a>, or <a href="/builder">generate your own</a>.</p>
${empty}${sections}
</main>
${lessonFooter({ slug: "", title: "", description: null, category: null, level: null, estMinutes: null, blueprint: null, html: "" }, [])}
</body>
</html>`;
}

// ============================================================================
// GUIDES — category overview / "learning path" landing pages (/guides/:slug).
// The crawlable, LLM-citable "before you enter a lesson" layer (like a Coursera
// specialization page): a plain-prose overview of a whole category + thumbnails
// linking to every lesson in it. Content here is intentionally linear + quotable
// (GEO), unlike the interactive world lessons.
// ============================================================================

/** Per-category chrome: thumbnail key (Supabase `lesson-thumbs` bucket) + swatch (mirrors app.js). */
const CAT: Record<string, { thumb: string; bg: string; text: string }> = {
  "Agents": { thumb: "agents", bg: "#EEEDFE", text: "#3C3489" },
  "RAG": { thumb: "rag", bg: "#E1F5EE", text: "#0F6E56" },
  "LLMs": { thumb: "llms", bg: "#E6F1FB", text: "#0C447C" },
  "Frameworks": { thumb: "frameworks", bg: "#EEF0FE", text: "#3730A3" },
  "Generative": { thumb: "generative", bg: "#FBEAF0", text: "#993556" },
  "Evaluation": { thumb: "evaluation", bg: "#FAEEDA", text: "#633806" },
  "Infrastructure": { thumb: "infrastructure", bg: "#EEF2F6", text: "#334155" },
  "Safety": { thumb: "safety", bg: "#FCEBEB", text: "#791F1F" },
  "Foundations": { thumb: "foundations", bg: "#EAF3DE", text: "#27500A" },
  "Build Projects": { thumb: "build", bg: "#FAECE7", text: "#712B13" },
};
const SUPA = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
function catThumb(cat: string): string {
  const k = CAT[cat]?.thumb;
  return SUPA && k ? `${SUPA}/storage/v1/object/public/lesson-thumbs/${k}.webp` : "";
}

interface Guide {
  slug: string; category: string; title: string; tagline: string; intro: string;
  faq: { q: string; a: string }[];
}
/** The 10 guides (one per library category). Prose is evergreen + GEO-shaped (answer-first). */
const GUIDES: Guide[] = [
  { slug: "ai-agents", category: "Agents", title: "AI Agents: A Complete Guide",
    tagline: "How AI agents observe, decide, act, and use tools — from the ReAct loop to multi-agent systems.",
    intro: "An AI agent is a large language model that takes actions toward a goal: it observes the task, decides what to do, calls tools or APIs, observes the result, and loops until it's done. This guide covers the agent loop (ReAct), tool use, agent memory, planning and reflection, multi-agent orchestration, and the Model Context Protocol.",
    faq: [
      { q: "What is an AI agent?", a: "An AI agent is an LLM wrapped in a loop that lets it take actions — call tools, read results, and decide the next step — instead of only returning text. It keeps going until the goal is met or it hands off." },
      { q: "How is an AI agent different from a chatbot?", a: "A chatbot answers from the model's knowledge in one shot. An agent can DO things: query an API, run code, edit a file, then react to what happened — over multiple steps." },
      { q: "What is the ReAct loop?", a: "ReAct = Reason + Act. The agent alternates a reasoning step (what to do next) with an action (a tool call), observes the result, and repeats. It's the core control loop behind most agents." },
    ] },
  { slug: "agent-frameworks", category: "Frameworks", title: "AI Agent Frameworks: LangChain, LangGraph, CrewAI and More",
    tagline: "Pick the right scaffolding — LangChain, LangGraph, CrewAI, AutoGen, LlamaIndex, OpenAI Agents SDK.",
    intro: "Agent frameworks give you the scaffolding — tool calling, state management, and orchestration — so you don't rebuild the agent loop by hand. This guide compares LangChain, LangGraph, CrewAI, AutoGen, LlamaIndex, the OpenAI Agents SDK, and Claude tool use, and helps you choose the right one for your project.",
    faq: [
      { q: "LangChain vs LangGraph — what's the difference?", a: "LangChain is a broad toolkit of components (models, prompts, tools, chains). LangGraph is its framework for building agents as an explicit, inspectable state graph you fully control — better when you need branching, loops, and durable state." },
      { q: "Which agent framework should I use?", a: "For a simple tool-using loop, start with plain tool calling or LangChain. For complex, stateful, multi-step agents, use LangGraph. For role-based multi-agent teams, CrewAI or AutoGen. Match the framework to how much control and structure you need." },
      { q: "What is CrewAI?", a: "CrewAI is a framework for orchestrating multiple role-based agents (e.g. researcher, writer, reviewer) that collaborate on a task, run sequentially or hierarchically." },
    ] },
  { slug: "rag", category: "RAG", title: "RAG (Retrieval-Augmented Generation): A Complete Guide",
    tagline: "Ground an LLM in your own documents — embeddings, vector search, chunking, reranking, evaluation.",
    intro: "Retrieval-Augmented Generation (RAG) grounds a language model in your own documents by retrieving the most relevant passages at query time and passing them to the model as context, instead of relying on its trained-in memory. This guide covers embeddings, vector search, chunking strategies, hybrid retrieval and reranking, RAG evaluation, and building a RAG chatbot end to end.",
    faq: [
      { q: "What is RAG?", a: "RAG stands for Retrieval-Augmented Generation. It fetches relevant chunks from your document store and feeds them to the LLM as context so answers are grounded in your data and can be cited — without retraining the model." },
      { q: "RAG vs fine-tuning — when do I use each?", a: "Use RAG when the knowledge is large, changing, or must be cited (docs, policies). Use fine-tuning to change the model's behavior or format, not to add fresh facts. They're often combined." },
      { q: "How does vector search work?", a: "Each chunk and the query are encoded into vectors by an embedding model; the store returns the chunks whose vectors are nearest to the query's (cosine similarity). Hybrid search adds keyword matching to catch exact terms." },
    ] },
  { slug: "llms", category: "LLMs", title: "Large Language Models (LLMs): A Complete Guide",
    tagline: "How LLMs work — tokens, attention, context windows, prompting, function calling, fine-tuning.",
    intro: "A large language model (LLM) predicts the next token from patterns it learned across huge text corpora. This guide covers how LLMs work, tokenization and context windows, transformer attention, prompt engineering, function calling and structured output, and how to choose between fine-tuning, RAG, and prompting.",
    faq: [
      { q: "How do LLMs work?", a: "An LLM is a transformer neural network trained to predict the next token. Given your prompt, it repeatedly predicts the most likely next token, building the response one token at a time from patterns learned in training." },
      { q: "What is a context window?", a: "The context window is the maximum amount of text (measured in tokens) a model can consider at once — your prompt plus its response. Everything the model 'sees' for a request must fit inside it." },
      { q: "What is prompt engineering?", a: "Prompt engineering is structuring your instructions, examples, and context so the model reliably produces the output you want — via clear tasks, few-shot examples, output format, and constraints." },
    ] },
  { slug: "ai-foundations", category: "Foundations", title: "AI and Machine Learning Foundations",
    tagline: "The groundwork under LLMs — ML types, neural networks, backprop, gradient descent, embeddings.",
    intro: "Before large language models there is machine learning: models that learn patterns from data rather than following hand-written rules. This guide covers AI vs machine learning vs deep learning, supervised, unsupervised and reinforcement learning, neural networks and backpropagation, gradient descent, embeddings, and the bias-variance tradeoff.",
    faq: [
      { q: "What's the difference between AI, machine learning, and deep learning?", a: "AI is the broad goal of machines doing intelligent tasks. Machine learning is the subset that learns from data. Deep learning is the subset of ML using many-layered neural networks — the basis of modern LLMs." },
      { q: "What is a neural network?", a: "A neural network is layers of simple units ('neurons') with weighted connections that transform inputs into outputs. Training adjusts the weights so the network maps inputs to the right outputs." },
      { q: "What is supervised learning?", a: "Supervised learning trains a model on labeled examples (input → known answer) so it learns to predict the answer for new inputs. Classification and regression are the two main kinds." },
    ] },
  { slug: "generative-ai", category: "Generative", title: "Generative AI: Images, Audio, and Multimodal",
    tagline: "Beyond text — diffusion models, Stable Diffusion, Whisper, text-to-speech, vision-language models.",
    intro: "Generative AI creates new content — images, audio, and video — not just text. This guide covers diffusion models and how they generate images, Stable Diffusion, image-generation workflows, speech recognition with Whisper, text-to-speech, vision-language models, and responsible generative media.",
    faq: [
      { q: "What is generative AI?", a: "Generative AI is a class of models that produce new content — text, images, audio, video, or code — by learning the patterns of their training data and sampling new outputs that follow those patterns." },
      { q: "How do diffusion models generate images?", a: "A diffusion model learns to reverse a noising process: it starts from random noise and, guided by your prompt, denoises step by step into a coherent image." },
      { q: "What is a vision-language model?", a: "A vision-language model (VLM) understands images and text together — you can show it a picture and ask questions about it, or have it caption, describe, or reason over visual content." },
    ] },
  { slug: "llm-evaluation", category: "Evaluation", title: "Evaluating and Observing LLM Apps",
    tagline: "Catch regressions before users do — evals, golden datasets, LLM-as-judge, CI gating, tracing.",
    intro: "LLM apps change behavior whenever prompts, models, retrieval, or tools change — evaluation catches those regressions before your users do. This guide covers evaluation foundations, building golden datasets, LLM-as-judge, RAG evaluation, red-teaming, gating evals in CI, and tracing and observability with tools like Langfuse and OpenTelemetry.",
    faq: [
      { q: "How do you evaluate an LLM app?", a: "Build a dataset of representative cases with expected properties, run the real app path against them, and score with deterministic checks, reference comparisons, or an LLM judge — comparing each change to a baseline." },
      { q: "What is LLM-as-judge?", a: "LLM-as-judge uses a language model to score another model's output against a rubric (helpfulness, groundedness, correctness). It scales subjective evaluation that would otherwise need human labels." },
      { q: "What is observability for LLMs?", a: "LLM observability is tracing each request — prompts, retrieved context, tool calls, tokens, latency, cost — so you can debug failures and feed real production traces back into your eval set." },
    ] },
  { slug: "ai-infrastructure", category: "Infrastructure", title: "AI Infrastructure: Serving, Scaling, and Cost",
    tagline: "Run models in production — vLLM, Ollama, gateways, quantization, GPUs, cost and latency.",
    intro: "Running models in production means serving them, scaling them, and controlling cost and latency. This guide covers deploying open models with vLLM, running local models with Ollama, model gateways like LiteLLM, quantization and inference optimization, GPUs and TPUs, embedding pipelines at scale, and monitoring for model drift.",
    faq: [
      { q: "How do you serve an LLM in production?", a: "Use an inference server like vLLM (for open models on your own GPUs) or a hosted API. It batches requests, manages the KV cache, and streams tokens — behind a gateway that handles routing, retries, and rate limits." },
      { q: "What is a model gateway?", a: "A model gateway (e.g. LiteLLM) is a single API in front of many providers/models. It handles routing, failover, cost tracking, caching, and rate limiting so your app code doesn't change when you swap models." },
      { q: "How do you cut LLM cost and latency?", a: "Stream responses for perceived speed, cache and reuse prompts, route easy calls to smaller models, quantize open models, and trim context to what's needed. Most latency is output-token generation, so shorter outputs help most." },
    ] },
  { slug: "ai-safety", category: "Safety", title: "AI Safety, Security, and Governance",
    tagline: "Ship AI safely — prompt injection defense, guardrails, OWASP LLM Top 10, bias, privacy, the EU AI Act.",
    intro: "Shipping AI safely means defending against attacks and meeting governance standards. This guide covers prompt injection and how to defend against it, guardrails and validators, hallucinations and grounding, the OWASP LLM Top 10, bias and fairness, privacy and data governance, and frameworks like the EU AI Act and the NIST AI Risk Management Framework.",
    faq: [
      { q: "What is prompt injection?", a: "Prompt injection is an attack where malicious text — in the user input or in content the agent reads — overrides the app's instructions, making the model ignore its rules, leak data, or misuse tools. It's the top LLM security risk." },
      { q: "How do you add guardrails to an LLM?", a: "Guardrails validate inputs and outputs against rules: block or sanitize unsafe input, check output for PII, policy, or format violations, constrain which tools can run, and require confirmation for high-impact actions." },
      { q: "What is the OWASP LLM Top 10?", a: "The OWASP LLM Top 10 is a widely-used list of the most critical security risks for LLM apps — led by prompt injection, insecure output handling, and sensitive-information disclosure." },
    ] },
  { slug: "build-projects", category: "Build Projects", title: "Build AI Projects: Hands-On Guides",
    tagline: "Learn by building — RAG apps, tool-calling chatbots, agents, eval harnesses, model serving.",
    intro: "The fastest way to learn AI engineering is to build. This guide is a set of end-to-end projects: a RAG app with LangChain or LlamaIndex, a tool-calling chatbot, an agent with LangGraph, an evaluation harness with promptfoo, adding memory and observability to an agent, and serving models with vLLM or Ollama.",
    faq: [
      { q: "How do I build a RAG app?", a: "Ingest and chunk your documents, embed the chunks into a vector store, then at query time retrieve the top matches and pass them to the LLM as context with an instruction to answer only from the sources and cite them." },
      { q: "What's the best first AI project?", a: "A document Q&A / RAG chatbot over a small set of your own docs. It touches embeddings, vector search, prompting, and grounding — the core skills — without needing to train anything." },
      { q: "How do I build an AI agent?", a: "Start with an LLM, define a few typed tools it can call, and run a loop: send the prompt + tool schemas, execute any tool the model requests, feed the result back, and repeat until it returns a final answer." },
    ] },
];
const guideBySlug = (slug: string): Guide | undefined => GUIDES.find((g) => g.slug === slug);

/** Shared CSS for the light, content-first guide pages (Coursera-style overview). */
const GUIDE_CSS = `
.g-wrap{max-width:940px;margin:0 auto;padding:0 20px 64px}
.g-hero{display:grid;grid-template-columns:1fr;gap:18px;padding:30px 0 8px}
.g-hero .g-thumb{width:100%;max-height:260px;object-fit:cover;border-radius:16px;border:1px solid #e6e6ef}
.g-eyebrow{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px}
.g-hero h1{font-size:32px;line-height:1.15;letter-spacing:-.02em;margin:0 0 10px;color:#0f1115}
.g-tag{font-size:17px;color:#4a4d57;margin:0 0 12px;line-height:1.5}
.g-intro{font-size:16px;color:#33353d;line-height:1.65;margin:0 0 6px}
.g-cta{display:inline-block;background:#635bff;color:#fff !important;text-decoration:none;padding:10px 18px;border-radius:9px;font-weight:700;margin:14px 0 2px}
.g-cta:hover{background:#4f47e0}
.g-h2{font-size:20px;color:#0f1115;margin:34px 0 14px;letter-spacing:-.01em}
.g-learn{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px 22px}
.g-learn li{padding-left:22px;position:relative;color:#33353d;font-size:15px;line-height:1.5}
.g-learn li:before{content:"✓";position:absolute;left:0;color:#1D9E75;font-weight:800}
.g-cards{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:16px}
.g-card{display:flex;flex-direction:column;border:1px solid #e6e6ef;border-radius:14px;overflow:hidden;background:#fff;text-decoration:none;transition:box-shadow .2s,transform .2s}
.g-card:hover{box-shadow:0 8px 24px rgba(20,20,40,.09);transform:translateY(-2px)}
.g-card .g-cthumb{width:100%;height:120px;object-fit:cover;display:block}
.g-card .g-cthumb.flat{display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px;letter-spacing:.04em}
.g-card .g-cbody{padding:12px 14px 14px}
.g-card h3{font-size:15.5px;margin:0 0 5px;color:#0f1115;line-height:1.3}
.g-card .g-cmeta{font-size:12.5px;color:#9498a3}
.g-card .g-cdesc{font-size:13px;color:#5c5f69;margin:4px 0 0;line-height:1.45}
.g-faq{margin-top:12px}
.g-faq h3{font-size:16px;color:#0f1115;margin:18px 0 4px}
.g-faq p{font-size:15px;color:#33353d;line-height:1.6;margin:0}
.g-guides{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:18px}
`;

/** A lesson card (shared category thumbnail + title + level/time). */
function guideLessonCard(c: LibraryCard, cat: string): string {
  const thumb = catThumb(cat);
  const sw = CAT[cat] || { bg: "#EEF2F6", text: "#334155" };
  const cover = thumb
    ? `<img class="g-cthumb" src="${escAttr(thumb)}" alt="${escAttr(c.title)}" loading="lazy"/>`
    : `<div class="g-cthumb flat" style="background:${sw.bg};color:${sw.text}">${esc(cat)}</div>`;
  const meta = [c.level, c.estMinutes ? `${c.estMinutes} min` : ""].filter(Boolean).map(esc).join(" · ");
  return `<a class="g-card" href="/library/${escAttr(c.slug)}">${cover}<div class="g-cbody">` +
    `<h3>${esc(c.title)}</h3>${meta ? `<p class="g-cmeta">${meta}</p>` : ""}` +
    (c.description ? `<p class="g-cdesc">${esc(c.description)}</p>` : "") + `</div></a>`;
}

/** Render one guide (/guides/:slug): overview prose + lesson thumbnails + FAQ (crawlable, GEO). */
export function renderGuidePage(guide: Guide, lessons: LibraryCard[]): string {
  const url = `${BASE}/guides/${guide.slug}`;
  const titleText = `${guide.title} — ${SITE}`;
  const desc = metaDesc(guide.intro, guide.tagline);
  const sw = CAT[guide.category] || { bg: "#EEF2F6", text: "#334155" };
  const thumb = catThumb(guide.category);

  const ld: Record<string, unknown>[] = [
    {
      "@context": "https://schema.org", "@type": "Course",
      name: guide.title, description: desc, url, inLanguage: "en", isAccessibleForFree: true,
      about: guide.category, image: thumb || OG_IMAGE,
      provider: { "@type": "Organization", name: SITE, url: BASE },
      ...(lessons.length ? { teaches: lessons.map((l) => l.title).slice(0, 12) } : {}),
      hasCourseInstance: { "@type": "CourseInstance", courseMode: "online", courseWorkload: "PT1H" },
    },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${BASE}/guides` },
        { "@type": "ListItem", position: 3, name: guide.title, item: url },
      ],
    },
    {
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: guide.faq.map((f) => ({
        "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  const head =
    `<meta name="description" content="${escAttr(desc)}"/>` +
    `<meta name="robots" content="index,follow"/>` +
    `<link rel="canonical" href="${escAttr(url)}"/>` +
    `<link rel="icon" type="image/png" href="/wizbit-logo.png"/>` +
    `<meta property="og:type" content="website"/>` +
    `<meta property="og:site_name" content="${escAttr(SITE)}"/>` +
    `<meta property="og:title" content="${escAttr(titleText)}"/>` +
    `<meta property="og:description" content="${escAttr(desc)}"/>` +
    `<meta property="og:url" content="${escAttr(url)}"/>` +
    `<meta property="og:image" content="${escAttr(thumb || OG_IMAGE)}"/>` +
    `<meta name="twitter:card" content="summary_large_image"/>` +
    `<meta name="twitter:title" content="${escAttr(titleText)}"/>` +
    `<meta name="twitter:description" content="${escAttr(desc)}"/>` +
    `<meta name="twitter:image" content="${escAttr(thumb || OG_IMAGE)}"/>` +
    `<script type="application/ld+json">${jsonLd(ld)}</script>`;

  const heroThumb = thumb ? `<img class="g-thumb" src="${escAttr(thumb)}" alt="${escAttr(guide.title)}"/>` : "";
  const learn = lessons.length
    ? `<h2 class="g-h2">What you'll learn</h2><ul class="g-learn">` +
      lessons.map((l) => `<li>${esc(l.title)}</li>`).join("") + `</ul>`
    : "";
  const cards = lessons.length
    ? `<h2 class="g-h2">Lessons in this guide (${lessons.length})</h2>` +
      `<ul class="g-cards">${lessons.map((l) => guideLessonCard(l, guide.category)).join("")}</ul>`
    : "";
  const faq = `<section class="g-faq"><h2 class="g-h2">Frequently asked questions</h2>` +
    guide.faq.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join("") + `</section>`;
  const otherGuides = GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 6);
  const related = `<h2 class="g-h2">Other guides</h2><nav class="seo-related"><ul>` +
    otherGuides.map((g) => `<li><a href="/guides/${escAttr(g.slug)}">${esc(g.title)}</a></li>`).join("") + `</ul></nav>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titleText)}</title>${head}
<style>${CHROME_CSS}
body{margin:0;background:#fff;color:#22242b;font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
${GUIDE_CSS}</style>
</head><body>
${lessonHeader()}
<main class="g-wrap">
<div class="g-hero">${heroThumb}<div>
<p class="g-eyebrow" style="color:${sw.text}">${esc(guide.category)} · Guide</p>
<h1>${esc(guide.title)}</h1>
<p class="g-tag">${esc(guide.tagline)}</p>
<p class="g-intro">${esc(guide.intro)}</p>
<a class="g-cta" href="/builder">Generate your own lesson →</a>
</div></div>
${learn}
${cards}
${faq}
${related}
</main>
${lessonFooter({ slug: "", title: "", description: null, category: null, level: null, estMinutes: null, blueprint: null, html: "" }, [])}
</body></html>`;
}

/** Server entry: resolve a guide slug + filter its lessons, then render. Null → 404. */
export function renderGuideBySlug(slug: string, allCards: LibraryCard[]): string | null {
  const guide = guideBySlug(slug);
  if (!guide) return null;
  return renderGuidePage(guide, allCards.filter((c) => c.category === guide.category));
}

/** Render the /guides index — all 10 guides as big thumbnail cards. */
export function renderGuidesIndexPage(cards: LibraryCard[]): string {
  const url = `${BASE}/guides`;
  const titleText = `AI Learning Guides — ${SITE}`;
  const desc = metaDesc(`Free guides to AI, LLMs, RAG, agents, and more from ${SITE} — each an overview plus a set of interactive lessons.`, "AI learning guides.");
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.category || "", (counts.get(c.category || "") || 0) + 1);

  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${BASE}/guides/${g.slug}`, name: g.title })),
  };
  const breadcrumb = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Guides", item: url },
    ],
  };

  const cardsHtml = GUIDES.map((g) => {
    const thumb = catThumb(g.category);
    const sw = CAT[g.category] || { bg: "#EEF2F6", text: "#334155" };
    const n = counts.get(g.category) || 0;
    const cover = thumb
      ? `<img class="g-cthumb" src="${escAttr(thumb)}" alt="${escAttr(g.title)}" loading="lazy"/>`
      : `<div class="g-cthumb flat" style="background:${sw.bg};color:${sw.text}">${esc(g.category)}</div>`;
    return `<a class="g-card" href="/guides/${escAttr(g.slug)}">${cover}<div class="g-cbody">` +
      `<h3>${esc(g.title)}</h3><p class="g-cdesc">${esc(g.tagline)}</p>` +
      `<p class="g-cmeta" style="margin-top:8px">${n} lesson${n === 1 ? "" : "s"}</p></div></a>`;
  }).join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(titleText)}</title>
<meta name="description" content="${escAttr(desc)}"/><meta name="robots" content="index,follow"/>
<link rel="canonical" href="${escAttr(url)}"/><link rel="icon" type="image/png" href="/wizbit-logo.png"/>
<meta property="og:type" content="website"/><meta property="og:title" content="${escAttr(titleText)}"/>
<meta property="og:description" content="${escAttr(desc)}"/><meta property="og:url" content="${escAttr(url)}"/>
<meta property="og:image" content="${escAttr(OG_IMAGE)}"/>
<script type="application/ld+json">${jsonLd([breadcrumb, itemList])}</script>
<style>${CHROME_CSS}
body{margin:0;background:#fff;color:#22242b;font:400 16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
${GUIDE_CSS}</style>
</head><body>
${lessonHeader()}
<main class="g-wrap">
<h1 style="font-size:30px;letter-spacing:-.02em;margin:28px 0 8px;color:#0f1115">AI Learning Guides</h1>
<p class="g-tag">Comprehensive, free guides to AI, LLMs, RAG, and agents — each an overview plus a set of interactive lessons. Or <a href="/builder">generate your own</a>.</p>
<ul class="g-guides">${cardsHtml}</ul>
</main>
${lessonFooter({ slug: "", title: "", description: null, category: null, level: null, estMinutes: null, blueprint: null, html: "" }, [])}
</body></html>`;
}

/**
 * /llms.txt — a curated markdown map of the site for LLM crawlers (emerging standard:
 * https://llmstxt.org). Points ChatGPT/Perplexity/Claude at the guides + every lesson.
 */
export function renderLlmsTxt(cards: LibraryCard[]): string {
  const guideLines = GUIDES.map((g) => `- [${g.title}](${BASE}/guides/${g.slug}): ${g.tagline}`).join("\n");
  const lessonLines = cards.map((c) =>
    `- [${c.title}](${BASE}/library/${c.slug})${c.description ? `: ${c.description.replace(/\s+/g, " ").trim()}` : ""}`).join("\n");
  return `# ${SITE}

> Free, interactive, source-grounded lessons on AI, LLMs, RAG, and agents. Every topic can be read as an interactive "mental map" lesson or generated on demand. No signup required to read.

## Guides
${guideLines}

## Lessons
${lessonLines}

## Key pages
- [Home](${BASE}/): generate a personalized AI lesson on any topic.
- [Library](${BASE}/library): browse all free interactive lessons.
- [Guides](${BASE}/guides): topic overviews, each with a set of lessons.
`;
}

/** Generate /sitemap.xml from the live lesson list + the static public pages. */
export function renderSitemap(cards: LibraryCard[]): string {
  const staticPaths: { path: string; changefreq: string; priority: string }[] = [
    { path: "/", changefreq: "weekly", priority: "1.0" },
    { path: "/library", changefreq: "weekly", priority: "0.9" },
    { path: "/guides", changefreq: "weekly", priority: "0.8" },
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
    ...GUIDES.map((g) =>
      `  <url><loc>${BASE}/guides/${g.slug}</loc><changefreq>monthly</changefreq><priority>0.8</priority></url>`),
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
