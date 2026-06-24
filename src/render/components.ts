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
// Only treat real http(s) URLs as linkable sources (Bug 5) — guards against a non-URL string
// (e.g. a bare title, "knowledge base", or a javascript:/data: scheme) being rendered as a link.
function isHttpUrl(u: string | undefined | null): boolean {
  return typeof u === "string" && /^https?:\/\/\S+/i.test(u.trim());
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
  // `reveal` → scroll-reveal animation (runtime adds `.in`). blk-* → colored block type.
  const c: string[] = ["block", "reveal"];
  // needs-* drive the 27-combo CSS gates; b-* drive the in-lesson Concept/Functional/Code toggles.
  if (b.kind === "technical") c.push("needs-technical", "blk-explain");
  if (b.kind === "conceptual") c.push("needs-conceptual", "b-concept", "blk-explain");
  if (b.kind === "codeExample") c.push("needs-code", "b-code", "blk-code");
  if (b.kind === "functionalExample") c.push("needs-functional", "b-funcex", "blk-example");
  if (b.kind === "knowledgeCheck") c.push("blk-check");
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

// ---- "In plain words" analogy callout (beginner/intermediate; CSS gates by level) ----
function analogyHtml(text: string | undefined): string {
  if (!text) return "";
  return `<div class="analogy"><span class="an-lab">In plain words</span>${esc(text)}</div>`;
}

// ---- a collapsible body (used to keep examples/code from flooding the page on landing) ----
function collapsible(label: string, icon: string, inner: string): string {
  return `<div class="collapse"><button class="collapse-h" aria-expanded="false"><span class="col-ico">${icon}</span><span class="col-lab">${esc(label)}</span><span class="col-chev">▸</span></button><div class="collapse-body">${inner}</div></div>`;
}

// ---- knowledge check (graded; MCQ checked vs the stored Blueprint, freeText by the LLM) ----
type KCQuestion = Extract<Block, { kind: "knowledgeCheck" }>["questions"][number];

// A 3-point confidence picker — calibration before grading (Tier A retention).
function kcConfidenceRow(): string {
  return `<div class="kc-confidence"><span class="kc-conf-lab">How sure are you?</span><button class="kc-conf" type="button" data-conf="0">Guessing</button><button class="kc-conf" type="button" data-conf="1">Fairly sure</button><button class="kc-conf" type="button" data-conf="2">Certain</button></div>`;
}

/** One graded question. `blockId` is stamped on the item so the runtime can grade it
 *  even when questions from several blocks are mixed onto one page (horizontal mode).
 *  Tier-A retention: when `freeRecallFirst`, the answer is hidden behind a recall gate
 *  (recall beats recognition); when `confidence`, a 3-point pick is required before
 *  grading (calibration). The MCQ options still carry NO correctness flag — grading
 *  stays server-side against the stored Blueprint. */
function kcItemHtml(blockId: string, q: KCQuestion, i: number): string {
  const head = `<div class="kc-q"><span class="kc-n">Q${i + 1}</span>${esc(q.prompt)}</div>`;
  let answer = "";
  if (q.kind === "mcq" && q.options) {
    // No correctness in the DOM — the server verifies against the Blueprint ("by DB").
    answer = `<div class="kc-opts">${q.options
      .map((o, oi) => `<button class="kc-opt" data-qid="${escAttr(q.id)}" data-choice="${oi}">${esc(o.text)}</button>`)
      .join("")}</div>`;
  } else {
    answer = `<div class="kc-free"><textarea class="kc-input" data-qid="${escAttr(q.id)}" rows="2" placeholder="Type your answer…"></textarea><button class="kc-submit" data-qid="${escAttr(q.id)}">Check</button></div>`;
  }
  // The answer (+ optional confidence pick) lives in a "reveal stage" hidden behind the
  // recall gate when freeRecallFirst is set; otherwise it's shown immediately.
  const stage = `<div class="kc-reveal-stage"${q.freeRecallFirst ? " hidden" : ""}>${q.confidence ? kcConfidenceRow() : ""}${answer}</div>`;
  const recall = q.freeRecallFirst
    ? `<div class="kc-recall"><textarea class="kc-recall-input" rows="2" placeholder="First, recall from memory — jot what you remember…"></textarea><button class="kc-recall-done" type="button">I've thought about it →</button></div>`
    : "";
  const srcLink = q.sourceModuleId
    ? `<button class="kc-source" type="button" data-goto="${escAttr(q.sourceModuleId)}">Review the source →</button>`
    : "";
  const tags = (q.conceptTags ?? []).join(",");
  const attrs = [
    `data-qid="${escAttr(q.id)}"`,
    `data-kind="${q.kind}"`,
    `data-block="${escAttr(blockId)}"`,
    q.sourceModuleId ? `data-module="${escAttr(q.sourceModuleId)}"` : "",
    tags ? `data-tags="${escAttr(tags)}"` : "",
    q.freeRecallFirst ? `data-recall-first="1"` : "",
    q.confidence ? `data-conf-required="1"` : "",
  ].filter(Boolean).join(" ");
  return `<div class="kc-item" ${attrs}><div class="kc-feedback" hidden></div>${head}${recall}${stage}<div class="kc-explain" hidden>${esc(q.explanation)}${srcLink}</div></div>`;
}

function knowledgeCheck(b: Extract<Block, { kind: "knowledgeCheck" }>): string {
  const qs = b.questions.map((q, i) => kcItemHtml(b.id, q, i)).join("");
  return `<div class="kc" data-block="${escAttr(b.id)}">${b.title ? `<h3>🧠 ${esc(b.title)}</h3>` : `<h3>🧠 Knowledge check</h3>`}${b.intro ? `<p class="kc-intro">${esc(b.intro)}</p>` : ""}<div class="kc-score" hidden>Score: <b>0</b>/${b.questions.length}</div>${qs}</div>`;
}

/** Round-robin a cumulative 4–5 question set ACROSS the modules' knowledgeCheck blocks
 *  (so it spans the whole lesson — interleaving aids retention). Each item keeps its
 *  SOURCE blockId so grading via /api/check still resolves to the right question.
 *  Shared by horizontal mode's final page and (later) a vertical end-of-lesson set. */
function cumulativeCheckItems(bp: Blueprint, max = 5): { blockId: string; q: KCQuestion }[] {
  const groups: { blockId: string; q: KCQuestion }[][] = [];
  for (const m of bp.modules) {
    for (const b of m.blocks) {
      if (b.kind === "knowledgeCheck") groups.push(b.questions.map((q) => ({ blockId: b.id, q })));
    }
  }
  const flat: { blockId: string; q: KCQuestion }[] = [];
  for (let i = 0; flat.length < max; i++) {
    let advanced = false;
    for (const g of groups) {
      if (g[i]) { flat.push(g[i]); advanced = true; if (flat.length >= max) break; }
    }
    if (!advanced) break;
  }
  return flat;
}

/** Horizontal mode's FINAL page: the cumulative interleaved check across the lesson. */
function horizontalCheckPage(bp: Blueprint): string {
  const flat = cumulativeCheckItems(bp, 5);
  if (!flat.length) {
    return `<div class="kc kc-pending"><h3>🧠 Knowledge check</h3><p class="kc-intro">Your knowledge check appears here once the lesson finishes building — give the pages a moment, then come back.</p></div>`;
  }
  const items = flat.map((x, i) => kcItemHtml(x.blockId, x.q, i)).join("");
  return `<div class="kc" data-block="_mixed"><h3>🧠 Knowledge check</h3><p class="kc-intro">A quick check across what you just learned. Pick or type your answers.</p><div class="kc-score" hidden>Score: <b>0</b>/${flat.length}</div>${items}</div>`;
}

// ---- estimated reading time for a set of blocks (rough: ~200 wpm) ----
function readingMinutes(m: Module): number {
  let words = (m.summary || "").split(/\s+/).length;
  const count = (s: string | undefined) => { if (s) words += s.split(/\s+/).length; };
  for (const b of m.blocks) {
    if ("body" in b && b.body) for (const n of b.body) { if (n.t === "ul" || n.t === "ol") n.items.forEach((it) => it.forEach((s) => count(s.text))); else if ("spans" in n) n.spans.forEach((s) => count(s.text)); }
    if (b.kind === "codeExample") count(b.code);
  }
  return Math.max(1, Math.round(words / 200));
}

// ---- single block dispatch ----
function block(b: Block, bp: Blueprint): string {
  const cls = gateClasses(b);
  let inner = "";
  switch (b.kind) {
    case "conceptual":
    case "technical":
      inner = (b.title ? `<h3>${esc(b.title)}</h3>` : "") + analogyHtml(b.analogy) + richText(b.body, bp);
      break;
    case "functionalExample":
      // Collapsible so the page isn't a wall of text on landing — open the example on demand.
      inner = collapsible(b.title || "Real-world example", "💡", richText(b.body, bp));
      break;
    case "note":
      inner = `<div class="callout ${b.tone ?? "info"}">${richText(b.body, bp)}</div>`;
      break;
    case "codeExample":
      // Collapsible code (less text up front; expand to read the snippet).
      inner = collapsible(b.title || "Code example", "⟨⟩", codeBlock(b, bp));
      break;
    case "knowledgeCheck":
      inner = knowledgeCheck(b);
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

// ---- the mental map — an ADVANCE ORGANIZER laid out by the topic's true STRUCTURE ----
function mentalMap(bp: Blueprint): string {
  const mm = bp.mentalMap;
  const moduleIds = new Set(bp.modules.map((m) => m.id));
  // Classify; fall back to "procedural" if any node carries an order, else conceptual.
  const type = mm.structureType ?? (mm.nodes.some((n) => typeof n.order === "number") ? "procedural" : "conceptual");
  const ordered = type === "procedural" || type === "dependency";

  const nodes = mm.nodes.slice();
  if (ordered) nodes.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  const startId = mm.entryNodeId ?? (ordered ? (nodes[0]?.id ?? "") : "");

  // A uniform SQUARE block: corner badge (number for ordered, icon otherwise) + a 4–6 word
  // headline + a 10–15 word description. Nothing else on the card — deeper detail lives in
  // the module the card opens. The whole card is the click target (runtime delegates on
  // data-deepdive), so the open cue is a hover-only flourish that never changes the square's size.
  // The badge + open-cue are absolutely positioned (out of flow) so the corner number can
  // overflow the square; the text lives in a clipped .mn-body so the square stays uniform.
  const card = (n: (typeof nodes)[number], i: number): string => {
    const linked = !!(n.moduleId && moduleIds.has(n.moduleId));
    const click = linked ? ` data-deepdive="${escAttr(n.moduleId!)}"` : "";
    const num = ordered ? (n.order ?? i + 1) : null;
    const isStart = ordered && n.id === startId;
    const badge = num != null ? `<span class="mn-num">${num}</span>` : `<span class="mn-ico">${esc(n.icon || "●")}</span>`;
    const desc = n.orient || n.sub || "";
    const descHtml = desc ? `<span class="mn-desc">${esc(desc)}</span>` : "";
    const cue = linked ? `<span class="mn-go" aria-hidden="true">Open →</span>` : "";
    const cls = `map-node${n.emphasis === "spine" ? " spine" : ""}${isStart ? " is-start" : ""}${linked ? "" : " no-link"}`;
    return `<button class="${cls}"${click}>${badge}${cue}<span class="mn-body"><span class="mn-title">${esc(n.label)}</span>${descHtml}</span></button>`;
  };
  const conn = `<div class="map-conn" aria-hidden="true"><span class="spark"></span></div>`;

  let inner: string;
  let eyebrow: string;
  let cap: string;
  if (ordered) {
    // Process: equal-width numbered squares in ONE sequence joined by animated arrows
    // (a single non-wrapping row keeps it on one screen; CSS shrinks the squares to fit).
    eyebrow = type === "procedural" ? "Your build path · start at step 1" : "Learning path · in order";
    cap = type === "procedural" ? "Follow these steps in order — each builds on the one before." : "Understand these in order — later ideas depend on earlier ones.";
    inner = `<div class="map-path">${nodes.map((n, i) => `${card(n, i)}${i < nodes.length - 1 ? conn : ""}`).join("")}</div>`;
  } else if (type === "comparative") {
    // The options, side by side.
    eyebrow = "The options · weigh and choose";
    cap = "These are the choices on the table — compare them, then pick.";
    inner = `<div class="map-options">${nodes.map((n, i) => card(n, i)).join("")}</div>`;
  } else {
    // Conceptual relationship map.
    eyebrow = "Mental map · how the pieces relate";
    cap = "Not a sequence — these connect as a whole. Open any piece.";
    inner = `<div class="map-concept">${nodes.map((n, i) => card(n, i)).join("")}</div>`;
  }
  return `<div class="map"><div class="eyebrow">${eyebrow}</div><h2>${esc(mm.title)}</h2><p class="cap">${esc(mm.caption || cap)}</p><div class="map-body map-${type}">${inner}</div></div>`;
}

/** True once a module's body has been written (vs a stub awaiting background build). */
export function isBuilt(m: Module): boolean {
  return m.loadState === "full" && m.blocks.length > 0;
}

// ---- the INNER content of a built module (head + body). Reused both inline AND as
//      the fragment the runtime injects when a background module finishes. ----
export function moduleInner(m: Module, bp: Blueprint): string {
  const total = bp.modules.length;
  const idx = bp.modules.findIndex((x) => x.id === m.id);
  const prev = idx > 0 ? bp.modules[idx - 1] : null;
  const next = idx >= 0 && idx < total - 1 ? bp.modules[idx + 1] : null;
  const node = bp.mentalMap.nodes.find((n) => n.moduleId === m.id);
  const ordered = bp.mentalMap.structureType === "procedural" || bp.mentalMap.structureType === "dependency";
  // SPINE: always show where you are, and what this builds on.
  const spine = `<div class="m-spine"><span class="m-pos">${ordered ? "Step " : ""}${m.order} of ${total}</span>${prev ? `<span class="m-prev">↳ builds on “${esc(prev.title)}”</span>` : ""}</div>`;
  const badge = m.icon ? `<div class="m-ico">${esc(m.icon)}</div>` : `<div class="num">${m.order}</div>`;
  const mins = readingMinutes(m);
  // DETAIL layer (moved off the overview): what it is, the analogy, why it matters here.
  const detail = node
    ? `${node.what ? `<p class="m-what">${esc(node.what)}</p>` : ""}${node.laymanExplanation ? `<div class="analogy"><span class="an-lab">In plain words</span>${esc(node.laymanExplanation)}</div>` : ""}${node.relevance ? `<div class="m-rel"><span class="m-rel-lab">Why this matters for you</span>${esc(node.relevance)}</div>` : ""}`
    : "";
  const head = `<div class="module-head">${badge}<div class="mh-text">${spine}<h2>${esc(m.title)}</h2>${m.sub ? `<p class="sub">${esc(m.sub)}</p>` : ""}<div class="m-time">⏱ ~${mins} min read</div></div></div>${detail}`;
  const obj = m.objectives.length
    ? `<div class="objectives"><b>After this you'll be able to</b><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>`
    : "";
  const forces = m.decisionItForces ? `<div class="decision-forces"><strong>Decision this forces:</strong> ${esc(m.decisionItForces)}</div>` : "";
  // Horizontal mode collects every knowledgeCheck onto a dedicated final page, so keep
  // them out of the per-module pages (vertical is unchanged — it shows them inline).
  const horizontal = bp.learnerProfile.readingMode === "horizontal";
  const usable = horizontal ? m.blocks.filter((b) => b.kind !== "knowledgeCheck") : m.blocks;
  const core = usable.filter((b) => b.depthTier !== "deeper");
  const deeper = usable.filter((b) => b.depthTier === "deeper");
  const deeperHtml = deeper.length
    ? `<button class="deeper-toggle" data-label="Go deeper →">Go deeper →</button><div class="deeper">${deeper.map((b) => block(b, bp)).join("")}</div>`
    : "";
  // SPINE forward link: continue the path.
  const nextHtml = next
    ? `<button class="next-step" data-deepdive="${escAttr(next.id)}">Next${ordered ? ` · step ${next.order}` : ""}: ${esc(next.title)} →</button>`
    : `<button class="next-step" data-goto="_synth">Finish → Putting it together</button>`;
  return `${head}<div class="module-body"><p>${esc(m.summary)}</p>${obj}${forces}${keyTerms(m.termIds, bp)}${core.map((b) => block(b, bp)).join("")}${deeperHtml}${nextHtml}</div>`;
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

// ---- recap card: links a course lesson back to the previous one (overview top) ----
function recapBanner(bp: Blueprint): string {
  const r = bp.meta.recap;
  if (!r) return "";
  const pts = r.points.slice(0, 5).map((p) => `<li>${esc(p)}</li>`).join("");
  return `<div class="recap"><div class="recap-h">↩ Recap — building on “${esc(r.previousTitle)}”</div><ul>${pts}</ul></div>`;
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
      // BUG 5: a Source must link to the ORIGINAL source it was drawn from (the website/blog/
      // GitHub repo). kb + canonical citations carry the source doc's `url`; the learner's own
      // uploads carry none. Link ONLY when a real url is present (http/https) — never fabricate a
      // URL when it's absent (render plain text then). Open in a new tab with noopener/noreferrer
      // so the lesson tab is never navigated away from or exposed via window.opener.
      const href = isHttpUrl(c.url) ? c.url! : "";
      const link = href
        ? `<a href="${escAttr(href)}" target="_blank" rel="noopener noreferrer">${esc(c.title)}</a>`
        : esc(c.title);
      const tag = c.kind === "upload" ? "your document" : c.kind === "kb" ? "knowledge base" : c.kind === "liveSearch" ? "web" : "reference";
      const cls = c.kind === "upload" ? "src-upload" : "";
      return `<li class="${cls}">${link} <span class="muted">· ${tag}${c.asOfDate ? " · " + esc(c.asOfDate) : ""}</span></li>`;
    })
    .join("");
  return `<div class="eyebrow">Provenance</div><h2>Sources</h2><div class="cites"><ol>${items}</ol></div>`;
}

/** Which in-lesson content toggles to render (shared by both layouts). */
function contentToggleBar(bp: Blueprint): string {
  let hasConcept = false, hasFunc = false, hasCode = false, hasSyntax = false;
  for (const m of bp.modules)
    for (const b of m.blocks) {
      if (b.kind === "conceptual") hasConcept = true;
      if (b.kind === "functionalExample") hasFunc = true;
      if (b.kind === "codeExample") { hasCode = true; if (b.syntax && b.syntax.length) hasSyntax = true; }
    }
  const toggles =
    (hasConcept ? `<button class="tbtn toggle" id="t-concept" aria-pressed="true">Concept</button>` : "") +
    (hasFunc ? `<button class="tbtn toggle" id="t-funcex" aria-pressed="true">Functional</button>` : "") +
    (hasCode ? `<button class="tbtn toggle" id="t-code" aria-pressed="true">Code</button>` : "") +
    (hasSyntax ? `<button class="tbtn toggle" id="t-syntax" aria-pressed="false">Explain syntax</button>` : "");
  return toggles ? `<div class="toggle-group" role="group" aria-label="Show or hide content">${toggles}</div>` : "";
}

/** The hero block (title/thesis/meta) reused by both layouts. */
function heroInner(bp: Blueprint, metaBits: string[]): string {
  return `<div class="hero"><div class="eyebrow">Interactive lesson</div><h1>${esc(bp.meta.title)}</h1>${bp.meta.thesis ? `<p class="thesis">${esc(bp.meta.thesis)}</p>` : ""}<div class="meta-line">${metaBits.map((m) => `<span>${esc(m)}</span>`).join("")}</div></div>`;
}

function metaBitsFor(bp: Blueprint): string[] {
  const p = bp.learnerProfile;
  return [
    bp.meta.course ? `Part ${bp.meta.course.index} of ${bp.meta.course.total}` : "",
    p.level,
    p.depth.replace("_", " + "),
    p.examples.replace("_", " + "),
    bp.meta.estTotalMinutes ? `${bp.meta.estTotalMinutes} min read` : "",
    p.industry ? `for ${p.industry}` : "",
  ].filter(Boolean);
}

// ---- HORIZONTAL example box: a functional/code example shown BELOW the concept on a tab,
//      as a preview the runtime clamps + fades; "See details" opens the FULL block in the modal. ----
function exampleBoxH(b: Block, bp: Blueprint): string {
  const isCode = b.kind === "codeExample";
  const lab = isCode ? "Code example" : "Functional example";
  const ic = isCode ? "⟨⟩" : "▦";
  return `<div class="hx-ex"><div class="hx-exh"><span class="hx-ic">${ic}</span><span class="hx-t">${esc(lab)}</span></div>`
    + `<div class="hx-exc">${block(b, bp)}<div class="hx-fade"></div></div>`
    + `<div class="hx-exf"><span class="hx-ell">preview</span><button class="hx-see" type="button" data-extitle="${escAttr(lab)}">See details →</button></div></div>`;
}

type HTab = { label: string; eyebrow: string; html: string; check?: boolean };

/** Paginate ONE module's blocks into horizontal tabs: ≤5 concept tabs (examples rendered
 *  as boxes BELOW the concept, in original order) + a final per-module knowledge-check tab. */
function moduleTabsH(m: Module, bp: Blueprint): HTab[] {
  const MAJOR = new Set(["conceptual", "technical", "diagram", "decisionMatrix", "decisionTree", "scenario", "walkthrough", "taxonomy", "steppedFlow", "interactiveScatter", "interactiveSlider"]);
  const groups: { concept: Block[]; examples: Block[] }[] = [];
  let cur: { concept: Block[]; examples: Block[] } | null = null;
  const kcBlocks: Block[] = [];
  for (const b of m.blocks) {
    if (b.kind === "knowledgeCheck") { kcBlocks.push(b); continue; }
    if (b.kind === "functionalExample" || b.kind === "codeExample") { (cur ??= { concept: [], examples: [] }).examples.push(b); continue; }
    // a new MAJOR concept block starts a new tab once the current one already holds one (cap 5)
    const startNew = cur && b.kind && MAJOR.has(b.kind) && cur.concept.some((c) => MAJOR.has(c.kind)) && groups.length < 4;
    if (!cur || startNew) { if (cur) groups.push(cur); cur = { concept: [], examples: [] }; }
    cur.concept.push(b);
  }
  if (cur) groups.push(cur);
  if (!groups.length) groups.push({ concept: [], examples: [] });

  const tabs: HTab[] = groups.map((g, i) => {
    const conceptHtml = g.concept.map((b) => block(b, bp)).join("") || `<p class="muted">${esc(m.summary)}</p>`;
    const exHtml = g.examples.length
      ? `<div class="hx-examples${g.examples.length === 1 ? " one" : ""}">${g.examples.map((b) => exampleBoxH(b, bp)).join("")}</div>`
      : "";
    // tab title: first major block's title, else module title + part
    const titled = g.concept.find((b) => "title" in b && (b as { title?: string }).title) as { title?: string } | undefined;
    const label = i === 0 ? (titled?.title || m.title) : (titled?.title || `${m.title} · part ${i + 1}`);
    const eyebrow = groups.length > 1 ? `Module ${m.order} · part ${i + 1} of ${groups.length}` : `Module ${m.order}`;
    return { label, eyebrow, html: `<div class="hx-concept">${conceptHtml}</div>${exHtml}` };
  });
  // per-module knowledge check = the module's last tab
  if (kcBlocks.length) {
    tabs.push({ label: "Knowledge check", eyebrow: `Module ${m.order} · knowledge check`, check: true, html: `<div class="hx-concept">${kcBlocks.map((b) => block(b, bp)).join("")}</div>` });
  }
  return tabs;
}

// ---- a module rendered as a HORIZONTAL tabbed PANE (concept tabs + examples-below + a
//      per-module knowledge-check tab). The runtime pages through tabs via the top-right
//      Next/Back; switching modules is the left nav. Stub modules show a building notice. ----
function modulePaneH(m: Module, bp: Blueprint, activeMod: boolean): string {
  const hidden = activeMod ? "" : " hidden";
  if (!isBuilt(m)) {
    const obj = m.objectives.length ? `<div class="objectives"><b>After this you'll be able to</b><ul>${m.objectives.map((o) => `<li>${esc(o)}</li>`).join("")}</ul></div>` : "";
    return `<section class="hx-mod${hidden}" data-hmod="${escAttr(m.id)}" data-module="${escAttr(m.id)}" data-stub="1"><div class="hx-tab" data-ti="0" data-label="${escAttr(m.title)}" data-eyebrow="Module ${m.order}"><div class="hx-concept"><p>${esc(m.summary)}</p>${obj}<div class="building"><span class="bspin"></span> Building this section… <span class="muted">it'll fill in shortly</span></div></div></div></section>`;
  }
  const tabs = moduleTabsH(m, bp);
  const tabHtml = tabs.map((t, i) => `<div class="hx-tab${i === 0 ? "" : " hidden"}" data-ti="${i}" data-label="${escAttr(t.label)}" data-eyebrow="${escAttr(t.eyebrow)}"${t.check ? ' data-check="1"' : ""}>${t.html}</div>`).join("");
  return `<section class="hx-mod${hidden}" data-hmod="${escAttr(m.id)}" data-module="${escAttr(m.id)}" data-tabs="${tabs.length}">${tabHtml}</section>`;
}

/**
 * HORIZONTAL reading mode — a fixed-viewport paged deck. The TOC nav stays on the left
 * (same place as the vertical workbench); the right side is a horizontal track of full
 * pages: overview (mental map) → modules → synthesis → [sources] → knowledge check (LAST).
 * Each page has a Next button; heavy blocks open in a modal (the runtime owns that).
 * Vertical mode is completely untouched — this is a separate, additive layout.
 */
function renderBodyHorizontal(bp: Blueprint, opts: { previewOnly?: boolean } = {}): string {
  const metaBits = metaBitsFor(bp);
  const hasCitations = Object.keys(bp.citations).length > 0;

  // BUG 2 FIX — OVERVIEW PREVIEW PARITY. Before a lesson is built (the free overview draft,
  // `previewOnly`), the horizontal layout used to render the full left module-list nav + the
  // per-module page deck, while the VERTICAL preview shows ONLY the concept/process map. The
  // overview preview must look the SAME in both modes — the concept map only; the module-page
  // deck belongs to the BUILT lesson. So in preview we emit just the overview concept map (no
  // left nav, no module/synthesis/sources panes, no pager), mirroring vertical's #overview view.
  if (opts.previewOnly) {
    return `
  <div id="overview" class="hx-preview">
    <main class="shell">
      ${heroInner(bp, metaBits)}
      ${recapBanner(bp)}
      ${provenanceBanner(bp)}
      ${whatsNew(bp)}
      ${mentalMap(bp)}
      <p class="ov-hint">This is the free overview — click “Generate Lesson” to build the full interactive lesson.</p>
    </main>
  </div>`;
  }

  // Special single-tab pane (overview / synthesis / sources) — uniform with module panes.
  const specialPane = (id: string, label: string, eyebrow: string, html: string) =>
    `<section class="hx-mod hidden" data-hmod="${escAttr(id)}"><div class="hx-tab" data-ti="0" data-label="${escAttr(label)}" data-eyebrow="${escAttr(eyebrow)}"><div class="hx-concept">${html}</div></div></section>`;

  type Nav = { id: string; label: string; icon?: string; num?: number; module?: boolean };
  const nav: Nav[] = [];
  nav.push({ id: "_map", label: "Overview", icon: "🗺" });
  for (const m of bp.modules) nav.push({ id: m.id, label: m.title, num: m.order, module: true });
  nav.push({ id: "_synth", label: "Putting it together", icon: "✦" });
  if (hasCitations) nav.push({ id: "_sources", label: "Sources", icon: "⌕" });

  // Left nav: Overview, then the LESSON MODULES, then synthesis/sources.
  const navHtml = nav
    .map((n) => {
      const badge = n.module ? `<span class="ni-num">${n.num}</span>` : `<span class="ni-num">${esc(n.icon || "•")}</span>`;
      const building = n.module && !isBuilt(bp.modules.find((x) => x.id === n.id)!) ? " building" : "";
      return `<button class="navitem${n.module ? "" : " nav-special"}${building}" data-hmod="${escAttr(n.id)}">${badge}<span class="ni-label">${esc(n.label)}</span><span class="ni-status" aria-hidden="true"></span></button>`;
    })
    .join("");

  // Panes: overview (active), each module (tabbed), synthesis, sources. The runtime shows
  // one pane + one tab at a time and drives the shared header's Back/Next.
  const panes =
    `<section class="hx-mod" data-hmod="_map"><div class="hx-tab" data-ti="0" data-label="Overview" data-eyebrow="Lesson overview"><div class="hx-concept">${heroInner(bp, metaBits)}${recapBanner(bp)}${provenanceBanner(bp)}${whatsNew(bp)}${mentalMap(bp)}</div></div></section>` +
    bp.modules.map((m) => modulePaneH(m, bp, false)).join("") +
    specialPane("_synth", "Putting it together", "Synthesis", synthesisInner(bp)) +
    (hasCitations ? specialPane("_sources", "Sources", "Provenance", citationsInner(bp)) : "");

  const toggles = contentToggleBar(bp);
  const modal = `<div id="hmodal" class="hmodal" hidden><div class="hmodal-card"><button class="hmodal-x" type="button" aria-label="Close">×</button><div class="hmodal-title"></div><div class="hmodal-body"></div></div></div>`;

  // No internal lesson top bar — the host app's Bar 2 carries the title + Dark; the lens
  // toggles + progress live in the playground header below, next to Back/Next.
  return `
  <div id="hworkbench" class="no-topbar">
    <nav id="blocknav">${navHtml}</nav>
    <div class="h-stage">
      <div class="hx-head">
        <div class="hx-htext"><div class="hx-eyebrow" id="hx-eyebrow"></div><div class="hx-title" id="hx-title"></div></div>
        <div class="hx-grow"></div>
        <div class="hx-tools">${toggles}<div class="progress" title="Progress"><i></i></div></div>
        <div class="hx-pos" id="hx-pos"></div>
        <button class="hx-nav hx-back" id="hx-back" type="button" hidden>← Back</button>
        <button class="hx-nav hx-next" id="hx-next" type="button">Next →</button>
      </div>
      <div class="hx-panes" id="hx-panes">${panes}</div>
    </div>
  </div>
  ${modal}`;
}

/**
 * Render the full page body.
 *
 * Layout (Fix 2): an OVERVIEW (hero + clickable mental map of the broad building
 * blocks) shown first, full width. Clicking any block enters the WORKBENCH — a
 * left rail of block buttons + the selected block's content on the right.
 *
 * The learner's "Reading" preference picks the layout: "horizontal" → a paged deck
 * (renderBodyHorizontal); anything else → the classic vertical lesson below.
 */
export function renderBody(bp: Blueprint, opts: { previewOnly?: boolean } = {}): string {
  if (bp.learnerProfile.readingMode === "horizontal") return renderBodyHorizontal(bp, opts);
  const p = bp.learnerProfile;
  const metaBits = [
    bp.meta.course ? `Part ${bp.meta.course.index} of ${bp.meta.course.total}` : "",
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
      ${recapBanner(bp)}
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
