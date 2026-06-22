/**
 * # Prebuilt diagram component library — diagrams-as-CODE (deterministic, $0, offline)
 *
 * One pure function per `diagram` template. Each takes the model's DATA-ONLY payload
 * (see `DiagramDataSchema` in schema.ts) and returns a self-contained **inline SVG string**.
 * The model NEVER emits SVG/HTML — it only picks a `template` and fills `data`, exactly like
 * the interactive* viz blocks. The difference: these are STATIC inline SVG (no JS/hydration),
 * so a diagram renders identically in vertical mode, horizontal mode, AND inside the
 * horizontal "heavy block" modal, with zero external dependencies.
 *
 * Conventions every template follows:
 *   - THEME-AWARE: all colors are artifact CSS variables (var(--accent), var(--ink),
 *     var(--surface-2), var(--border-strong), var(--muted)) + currentColor, so light/dark +
 *     per-industry accent "just work" with no JS.
 *   - ACCESSIBLE: each SVG carries <title>/<desc>; every model-supplied label is escaped.
 *   - DEFENSIVE: a missing/odd field renders a smaller or empty-state diagram, never throws —
 *     a bad payload can't break the page (it can't even fail the module parse, since every
 *     data field is optional).
 *   - DETERMINISTIC LAYOUT: `graph` places boxes on the coarse col/row grid the model supplies
 *     and routes arrows on it — there is no force/auto-layout engine.
 */

import type { DiagramData, DiagramTreeNode } from "./schema";

// ---------------------------------------------------------------------------
// escaping + small helpers (kept local so this file is import-light + standalone)
// ---------------------------------------------------------------------------
function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- text-fitting constants (tuned for the Lexend body font) -----------------
const CHAR_W = 0.58; // average glyph advance as a fraction of font-size (conservative)
const LINE_H = 1.16; // line height as a fraction of font-size
const PADX = 9; // horizontal text inset inside a box
const PADY = 7; // vertical text inset inside a box

/**
 * Greedy word-wrap into ≤maxLines lines of ≤maxChars. Returns the lines AND whether text
 * had to be dropped (`overflow`): the caller (fitText) uses that to decide whether to shrink
 * the font and try again. A single word longer than maxChars is hard-broken so it never spills.
 */
function wrapAt(text: string, maxChars: number, maxLines: number): { lines: string[]; overflow: boolean; hardBroke: boolean } {
  const mc = Math.max(2, Math.floor(maxChars));
  const ml = Math.max(1, Math.floor(maxLines));
  const words: string[] = [];
  let hardBroke = false;
  for (const raw of String(text ?? "").trim().split(/\s+/).filter(Boolean)) {
    let w = raw;
    while (w.length > mc) { words.push(w.slice(0, mc)); w = w.slice(mc); hardBroke = true; } // hard-break a too-long token
    if (w) words.push(w);
  }
  if (!words.length) return { lines: [""], overflow: false, hardBroke: false };
  const lines: string[] = [];
  let cur = "";
  let i = 0;
  for (; i < words.length; i++) {
    const tentative = cur ? cur + " " + words[i] : words[i];
    if (tentative.length <= mc || !cur) {
      cur = tentative;
    } else {
      lines.push(cur);
      cur = words[i];
      if (lines.length >= ml) break; // out of vertical room
    }
  }
  let overflow = false;
  if (lines.length >= ml) {
    const remaining = [cur, ...words.slice(i + 1)].join(" ").trim();
    overflow = remaining.length > 0;
    if (overflow) {
      const last = lines[ml - 1];
      lines[ml - 1] = (last.length > mc - 1 ? last.slice(0, mc - 1) : last).replace(/\s+$/, "") + "…";
    }
  } else if (cur) {
    lines.push(cur);
  }
  return { lines: lines.length ? lines : [""], overflow, hardBroke };
}

/** Back-compat helper for short captions/labels: just the wrapped lines. */
function wrap(text: string, maxChars: number, maxLines = 2): string[] {
  return wrapAt(text, maxChars, maxLines).lines;
}

/**
 * Fit `text` inside a `boxW × boxH` area: shrink the font from maxFs down to minFs until the
 * wrapped text fits both the width (chars/line) AND the height (line count) with NO overflow.
 * `reserveBottom` keeps room for a sub-line beneath. Returns the chosen lines + font size.
 */
function fitText(
  text: string,
  boxW: number,
  boxH: number,
  opts: { maxFs?: number; minFs?: number; reserveBottom?: number } = {}
): { lines: string[]; fs: number } {
  const maxFs = opts.maxFs ?? 13;
  const minFs = opts.minFs ?? 9;
  const availW = Math.max(12, boxW - PADX * 2);
  const availH = Math.max(8, boxH - PADY * 2 - (opts.reserveBottom ?? 0));
  let fallback: { lines: string[]; fs: number } | null = null;
  for (let fs = maxFs; fs >= minFs - 0.01; fs -= 0.5) {
    const maxChars = Math.max(3, Math.floor(availW / (fs * CHAR_W)));
    const maxLines = Math.max(1, Math.floor(availH / (fs * LINE_H)));
    const { lines, overflow, hardBroke } = wrapAt(text, maxChars, maxLines);
    // Prefer shrinking the font over splitting a word mid-letter — only accept a clean fit
    // (no dropped text AND no hard-broken word). Hard-break is a last resort at minFs.
    if (!overflow && !hardBroke) return { lines, fs };
    fallback = { lines, fs }; // remember the smallest attempt in case nothing fits cleanly
  }
  return fallback ?? { lines: [text], fs: minFs };
}

/** Multiline <text> whose block is vertically centered on `cyCenter`. */
function centeredText(cx: number, cyCenter: number, lines: string[], fs: number, fill: string, weight = 600): string {
  const lh = fs * LINE_H;
  const topY = cyCenter - (lines.length * lh) / 2;
  const tspans = lines
    .map((ln, i) => `<tspan x="${cx}" y="${(topY + fs * 0.82 + i * lh).toFixed(1)}">${esc(ln)}</tspan>`)
    .join("");
  return `<text text-anchor="middle" font-size="${fs.toFixed(2)}" font-weight="${weight}" fill="${fill}">${tspans}</text>`;
}

/** Multiline <text> stacked from `topY` (first baseline below it). Used to stack label + sub. */
function textBlock(cx: number, topY: number, lines: string[], fs: number, fill: string, weight = 600): string {
  const lh = fs * LINE_H;
  const tspans = lines
    .map((ln, i) => `<tspan x="${cx}" y="${(topY + fs * 0.82 + i * lh).toFixed(1)}">${esc(ln)}</tspan>`)
    .join("");
  return `<text text-anchor="middle" font-size="${fs.toFixed(2)}" font-weight="${weight}" fill="${fill}">${tspans}</text>`;
}

/**
 * A rounded node box whose label (and optional smaller sub-line) is AUTO-FITTED to the box —
 * it wraps and shrinks so text never spills outside the rectangle, however long the model's
 * label is. Label + sub are stacked and the whole stack is vertically centered.
 */
function nodeBox(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: { sub?: string; accent?: boolean; fs?: number } = {}
): string {
  const stroke = opts.accent ? "var(--accent)" : "var(--border-strong)";
  const fill = opts.accent ? "var(--accent-weak)" : "var(--surface-2)";
  const cx = x + w / 2;
  const sub = opts.sub ? String(opts.sub).trim() : "";
  const rect = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${fill}" stroke="${stroke}" stroke-width="1.4"/>`;
  if (!sub) {
    const fit = fitText(label, w, h, { maxFs: opts.fs ?? 13, minFs: 8.5 });
    return rect + centeredText(cx, y + h / 2, fit.lines, fit.fs, "var(--ink)", 600);
  }
  // With a sub-line: reserve the lower ~38% for it, fit each, then center the combined stack.
  const subFit = fitText(sub, w, h * 0.4, { maxFs: (opts.fs ?? 13) - 2, minFs: 8 });
  const labFit = fitText(label, w, h, { maxFs: opts.fs ?? 13, minFs: 8.5, reserveBottom: subFit.lines.length * subFit.fs * LINE_H + 3 });
  const labLH = labFit.fs * LINE_H;
  const subLH = subFit.fs * LINE_H;
  const gap = 3;
  const totalH = labFit.lines.length * labLH + gap + subFit.lines.length * subLH;
  const topY = y + h / 2 - totalH / 2;
  const subTop = topY + labFit.lines.length * labLH + gap;
  return (
    rect +
    textBlock(cx, topY, labFit.lines, labFit.fs, "var(--ink)", 600) +
    textBlock(cx, subTop, subFit.lines, subFit.fs, "var(--muted)", 500)
  );
}

/** The shared <svg> wrapper: viewBox-scaled to 100% width, theme inherited, a11y title/desc. */
function svg(vbW: number, vbH: number, uid: string, title: string, desc: string, body: string): string {
  const m = `ar-${uid}`;
  return (
    `<svg class="dgm-svg" viewBox="0 0 ${Math.round(vbW)} ${Math.round(vbH)}" width="100%" ` +
    `preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="${m}-t ${m}-d" ` +
    `style="font-family:inherit;color:var(--ink);max-height:${Math.round(vbH)}px">` +
    `<title id="${m}-t">${esc(title)}</title><desc id="${m}-d">${esc(desc)}</desc>` +
    // a single reusable arrowhead marker, scoped by uid so multiple diagrams never collide.
    `<defs><marker id="${m}-arw" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0 0L10 5L0 10z" fill="var(--border-strong)"/></marker>` +
    `<marker id="${m}-arwa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">` +
    `<path d="M0 0L10 5L0 10z" fill="var(--accent)"/></marker></defs>` +
    body +
    `</svg>`
  );
}

function emptyState(uid: string, what: string): string {
  return svg(420, 90, uid, "Diagram", `${what} (no data)`,
    `<rect x="1" y="1" width="418" height="88" rx="10" fill="var(--surface-2)" stroke="var(--border-strong)" stroke-width="1.2" stroke-dasharray="5 4"/>` +
    centeredText(210, 45, [`Diagram unavailable`], 13, "var(--muted)", 600));
}

// ---------------------------------------------------------------------------
// 1. neuralNetwork — the classic fully-connected node-link net
// ---------------------------------------------------------------------------
function neuralNetwork(d: DiagramData, uid: string): string {
  let layers = (d.layers ?? []).map((n) => Math.max(1, Math.round(Number(n) || 1)));
  if (layers.length < 2) return emptyState(uid, "neural network");
  if (layers.length > 7) layers = layers.slice(0, 7);
  const DISP_CAP = 7; // nodes drawn per layer
  const colGap = 150;
  const nodeGap = 44;
  const r = 13;
  // Side margin must clear half a column label so the first/last "Layer (n)" caption never
  // clips at the viewBox edge (right gap from a column centre = marginX - r).
  const marginX = 64;
  const marginTop = 30;
  const labelH = 34;
  const maxNodes = Math.min(DISP_CAP, Math.max(...layers));
  const plotH = (maxNodes - 1) * nodeGap + r * 2;
  const W = marginX * 2 + (layers.length - 1) * colGap;
  const H = marginTop + plotH + labelH + 14;
  const centerY = marginTop + plotH / 2;
  const colX = (i: number) => marginX + i * colGap + r;
  const layerYs = (count: number): number[] => {
    const shown = Math.min(count, DISP_CAP);
    const ys: number[] = [];
    for (let k = 0; k < shown; k++) ys.push(centerY + (k - (shown - 1) / 2) * nodeGap);
    return ys;
  };

  // edges first (behind nodes)
  let edges = "";
  for (let i = 0; i < layers.length - 1; i++) {
    const a = layerYs(layers[i]);
    const b = layerYs(layers[i + 1]);
    for (const ya of a)
      for (const yb of b)
        edges += `<line x1="${colX(i)}" y1="${ya.toFixed(1)}" x2="${colX(i + 1)}" y2="${yb.toFixed(1)}" stroke="var(--border-strong)" stroke-width="1" opacity="0.4"/>`;
  }
  // nodes + per-layer labels
  const labels = d.labels ?? [];
  const defaultLabel = (i: number) => (i === 0 ? "Input" : i === layers.length - 1 ? "Output" : layers.length === 3 ? "Hidden" : `Hidden ${i}`);
  let nodes = "";
  let captions = "";
  layers.forEach((count, i) => {
    const accent = i === 0 || i === layers.length - 1;
    for (const y of layerYs(count))
      nodes += `<circle cx="${colX(i)}" cy="${y.toFixed(1)}" r="${r}" fill="${accent ? "var(--accent-weak)" : "var(--surface-2)"}" stroke="${accent ? "var(--accent)" : "var(--border-strong)"}" stroke-width="1.6"/>`;
    if (count > DISP_CAP)
      captions += centeredText(colX(i), centerY + plotH / 2 + 2, [`+${count - DISP_CAP} more`], 10.5, "var(--muted)", 500);
    const lab = labels[i] || defaultLabel(i);
    captions += centeredText(colX(i), marginTop + plotH + labelH - 6, [`${esc(lab)} (${count})`], 11.5, "var(--muted)", 600);
  });

  return svg(W, H, uid, "Neural network", `A ${layers.join("-")} fully-connected neural network`, edges + nodes + captions);
}

// ---------------------------------------------------------------------------
// 2. pipeline — a static left→right labelled flow with arrows
// ---------------------------------------------------------------------------
function pipeline(d: DiagramData, uid: string): string {
  const stages = (d.stages && d.stages.length ? d.stages : d.steps) ?? [];
  if (!stages.length) return emptyState(uid, "pipeline");
  const boxW = 132;
  const boxH = 62;
  const gap = 38;
  const marginX = 16;
  const marginY = 24;
  const W = marginX * 2 + stages.length * boxW + (stages.length - 1) * gap;
  const H = marginY * 2 + boxH;
  const m = `ar-${uid}`;
  let body = "";
  stages.forEach((s, i) => {
    const x = marginX + i * (boxW + gap);
    body += nodeBox(x, marginY, boxW, boxH, s.label, { sub: s.sub, accent: i === 0 });
    if (i < stages.length - 1) {
      const ax1 = x + boxW + 5;
      const ax2 = x + boxW + gap - 5;
      const ay = marginY + boxH / 2;
      body += `<line x1="${ax1}" y1="${ay}" x2="${ax2}" y2="${ay}" stroke="var(--border-strong)" stroke-width="1.8" marker-end="url(#${m}-arw)"/>`;
    }
  });
  return svg(W, H, uid, "Pipeline", `A ${stages.length}-stage pipeline: ${stages.map((s) => s.label).join(" → ")}`, body);
}

// ---------------------------------------------------------------------------
// 3. agentLoop — a CYCLIC loop (forward arrows + a labelled return edge)
// ---------------------------------------------------------------------------
function agentLoop(d: DiagramData, uid: string): string {
  const steps = (d.steps && d.steps.length ? d.steps : d.stages) ?? [];
  if (!steps.length) return emptyState(uid, "agent loop");
  const boxW = 124;
  const boxH = 60;
  const gap = 46;
  const marginX = 18;
  const marginY = 22;
  const W = marginX * 2 + steps.length * boxW + (steps.length - 1) * gap;
  const arcDrop = 52; // vertical room for the return loop beneath the row
  const H = marginY + boxH + arcDrop + 26;
  const m = `ar-${uid}`;
  const rowY = marginY;
  let body = "";
  steps.forEach((s, i) => {
    const x = marginX + i * (boxW + gap);
    body += nodeBox(x, rowY, boxW, boxH, s.label, { sub: s.sub, accent: i === 0 });
    if (i < steps.length - 1) {
      const ax1 = x + boxW + 6;
      const ax2 = x + boxW + gap - 6;
      const ay = rowY + boxH / 2;
      body += `<line x1="${ax1}" y1="${ay}" x2="${ax2}" y2="${ay}" stroke="var(--border-strong)" stroke-width="1.8" marker-end="url(#${m}-arw)"/>`;
    }
  });
  // return edge: from the last box's bottom, curve down and back to the first box's bottom.
  if (steps.length > 1) {
    const firstX = marginX + boxW / 2;
    const lastX = marginX + (steps.length - 1) * (boxW + gap) + boxW / 2;
    const yb = rowY + boxH;
    const yArc = rowY + boxH + arcDrop;
    body +=
      `<path d="M${lastX} ${yb} C ${lastX} ${yArc}, ${firstX} ${yArc}, ${firstX} ${yb}" fill="none" ` +
      `stroke="var(--accent)" stroke-width="1.8" stroke-dasharray="6 4" marker-end="url(#${m}-arwa)"/>` +
      centeredText((firstX + lastX) / 2, yArc + 12, ["repeat until done"], 11.5, "var(--accent-2)", 600);
  }
  return svg(W, H, uid, "Agent loop", `A cyclic agent loop: ${steps.map((s) => s.label).join(" → ")} → repeat`, body);
}

// ---------------------------------------------------------------------------
// 4. graph — a general node-link DAG on the model's coarse col/row grid
// ---------------------------------------------------------------------------
function graph(d: DiagramData, uid: string): string {
  const nodes = (d.nodes ?? []).filter((n) => n && n.id != null);
  if (!nodes.length) return emptyState(uid, "graph");
  const edges = d.edges ?? [];
  const boxW = 138;
  const boxH = 54;
  const colGap = 184;
  const rowGap = 92;
  const marginX = 16;
  const marginY = 20;
  const maxCol = Math.max(0, ...nodes.map((n) => Math.max(0, Math.round(Number(n.col) || 0))));
  const maxRow = Math.max(0, ...nodes.map((n) => Math.max(0, Math.round(Number(n.row) || 0))));
  const W = marginX * 2 + boxW + maxCol * colGap;
  const H = marginY * 2 + boxH + maxRow * rowGap;
  const m = `ar-${uid}`;
  const cx = (col: number) => marginX + col * colGap + boxW / 2;
  const cy = (row: number) => marginY + row * rowGap + boxH / 2;
  const byId = new Map(nodes.map((n) => [String(n.id), n]));

  // edges first, clipped to each box's border so arrowheads land on the edge, not the centre.
  let edgeSvg = "";
  for (const e of edges) {
    const a = byId.get(String(e.from));
    const b = byId.get(String(e.to));
    if (!a || !b) continue;
    const x1 = cx(Math.round(Number(a.col) || 0)), y1 = cy(Math.round(Number(a.row) || 0));
    const x2 = cx(Math.round(Number(b.col) || 0)), y2 = cy(Math.round(Number(b.row) || 0));
    const dx = x1 - x2, dy = y1 - y2;
    const hw = boxW / 2 + 4, hh = boxH / 2 + 4;
    const clip = (px: number, py: number, ox: number, oy: number) => {
      if (ox === 0 && oy === 0) return [px, py];
      const s = Math.min(Math.abs(hw / (ox || 1e-6)), Math.abs(hh / (oy || 1e-6)));
      return [px + ox * s, py + oy * s];
    };
    const [sx, sy] = clip(x2, y2, dx, dy); // entry point on target box
    const [ex, ey] = clip(x1, y1, -dx, -dy); // exit point on source box
    const dashed = e.kind === "conditional" || e.kind === "dashed";
    edgeSvg += `<line x1="${ex.toFixed(1)}" y1="${ey.toFixed(1)}" x2="${sx.toFixed(1)}" y2="${sy.toFixed(1)}" stroke="var(--border-strong)" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ""} marker-end="url(#${m}-arw)"/>`;
    if (e.label) {
      const mx = (ex + sx) / 2, my = (ey + sy) / 2;
      const lf = fitText(e.label, 132, 14, { maxFs: 10.5, minFs: 8.5 });
      const txt = lf.lines[0] ?? "";
      const lw = Math.min(140, txt.length * lf.fs * CHAR_W + 12);
      edgeSvg += `<rect x="${(mx - lw / 2).toFixed(1)}" y="${(my - 9).toFixed(1)}" width="${lw.toFixed(1)}" height="16" rx="4" fill="var(--surface)" opacity="0.92"/>` +
        centeredText(mx, my, [txt], lf.fs, "var(--muted)", 500);
    }
  }
  // boxes on top
  let nodeSvg = "";
  nodes.forEach((n, i) => {
    const x = marginX + (Math.round(Number(n.col) || 0)) * colGap;
    const y = marginY + (Math.round(Number(n.row) || 0)) * rowGap;
    nodeSvg += nodeBox(x, y, boxW, boxH, n.label, { accent: i === 0 });
  });
  return svg(W, H, uid, "Diagram", `A node-link diagram with ${nodes.length} nodes and ${edges.length} connections`, edgeSvg + nodeSvg);
}

// ---------------------------------------------------------------------------
// 5. sequence — lifelines + ordered messages (a request path / trace capture)
// ---------------------------------------------------------------------------
function sequence(d: DiagramData, uid: string): string {
  const actors = (d.actors ?? []).map((a) => String(a)).filter(Boolean);
  if (actors.length < 2) return emptyState(uid, "sequence");
  const messages = d.messages ?? [];
  const actorW = 120;
  const actorH = 40;
  const actorGap = 56;
  const marginX = 16;
  const marginTop = 16;
  const msgTop = marginTop + actorH + 30;
  const msgGap = 42;
  const W = marginX * 2 + actors.length * actorW + (actors.length - 1) * actorGap;
  const H = msgTop + Math.max(1, messages.length) * msgGap + 16;
  const m = `ar-${uid}`;
  const ax = (i: number) => marginX + i * (actorW + actorGap) + actorW / 2;
  const idxOf = (name: string) => {
    const t = String(name).toLowerCase().trim();
    let i = actors.findIndex((a) => a.toLowerCase().trim() === t);
    if (i < 0) i = actors.findIndex((a) => a.toLowerCase().includes(t) || t.includes(a.toLowerCase()));
    return i;
  };

  // lifelines + actor heads
  let body = "";
  actors.forEach((a, i) => {
    const x = marginX + i * (actorW + actorGap);
    body += `<line x1="${ax(i)}" y1="${marginTop + actorH}" x2="${ax(i)}" y2="${H - 12}" stroke="var(--border-strong)" stroke-width="1" stroke-dasharray="3 4" opacity="0.6"/>`;
    body += nodeBox(x, marginTop, actorW, actorH, a, { accent: i === 0, fs: 12.5 });
  });
  // messages
  messages.forEach((msg, k) => {
    const fi = idxOf(msg.from), ti = idxOf(msg.to);
    if (fi < 0 || ti < 0) return;
    const y = msgTop + k * msgGap;
    if (fi === ti) {
      // self-call: a little loop to the right of the lifeline.
      const x = ax(fi);
      body += `<path d="M${x} ${y} h26 v14 h-26" fill="none" stroke="var(--border-strong)" stroke-width="1.5" marker-end="url(#${m}-arw)"/>` +
        `<text x="${x + 30}" y="${y - 3}" font-size="11" fill="var(--ink)">${esc(msg.label)}</text>`;
    } else {
      const x1 = ax(fi), x2 = ax(ti);
      const dir = x2 > x1 ? -6 : 6;
      // label auto-fits the span between the two lifelines (shrinks rather than overruns).
      const lf = fitText(msg.label, Math.abs(x2 - x1) - 14, 16, { maxFs: 11, minFs: 8 });
      body += `<line x1="${x1}" y1="${y}" x2="${x2 + dir}" y2="${y}" stroke="var(--border-strong)" stroke-width="1.6" marker-end="url(#${m}-arw)"/>` +
        centeredText((x1 + x2) / 2, y - 7, lf.lines, lf.fs, "var(--ink)", 500);
    }
  });
  return svg(W, H, uid, "Sequence diagram", `A sequence of ${messages.length} messages between ${actors.length} participants`, body);
}

// ---------------------------------------------------------------------------
// 6. layeredArchitecture — stacked tiers, top → bottom
// ---------------------------------------------------------------------------
function layeredArchitecture(d: DiagramData, uid: string): string {
  const tiers = (d.tiers ?? []).filter((t) => t && t.name != null);
  if (!tiers.length) return emptyState(uid, "layered architecture");
  const W = 580;
  const nameW = 144; // left gutter for the tier name (wide enough for long tier names, which still auto-fit)
  const nameGap = 10; // breathing room between the name gutter and the item area
  const marginX = 14;
  const marginY = 16;
  const itemH = 42;
  const itemGap = 10;
  const tierPad = 12;
  const tierGap = 14;
  const innerW = W - marginX * 2 - nameW - nameGap;

  // pre-compute each tier's height from how many item rows it needs.
  const layout = tiers.map((t) => {
    const items = (t.items ?? []).map(String).filter(Boolean);
    const perRow = Math.max(1, Math.min(items.length, Math.floor(innerW / 130) || 1));
    const rows = Math.max(1, Math.ceil(items.length / perRow));
    const h = rows * itemH + (rows - 1) * itemGap + tierPad * 2;
    return { name: String(t.name), items, perRow, rows, h };
  });
  const H = marginY * 2 + layout.reduce((a, l) => a + l.h, 0) + (layout.length - 1) * tierGap;

  let body = "";
  let y = marginY;
  layout.forEach((l, ti) => {
    const accent = ti === 0;
    // tier band
    body += `<rect x="${marginX}" y="${y}" width="${W - marginX * 2}" height="${l.h}" rx="10" fill="${accent ? "var(--accent-weak)" : "var(--surface-2)"}" stroke="${accent ? "var(--accent)" : "var(--border-strong)"}" stroke-width="1.3"/>`;
    // tier name (left gutter) — AUTO-FITTED so even a long name ("Frozen Base Model Weights …")
    // wraps + shrinks inside the gutter instead of spilling over the items.
    const nameFit = fitText(l.name, nameW, l.h, { maxFs: 12.5, minFs: 8 });
    body += centeredText(marginX + nameW / 2, y + l.h / 2, nameFit.lines, nameFit.fs, accent ? "var(--accent-2)" : "var(--ink)", 700);
    // item boxes (each label auto-fitted to its box)
    const itemAreaX = marginX + nameW + nameGap;
    const iw = l.items.length ? (innerW - (l.perRow - 1) * itemGap) / l.perRow : innerW;
    l.items.forEach((it, idx) => {
      const r = Math.floor(idx / l.perRow);
      const c = idx % l.perRow;
      const ix = itemAreaX + c * (iw + itemGap);
      const iy = y + tierPad + r * (itemH + itemGap);
      const itFit = fitText(it, iw, itemH, { maxFs: 11.5, minFs: 8.5 });
      body += `<rect x="${ix.toFixed(1)}" y="${iy}" width="${iw.toFixed(1)}" height="${itemH}" rx="7" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.1"/>` +
        centeredText(ix + iw / 2, iy + itemH / 2, itFit.lines, itFit.fs, "var(--ink)", 500);
    });
    // a faint down-chevron in the gap shows the stack direction (each tier sits on the one below).
    if (ti < layout.length - 1) {
      const cyMid = y + l.h + tierGap / 2;
      const cxMid = W / 2;
      body += `<path d="M${cxMid - 5} ${(cyMid - 2.5).toFixed(1)} L${cxMid} ${(cyMid + 3).toFixed(1)} L${cxMid + 5} ${(cyMid - 2.5).toFixed(1)}" fill="none" stroke="var(--border-strong)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    y += l.h + tierGap;
  });
  return svg(W, H, uid, "Layered architecture", `A ${tiers.length}-tier architecture: ${tiers.map((t) => t.name).join(", ")}`, body);
}

// ---------------------------------------------------------------------------
// 7. tree — a top-down hierarchy (task decomposition, trace-span nesting, taxonomy)
// ---------------------------------------------------------------------------
type Placed = { node: DiagramTreeNode; x: number; y: number; kids: Placed[]; depth: number };
function tree(d: DiagramData, uid: string): string {
  const root = d.tree;
  if (!root || root.label == null) return emptyState(uid, "tree");
  const boxW = 132, boxH = 48, hGap = 16, vGap = 38, marginX = 14, marginY = 14;
  let leaf = 0;
  let maxDepth = 0;
  let count = 0;
  const place = (node: DiagramTreeNode, depth: number): Placed => {
    maxDepth = Math.max(maxDepth, depth);
    count++;
    const children = (count > 60 ? [] : node.children ?? []).filter((c) => c && c.label != null); // hard cap = runaway guard
    const kids = children.map((c) => place(c, depth + 1));
    const x = kids.length ? (kids[0].x + kids[kids.length - 1].x) / 2 : (leaf++ * (boxW + hGap) + boxW / 2);
    return { node, x, y: marginY + depth * (boxH + vGap), kids, depth };
  };
  const tree0 = place(root, 0);
  const flat: Placed[] = [];
  (function walk(p: Placed) { flat.push(p); p.kids.forEach(walk); })(tree0);
  const W = marginX * 2 + Math.max(boxW, (leaf - 1) * (boxW + hGap) + boxW);
  const H = marginY * 2 + (maxDepth + 1) * boxH + maxDepth * vGap;

  // connectors: parent bottom → child top, as orthogonal elbows through the mid-gap.
  let edges = "";
  for (const p of flat) {
    const px = marginX + p.x, pyB = p.y + boxH;
    for (const k of p.kids) {
      const cx = marginX + k.x, cyT = k.y;
      const midY = pyB + (cyT - pyB) / 2;
      edges += `<path d="M${px.toFixed(1)} ${pyB} V${midY.toFixed(1)} H${cx.toFixed(1)} V${cyT}" fill="none" stroke="var(--border-strong)" stroke-width="1.5"/>`;
    }
  }
  let boxes = "";
  for (const p of flat) {
    boxes += nodeBox(marginX + p.x - boxW / 2, p.y, boxW, boxH, p.node.label, { sub: p.node.sub, accent: p.depth === 0 });
  }
  return svg(W, H, uid, "Hierarchy", `A ${count}-node hierarchy rooted at "${root.label}"`, edges + boxes);
}

// ---------------------------------------------------------------------------
// 8. matrix — a labelled grid / heatmap (attention weights, confusion matrix, similarity)
// ---------------------------------------------------------------------------
function matrix(d: DiagramData, uid: string): string {
  const mx = d.matrix;
  if (!mx || !Array.isArray(mx.rows) || !Array.isArray(mx.cols) || !mx.rows.length || !mx.cols.length) return emptyState(uid, "matrix");
  const rows = mx.rows.map(String);
  const cols = mx.cols.map(String);
  const cells = mx.cells ?? [];
  const cellW = Math.max(40, Math.min(72, Math.floor(520 / cols.length)));
  const cellH = 40;
  const gutterW = 104; // row-label gutter
  const headerH = 38; // col-label header
  const marginX = 14, marginY = 12;
  const W = marginX * 2 + gutterW + cols.length * cellW;
  const H = marginY * 2 + headerH + rows.length * cellH;
  // normalise colour intensity by the largest magnitude in the grid.
  let maxV = 1e-6;
  for (const r of cells) for (const v of r ?? []) maxV = Math.max(maxV, Math.abs(Number(v) || 0));
  const asInt = maxV > 1.5; // counts (confusion matrix) vs 0..1 weights
  const gx = marginX + gutterW;
  const gy = marginY + headerH;

  let body = "";
  // column headers
  cols.forEach((c, j) => {
    const cf = fitText(c, cellW, headerH, { maxFs: 11, minFs: 8 });
    body += centeredText(gx + j * cellW + cellW / 2, marginY + headerH / 2, cf.lines, cf.fs, "var(--muted)", 600);
  });
  // rows: label + cells
  rows.forEach((r, i) => {
    const rf = fitText(r, gutterW, cellH, { maxFs: 11, minFs: 8 });
    body += centeredText(marginX + gutterW / 2, gy + i * cellH + cellH / 2, rf.lines, rf.fs, "var(--muted)", 600);
    cols.forEach((_, j) => {
      const v = Number(cells[i]?.[j] ?? 0);
      const intensity = Math.min(1, Math.abs(v) / maxV);
      const x = gx + j * cellW, y = gy + i * cellH;
      body += `<rect x="${x + 1}" y="${y + 1}" width="${cellW - 2}" height="${cellH - 2}" rx="5" fill="var(--accent)" fill-opacity="${(0.06 + 0.82 * intensity).toFixed(3)}" stroke="var(--border-strong)" stroke-width="0.8"/>`;
      const txt = asInt ? String(Math.round(v)) : v.toFixed(2);
      const tf = fitText(txt, cellW, cellH, { maxFs: 11, minFs: 8 });
      body += centeredText(x + cellW / 2, y + cellH / 2, tf.lines, tf.fs, intensity > 0.55 ? "#fff" : "var(--ink)", 600);
    });
  });
  return svg(W, H, uid, "Matrix", `A ${rows.length}×${cols.length} grid of values`, body);
}

// ---------------------------------------------------------------------------
// 9. barProportion — one stacked horizontal bar of proportions (budget / cost split)
// ---------------------------------------------------------------------------
function barProportion(d: DiagramData, uid: string): string {
  const segs = (d.segments ?? []).filter((s) => s && s.label != null && Number(s.value) > 0);
  if (!segs.length) return emptyState(uid, "barProportion");
  const total = segs.reduce((a, s) => a + Number(s.value), 0) || 1;
  const W = 560, marginX = 14, top = 16, barH = 46, legendTop = 16, legendRowH = 24;
  const barW = W - marginX * 2;
  const H = top + barH + legendTop + segs.length * legendRowH + 12;
  const m = `ar-${uid}`;

  // bar segments (alternating accent intensities so neighbours separate without a colour list).
  let bar = "";
  let legend = "";
  let x = marginX;
  segs.forEach((s, i) => {
    const frac = Number(s.value) / total;
    const w = frac * barW;
    const op = (0.85 - (i % 4) * 0.18).toFixed(2); // 0.85,0.67,0.49,0.31 cycling
    const pct = Math.round(frac * 100);
    bar += `<rect x="${x.toFixed(1)}" y="${top}" width="${w.toFixed(1)}" height="${barH}" fill="var(--accent)" fill-opacity="${op}" stroke="var(--surface)" stroke-width="1.5"/>`;
    if (w > 54) {
      const lf = fitText(`${s.label} · ${pct}%`, w, barH, { maxFs: 11.5, minFs: 8.5 });
      bar += centeredText(x + w / 2, top + barH / 2, lf.lines, lf.fs, Number(op) > 0.55 ? "#fff" : "var(--ink)", 600);
    }
    // legend row
    const ly = top + barH + legendTop + i * legendRowH;
    legend += `<rect x="${marginX}" y="${ly}" width="14" height="14" rx="3" fill="var(--accent)" fill-opacity="${op}"/>` +
      `<text x="${marginX + 22}" y="${ly + 11}" font-size="12" fill="var(--ink)">${esc(s.label)} — ${esc(asNum(s.value))} (${pct}%)${s.sub ? `  ·  ${esc(s.sub)}` : ""}</text>`;
    x += w;
  });
  return svg(W, H, uid, "Proportion bar", `A stacked bar of ${segs.length} segments totalling ${asNum(total)}`, bar + legend);
}
function asNum(v: unknown): string { const n = Number(v); return Number.isInteger(n) ? String(n) : n.toFixed(2); }

// ---------------------------------------------------------------------------
// dispatcher — pick the template fn; unknown/empty → a safe empty state.
// `uid` (the block id, sanitized) scopes per-SVG marker ids so diagrams never collide.
// ---------------------------------------------------------------------------
export type DiagramTemplate =
  | "neuralNetwork" | "pipeline" | "agentLoop" | "graph" | "sequence"
  | "layeredArchitecture" | "tree" | "matrix" | "barProportion";

export function renderDiagram(template: DiagramTemplate, data: DiagramData, idSeed: string): string {
  const uid = String(idSeed || "d").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "d";
  const d = data ?? {};
  try {
    switch (template) {
      case "neuralNetwork": return neuralNetwork(d, uid);
      case "pipeline": return pipeline(d, uid);
      case "agentLoop": return agentLoop(d, uid);
      case "graph": return graph(d, uid);
      case "sequence": return sequence(d, uid);
      case "layeredArchitecture": return layeredArchitecture(d, uid);
      case "tree": return tree(d, uid);
      case "matrix": return matrix(d, uid);
      case "barProportion": return barProportion(d, uid);
      default: return emptyState(uid, "diagram");
    }
  } catch {
    // A renderer bug must never take down the whole lesson page.
    return emptyState(uid, "diagram");
  }
}
