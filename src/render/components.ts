/**
 * # Component renderers — turn a validated Blueprint into the page body HTML
 *
 * Pure string functions, one per block/section type. The model supplies DATA
 * only; these functions own every tag, class, and the (i)-term wiring — so the
 * output is consistent and the interactivity always works.
 *
 * The 27 learner combinations are handled by attaching gate classes
 * (`needs-technical`, `needs-code`, …) that the CSS (tokens.ts) shows/hides based
 * on `body[data-*]`. Progressive disclosure uses `depthTier:"deeper"` blocks
 * behind a "Go deeper" toggle.
 */

import type { Blueprint, Block, Module } from "./schema";

// ---- escaping ----
export function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return esc(s).replace(/"/g, "&quot;");
}

// ---- inline spans (term references become (i) buttons) ----
function spanHtml(s: { text: string; term?: string; em?: boolean; strong?: boolean; code?: boolean }, bp: Blueprint): string {
  let inner = esc(s.text);
  if (s.code) inner = `<code>${inner}</code>`;
  if (s.strong) inner = `<strong>${inner}</strong>`;
  if (s.em) inner = `<em>${inner}</em>`;
  if (s.term && bp.glossary[s.term] && bp.learnerProfile.showTermPopovers) {
    return `<button class="term" data-term="${escAttr(s.term)}">${inner}<span class="i">i</span></button>`;
  }
  return inner;
}

type RichNodes = Extract<Block, { body: unknown }>["body"];
function richText(nodes: RichNodes | undefined, bp: Blueprint): string {
  if (!nodes) return "";
  return nodes
    .map((n) => {
      if (n.t === "p") return `<p>${n.spans.map((s) => spanHtml(s, bp)).join("")}</p>`;
      if (n.t === "h") return `<h${n.level}>${n.spans.map((s) => spanHtml(s, bp)).join("")}</h${n.level}>`;
      if (n.t === "ul") return `<ul>${n.items.map((it) => `<li>${it.map((s) => spanHtml(s, bp)).join("")}</li>`).join("")}</ul>`;
      if (n.t === "ol") return `<ol>${n.items.map((it) => `<li>${it.map((s) => spanHtml(s, bp)).join("")}</li>`).join("")}</ol>`;
      if (n.t === "callout") return `<div class="callout ${n.tone ?? "info"}">${n.spans.map((s) => spanHtml(s, bp)).join("")}</div>`;
      return "";
    })
    .join("");
}

// ---- key-terms chip row — guarantees every module term has an accessible (i) ----
function keyTerms(termIds: string[], bp: Blueprint): string {
  if (!bp.learnerProfile.showTermPopovers) return "";
  const chips = termIds
    .filter((id) => bp.glossary[id])
    .map((id) => `<button class="term-chip" data-term="${escAttr(id)}">${esc(bp.glossary[id].label)}<span class="i">i</span></button>`)
    .join("");
  return chips ? `<div class="keyterms">${chips}</div>` : "";
}

// ---- per-block visibility gate classes (drive the 27-combo CSS) ----
function gateClasses(b: Block): string {
  const c: string[] = ["block"];
  // needs-* drive the 27-combo CSS gates; b-* drive the in-lesson Concept/Functional/Code toggles.
  if (b.kind === "technical") c.push("needs-technical");
  if (b.kind === "conceptual") c.push("needs-conceptual", "b-concept");
  if (b.kind === "codeExample") c.push("needs-code", "b-code");
  if (b.kind === "functionalExample") c.push("needs-functional", "b-funcex");
  const vw = b.visibleWhen;
  if (vw?.depth?.length === 1 && vw.depth[0] === "technical") c.push("needs-technical");
  if (vw?.depth?.length === 1 && vw.depth[0] === "conceptual") c.push("needs-conceptual");
  if (vw?.examples?.length === 1 && vw.examples[0] === "code") c.push("needs-code");
  if (vw?.examples?.length === 1 && vw.examples[0] === "functional") c.push("needs-functional");
  return c.join(" ");
}

// ---- decision matrix ----
function decisionMatrix(b: Extract<Block, { kind: "decisionMatrix" }>): string {
  const head = `<tr><th>Option</th>${b.criteria.map((c) => `<th>${esc(c)}</th>`).join("")}<th>When to choose</th><th>Cost</th><th>Complexity</th></tr>`;
  const rows = b.options
    .map((o) => {
      const cellByCriterion = new Map(o.cells.map((c) => [c.criterion, c]));
      const cells = b.criteria
        .map((c) => {
          const cell = cellByCriterion.get(c);
          const dot = cell ? `<span class="rate ${cell.rating}"></span>` : "";
          return `<td>${dot}${esc(cell?.text ?? "—")}</td>`;
        })
        .join("");
      return `<tr><td><strong>${esc(o.name)}</strong></td>${cells}<td class="when">${esc(o.whenToUse)}</td><td>${esc(o.cost ?? "—")}</td><td>${esc(o.complexity ?? "—")}</td></tr>`;
    })
    .join("");
  return `<div class="matrix"><table class="dm"><thead>${head}</thead><tbody>${rows}</tbody></table>${b.howToRead ? `<div class="howread">${esc(b.howToRead)}</div>` : ""}</div>`;
}

// ---- decision tree (recursive) ----
function tree(node: import("./schema").TreeNode): string {
  if (node.outcome) return `<li><strong>→ ${esc(node.outcome)}</strong></li>`;
  const branches = (node.branches ?? []).map((br) => `<li><em>${esc(br.label)}</em><ul>${tree(br.to)}</ul></li>`).join("");
  return `<li>${node.question ? esc(node.question) : ""}<ul>${branches}</ul></li>`;
}

// ---- code example ----
function codeBlock(b: Extract<Block, { kind: "codeExample" }>, bp: Blueprint): string {
  const path = b.filePath ? `<div class="code-path">${esc(b.filePath)} · ${esc(b.language)}</div>` : "";
  const explain = b.explain ? richText(b.explain, bp) : "";
  const predict = b.predictThenReveal
    ? `<div class="quiz"><div class="q">Predict: ${esc(b.predictThenReveal.prompt)}</div><button class="reveal">Reveal</button><div class="answer">${esc(b.predictThenReveal.answer)}</div></div>`
    : "";
  // Syntax breakdown — hidden by default; the in-lesson "Explain syntax" toggle reveals it.
  const syntax =
    b.syntax && b.syntax.length
      ? `<div class="syntax-panel"><div class="sp-h">Syntax breakdown</div><dl>${b.syntax
          .map((s) => `<dt><code>${esc(s.part)}</code></dt><dd>${esc(s.explains)}</dd>`)
          .join("")}</dl></div>`
      : "";
  return `<div class="ex"><button class="copy">Copy</button>${path}<pre class="code">${esc(b.code)}</pre></div>${syntax}${explain}${predict}`;
}

// ---- interactive visual blocks (data-only; the runtime draws + wires them) ----
// The renderer emits a skeleton + an inert JSON payload; runtime.ts hydrates it into
// the live SVG/controls. We escape "<" so a label can never close the <script> early.
function vizBlock(kind: string, title: string | undefined, caption: string | undefined, data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    (title ? `<h3>${esc(title)}</h3>` : "") +
    `<div class="viz" data-viz="${kind}">${caption ? `<p class="viz-cap">${esc(caption)}</p>` : ""}<div class="viz-body"></div>` +
    `<script type="application/json" class="viz-data">${json}</script></div>`
  );
}

// ---- quiz ----
function quiz(b: Extract<Block, { kind: "selfCheckQuiz" }>): string {
  let body = "";
  if (b.format === "mcq" && b.options) {
    body = b.options.map((o) => `<button class="opt" data-correct="${o.correct ? "1" : "0"}">${esc(o.text)}</button>`).join("");
    body += `<div class="answer">${esc(b.explanation)}</div>`;
  } else {
    const ask = b.format === "applyToYourBuild" && b.applyToYourBuildPrompt ? b.applyToYourBuildPrompt : "";
    body = `${ask ? `<p class="muted">${esc(ask)}</p>` : ""}<button class="reveal">Reveal answer</button><div class="answer">${b.acceptableAnswer ? `<strong>${esc(b.acceptableAnswer)}</strong><br>` : ""}${esc(b.explanation)}</div>`;
  }
  return `<div class="quiz"><div class="q">${esc(b.prompt)}</div>${body}</div>`;
}

// ---- single block dispatch ----
function block(b: Block, bp: Blueprint): string {
  const cls = gateClasses(b);
  let inner = "";
  switch (b.kind) {
    case "conceptual":
    case "technical":
    case "functionalExample":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + richText(b.body, bp);
      break;
    case "note":
      inner = `<div class="callout ${b.tone ?? "info"}">${richText(b.body, bp)}</div>`;
      break;
    case "codeExample":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + codeBlock(b, bp);
      break;
    case "decisionCallout":
      inner = `<div class="dcall"><div class="use"><div class="lab">Use when</div>${esc(b.useWhen)}</div><div class="avoid"><div class="lab">Avoid when</div>${esc(b.avoidWhen)}</div><div class="rot"><div class="lab">Rule of thumb</div>${esc(b.ruleOfThumb)}</div></div>`;
      break;
    case "decisionMatrix":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + decisionMatrix(b);
      break;
    case "decisionTree":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + `<ul class="tree">${tree(b.root)}</ul>`;
      break;
    case "diagram":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + miniMap(b.nodes, b.edges);
      break;
    case "scenario":
      inner = `<div class="scn"><div class="ask">${esc(b.ask)}</div><div class="imp">${esc(b.implies)}</div></div>`;
      break;
    case "walkthrough":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + `<div class="walk">${b.steps.map((s) => `<div class="step"><div class="n"></div><div><strong>${esc(s.label)}</strong>${richText(s.detail, bp)}</div></div>`).join("")}</div>`;
      break;
    case "taxonomy":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + `<div class="tax">${b.groups.map((g) => `<div class="grp"><h4>${esc(g.name)}</h4><ul>${g.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`).join("")}</div>`;
      break;
    case "selfCheckQuiz":
      inner = quiz(b);
      break;
    case "interactiveScatter":
      inner = vizBlock("scatter", b.title, b.caption, { points: b.points, queries: b.queries });
      break;
    case "interactiveSlider":
      inner = vizBlock("slider", b.title, b.caption, { min: b.min, max: b.max, unit: b.unit, stops: b.stops });
      break;
    case "steppedFlow":
      inner = vizBlock("stepped", b.title, b.caption, { steps: b.steps });
      break;
  }
  const terms = b.termIds && b.termIds.length ? keyTerms(b.termIds, bp) : "";
  return `<div class="${cls}">${inner}${terms}</div>`;
}

// ---- a small inline diagram (reuses the map-node look) ----
function miniMap(nodes: { id: string; label: string; sub?: string }[], _edges: unknown): string {
  return `<div class="map-row">${nodes.map((n) => `<div class="map-node"><div class="mn-title">${esc(n.label)}</div>${n.sub ? `<div class="mn-sub">${esc(n.sub)}</div>` : ""}</div>`).join("")}</div>`;
}

// ---- the mental map (layered, clickable) ----
function mentalMap(bp: Blueprint): string {
  const mm = bp.mentalMap;
  const moduleIds = new Set(bp.modules.map((m) => m.id));
  const layers: string[] = [];
  const byLayer: Record<string, typeof mm.nodes> = {};
  for (const n of mm.nodes) {
    const L = n.layer ?? "_";
    if (!byLayer[L]) {
      byLayer[L] = [];
      layers.push(L);
    }
    byLayer[L].push(n);
  }
  const rows = layers
    .map((L, i) => {
      const nodes = byLayer[L]
        .map((n) => {
          const click = n.moduleId && moduleIds.has(n.moduleId) ? ` data-deepdive="${escAttr(n.moduleId)}"` : "";
          // Richer overview card: WHAT it is + why it's RELEVANT here (falls back to sub).
          const what = n.what ? `<div class="mn-what">${esc(n.what)}</div>` : n.sub ? `<div class="mn-sub">${esc(n.sub)}</div>` : "";
          const rel = n.relevance ? `<div class="mn-rel"><span class="mn-rel-lab">Why it matters here</span>${esc(n.relevance)}</div>` : "";
          const cue = click ? `<div class="mn-go"><span class="mn-cue-ico">⤢</span> Click for details</div>` : "";
          return `<button class="map-node${n.emphasis === "spine" ? " spine" : ""}"${click}><div class="mn-title">${esc(n.label)}</div>${what}${rel}${cue}</button>`;
        })
        .join("");
      const label = L !== "_" ? `<div class="map-layer-label">${esc(L)}</div>` : "";
      // Glyph-less arrow; CSS sets → (horizontal layer flow) or ↓ (narrow/vertical fallback).
      const arrow = i < layers.length - 1 ? `<div class="map-arrow" aria-hidden="true"></div>` : "";
      return `<div class="map-layer">${label}<div class="map-row">${nodes}</div></div>${arrow}`;
    })
    .join("");
  return `<div class="map"><div class="eyebrow">Mental map · start here</div><h2>${esc(mm.title)}</h2>${mm.caption ? `<p class="cap">${esc(mm.caption)}</p>` : ""}<div class="map-flow">${rows}</div></div>`;
}

/** True once a module's body has been written (vs a stub awaiting background build). */
export function isBuilt(m: Module): boolean {
  return m.loadState === "full" && m.blocks.length > 0;
}

// ---- the INNER content of a built module (head + body). Reused both inline AND as
//      the fragment the runtime injects when a background module finishes. ----
export function moduleInner(m: Module, bp: Blueprint): string {
  const head = `<div class="module-head"><div class="num">${m.order}${m.icon ? " · " + esc(m.icon) : ""}</div><h2>${esc(m.title)}</h2>${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ""}</div>`;
  const obj = m.objectives.length
    ? `<div class="objectives"><b>After this you'll be able to</b><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`
    : "";
  const forces = m.decisionItForces ? `<div class="decision-forces"><strong>Decision this forces:</strong> ${esc(m.decisionItForces)}</div>` : "";
  const core = m.blocks.filter((b) => b.depthTier !== "deeper");
  const deeper = m.blocks.filter((b) => b.depthTier === "deeper");
  const deeperHtml = deeper.length
    ? `<button class="deeper-toggle" data-label="Go deeper →">Go deeper →</button><div class="deeper">${deeper.map((b) => block(b, bp)).join("")}</div>`
    : "";
  return `${head}<div class="module-body"><p>${esc(m.summary)}</p>${obj}${forces}${keyTerms(m.termIds, bp)}${core.map((b) => block(b, bp)).join("")}${deeperHtml}</div>`;
}

/** The fragment served by POST /api/module and injected into the panel by the runtime. */
export const renderModuleFragment = moduleInner;

// ---- a module rendered as a workbench PANEL. A STUB shows its head/summary/objectives
//      plus a "building…" notice; the runtime swaps in moduleInner once the body loads. ----
function modulePanel(m: Module, bp: Blueprint): string {
  if (isBuilt(m)) {
    return `<section class="panel module" data-panel="${escAttr(m.id)}" data-module="${escAttr(m.id)}" id="panel-${escAttr(m.id)}">${moduleInner(m, bp)}</section>`;
  }
  const head = `<div class="module-head"><div class="num">${m.order}${m.icon ? " · " + esc(m.icon) : ""}</div><h2>${esc(m.title)}</h2>${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ""}</div>`;
  const obj = m.objectives.length
    ? `<div class="objectives"><b>After this you'll be able to</b><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`
    : "";
  const forces = m.decisionItForces ? `<div class="decision-forces"><strong>Decision this forces:</strong> ${esc(m.decisionItForces)}</div>` : "";
  return `<section class="panel module is-stub" data-panel="${escAttr(m.id)}" data-module="${escAttr(m.id)}" id="panel-${escAttr(m.id)}">
    ${head}
    <div class="module-body"><p>${esc(m.summary)}</p>${obj}${forces}<div class="building"><span class="bspin"></span> Building this section… <span class="muted">it'll fill in shortly — read on while it loads</span></div></div>
  </section>`;
}

// ---- synthesis (inner content for its panel) ----
function synthesisInner(bp: Blueprint): string {
  const s = bp.synthesis;
  const ref = s.referenceArchitecture ? `<h3>Reference architecture</h3>${miniMap(s.referenceArchitecture.nodes, s.referenceArchitecture.edges)}` : "";
  const order = s.buildOrder.length
    ? `<h3>Suggested build order</h3><div class="walk">${s.buildOrder.map((b) => `<div class="step"><div class="n"></div><div><strong>${esc(b.label)}</strong>${b.detail ? `<div class="muted">${esc(b.detail)}</div>` : ""}</div></div>`).join("")}</div>`
    : "";
  const check = s.checklist.length ? `<h3>Decision checklist</h3><ul class="checklist">${s.checklist.map((c) => `<li>${esc(c.label)}</li>`).join("")}</ul>` : "";
  const cap = `<div class="capstone"><strong>Try it:</strong> ${esc(s.capstone.prompt)}</div>`;
  return `<div class="eyebrow">Putting it together</div><h2>Synthesis</h2>${s.recap ? richText(s.recap, bp) : ""}${ref}${order}${check}${cap}`;
}

function whatsNew(bp: Blueprint): string {
  if (!bp.whatsNew || !bp.whatsNew.length) return "";
  return `<div class="whatsnew"><div class="lab">What's new</div><ul>${bp.whatsNew.map((w) => `<li>${esc(w.title)} — ${esc(w.summary)}</li>`).join("")}</ul></div>`;
}

// ---- provenance banner: tells the reader what the lesson drew on (only when they uploaded) ----
function provenanceBanner(bp: Blueprint): string {
  const m = bp.meta;
  if (!m.usedUpload) return "";
  const titles = (m.uploadTitles ?? []).map(esc).join(", ");
  const plural = (m.uploadTitles?.length ?? 0) > 1 ? "s" : "";
  const body = m.referOnly
    ? `Built <strong>only from your uploaded document${plural}</strong>: ${titles}. Nothing was added from the knowledge base.`
    : `Drawing on <strong>your document${plural}</strong> (${titles}) <strong>first</strong>, then the knowledge base, then general knowledge. Each source is tagged in <strong>Sources</strong>.`;
  return `<div class="provenance"><span class="prov-star">★</span><div>${body}</div></div>`;
}

function citationsInner(bp: Blueprint): string {
  const ids = Object.keys(bp.citations);
  const items = ids
    .map((id) => {
      const c = bp.citations[id];
      const link = c.url ? `<a href="${escAttr(c.url)}">${esc(c.title)}</a>` : esc(c.title);
      const tag = c.kind === "upload" ? "your document" : c.kind === "kb" ? "knowledge base" : c.kind === "liveSearch" ? "web" : "reference";
      const cls = c.kind === "upload" ? "src-upload" : "";
      return `<li class="${cls}">${link} <span class="muted">· ${tag}${c.asOfDate ? " · " + esc(c.asOfDate) : ""}</span></li>`;
    })
    .join("");
  return `<div class="eyebrow">Provenance</div><h2>Sources</h2><div class="cites"><ol>${items}</ol></div>`;
}

/**
 * Render the full page body.
 *
 * Layout (Fix 2): an OVERVIEW (hero + clickable mental map of the broad building
 * blocks) shown first, full width. Clicking any block enters the WORKBENCH — a
 * left rail of block buttons + the selected block's content on the right.
 */
export function renderBody(bp: Blueprint): string {
  const p = bp.learnerProfile;
  const metaBits = [
    p.level,
    p.depth.replace("_", " + "),
    p.examples.replace("_", " + "),
    bp.meta.estTotalMinutes ? `${bp.meta.estTotalMinutes} min read` : "",
    p.industry ? `for ${p.industry}` : "",
  ].filter(Boolean);

  // Left-rail nav: one button per module, then synthesis + sources. Stub modules get a
  // `building` class + status dot; the runtime flips them to ready as bodies arrive.
  const navModules = bp.modules
    .map((m) => `<button class="navitem${isBuilt(m) ? "" : " building"}" data-goto="${escAttr(m.id)}"><span class="ni-num">${m.order}</span><span class="ni-label">${esc(m.title)}</span><span class="ni-status" aria-hidden="true"></span></button>`)
    .join("");
  const hasCitations = Object.keys(bp.citations).length > 0;
  const navExtra =
    `<button class="navitem nav-special" data-goto="_synth"><span class="ni-num">✦</span><span class="ni-label">Putting it together</span></button>` +
    (hasCitations ? `<button class="navitem nav-special" data-goto="_sources"><span class="ni-num">⌕</span><span class="ni-label">Sources</span></button>` : "");

  // Right-pane panels.
  const panels =
    bp.modules.map((m) => modulePanel(m, bp)).join("") +
    `<section class="panel" data-panel="_synth" id="panel-_synth">${synthesisInner(bp)}</section>` +
    (hasCitations ? `<section class="panel" data-panel="_sources" id="panel-_sources">${citationsInner(bp)}</section>` : "");

  // Which content types exist? Drives which in-lesson show/hide toggles we render.
  let hasConcept = false, hasFunc = false, hasCode = false, hasSyntax = false;
  for (const m of bp.modules)
    for (const b of m.blocks) {
      if (b.kind === "conceptual") hasConcept = true;
      if (b.kind === "functionalExample") hasFunc = true;
      if (b.kind === "codeExample") { hasCode = true; if (b.syntax && b.syntax.length) hasSyntax = true; }
    }
  // Content toggles default ON (aria-pressed=true → shown); syntax toggle defaults OFF.
  const contentToggles =
    (hasConcept ? `<button class="tbtn toggle" id="t-concept" aria-pressed="true">Concept</button>` : "") +
    (hasFunc ? `<button class="tbtn toggle" id="t-funcex" aria-pressed="true">Functional</button>` : "") +
    (hasCode ? `<button class="tbtn toggle" id="t-code" aria-pressed="true">Code</button>` : "") +
    (hasSyntax ? `<button class="tbtn toggle" id="t-syntax" aria-pressed="false">Explain syntax</button>` : "");

  return `
  <div class="topbar"><div class="topbar-in">
    <div class="tb-left"><button class="tbtn nav-back" id="to-overview" hidden>← Overview</button></div>
    <div class="tb-center"><span class="brand-mini">${esc(bp.meta.title)}</span></div>
    <div class="tb-right">
      ${contentToggles ? `<div class="toggle-group" role="group" aria-label="Show or hide content">${contentToggles}</div>` : ""}
      <div class="progress" title="Progress"><i></i></div>
      <button class="tbtn" id="theme">☾ Dark</button>
    </div>
  </div></div>

  <div id="overview">
    <main class="shell">
      <div class="hero">
        <div class="eyebrow">Interactive lesson</div>
        <h1>${esc(bp.meta.title)}</h1>
        ${bp.meta.thesis ? `<p class="thesis">${esc(bp.meta.thesis)}</p>` : ""}
        <div class="meta-line">${metaBits.map((m) => `<span>${esc(m)}</span>`).join("")}</div>
      </div>
      ${provenanceBanner(bp)}
      ${whatsNew(bp)}
      ${mentalMap(bp)}
      <p class="ov-hint">Pick a building block above to dive in — or use the menu that appears on the left.</p>
    </main>
  </div>

  <div id="workbench" hidden>
    <nav id="blocknav">${navModules}${navExtra}</nav>
    <div id="blockmain">${panels}</div>
  </div>`;
}
