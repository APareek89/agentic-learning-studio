/**
 * # WORLD renderer — the V2 lesson template ("Zoom World", owner-approved 2026-07-13)
 *
 * Each module renders as a MENTAL MAP of its blocks on a pannable/zoomable canvas:
 * every block = a card (kind chip + heading + one-line orient); clicking a card opens
 * a popup carrying 100% of the block's content (rendered by the SAME block renderers
 * the classic view uses — zero content loss). Beats (Next ▸ / Auto) tour the map with
 * a one-line caption + console strip. Specials: synthesis, final knowledge check, sources.
 *
 * Design principles (enforced by construction):
 *   P1 reserved bands — captions + strip own the bottom; the map never enters it.
 *   P2 no empty boxes — every card has chip + heading + orient; depth is one click away.
 *   P3 fill the canvas — S-flow grid COMPUTED from block count (never hand-placed).
 *   P5 basics only — header is Next · Auto · ↺ (+ the rail toggle).  P6 drag/zoom canvas.
 *
 * Template contract: everything here is DERIVED from the Blueprint — headings, orient
 * lines and captions come from block titles/first sentences; the model authors nothing
 * presentation-specific. Selected by `learnerProfile.readingMode === "world"` (the
 * default for all NEW generations); classic vertical/horizontal lessons are untouched.
 */

import type { Blueprint, Block } from "./schema";
import { block as renderBlockHtml, synthesisInner, citationsInner, visibleCitationIds, isBuilt, mdLite } from "./components";
import { handsOnEligible } from "./eligibility";
import { escMath } from "./math";

const esc = (s: unknown): string => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s: unknown): string => esc(s).replace(/"/g, "&quot;");

/* ---------------- content derivation (the "agent fills data, template derives UI" step) ---------------- */

type Rich = { t: string; spans?: { text: string }[]; items?: { text: string }[][] }[];
function plainText(rt?: Rich): string {
  if (!rt) return "";
  const parts: string[] = [];
  for (const n of rt) {
    if ((n.t === "ul" || n.t === "ol") && n.items) for (const it of n.items) parts.push(it.map((s) => s.text).join(""));
    else if (n.spans) parts.push(n.spans.map((s) => s.text).join(""));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
function firstSentence(s: string, max: number): string {
  // Card teasers / beat captions are PLAIN text — strip any markdown markers the model
  // leaked into the source string (the popup renders them properly; here they'd show raw).
  const t = (s || "").replace(/\*\*/g, "").replace(/```[a-zA-Z]*/g, "").replace(/`/g, "").trim();
  if (!t) return "";
  // Don't treat the period of a common abbreviation ("e.g.", "i.e.", "vs.", "etc.") as a
  // sentence end — the old regex cut "Stateful Graph (e.g." mid-parenthesis.
  const m = t.match(/^[\s\S]*?(?<!\b(?:e\.g|i\.e|etc|vs|cf|st|dr|no))[.!?](?=\s|$)/i);
  let out = (m ? m[0] : t).trim();
  if (out.length > max) out = out.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  return out;
}

const KIND: Record<string, { ico: string; label: string; cls: string }> = {
  conceptual: { ico: "💡", label: "Concept", cls: "wk-concept" },
  technical: { ico: "⚙️", label: "Technical", cls: "wk-tech" },
  note: { ico: "🧠", label: "Note", cls: "wk-recall" },
  walkthrough: { ico: "🧭", label: "How-to", cls: "wk-howto" },
  functionalExample: { ico: "▶", label: "Example", cls: "wk-example" },
  codeExample: { ico: "⟨⟩", label: "Code", cls: "wk-code" },
  decisionMatrix: { ico: "⚖️", label: "Decision", cls: "wk-decision" },
  decisionTree: { ico: "⚖️", label: "Decision", cls: "wk-decision" },
  decisionCallout: { ico: "⚖️", label: "Decision", cls: "wk-decision" },
  scenario: { ico: "🎬", label: "Scenario", cls: "wk-example" },
  taxonomy: { ico: "🗂", label: "Landscape", cls: "wk-concept" },
  diagram: { ico: "🗺", label: "Diagram", cls: "wk-howto" },
  interactiveScatter: { ico: "🎛", label: "Try it", cls: "wk-try" },
  interactiveSlider: { ico: "🎚", label: "Try it", cls: "wk-try" },
  steppedFlow: { ico: "🎛", label: "Try it", cls: "wk-try" },
  selfCheckQuiz: { ico: "✅", label: "Check", cls: "wk-check" },
  knowledgeCheck: { ico: "✅", label: "Check", cls: "wk-check" },
};
const kindOf = (k: string) => KIND[k] ?? { ico: "📌", label: "Section", cls: "wk-concept" };

/** One-line orient + slightly longer caption line, derived per block kind. */
function deriveLines(b: Block): { heading: string; orient: string; capline: string } {
  const k = kindOf(b.kind);
  const title = ("title" in b && b.title ? String(b.title) : "").trim();
  let body = "";
  if ("body" in b && b.body) body = plainText(b.body as Rich);
  else if (b.kind === "walkthrough") body = b.steps.map((s) => s.label).join(" → ");
  else if (b.kind === "codeExample") body = plainText((b as { explain?: Rich }).explain) || "A full, runnable code example — open to read it line by line.";
  else if (b.kind === "decisionMatrix") body = `Compare ${b.options.map((o) => o.name).join(" vs ")} across the criteria that matter.`;
  else if (b.kind === "decisionTree") body = "Walk the branches: each question routes you to the right choice.";
  else if (b.kind === "decisionCallout") body = `Use when: ${b.useWhen}`;
  else if (b.kind === "scenario") body = b.ask;
  else if (b.kind === "taxonomy") body = b.groups.map((g) => g.name).join(" · ");
  else if (b.kind === "interactiveSlider") body = (b.caption || "Drag the dial and read what changes at each stop.") as string;
  else if (b.kind === "interactiveScatter") body = (b.caption || "An interactive plot — pick a query and see what lands nearest.") as string;
  else if (b.kind === "steppedFlow") body = (b.caption || "Click through the stages of the process.") as string;
  else if (b.kind === "diagram") body = "A drawn map of how the pieces connect.";
  else if (b.kind === "selfCheckQuiz") body = (b as { prompt?: string }).prompt || "A quick self-check on this module.";
  else if (b.kind === "knowledgeCheck") body = "A graded check on what you just learned.";
  const heading = title || k.label;
  return {
    heading,
    orient: firstSentence(body, 900) || "Open for the full detail.",
    capline: firstSentence(body, 900) || heading,
  };
}

/* ---------------- stage assembly ---------------- */

/** A secondary openable piece folded INTO a story card (an example or a code stage that
 *  belongs to the concept before it) — rendered as a small button on the card, opening its
 *  own popup. Keeps the map at ~6 story nodes instead of 9 scattered blocks. */
interface WAtt { label: string; full: string; ico: string; popup: string }
interface WCard { chip: string; ico: string; clabel: string; heading: string; orient: string; capline?: string; popup: string; check?: boolean; atts?: WAtt[] }
interface WStage { id: string; rail: string; num: string; special?: boolean; kick: string; tagline: string; cards: WCard[]; stub?: boolean; moduleId?: string }

function moduleLeadCard(bp: Blueprint, m: Blueprint["modules"][number]): WCard {
  const node = bp.mentalMap.nodes.find((n) => n.moduleId === m.id);
  // The renderer OWNS the "After this you'll be able to" heading — strip the same stem from
  // each objective (the prompts ask writers to phrase objectives with it), else learners read
  // "After this you'll be able to After this you'll be able to …" on every module opener.
  const objText = (o: string) => o.replace(/^\s*after this,?\s+you(?:'|’)ll be able to\s*/i, "").replace(/^\w/, (c) => c.toUpperCase());
  const obj = m.objectives.length ? `<h4>After this you'll be able to</h4><ul>${m.objectives.map((o) => `<li>${escMath(objText(o))}</li>`).join("")}</ul>` : "";
  const detail =
    (node?.what ? `<p>${escMath(node.what)}</p>` : "") +
    (node?.laymanExplanation ? `<div class="po-analogy"><b>In plain words —</b> ${escMath(node.laymanExplanation)}</div>` : "") +
    (node?.relevance ? `<p><b>Why this matters:</b> ${escMath(node.relevance)}</p>` : "");
  const forces = m.decisionItForces ? `<p><b>Decision this forces:</b> ${escMath(m.decisionItForces)}</p>` : "";
  // (curated m.visual diagrams retired — not rendered even when an old blueprint carries one)
  return {
    chip: "wk-lead", ico: "📌", clabel: "This module", heading: m.title,
    orient: firstSentence(m.summary, 900) || "What this module covers and why.",
    capline: firstSentence(m.summary, 900),
    popup: `<p>${escMath(m.summary)}</p>${detail}${obj}${forces}`,
  };
}

function finalCheckCards(bp: Blueprint): WCard[] {
  const fc = bp.finalCheck;
  if (!fc) return [];
  return fc.questions.map((q, i) => {
    const opts = (q.options ?? []).map((o, oi) =>
      `<button class="qopt" data-ok="${o.correct ? 1 : 0}"><b class="qL">${String.fromCharCode(65 + oi)}.</b> ${escMath(o.text)}</button>`).join("");
    const free = q.kind === "freeText"
      ? `<textarea class="w-free" rows="3" placeholder="Type your answer from memory…"></textarea>
         <button class="qopt w-reveal" data-reveal="1">Reveal the reference answer</button>
         <div class="w-ref" hidden><b>Reference answer:</b> ${escMath(q.acceptableAnswer || "")}</div>`
      : "";
    return {
      chip: "wk-check", ico: "✅", clabel: "Check", heading: `Question ${i + 1}`,
      orient: firstSentence(q.prompt.replace(/```[a-zA-Z]*[\s\S]*?```/g, "(code snippet)"), 900),
      // Explanation pre-rendered into a hidden sibling so the runtime can show REAL markup
      // (why-each-option-is-wrong often carries `code`/**bold**) instead of raw markdown text.
      popup: `<div class="qprompt">${mdLite(q.prompt)}</div>${opts}${free}<div class="qfb"></div><div class="qfb-src" hidden>${mdLite(q.explanation || "")}</div>`,
      check: true,
    };
  });
}

function buildStages(bp: Blueprint): WStage[] {
  const stages: WStage[] = [];
  bp.modules.forEach((m, i) => {
    const built = isBuilt(m);
    const cards: WCard[] = [moduleLeadCard(bp, m)];
    if (built) {
      for (const b of m.blocks) {
        // DIAGRAMS RETIRED: static diagram blocks don't meet the quality bar — skip them
        // (old lessons still carry them in the blueprint; they simply stop rendering).
        if (b.kind === "diagram") continue;
        const d = deriveLines(b);
        const k = kindOf(b.kind);
        // GROUP examples + code stages into the story card they illustrate: an example or
        // code block that follows a concept/technical card becomes a labelled button ON that
        // card (own popup) instead of its own map node — the map stays ~6 readable story
        // nodes per module and the reading order stops zigzagging between idea and artifact.
        const attachable = b.kind === "codeExample" || b.kind === "functionalExample";
        const host = attachable
          ? [...cards].reverse().find((c) => (c.chip === "wk-concept" || c.chip === "wk-tech") && (c.atts?.length ?? 0) < 4)
          : undefined;
        if (attachable && host) {
          host.atts = host.atts ?? [];
          // Button labels stay SHORT type names ("Example", "Code 1") — the full block title
          // shows in the popup header once opened.
          const codeCount = host.atts.filter((a) => a.ico === "⟨⟩").length;
          const label = b.kind === "functionalExample" ? "Example" : codeCount > 0 ? `Code ${codeCount + 1}` : "Code";
          host.atts.push({ label, full: b.title || k.label, ico: k.ico, popup: renderBlockHtml(b, bp) });
          if (host.atts.some((a) => a.ico === "⟨⟩") && host.atts.filter((a) => a.ico === "⟨⟩").length === 2) {
            const first = host.atts.find((a) => a.ico === "⟨⟩" && a.label === "Code");
            if (first) first.label = "Code 1";
          }
          continue;
        }
        cards.push({ chip: k.cls, ico: k.ico, clabel: k.label, heading: d.heading, orient: d.orient, capline: d.capline, popup: renderBlockHtml(b, bp), check: b.kind === "selfCheckQuiz" || b.kind === "knowledgeCheck" });
      }
    } else {
      cards.push({ chip: "wk-recall", ico: "⏳", clabel: "Building", heading: "This module is being built",
        orient: "Its blocks appear here the moment they're written — usually under a minute.",
        popup: `<p>The trainer is writing this module right now. The map fills in automatically — you can keep reading other modules meanwhile.</p>` });
    }
    stages.push({ id: `m${i}`, moduleId: m.id, rail: m.title, num: String(m.order), kick: `Module ${m.order} of ${bp.modules.length} · ${m.title}`,
      tagline: firstSentence(m.summary, 900) || m.title, cards, stub: !built });
  });
  const syn = bp.synthesis;
  const hasSynth = !!(syn && (syn.recap || syn.buildOrder.length || syn.checklist.length || syn.capstone?.prompt));
  if (hasSynth) stages.push({ id: "_synth", rail: "Putting it together", num: "✦", special: true,
    kick: "Putting it together · the whole lesson, consolidated",
    tagline: "The recap, the build order, the decision checklist, and a capstone to try solo.",
    cards: [{ chip: "wk-lead", ico: "✦", clabel: "Synthesis", heading: "Putting it together",
      orient: "Recap · build order · decision checklist · your capstone.", popup: synthesisInner(bp) }] });
  const fcCards = finalCheckCards(bp);
  if (fcCards.length) stages.push({ id: "_check", rail: "Knowledge check", num: "🧠", special: true,
    kick: `Knowledge check · ${fcCards.length} questions across the whole lesson`,
    tagline: "Open each question card and commit to an answer before it reveals.", cards: fcCards });
  const nSources = visibleCitationIds(bp).length; // must match the deduped rendered list
  if (nSources) stages.push({ id: "_sources", rail: "Sources", num: "⌕", special: true,
    kick: "Sources · what grounded this lesson",
    tagline: "Every claim traces back to a source — your documents and knowledge-base notes are tagged.",
    cards: [{ chip: "wk-lead", ico: "⌕", clabel: "Provenance", heading: "Sources",
      orient: `${nSources} source(s) grounded this lesson.`, popup: citationsInner(bp) }] });
  return stages;
}

/* ---------------- markup ---------------- */

export function renderBodyWorld(bp: Blueprint, opts: { currentModuleId?: string } = {}): string {
  const stages = buildStages(bp);
  // Popup bodies live in <template> tags (full block HTML, zero JSON-escaping pain).
  const templates = stages.map((s, si) => s.cards.map((c, ci) =>
    `<template id="wpop-${si}-${ci}">${c.popup}</template>` +
    (c.atts ?? []).map((a, ai) => `<template id="wpop-${si}-${ci}-a${ai}">${a.popup}</template>`).join("")
  ).join("")).join("");
  // The engine's structural data rides as JSON. The *Html fields are PRE-ESCAPED HTML
  // (escMath: HTML-escaped text + rendered KaTeX for any $…$ the teaser carries) —
  // WORLD_JS inserts them verbatim and must NOT escH them; every non-Html field it
  // still escapes itself. The suffix IS the contract: never emit a card teaser here
  // without running it through teaser(). Display math renders inline so teasers clamp.
  const teaser = (s: string) => escMath(s, { inlineOnly: true });
  const data = stages.map((s) => ({ id: s.id, moduleId: s.moduleId, kick: s.kick, taglineHtml: teaser(s.tagline), rail: s.rail, num: s.num, special: !!s.special, stub: !!s.stub,
    cards: s.cards.map((c) => ({ chip: c.chip, ico: c.ico, clabel: c.clabel, heading: c.heading, orientHtml: teaser(c.orient), caplineHtml: teaser(c.capline || c.orient), check: !!c.check,
      atts: (c.atts ?? []).map((a) => ({ label: a.label, full: a.full, ico: a.ico })) })) }));
  const startStage = opts.currentModuleId ? Math.max(0, stages.findIndex((s) => s.moduleId === opts.currentModuleId)) : 0;
  const wcfg = { startStage, title: bp.meta.title, thesis: bp.meta.thesis || "" };
  return `
<div id="wroot">
  <nav id="wrail"></nav>
  <main id="wstage">
    <div class="w-head">
      <button class="w-railbtn" id="w-railbtn" title="Modules" aria-label="Toggle module list"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/></svg></button>
      <span class="w-kick" id="w-kick"></span>
      <div class="w-grow"></div>
      ${handsOnEligible(bp) ? `<button class="w-btn w-handson" id="w-handson" title="Open a runnable Python notebook for this lesson">⚡ Get Hands on<span class="w-hobeta">Beta</span></button>` : ""}
      <button class="w-btn w-round w-zoom" id="w-zout" title="Zoom out (−)" aria-label="Zoom out">−</button>
      <button class="w-btn w-round w-zoom" id="w-zin" title="Zoom in (+)" aria-label="Zoom in">+</button>
      <button class="w-recenter" id="w-recenter">⤾ Recenter</button>
      <button class="w-btn w-primary" id="w-next">Next ▸</button>
      <button class="w-btn w-round" id="w-reset" title="Restart this module">↺</button>
      <span class="w-meta"><span id="w-sn">0</span>/<span id="w-st">0</span></span>
    </div>
    <div class="w-vp" id="w-vp">
      <div class="w-world w-anim" id="w-world"></div>
      <div class="w-cap" id="w-cap"></div>
      <div class="w-poback" id="w-poback"></div>
      <div class="w-po" id="w-po"><div class="w-poh" id="w-poh"></div><div class="w-pob po-b" id="w-pob"></div></div>
    </div>
  </main>
</div>
${templates}
<script type="application/json" id="world-data">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>
<script type="application/json" id="world-cfg">${JSON.stringify(wcfg).replace(/</g, "\\u003c")}</script>`;
}

/* ---------------- CSS (scoped to the world layout; block content inside popups
     keeps using ARTIFACT_CSS with the dark theme) ---------------- */

export const WORLD_CSS = String.raw`
body[data-reading="world"]{overflow:hidden;height:100vh;height:100dvh;margin:0;
  --wbg:#0a0f1f;--wink:#eef2ff;--wsoft:#a8b4e0;--wmuted:#5f6c9b;--wline:#232f5c;--wcard:#101a38;
  --wcy:#5b8cff;--wcy2:#8fb0ff;--wgood:#34d399;--wwarn:#fbbf24;--wbad:#f87171;--wvio:#c084fc;
  background:var(--wbg);color:var(--wink)}
#wroot{display:grid;grid-template-columns:auto 1fr;height:100vh;height:100dvh}
#wrail{background:#0d1430;border-right:1px solid var(--wline);padding:14px 10px;display:flex;flex-direction:column;gap:3px;
  overflow:hidden auto;width:246px;transition:width .32s cubic-bezier(.2,.7,.2,1),padding .32s cubic-bezier(.2,.7,.2,1)}
#wroot:not(.rail-open) #wrail{width:0;padding:14px 0;border-right:none}
.w-nav{flex:none;width:226px;display:flex;align-items:center;gap:10px;text-align:left;border:none;background:none;font:inherit;
  font-size:13px;color:var(--wsoft);padding:9px 11px;border-radius:9px;cursor:pointer;line-height:1.3}
.w-nav:hover{background:rgba(91,140,255,.08)}
.w-nav.active{background:rgba(91,140,255,.14);color:var(--wcy2);font-weight:700}
.w-nav .n{flex:none;width:22px;height:22px;border-radius:7px;background:#1a2547;display:flex;align-items:center;justify-content:center;
  font-size:10.5px;font-weight:800;color:var(--wsoft)}
.w-nav.active .n{background:var(--wcy);color:#fff}
.w-nav.done .n{background:var(--wgood);color:#04120c}
#wstage{position:relative;min-width:0;display:flex;flex-direction:column;overflow:hidden;
  background:radial-gradient(900px 560px at 60% -8%,#182450 0%,transparent 60%),
    repeating-linear-gradient(0deg,transparent 0 39px,rgba(91,140,255,.045) 39px 40px),
    repeating-linear-gradient(90deg,transparent 0 39px,rgba(91,140,255,.045) 39px 40px),var(--wbg)}
.w-head{flex:none;display:flex;align-items:center;gap:10px;padding:12px 22px 10px;position:relative;z-index:8;
  background:linear-gradient(180deg,var(--wbg) 62%,transparent)}
/* Header controls MATCH THE HOST APP's nav-bar buttons (.vbtn in public/styles.css):
   9px-radius boxes on the surface token with a 1px border, 13px text at NORMAL weight,
   content centered; icon-only controls are 32px circles on the same tokens; exactly one
   primary (Next) carries the accent fill — so the header reads like a third nav bar. */
.w-railbtn{flex:none;width:32px;height:32px;border:1px solid var(--wline);background:var(--wcard);color:var(--wsoft);
  border-radius:50%;padding:0;line-height:0;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.w-railbtn:hover,.w-railbtn.on{border-color:var(--wcy);color:var(--wcy2)}
.w-kick{font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--wcy2);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.w-grow{flex:1}
.w-btn{font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;
  border:1px solid var(--wline);background:var(--wcard);color:var(--wink);border-radius:9px;
  padding:0 13px;cursor:pointer;font-weight:500;font-size:13px;white-space:nowrap;line-height:1}
.w-btn:hover{border-color:var(--wcy);color:var(--wcy2)}
.w-primary{background:var(--wcy);border-color:var(--wcy);color:#fff}
.w-primary:hover{filter:brightness(1.07);color:#fff}
.w-btn:disabled{opacity:.35}
/* icon-only circles: zoom −/+ (wheel-zoom equivalents, same 0.45–2 clamp) and restart ↺ */
.w-round{width:32px;padding:0;border-radius:50%;font-size:15px;flex:none}
/* On phones the header has no room for them: the two extra buttons push #w-next past the
   390px edge, and any focus/click scroll then drags the whole overflow:hidden stage 34px
   sideways (the map clips). Hide them — narrow screens keep the pre-existing header. */
@media (max-width:600px){.w-zoom{display:none}}
/* "⚡ Get Hands on" — a filled, accent launch button (restores the classic-renderer affordance
   in the world header; opens the browser-run Python notebook). Green so it reads as "run it". */
.w-handson{background:var(--wgood);border-color:var(--wgood);color:#06231a}
.w-handson:hover{filter:brightness(1.06);border-color:var(--wgood);color:#06231a}
.w-hobeta{font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;background:rgba(6,35,26,.18);color:#06231a;border-radius:5px;padding:1px 5px;line-height:1.4}
.w-meta{font-size:12.5px;color:var(--wmuted);font-weight:500;min-width:40px;height:32px;display:inline-flex;align-items:center;justify-content:center;
  background:var(--wcard);border:1px solid var(--wline);border-radius:9px;padding:0 11px}
/* Recenter appears only while panned/zoomed — same box, accent-tinted so it reads as a hint */
.w-recenter{display:none;font-family:inherit;align-items:center;justify-content:center;height:32px;
  border:1px solid var(--wcy);background:rgba(91,140,255,.1);color:var(--wcy2);
  border-radius:9px;padding:0 13px;cursor:pointer;font-weight:500;font-size:13px;white-space:nowrap;line-height:1}
.w-recenter.show{display:inline-flex}
.w-vp{flex:1;min-height:0;position:relative;cursor:grab;transition:opacity .4s}
.w-vp.dragging{cursor:grabbing}
.w-vp.swap{opacity:0}
.w-world{position:absolute;left:50%;top:50%;width:1400px;height:760px;margin:-380px 0 0 -700px;transform-origin:center}
.w-world.w-anim{transition:transform .95s cubic-bezier(.3,.62,.18,1)}
.w-wire{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}
.w-edge{stroke:#2b3a72;stroke-width:2.5;fill:none}
.w-edge.hot{stroke:var(--wcy);stroke-dasharray:8 8;animation:wdash .9s linear infinite}
@keyframes wdash{to{stroke-dashoffset:-16}}
.w-card{position:absolute;width:360px;height:208px;display:flex;flex-direction:column;border:1.5px solid var(--wline);
  border-radius:16px;background:var(--wcard);padding:14px 17px 12px;cursor:pointer;overflow:hidden;
  transition:border-color .4s,box-shadow .4s,transform .3s;color:var(--wink)}
.w-card.wide{width:560px}
.w-card:hover{transform:translateY(-3px);border-color:#3b4d94}
/* the ▸ start card pulses until it's been read — the "click me first" cue */
@keyframes wpulse{0%{box-shadow:0 0 0 0 rgba(91,140,255,.5)}70%{box-shadow:0 0 0 18px rgba(91,140,255,0)}100%{box-shadow:0 0 0 0 rgba(91,140,255,0)}}
.w-card.pulse:not(.visited){animation:wpulse 1.9s ease-out infinite;border-color:var(--wcy)}
/* align-self:flex-start is LOAD-BEARING: the card is a flex column, and a stretched chip
   spans the full card width and collides with the corner badge. flex-shrink:0 on chip/title
   keeps tight cards from vertically squeezing (clipping) the heading glyphs. */
.w-chip{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;
  border-radius:99px;padding:3px 10px;border:1px solid;align-self:flex-start;flex-shrink:0;max-width:70%}
.wk-concept{color:var(--wcy2);border-color:rgba(91,140,255,.4);background:rgba(91,140,255,.1)}
.wk-try{color:var(--wwarn);border-color:rgba(251,191,36,.4);background:rgba(251,191,36,.08)}
.wk-howto{color:var(--wgood);border-color:rgba(52,211,153,.4);background:rgba(52,211,153,.08)}
.wk-example{color:var(--wvio);border-color:rgba(192,132,252,.4);background:rgba(192,132,252,.1)}
.wk-code{color:#7ee2b8;border-color:rgba(126,226,184,.4);background:rgba(126,226,184,.08)}
.wk-decision{color:#f0a6a4;border-color:rgba(248,113,113,.4);background:rgba(248,113,113,.08)}
.wk-tech{color:#9fb6e8;border-color:rgba(159,182,232,.4);background:rgba(159,182,232,.08)}
.wk-check{color:var(--wgood);border-color:rgba(52,211,153,.5);background:rgba(52,211,153,.1)}
.wk-recall{color:var(--wvio);border-color:rgba(192,132,252,.4);background:rgba(192,132,252,.1)}
.wk-lead{color:var(--wcy2);border-color:rgba(143,176,255,.5);background:rgba(91,140,255,.14)}
.w-card h3{margin:9px 0 4px;font-size:17px;font-weight:800;line-height:1.3;color:var(--wink);flex-shrink:0;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.w-card .w-orient{font-size:12.5px;color:var(--wsoft);line-height:1.5;min-height:0;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.w-card:has(.w-atts) .w-orient{-webkit-line-clamp:2}
/* attached example/code buttons — SHORT type labels ("Example", "Code 1"); one row.
   These carry the module's RUNNABLE ARTIFACTS folded off the map, so they must read as clear
   call-to-actions: a learner scanning a concept card must never conclude the lesson has no code.
   Accent CODE buttons green and EXAMPLE buttons violet — same identity as their kind chips. */
.w-atts{margin-top:9px;display:flex;flex-wrap:wrap;gap:7px;flex-shrink:0}
.w-att{font-family:inherit;font-size:11.5px;font-weight:800;letter-spacing:.01em;display:inline-flex;align-items:center;gap:5px;
  color:var(--wcy2);background:rgba(91,140,255,.16);border:1.5px solid rgba(91,140,255,.42);
  border-radius:9px;padding:5px 11px;cursor:pointer;white-space:nowrap;transition:background .2s,border-color .2s,color .2s,transform .15s}
.w-att:hover{background:rgba(91,140,255,.3);border-color:var(--wcy);color:#fff;transform:translateY(-1px)}
.w-att.is-code{color:#8ff0c6;background:rgba(126,226,184,.16);border-color:rgba(126,226,184,.5)}
.w-att.is-code:hover{background:rgba(126,226,184,.3);border-color:#7ee2b8;color:#eafff5}
.w-att.is-ex{color:#d9b6ff;background:rgba(192,132,252,.16);border-color:rgba(192,132,252,.48)}
.w-att.is-ex:hover{background:rgba(192,132,252,.3);border-color:var(--wvio);color:#fbeeff}
.w-card .w-open{display:flex;justify-content:flex-end;margin-top:auto;font-size:10.5px;font-weight:800;letter-spacing:.05em;
  color:var(--wmuted);text-transform:uppercase}
.w-card:hover .w-open,.w-card.focus .w-open{color:var(--wcy2)}
.w-card.focus{border-color:var(--wcy);box-shadow:0 22px 70px rgba(91,140,255,.4)}
/* dim = fade the CONTENT, keep the card surface OPAQUE — a translucent card let the wire
   lines show through it (read as stray dotted lines crossing the text) */
.w-card.dim>*{opacity:.34;transition:opacity .5s}
.w-card.dim{border-color:var(--wline)}
.w-card .w-seen{position:absolute;top:12px;right:14px;font-size:11px;color:var(--wgood);opacity:0;transition:opacity .3s}
.w-card.visited .w-seen{opacity:1}
/* Suggested reading order — the map invites free clicking, but recall-openers and staged
   examples assume a sequence; the corner number makes the intended path visible. Fades
   out once the card is read so the ✓ can take its spot. */
.w-card .w-idx{position:absolute;top:12px;right:14px;font-size:10px;font-weight:800;letter-spacing:.04em;
  color:var(--wsoft);opacity:.75;border:1px solid var(--wline);border-radius:9px;padding:1px 7px;transition:opacity .3s}
.w-card.visited .w-idx{opacity:0}
.w-cap{position:absolute;left:26px;right:26px;bottom:18px;z-index:5;pointer-events:none}
/* Each caption line sits on its own scrim pill — without it the white caption text prints
   directly over whatever card occupies the bottom-left of the map (text-over-text). */
.w-cap .w-line{opacity:0;transform:translateY(15px);background:rgba(8,13,29,.82);
  padding:5px 12px;border-radius:10px;width:fit-content;max-width:100%;backdrop-filter:blur(3px)}
.w-cap.enter .w-line{animation:wup .6s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i)*.32s)}
@keyframes wup{to{opacity:1;transform:none}}
.w-line.kck{font-size:10.5px;font-weight:800;letter-spacing:.11em;text-transform:uppercase;color:var(--wcy2);margin:0 0 7px}
.w-line.one{font-size:clamp(12.5px,1.05vw,15px);font-weight:650;line-height:1.5;color:var(--wink);max-width:110ch;
  text-shadow:0 2px 18px rgba(10,15,31,.95);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.w-line.one .hl{color:var(--wcy2);font-weight:800}
.w-line.hint{font-size:11px;font-weight:600;color:var(--wmuted);margin-top:8px}
.w-nextmod{pointer-events:auto;margin-top:12px;font-family:inherit;border:1px solid var(--wgood);background:rgba(52,211,153,.12);
  color:var(--wgood);border-radius:99px;padding:9px 20px;cursor:pointer;font-weight:800;font-size:13.5px;opacity:0;animation:wup .6s .5s both}
@keyframes wcin{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.w-poback{position:absolute;inset:0;background:rgba(6,10,22,.62);opacity:0;pointer-events:none;transition:opacity .3s;z-index:9}
.w-poback.on{opacity:1;pointer-events:auto}
.w-po{position:absolute;left:50%;top:47%;transform:translate(-50%,-47%) scale(.96);width:min(780px,76%);max-height:82%;
  background:#0d1530;border:1px solid #2b3a72;border-radius:20px;box-shadow:0 40px 120px rgba(0,0,0,.6);display:flex;
  flex-direction:column;opacity:0;pointer-events:none;transition:all .35s cubic-bezier(.2,.7,.2,1);z-index:10;overflow:hidden}
.w-po.on{opacity:1;pointer-events:auto;transform:translate(-50%,-47%)}
.w-poh{flex:none;display:flex;align-items:center;gap:11px;padding:15px 20px;border-bottom:1px solid #1e2b56}
.w-poh h2{margin:0;font-size:18px;font-weight:800;min-width:0;line-height:1.3;color:var(--wink)}
.w-poh .x{margin-left:auto;flex:none;cursor:pointer;border:1px solid var(--wline);background:none;color:#8fa3d8;font:inherit;
  font-size:15px;line-height:1;width:30px;height:30px;border-radius:9px}
.w-poh .x:hover{border-color:var(--wcy);color:var(--wcy2)}
.w-pob{flex:1;min-height:0;overflow-y:auto;padding:16px 22px 20px;font-size:13.5px;line-height:1.65}
.w-pob::-webkit-scrollbar{width:8px}.w-pob::-webkit-scrollbar-thumb{background:#26346a;border-radius:99px}
/* block content adjustments inside the popup: force collapsibles open, keep media inside */
.w-pob .collapse-body{display:block!important}
.w-pob .collapse-h{pointer-events:none}
.w-pob .reveal{opacity:1!important;transform:none!important}
/* A popup carries 100% of its block's content — NEVER combo-gate it. The 27-combo
   gates (body[data-depth] .needs-*) hide blocks in the classic flow, but the world map
   shows a card for every block; an opened card must never be empty. */
.w-pob .needs-technical,.w-pob .needs-conceptual,.w-pob .needs-code,.w-pob .needs-functional{display:block!important}
/* The popup HEADER already shows the block's title — hide the body's duplicate first
   heading and the collapsible label bar so every popup doesn't open with its own title twice.
   Same for the synthesis/sources panels' eyebrow+h2 pair (they aren't .block-wrapped). */
.w-pob .block>h3:first-child{display:none}
.w-pob .collapse-h{display:none}
.w-pob>.eyebrow,.w-pob>.eyebrow+h2{display:none}
.w-pob img,.w-pob svg{max-width:100%}
.w-pob .po-visual svg{width:100%;height:auto}
.w-pob .po-analogy{background:rgba(192,132,252,.08);border-left:3px solid var(--wvio);border-radius:0 11px 11px 0;
  padding:10px 14px;margin:12px 0;color:#d9c4f5;font-size:13px}
.w-pob .qprompt{font-size:15px;font-weight:800;margin:2px 0 12px;line-height:1.45}
.w-pob .qopt{display:block;width:100%;text-align:left;font:600 13px inherit;font-family:inherit;color:var(--wink);
  background:rgba(255,255,255,.03);border:1px solid var(--wline);border-radius:11px;padding:11px 14px;margin:7px 0;cursor:pointer;line-height:1.45}
.w-pob .qopt:hover{border-color:var(--wcy)}
.w-pob .qopt.ok{border-color:var(--wgood);color:var(--wgood)}
.w-pob .qopt.no{border-color:var(--wbad);color:var(--wbad)}
.w-pob .qfb{font-size:13.5px;color:var(--wink);margin-top:10px;line-height:1.6}
.w-pob .qfb .q-yes{color:var(--wgood)}.w-pob .qfb .q-no{color:var(--wbad)}
.w-pob .qopt .qL{opacity:.55;margin-right:6px}
.w-pob .w-free{width:100%;font:inherit;font-size:13px;color:var(--wink);background:rgba(255,255,255,.04);
  border:1px solid var(--wline);border-radius:11px;padding:10px 12px;margin:6px 0}
.w-pob .w-ref{font-size:12.5px;color:var(--wsoft);background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.3);
  border-radius:11px;padding:10px 13px;margin-top:8px}

/* ===== LIGHT THEME (toggle in the header; persisted in localStorage). The --w* vars
   flip here; block content inside popups follows automatically because ARTIFACT_CSS's
   default (non-dark) theme applies once body[data-theme] is "light". Rules below only
   re-cover the colors that were hard-coded for dark. ===== */
body[data-reading="world"][data-theme="light"]{
  --wbg:#eef2fa;--wink:#16203f;--wsoft:#3f4e7d;--wmuted:#7c88ad;--wline:#c9d3ec;--wcard:#ffffff;
  --wcy:#3b66e0;--wcy2:#2f55c8;--wgood:#0d9668;--wwarn:#b3730a;--wbad:#d43d3d;--wvio:#7c3aed}
body[data-reading="world"][data-theme="light"] #wrail{background:#e4e9f7}
body[data-reading="world"][data-theme="light"] .w-nav .n{background:#d3dcf2;color:#3f4e7d}
body[data-reading="world"][data-theme="light"] #wstage{
  background:radial-gradient(900px 560px at 60% -8%,#dde6fb 0%,transparent 60%),
    repeating-linear-gradient(0deg,transparent 0 39px,rgba(59,102,224,.06) 39px 40px),
    repeating-linear-gradient(90deg,transparent 0 39px,rgba(59,102,224,.06) 39px 40px),var(--wbg)}
/* light surfaces come from var(--wcard) (#fff) in the base rules — same as the host bars */
body[data-reading="world"][data-theme="light"] .w-recenter{background:rgba(59,102,224,.08)}
body[data-reading="world"][data-theme="light"] .w-primary{background:var(--wcy);color:#fff}
/* keep the hands-on button GREEN in light mode — the light .w-btn override above (same base
   class, higher specificity) would otherwise flatten it to the faint surface. */
body[data-reading="world"][data-theme="light"] .w-handson{background:var(--wgood);border-color:var(--wgood);color:#fff}
body[data-reading="world"][data-theme="light"] .w-hobeta{background:rgba(255,255,255,.28);color:#fff}
body[data-reading="world"][data-theme="light"] .w-edge{stroke:#aebbe2}
body[data-reading="world"][data-theme="light"] .w-card{box-shadow:0 8px 26px rgba(22,32,63,.07)}
body[data-reading="world"][data-theme="light"] .w-card:hover{border-color:#8fa4d8}
body[data-reading="world"][data-theme="light"] .w-card.focus{box-shadow:0 22px 70px rgba(59,102,224,.25)}
body[data-reading="world"][data-theme="light"] .wk-code{color:#0c7a52;border-color:rgba(12,122,82,.4);background:rgba(12,122,82,.07)}
body[data-reading="world"][data-theme="light"] .w-att{color:#2f55c8;background:rgba(59,102,224,.11);border-color:rgba(59,102,224,.38)}
body[data-reading="world"][data-theme="light"] .w-att:hover{background:rgba(59,102,224,.2);color:#16203f}
body[data-reading="world"][data-theme="light"] .w-att.is-code{color:#0c7a52;background:rgba(12,122,82,.11);border-color:rgba(12,122,82,.42)}
body[data-reading="world"][data-theme="light"] .w-att.is-code:hover{background:rgba(12,122,82,.2);color:#08543a}
body[data-reading="world"][data-theme="light"] .w-att.is-ex{color:#6d28d9;background:rgba(124,58,237,.11);border-color:rgba(124,58,237,.4)}
body[data-reading="world"][data-theme="light"] .w-att.is-ex:hover{background:rgba(124,58,237,.2);color:#4c1d95}
body[data-reading="world"][data-theme="light"] .wk-decision{color:#c03636;border-color:rgba(192,54,54,.35);background:rgba(192,54,54,.06)}
body[data-reading="world"][data-theme="light"] .wk-tech{color:#3c5aa8;border-color:rgba(60,90,168,.4);background:rgba(60,90,168,.08)}
body[data-reading="world"][data-theme="light"] .w-line.one{text-shadow:0 2px 18px rgba(238,242,250,.95)}
body[data-reading="world"][data-theme="light"] .w-cap .w-line{background:rgba(255,255,255,.86)}
body[data-reading="world"][data-theme="light"] body[data-reading="world"][data-theme="light"] .w-poback{background:rgba(30,40,72,.35)}
body[data-reading="world"][data-theme="light"] .w-po{background:#ffffff;border-color:#c9d3ec;box-shadow:0 40px 120px rgba(22,32,63,.28)}
body[data-reading="world"][data-theme="light"] .w-poh{border-bottom-color:#dde4f4}
body[data-reading="world"][data-theme="light"] .w-poh .x{color:#5a6a99}
body[data-reading="world"][data-theme="light"] .w-pob::-webkit-scrollbar-thumb{background:#c9d3ec}
body[data-reading="world"][data-theme="light"] .w-pob .po-analogy{color:#5b3f8f}
body[data-reading="world"][data-theme="light"] .w-pob .qopt{background:rgba(22,32,63,.025)}
body[data-reading="world"][data-theme="light"] .w-pob .w-free{background:rgba(22,32,63,.03)}
@media print{ body[data-reading="world"]{overflow:visible;height:auto} }
`;

/* ---------------- runtime (self-contained; ports the approved mockup engine) ---------------- */

export const WORLD_JS = String.raw`
(function(){
"use strict";
var $=function(id){return document.getElementById(id);};
var DATA=[],WCFG={},glossary={},cfg={};
try{DATA=JSON.parse($("world-data").textContent||"[]");}catch(e){}
try{WCFG=JSON.parse($("world-cfg").textContent||"{}");}catch(e){}
try{glossary=JSON.parse($("glossary-data").textContent||"{}");}catch(e){}
try{cfg=JSON.parse($("lesson-config").textContent||"{}");}catch(e){}
var _m=(location.pathname||"").match(/\/api\/artifact\/([^\/?#]+)/);
var ARTIFACT_ID=_m?_m[1]:"";
var E={si:0,bi:0,gen:0,doneStages:{},visited:{},cam:{x:0,y:0,s:.85},usr:{x:0,y:0,s:1}};
var BEATS=[];
/* ---- camera + canvas ---- */
function applyCam(anim){var w=$("w-world");w.classList.toggle("w-anim",anim!==false);
  w.style.transform="translate("+(E.cam.x+E.usr.x)+"px,"+(E.cam.y+E.usr.y)+"px) scale("+(E.cam.s*E.usr.s)+")";
  $("w-recenter").classList.toggle("show",Math.abs(E.usr.x)+Math.abs(E.usr.y)>4||Math.abs(E.usr.s-1)>.02);}
function resetUsr(){E.usr={x:0,y:0,s:1};}
/* +/- button (and keyboard) zoom — same clamp as the wheel handler so behavior matches;
   animated so a button press reads as a deliberate step. applyCam also flips the
   Recenter button's visibility, exactly like wheel-zoom does. */
function zoomBy(f){E.usr.s=Math.min(2,Math.max(.45,E.usr.s*f));applyCam(true);}
function vpSize(){var r=$("w-vp").getBoundingClientRect();return{w:r.width,h:r.height};}
function bbox(){var x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,any=false;
  document.querySelectorAll("#w-world .w-card").forEach(function(c){any=true;
    x0=Math.min(x0,c.offsetLeft);y0=Math.min(y0,c.offsetTop);
    x1=Math.max(x1,c.offsetLeft+c.offsetWidth);y1=Math.max(y1,c.offsetTop+c.offsetHeight);});
  return any?{x0:x0,y0:y0,x1:x1,y1:y1}:{x0:0,y0:0,x1:1400,y1:760};}
function camFit(){var v=vpSize(),b=bbox();var n=document.querySelectorAll("#w-world .w-card").length;
  var s=Math.min((v.w-90)/(b.x1-b.x0),(v.h-235)/(b.y1-b.y0),n<=2?1.45:1.05);
  var cx=(b.x0+b.x1)/2,cy=(b.y0+b.y1)/2;
  E.cam={x:-(cx-700)*s,y:-((cy-380)*s)-78,s:s};resetUsr();applyCam();}
function camFocusEl(el){var v=vpSize();
  /* clamp the focus zoom so the card always FITS the viewport (a fixed 1.16 clipped
     ~14px per side on 390px phones) */
  var s=Math.min(1.16,Math.max(.5,(v.w-24)/el.offsetWidth));
  E.cam={x:-(el.offsetLeft+el.offsetWidth/2-700)*s,y:-(el.offsetTop+el.offsetHeight/2-380)*s-78,s:s};
  resetUsr();applyCam();}
(function(){var vp=$("w-vp"),drag=null;
 vp.addEventListener("pointerdown",function(e){
   if(e.target.closest(".w-po,.w-poback,button,.w-cap,textarea"))return;
   drag={x:e.clientX,y:e.clientY,ux:E.usr.x,uy:E.usr.y,moved:false,pid:e.pointerId};});
 vp.addEventListener("pointermove",function(e){if(!drag)return;
   var dx=e.clientX-drag.x,dy=e.clientY-drag.y;
   if(!drag.moved&&Math.hypot(dx,dy)>6){drag.moved=true;vp.classList.add("dragging");$("w-world").classList.remove("w-anim");
     try{vp.setPointerCapture(drag.pid);}catch(_){}}
   if(drag.moved){E.usr.x=drag.ux+dx;E.usr.y=drag.uy+dy;applyCam(false);}});
 vp.addEventListener("pointerup",function(){if(drag&&drag.moved){E.suppress=true;setTimeout(function(){E.suppress=false;},80);}
   drag=null;vp.classList.remove("dragging");});
 vp.addEventListener("wheel",function(e){if(e.target.closest(".w-po"))return;e.preventDefault();
   E.usr.s=Math.min(2,Math.max(.45,E.usr.s*(1-e.deltaY*.0012)));applyCam(false);},{passive:false});
 /* Recenter = re-FIT the whole map (not just undo the user's pan): mid-beat the camera is
    zoomed into one card, and "recenter" while zoomed-in previously left you zoomed-in. */
 $("w-recenter").onclick=function(){camFit();};
 $("w-zin").onclick=function(){zoomBy(1.2);};
 $("w-zout").onclick=function(){zoomBy(.83);};})();
/* ---- caption + strip ---- */
function cap(lines,extra){var c=$("w-cap");c.classList.remove("enter");
  c.innerHTML=lines.map(function(l,i){return '<div class="w-line '+(l[1]||"")+'" style="--i:'+i+'">'+l[0]+"</div>";}).join("")+(extra||"");
  void c.offsetWidth;c.classList.add("enter");}
function escH(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;");}
/* ---- world build ---- */
/* Serpentine grid: rows of 3, odd rows flow right-to-left so the reading path
   winds continuously (card N+1 is always spatially adjacent to card N). Any card
   count gets a real row offset — the old two-row layout stacked cards 4+ of the
   top row EXACTLY on top of cards 1-3 (its Y offset was multiplied by zero). */
function gridPos(n){var X=[85,535,985],Y0=100,RH=342;
  if(n===1)return[[420,220]];
  if(n===2)return[[190,130],[880,370]];
  if(n===3)return[[85,110],[535,340],[985,110]];
  var out=[],i;
  for(i=0;i<n;i++){
    var r=Math.floor(i/3),c=i%3;
    if(r%2===1)c=2-c;
    out.push([X[c],Y0+r*RH]);
  }
  return out;}
function buildWorld(si){var S=DATA[si],w=$("w-world");
  var pos=gridPos(S.cards.length);
  var centers=pos.map(function(p){return[p[0]+180,p[1]+104];});
  var edges=centers.slice(1).map(function(b,i){var a=centers[i];
    return '<path class="w-edge" d="M '+a[0]+" "+a[1]+" C "+((a[0]+b[0])/2)+" "+a[1]+", "+((a[0]+b[0])/2)+" "+b[1]+", "+b[0]+" "+b[1]+'"/>';}).join("");
  w.innerHTML='<svg class="w-wire">'+edges+"</svg>"+S.cards.map(function(c,ci){
    var atts=(c.atts&&c.atts.length)?'<div class="w-atts">'+c.atts.map(function(a,ai){
      var ak=a.ico==="⟨⟩"?" is-code":(a.ico==="▶"?" is-ex":"");
      return '<button class="w-att'+ak+'" data-ai="'+ai+'">'+a.ico+" "+escH(a.label)+"</button>";}).join("")+"</div>":"";
    return '<div class="w-card'+(S.cards.length===1?" wide":"")+(ci===0&&!S.special?" pulse":"")+'" data-ci="'+ci+'" style="left:'+pos[ci][0]+'px;top:'+pos[ci][1]+'px">'+
      '<span class="w-chip '+c.chip+'">'+c.ico+" "+escH(c.clabel)+'</span><span class="w-seen">✓ read</span>'+
      (S.cards.length>1?'<span class="w-idx" title="suggested reading order">'+(S.special?(ci+1):(ci===0?"▸ start":ci))+'</span>':"")+
      "<h3>"+escH(c.heading)+"</h3>"+
      /* *Html fields arrive PRE-ESCAPED from the renderer (may carry KaTeX) — no escH */
      '<div class="w-orient">'+c.orientHtml+"</div>"+atts+
      '<div class="w-open">Open ↗</div></div>';}).join("");
  w.querySelectorAll(".w-card").forEach(function(c){c.onclick=function(){if(E.suppress)return;openPopup(si,+c.dataset.ci);};
    c.querySelectorAll(".w-att").forEach(function(btn){btn.onclick=function(e){e.stopPropagation();if(E.suppress)return;
      openPopup(si,+c.dataset.ci,+btn.dataset.ai);};});});}
function focus(cis){document.querySelectorAll("#w-world .w-card").forEach(function(c){
  var on=(cis||[]).indexOf(+c.dataset.ci)!==-1;
  c.classList.toggle("focus",on);
  c.classList.toggle("dim",!!(cis&&cis.length)&&!on);});}
function hotEdge(i){document.querySelectorAll("#w-world .w-edge").forEach(function(e,k){e.classList.toggle("hot",k===i);});}
/* ---- popup ---- */
function openPopup(si,ci,ai){var S=DATA[si],c=S.cards[ci];
  var att=(ai!=null&&c.atts&&c.atts[ai])?c.atts[ai]:null;
  var tpl=document.getElementById("wpop-"+si+"-"+ci+(att?"-a"+ai:""));
  $("w-poh").innerHTML='<span class="w-chip '+c.chip+'">'+c.ico+" "+escH(c.clabel)+'</span><h2>'+escH(att?att.ico+" "+(att.full||att.label):c.heading)+'</h2><button class="x" id="w-pox">✕</button>';
  var b=$("w-pob");b.innerHTML="";if(tpl)b.appendChild(tpl.content.cloneNode(true));b.scrollTop=0;
  hydrate(b);
  $("w-po").classList.add("on");$("w-poback").classList.add("on");
  $("w-pox").onclick=closePopup;
  var card=document.querySelector('#w-world .w-card[data-ci="'+ci+'"]');if(card)card.classList.add("visited");
  E._open=[si,ci];}
function closePopup(){$("w-po").classList.remove("on");$("w-poback").classList.remove("on");E._open=null;}
$("w-poback").onclick=closePopup;
/* quiz + final-check + free-text grading (delegated inside the popup) */
document.addEventListener("click",function(ev){
  var opt=ev.target.closest(".w-pob .qopt");
  if(opt){var box=opt.parentElement;
    if(opt.dataset.reveal){var ref=box.querySelector(".w-ref");if(ref)ref.hidden=false;opt.disabled=true;opt.textContent="Revealed ✓";markCheckDone();return;}
    if(opt.disabled)return;
    var ok=opt.dataset.ok==="1";
    opt.classList.add(ok?"ok":"no");
    var right=box.querySelector('.qopt[data-ok="1"]');if(!ok&&right)right.classList.add("ok");
    box.querySelectorAll(".qopt").forEach(function(o){if(!o.dataset.reveal)o.disabled=true;});
    var fb=box.querySelector(".qfb"),src=box.querySelector(".qfb-src");
    if(fb)fb.innerHTML=(ok?'<b class="q-yes">✓ Correct.</b> ':'<b class="q-no">✗ Not quite.</b> ')+(src?src.innerHTML:escH(fb.dataset.explain||""));
    markCheckDone();return;}
  var q=ev.target.closest(".w-pob .quiz .opt");
  if(q){var correct=q.getAttribute("data-correct")==="1";
    q.classList.add(correct?"correct":"wrong");
    if(!correct){var c2=q.closest(".quiz").querySelector('.opt[data-correct="1"]');if(c2)c2.classList.add("correct");}
    q.closest(".quiz").classList.add("revealed");markCheckDone();return;}
  var rv=ev.target.closest(".w-pob .quiz .reveal");
  if(rv){rv.closest(".quiz").classList.add("revealed");rv.disabled=true;rv.textContent="Revealed ✓";markCheckDone();return;}
  var t=ev.target.closest(".term,.term-chip");
  if(t){ev.preventDefault();ev.stopPropagation();togglePopover(t);return;}
  if(!ev.target.closest("#popover"))hidePopover();
});
function markCheckDone(){if(!E._open)return;var si=E._open[0];
  if(!DATA[si].cards[E._open[1]].check)return;
  E.doneStages[si]=E.doneStages[si]||{};E.doneStages[si][E._open[1]]=1;
  var all=DATA[si].cards.every(function(c,ci){return !c.check||E.doneStages[si][ci];});
  if(all)stampDone(si);}
function stampDone(si){var r=document.querySelectorAll("#wrail .w-nav")[si];if(r)r.classList.add("done");}
/* ---- glossary popover (ported) ---- */
var pop=document.getElementById("popover");
function togglePopover(btn){if(pop._for===btn&&pop.classList.contains("on")){hidePopover();return;}
  var tm=glossary[btn.getAttribute("data-term")];if(!tm)return;
  pop.innerHTML='<button class="pclose" type="button" aria-label="Close">×</button><div class="pt">'+escH(tm.label)+"</div>"+
    (tm.acronymExpansion?'<div class="px">'+escH(tm.acronymExpansion)+"</div>":"")+
    '<div class="pn">'+escH(tm.laymanDefinition)+"</div>"+(tm.technicalNote?'<div class="ptech">'+escH(tm.technicalNote)+"</div>":"");
  pop.classList.add("on");pop._for=btn;
  var r=btn.getBoundingClientRect(),top=r.bottom+8,left=Math.min(r.left,window.innerWidth-330);
  if(top+pop.offsetHeight>window.innerHeight)top=r.top-pop.offsetHeight-8;
  pop.style.top=Math.max(8,top)+"px";pop.style.left=Math.max(8,left)+"px";
  pop.querySelector(".pclose").onclick=hidePopover;}
function hidePopover(){pop.classList.remove("on");pop._for=null;}
/* ---- interactive viz hydration inside popups (scatter / slider / stepped; same data contract) ---- */
function vEsc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function buildSlider(body,data){var min=+data.min,max=+data.max,unit=data.unit||"",stops=(data.stops||[]).slice().sort(function(a,b){return a.at-b.at;});
  if(stops.length<2||!(max>min))return;
  var step=(max-min)/100;if(!(step>0))step=1;
  body.innerHTML='<div class="viz-slider-row"><span class="viz-readout">'+vEsc(min)+'</span><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+stops[0].at+'"><span class="viz-readout">'+vEsc(max)+"</span></div>"+
    '<div class="viz-readout" style="margin-top:8px">Value: <b class="vs-val"></b> '+vEsc(unit)+"</div>"+
    '<div class="viz-stop-note"><span class="vsn-label vs-lab"></span><span class="vs-note"></span></div>';
  var range=body.querySelector("input"),val=body.querySelector(".vs-val"),lab=body.querySelector(".vs-lab"),note=body.querySelector(".vs-note");
  function nearest(v){var best=stops[0],bd=Math.abs(v-stops[0].at);for(var i=1;i<stops.length;i++){var d=Math.abs(v-stops[i].at);if(d<bd){bd=d;best=stops[i];}}return best;}
  function upd(){var v=+range.value;val.textContent=Math.round(v*100)/100;var s=nearest(v);lab.textContent=s.label+" — ";note.textContent=s.note;}
  range.addEventListener("input",upd);upd();}
function buildStepped(body,data){var steps=data.steps||[];if(steps.length<2)return;
  body.innerHTML='<div class="viz-steps-nav">'+steps.map(function(s,i){return '<button class="viz-step-btn'+(i===0?" active":"")+'" data-si="'+i+'"><span class="vsb-n">'+(i+1)+"</span>"+(s.icon?vEsc(s.icon)+" ":"")+vEsc(s.label)+"</button>";}).join("")+'</div><div class="viz-step-detail"></div>';
  var detail=body.querySelector(".viz-step-detail");
  function show(i){var s=steps[i];detail.innerHTML="<h4>"+(s.icon?vEsc(s.icon)+" ":"")+vEsc(s.label)+"</h4>"+vEsc(s.detail);
    body.querySelectorAll(".viz-step-btn").forEach(function(b,bi){b.classList.toggle("active",bi===i);});}
  body.querySelector(".viz-steps-nav").addEventListener("click",function(e){var b=e.target.closest(".viz-step-btn");if(b)show(+b.getAttribute("data-si"));});
  show(0);}
function buildScatter(body,data){var pts=data.points||[],qs=data.queries||[];if(pts.length<1||qs.length<1)return;
  var W=460,H=300,PAD=34;
  function sx(x){return PAD+(Math.max(0,Math.min(100,x))/100)*(W-2*PAD);}
  function sy(y){return PAD+(Math.max(0,Math.min(100,y))/100)*(H-2*PAD);}
  body.innerHTML='<div class="viz-controls">'+qs.map(function(q,i){return '<button class="viz-qbtn'+(i===0?" sel":"")+'" data-qi="'+i+'">'+vEsc(q.label)+"</button>";}).join("")+"</div>"+
    '<div class="viz-scatter-grid"><svg class="scatter" viewBox="0 0 '+W+" "+H+'"></svg><div><div class="viz-near-lab">Nearest matches</div><ol class="viz-near"></ol></div></div>';
  var svg=body.querySelector("svg.scatter"),near=body.querySelector(".viz-near"),maxD=Math.hypot(100,100);
  function draw(qi){var q=qs[qi];
    var ranked=pts.map(function(p){return{p:p,d:Math.hypot((p.x||0)-q.x,(p.y||0)-q.y)};}).sort(function(a,b){return a.d-b.d;});
    /* "nearest" must mean NEAR: cap at a real distance so a far, different-cluster point is
       never presented as a match (top-3-always contradicted the caption's own lesson). */
    var top=ranked.filter(function(r){return r.d<=32;}).slice(0,3);
    if(!top.length)top=ranked.slice(0,1);
    var nearSet={};top.forEach(function(r){nearSet[r.p.label]=1;});
    var h="";
    top.forEach(function(r){h+='<line x1="'+sx(q.x)+'" y1="'+sy(q.y)+'" x2="'+sx(r.p.x)+'" y2="'+sy(r.p.y)+'" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>';});
    pts.forEach(function(p){var on=nearSet[p.label];h+='<circle cx="'+sx(p.x)+'" cy="'+sy(p.y)+'" r="'+(on?7:5)+'" fill="'+(on?"var(--accent)":"var(--border-strong)")+'" stroke="var(--surface)" stroke-width="2"/>'+
      '<text x="'+(sx(p.x)+9)+'" y="'+(sy(p.y)-8)+'" font-size="10.5" fill="'+(on?"var(--accent-2)":"var(--muted)")+'">'+vEsc(String(p.label).slice(0,22))+"</text>";});
    h+='<text x="'+sx(q.x)+'" y="'+(sy(q.y)+6)+'" font-size="20" text-anchor="middle" fill="var(--accent)">★</text>';
    svg.innerHTML=h;
    near.innerHTML=top.map(function(r){return "<li>"+vEsc(r.p.label)+"</li>";}).join("");}
  body.querySelector(".viz-controls").addEventListener("click",function(e){var b=e.target.closest(".viz-qbtn");if(!b)return;
    body.querySelectorAll(".viz-qbtn").forEach(function(x){x.classList.remove("sel");});b.classList.add("sel");draw(+b.getAttribute("data-qi"));});
  draw(0);}
function hydrate(root){root.querySelectorAll(".viz").forEach(function(viz){
  if(viz._hyd)return;viz._hyd=true;
  var kind=viz.getAttribute("data-viz"),dataEl=viz.querySelector(".viz-data"),body=viz.querySelector(".viz-body");
  if(!dataEl||!body)return;var data;try{data=JSON.parse(dataEl.textContent||"{}");}catch(e){return;}
  try{if(kind==="scatter")buildScatter(body,data);else if(kind==="slider")buildSlider(body,data);else if(kind==="stepped")buildStepped(body,data);}catch(e){}});}
/* ---- beats ---- */
function beatsFor(si){var S=DATA[si],beats=[];
  beats.push(function(){closePopup();camFit();focus([]);hotEdge(-1);
    cap([[escH(S.rail).toUpperCase()+" · MENTAL MAP OF "+S.cards.length+" BLOCK"+(S.cards.length>1?"S":""),"kck"],
         ['<span class="hl">'+escH(S.rail)+"</span> — "+S.taglineHtml,"one"],
         ["Click a card for the full detail · drag the canvas · scroll to zoom","hint"]]);});
  S.cards.forEach(function(c,ci){beats.push(function(){closePopup();
    var el=document.querySelector('#w-world .w-card[data-ci="'+ci+'"]');
    if(el)camFocusEl(el);focus([ci]);hotEdge(ci-1);
    cap([[c.ico+" "+escH(c.clabel)+" · "+escH(c.heading).toUpperCase(),"kck"],[c.caplineHtml||c.orientHtml,"one"]]);
    if(c.check)openPopup(si,ci);});});
  beats.push(function(){closePopup();camFit();focus([]);hotEdge(-1);
    var nx=si<DATA.length-1?DATA[si+1]:null;
    cap([['<span style="color:var(--wgood)">'+escH(S.rail)+" ✓</span>","one"]].concat(nx?[["Up next — "+escH(nx.rail),"hint"]]:[["Lesson complete 🎉","hint"]]),
      nx?'<button class="w-nextmod" onclick="__wgoto('+(si+1)+')">Continue → '+escH(nx.rail)+"</button>"
        :'<button class="w-nextmod" onclick="__wgoto(0)">↺ Replay lesson</button>');});
  return beats;}
function gotoStage(n){if(n<0||n>=DATA.length)return;
  E.gen++;
  var vp=$("w-vp");vp.classList.add("swap");
  setTimeout(function(){E.si=n;E.bi=0;
    buildWorld(n);closePopupSilent();
    BEATS=beatsFor(n);$("w-st").textContent=BEATS.length;$("w-kick").textContent=DATA[n].kick;
    document.querySelectorAll("#wrail .w-nav").forEach(function(r,k){r.classList.toggle("active",k===n);});
    markVisited(n);
    vp.classList.remove("swap");
    nextBeat();
    if(DATA[n].id==="_check" && DATA[n].cards.length) openPopup(n,0);
  },420);}
window.__wgoto=gotoStage;
function closePopupSilent(){$("w-po").classList.remove("on");$("w-poback").classList.remove("on");E._open=null;}
function nextBeat(){if(E.bi>=BEATS.length){if(E.si<DATA.length-1)gotoStage(E.si+1);return;}
  BEATS[E.bi]();E.bi++;paint();}
function paint(){$("w-sn").textContent=E.bi;
  $("w-next").textContent=E.bi>=BEATS.length?(E.si<DATA.length-1?"Next module ▸":"Done ✓"):"Next ▸";
  $("w-next").disabled=E.bi>=BEATS.length&&E.si>=DATA.length-1;}
$("w-next").onclick=function(){nextBeat();};
$("w-reset").onclick=function(){gotoStage(E.si);};
/* "⚡ Get Hands on" → open the browser-run Python notebook (same contract as the classic
   runtime): inside the host iframe ask the parent to open it (it has the window + token);
   standalone (downloaded / full-screen) open it ourselves. Passes the CURRENT module. */
(function(){var hb=$("w-handson");if(!hb)return;
  var _hl=(location.pathname||"").match(/\/(?:api\/artifact|api\/lesson|api\/community\/lesson)\/([^\/?#]+)/);
  var HANDSON_LESSON=_hl?_hl[1]:(ARTIFACT_ID||"");
  hb.onclick=function(){var mid=(DATA[E.si]&&DATA[E.si].moduleId)||"";
    try{if(window.parent&&window.parent!==window){window.parent.postMessage({type:"als-handson",lessonId:HANDSON_LESSON,moduleId:mid||null},"*");return;}}catch(e){}
    window.open("/hands-on?lesson="+encodeURIComponent(HANDSON_LESSON)+"&module="+encodeURIComponent(mid),"_blank");};})();
document.addEventListener("keydown",function(e){
  /* never swallow browser gestures — Cmd/Ctrl+(+/-) is the BROWSER's zoom (accessibility) */
  if(e.metaKey||e.ctrlKey)return;
  if(e.key==="Escape"){closePopup();hidePopover();return;}
  if(e.target&&(e.target.tagName==="TEXTAREA"||e.target.tagName==="INPUT"))return;
  if(e.key==="ArrowRight"){e.preventDefault();nextBeat();}
  if(e.key==="ArrowLeft"){e.preventDefault();if(E.bi>1){E.bi=E.bi-2;BEATS[E.bi]();E.bi++;paint();}}
  if(e.key==="+"||e.key==="="){e.preventDefault();zoomBy(1.2);}
  if(e.key==="-"||e.key==="_"){e.preventDefault();zoomBy(.83);}});
$("w-railbtn").onclick=function(){var on=$("wroot").classList.toggle("rail-open");$("w-railbtn").classList.toggle("on",on);};
/* ---- progress relay to the host app (same contract as the classic runtime) ---- */
var moduleStages=DATA.filter(function(s){return !s.special;}).length||1;
function markVisited(si){if(DATA[si]&&!DATA[si].special)E.visited[si]=1;
  var n=Object.keys(E.visited).length,pct=Math.round(n/moduleStages*100);
  try{if(window.parent&&window.parent!==window)window.parent.postMessage({type:"als-progress",visited:n,total:moduleStages,percent:pct,module:DATA[si]&&DATA[si].moduleId||null},"*");}catch(e){}}
/* ---- stub modules: trigger their build + self-refresh until they arrive ----
   Backstop (was: unconditional reload every 22s forever): a module that PERMANENTLY fails to build
   never leaves stub state, so the old loop reloaded — and bounced the reader back to stage 0 — every
   22s indefinitely. Now the reload is gated on PROGRESS: the no-progress counter resets whenever a
   module actually arrives (stub count drops) and only trips the backstop after ~8 stalled cycles
   (~3 min with no new module), so a normal multi-minute build self-heals freely while a stuck one
   stops. And before each reload we carry the reader's live stage into ?module= so the server
   re-renders at their position instead of stage 0. */
(function(){var stubs=DATA.filter(function(s){return s.stub;});
  var CKEY="als-world-heal:"+ARTIFACT_ID;
  if(!stubs.length){try{sessionStorage.removeItem(CKEY);}catch(e){}return;} /* fully built → clear state */
  if(!ARTIFACT_ID)return;
  stubs.forEach(function(s){try{fetch("/api/module",{method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({artifactId:ARTIFACT_ID,moduleId:s.moduleId})}).catch(function(){});}catch(e){}});
  var prev={n:0,s:1e9};try{prev=JSON.parse(sessionStorage.getItem(CKEY)||"")||prev;}catch(e){}
  var noProg=(stubs.length<prev.s)?0:((prev.n||0)+1); /* a module arrived since last load → reset */
  try{sessionStorage.setItem(CKEY,JSON.stringify({n:noProg,s:stubs.length}));}catch(e){}
  if(noProg>=8)return; /* stuck module: stop reloading so the reader can keep reading what built */
  setTimeout(function(){
    try{var cur=DATA[E.si];var mid=(cur&&cur.moduleId)||"";
      if(!mid){for(var j=E.si;j>=0;j--){if(DATA[j]&&DATA[j].moduleId){mid=DATA[j].moduleId;break;}}}
      if(mid){var u=new URL(location.href);u.searchParams.set("module",mid);history.replaceState({},"",u.pathname+u.search);}
    }catch(e){}
    location.reload();},22000);})();
/* ---- theme: driven by the HOST nav-bar toggle (shared same-origin "als-theme" key +
   live postMessage from app.js) — no in-lesson button. Full-screen opens read the key. ---- */
(function(){function apply(t){var v=t==="light"?"light":"dark";
    document.documentElement.setAttribute("data-theme",v);document.body.setAttribute("data-theme",v);}
  var saved=null;try{saved=localStorage.getItem("als-theme");}catch(e){}
  apply(saved);
  window.addEventListener("message",function(e){
    if(e.source!==window.parent)return;
    if(e.data&&e.data.type==="als-theme")apply(e.data.value);});})();
/* ---- rail + boot ---- */
(function(){var rail=$("wrail");
  DATA.forEach(function(s,i){var b=document.createElement("button");b.className="w-nav";
    b.innerHTML='<span class="n">'+escH(s.num)+"</span>"+escH(s.rail);
    b.onclick=function(){gotoStage(i);};rail.appendChild(b);});
  gotoStage(Math.min(WCFG.startStage||0,DATA.length-1));})();
})();
`;
