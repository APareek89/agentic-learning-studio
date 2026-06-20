/**
 * # Artifact CSS — the look of the generated learning page (NOT the host app)
 *
 * One big stylesheet, inlined into every artifact so the file is self-contained.
 * It defines: design tokens (light + dark), layout, the mental map, module
 * sections, every block type, the (i) term popover, example tabs (CSS-only via
 * radio:checked), self-check quizzes, citations, and — crucially — the
 * **27-combo visibility gates** (`body[data-level/data-depth/data-examples]`)
 * that show/hide content for the learner's selection without any JavaScript.
 *
 * Tokens adopt the example's palette (indigo #605BFF, ink, Inter, 780px measure)
 * and add a real dark theme + reduced-motion guards.
 */

export const ARTIFACT_CSS = String.raw`
:root{
  --accent:#2563eb; --accent-2:#1d4ed8; --accent-weak:#e8efff;
  --ink:#0f1729; --ink-soft:#27324a; --muted:#56607a; --faint:#8893ab;
  --bg:#f5f8ff; --surface:#ffffff; --surface-2:#f9fbff;
  --border:#e3e9f5; --border-strong:#d0d9ee;
  --ok:#1d9e75; --ok-weak:#e6f6ef; --warn:#b9770a; --warn-weak:#fbf1de;
  --danger:#d2433a; --danger-weak:#fcebea; --info:#2563eb; --info-weak:#e8efff;
  --code-bg:#0b1228; --code-ink:#e7ecff;
  --radius:14px; --radius-sm:9px; --measure:780px;
  --font-body:Lexend,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-head:"Space Grotesk",Lexend,system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --shadow:0 1px 2px rgba(15,23,41,.05),0 10px 30px rgba(37,99,235,.08);
}
[data-theme="dark"]{
  --ink:#eaf0ff; --ink-soft:#c8d2ea; --muted:#9aa6c4; --faint:#76829f;
  --bg:#0a0f1f; --surface:#121829; --surface-2:#161d31;
  --border:#222a44; --border-strong:#313b5c; --accent-weak:#142149;
  --code-bg:#070b18; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 34px rgba(0,0,0,.5);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);line-height:1.65;font-size:16px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
a{color:var(--accent);text-decoration:none}
.shell{max-width:min(1240px,94vw);margin:0 auto;padding:22px 26px 56px}
h1,h2,h3,h4{line-height:1.25;letter-spacing:-.01em;color:var(--ink);font-family:var(--font-head)}
.eyebrow{color:var(--accent);font-weight:700;font-size:12px;letter-spacing:.06em;text-transform:uppercase}
.muted{color:var(--muted)}
code{font-family:var(--font-mono);font-size:.88em;background:var(--accent-weak);color:var(--accent-2);padding:1px 6px;border-radius:6px}

/* ---- top bar (theme toggle + progress) ---- */
.topbar{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.topbar-in{max-width:1320px;margin:0 auto;padding:10px 26px;display:flex;align-items:center;gap:14px}
.tb-left{flex:1 1 0;display:flex;justify-content:flex-start;min-width:0}
.tb-center{flex:0 1 auto;text-align:center;min-width:0;padding:0 10px}
.tb-right{flex:1 1 0;display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap}
.brand-mini{font-weight:800;font-size:17px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-block;max-width:100%}
.spacer{flex:1}
@media(max-width:820px){.brand-mini{font-size:14px}.tb-right{gap:8px}}
.progress{height:6px;width:120px;background:var(--border);border-radius:99px;overflow:hidden}
.progress > i{display:block;height:100%;width:0;background:var(--accent);transition:width .3s ease}
.tbtn{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;padding:5px 11px;border-radius:8px;cursor:pointer}

/* ---- hero ---- */
.hero{padding:14px 0 6px}
.hero h1{font-size:32px;font-weight:800;margin:.18em 0 .25em}
.thesis{font-size:18px;color:var(--ink-soft);font-weight:500}
.meta-line{margin-top:10px;color:var(--muted);font-size:13.5px;display:flex;gap:14px;flex-wrap:wrap}

/* ---- mental map ---- */
.map{margin:26px 0 8px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);padding:18px}
.map h2{font-size:15px;margin:0 0 3px}
.map .cap{color:var(--muted);font-size:13px;margin:0 0 14px}
.map-layer{margin:0 0 10px}
.map-layer-label{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;margin:0 0 6px}
.map-row{display:flex;flex-wrap:wrap;gap:9px}
.map-node{flex:1 1 240px;min-width:230px;text-align:left;border:1px solid var(--border-strong);background:var(--surface-2);border-radius:11px;padding:12px 14px;cursor:pointer;font:inherit;color:var(--ink);transition:border-color .12s,transform .08s,box-shadow .12s}
.map-node:hover{border-color:var(--accent);transform:translateY(-1px);box-shadow:var(--shadow)}
.map-node.spine{border-left:3px solid var(--accent)}
.map-node .mn-title{font-weight:600;font-size:13.5px}
.map-node .mn-sub{font-size:11.5px;color:var(--muted);margin-top:2px}
/* Persistent "click for details" affordance on every linked block. */
.map-node .mn-go{display:inline-flex;align-items:center;gap:5px;width:fit-content;font-size:11px;color:var(--accent-2);font-weight:700;margin-top:8px;background:var(--accent-weak);border-radius:99px;padding:3px 10px}
.map-node .mn-cue-ico{font-size:11px;line-height:1}
.map-node:hover .mn-go{background:var(--accent);color:#fff}
.map-arrow{display:flex;justify-content:center;color:var(--faint);font-size:14px;margin:2px 0}

/* Make the hidden attribute authoritative (author #overview/#workbench rules below
   would otherwise override the UA [hidden] rule and break the overview↔workbench swap). */
[hidden]{display:none!important}

/* ===== Overview = ONE non-scrolling screen; mental map flows LEFT-TO-RIGHT ===== */
/* Scoped to :not([hidden]) so it only applies while the overview is the active view. */
#overview:not([hidden]){height:calc(100dvh - 54px);overflow:hidden;display:flex;flex-direction:column}
#overview .shell{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:14px 26px}
#overview .hero{padding:2px 0 0}
#overview .hero h1{font-size:26px;margin:.06em 0 .12em}
#overview .thesis{font-size:15px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#overview .meta-line{margin-top:6px;font-size:12.5px}
#overview .ov-hint{margin:8px 0 0}
#overview .map{flex:1;min-height:0;display:flex;flex-direction:column;margin:12px 0 0;overflow:hidden;padding:16px}
#overview .map h2{font-size:14px}
#overview .map .cap{margin:0 0 8px}
/* layers become side-by-side columns; nodes stack inside their column */
#overview .map-flow{flex:1;min-height:0;display:flex;align-items:stretch;gap:6px}
#overview .map-flow .map-layer{flex:1 1 0;min-width:0;display:flex;flex-direction:column;margin:0}
#overview .map-flow .map-row{flex:1;min-height:0;display:flex;flex-direction:column;flex-wrap:nowrap;gap:8px}
#overview .map-flow .map-node{flex:1 1 0;min-width:0;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:3px}
#overview .map-flow .map-node .mn-go{margin-top:auto}
#overview .map-flow .mn-what,#overview .map-flow .mn-rel{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#overview .map-flow .map-arrow{flex:0 0 auto;align-self:center;margin:0 2px}
#overview .map-flow .map-arrow::before{content:"→"}
/* narrow screens: fall back to vertical stacking + a normal scrolling page */
@media(max-width:820px){
  #overview:not([hidden]){height:auto;overflow:visible}
  #overview .shell,#overview .map,#overview .map-flow{overflow:visible}
  #overview .map-flow{flex-direction:column}
  #overview .map-flow .map-row{flex-direction:row;flex-wrap:wrap}
  #overview .map-flow .map-arrow::before{content:"↓"}
}

/* ---- overview / workbench (Fix 2 layout) ---- */
.ov-hint{text-align:center;color:var(--muted);font-size:13.5px;margin:18px 0 0}
.nav-back{margin-right:4px}
#workbench{display:grid;grid-template-columns:248px 1fr;align-items:start}
#blocknav{position:sticky;top:53px;align-self:start;max-height:calc(100vh - 53px);overflow:auto;border-right:1px solid var(--border);padding:16px 10px;display:flex;flex-direction:column;gap:3px;background:var(--surface)}
.navitem{display:flex;align-items:center;gap:10px;text-align:left;width:100%;border:none;background:transparent;color:var(--ink-soft);font:inherit;font-size:13.5px;padding:9px 11px;border-radius:9px;cursor:pointer;line-height:1.3}
.navitem:hover{background:var(--surface-2)}
.navitem.active{background:var(--accent-weak);color:var(--accent-2);font-weight:600}
.navitem .ni-num{flex:none;width:22px;height:22px;border-radius:7px;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:var(--ink-soft)}
.navitem.active .ni-num{background:var(--accent);color:#fff}
.navitem.nav-special{color:var(--muted)}
#blockmain{padding:26px 40px 90px;min-width:0;max-width:1000px;margin:0 auto}
/* keep prose comfortably readable even though the panel is wide; wide blocks
   (matrix / code / diagrams / interactive visuals) still use the full width. */
#blockmain .block p,#blockmain .block ul,#blockmain .block ol,#blockmain .module-body>p{max-width:760px}
.panel{display:none}
.panel.active{display:block;animation:fadein .22s ease}
@keyframes fadein{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
.panel h2{font-size:24px;font-weight:800;margin:.1em 0 .35em}

/* ---- module panel internals ---- */
.module-head{padding:0 0 4px}
.panel .module-body{padding:0}
.module-head .num{color:var(--accent);font-weight:800;font-size:13px}
.module-head h2{font-size:22px;font-weight:800;margin:.15em 0 .1em}
.module-head .sub{color:var(--muted);font-size:14px;margin:0}
.module-body{padding:6px 22px 22px}
.objectives{background:var(--accent-weak);border-radius:var(--radius-sm);padding:11px 14px;margin:14px 0;font-size:13.5px}
.objectives b{display:block;color:var(--accent-2);font-size:11px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px}
.objectives ul{margin:0;padding-left:18px}
.decision-forces{font-size:13px;color:var(--warn);background:var(--warn-weak);border-radius:var(--radius-sm);padding:9px 13px;margin:12px 0}
.keyterms{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}

/* ---- generic blocks ---- */
.block{margin:16px 0}
.block h3{font-size:16px;margin:0 0 6px}
.block p{margin:.5em 0;color:var(--ink-soft)}
.block ul,.block ol{margin:.4em 0;padding-left:20px;color:var(--ink-soft)}
.block li{margin:.25em 0}
.callout{border-left:3px solid var(--info);background:var(--info-weak);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:11px 14px;margin:14px 0}
.callout.good{border-color:var(--ok);background:var(--ok-weak)}
.callout.warn{border-color:var(--warn);background:var(--warn-weak)}
.callout.danger{border-color:var(--danger);background:var(--danger-weak)}

/* decision callout */
.dcall{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden;margin:14px 0}
.dcall > div{background:var(--surface);padding:11px 13px;font-size:13.5px}
.dcall .lab{font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin-bottom:4px}
.dcall .use .lab{color:var(--ok)} .dcall .avoid .lab{color:var(--danger)}
.dcall .rot{grid-column:1/-1;background:var(--accent-weak);color:var(--accent-2)}

/* decision matrix */
.matrix{overflow-x:auto;margin:14px 0}
table.dm{border-collapse:collapse;width:100%;font-size:13px;min-width:520px}
table.dm th,table.dm td{border:1px solid var(--border);padding:8px 10px;text-align:left;vertical-align:top}
table.dm thead th{background:var(--surface-2);font-weight:700}
table.dm td.when{background:var(--accent-weak);color:var(--accent-2);font-weight:500}
.rate{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.rate.good{background:var(--ok)} .rate.ok{background:var(--warn)} .rate.bad{background:var(--danger)}
.howread{font-size:12px;color:var(--muted);margin-top:6px}

/* code + functional examples + tabs */
.ex{margin:16px 0;border:1px solid var(--border);border-radius:var(--radius-sm);overflow:hidden}
.ex-tabs{display:flex;gap:0;background:var(--surface-2);border-bottom:1px solid var(--border)}
.ex-tabs label{padding:8px 14px;font-size:12.5px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent}
.ex input[type=radio]{position:absolute;opacity:0;pointer-events:none}
.ex-pane{display:none;padding:0}
.ex .pane-functional{padding:14px}
pre.code{margin:0;background:var(--code-bg);color:var(--code-ink);padding:14px 16px;overflow-x:auto;font-family:var(--font-mono);font-size:12.8px;line-height:1.6}
pre.code .cm{color:#7f88b3}
.code-path{font-size:11px;color:var(--faint);padding:7px 14px;background:var(--surface-2);border-bottom:1px solid var(--border);font-family:var(--font-mono)}
.copy{float:right;border:1px solid var(--border-strong);background:var(--surface);color:var(--muted);font:inherit;font-size:11px;padding:2px 8px;border-radius:6px;cursor:pointer}
/* which tab is active */
.ex input.t-functional:checked ~ .ex-tabs label[for$="-fn"],
.ex input.t-code:checked ~ .ex-tabs label[for$="-code"]{color:var(--accent);border-bottom-color:var(--accent)}
.ex input.t-functional:checked ~ .pane-functional{display:block}
.ex input.t-code:checked ~ .pane-code{display:block}

/* walkthrough / taxonomy / scenario */
.walk{counter-reset:step;margin:14px 0}
.walk .step{display:flex;gap:12px;padding:8px 0}
.walk .step .n{counter-increment:step;flex:none;width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700}
.walk .step .n::before{content:counter(step)}
.scn{border:1px dashed var(--border-strong);border-radius:var(--radius-sm);padding:12px 14px;margin:14px 0;font-size:13.5px}
.scn .ask{font-weight:600}.scn .imp{color:var(--muted);margin-top:4px}
.tax{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:14px 0}
.tax .grp{border:1px solid var(--border);border-radius:var(--radius-sm);padding:11px 13px;background:var(--surface-2)}
.tax .grp h4{margin:0 0 6px;font-size:13px}
.tax .grp ul{margin:0;padding-left:16px;font-size:12.5px;color:var(--ink-soft)}

/* quiz */
.quiz{border:1px solid var(--accent);border-radius:var(--radius-sm);background:var(--accent-weak);padding:14px;margin:18px 0}
.quiz .q{font-weight:600;margin-bottom:9px}
.quiz .opt{display:block;width:100%;text-align:left;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:13.5px;padding:9px 12px;border-radius:8px;margin:5px 0;cursor:pointer}
.quiz .opt:hover{border-color:var(--accent)}
.quiz .opt.correct{border-color:var(--ok);background:var(--ok-weak)}
.quiz .opt.wrong{border-color:var(--danger);background:var(--danger-weak)}
.quiz .reveal{border:none;background:var(--accent);color:#fff;font:inherit;font-size:13px;padding:7px 14px;border-radius:8px;cursor:pointer;margin-top:8px}
.quiz .answer{display:none;margin-top:10px;font-size:13.5px;color:var(--ink-soft);border-top:1px solid var(--border-strong);padding-top:10px}
.quiz.revealed .answer{display:block}

/* go-deeper progressive disclosure */
.deeper-toggle{border:1px dashed var(--border-strong);background:transparent;color:var(--accent);font:inherit;font-size:13px;font-weight:600;padding:8px 14px;border-radius:8px;cursor:pointer;margin:10px 0;width:100%}
.deeper{display:none}
.module.show-deeper .deeper{display:block}

/* (i) term button + popover */
.term{border:none;background:transparent;color:inherit;font:inherit;cursor:pointer;border-bottom:1.5px dotted var(--accent);padding:0;white-space:nowrap}
.term .i{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;font-size:9px;font-weight:700;color:#fff;background:var(--accent);border-radius:50%;margin-left:3px;vertical-align:super;line-height:1}
.term-chip{border:1px solid var(--border-strong);background:var(--surface-2);color:var(--ink-soft);font:inherit;font-size:12px;padding:3px 9px 3px 10px;border-radius:99px;cursor:pointer}
.term-chip .i{font-size:9px;margin-left:5px}
#popover{position:fixed;z-index:60;max-width:300px;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius-sm);box-shadow:var(--shadow);padding:12px 14px;font-size:13px;display:none}
#popover.on{display:block}
#popover .pt{font-weight:700;margin-bottom:3px}
#popover .px{font-size:10.5px;color:var(--accent);text-transform:uppercase;letter-spacing:.04em}
#popover .pn{color:var(--ink-soft)}
#popover .ptech{margin-top:7px;padding-top:7px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
#popover .psrc{margin-top:7px;font-size:11px;color:var(--faint)}

/* synthesis + citations */
.synth{margin:34px 0;border:1px solid var(--accent);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);padding:22px}
.synth h2{font-size:20px;margin:0 0 8px}
.checklist{list-style:none;padding:0;margin:12px 0}
.checklist li{padding:7px 0;border-bottom:1px solid var(--border);font-size:14px;display:flex;gap:9px}
.checklist li::before{content:"☐";color:var(--accent)}
.capstone{margin-top:14px;background:var(--accent-weak);border-radius:var(--radius-sm);padding:13px 15px;font-size:14px}
.cites{margin-top:30px;font-size:12.5px;color:var(--muted);border-top:1px solid var(--border);padding-top:14px}
.cites h3{font-size:13px;color:var(--ink)}
.cites ol{padding-left:18px}

/* whats-new */
.whatsnew{border:1px solid var(--info);background:var(--info-weak);border-radius:var(--radius-sm);padding:12px 15px;margin:18px 0;font-size:13.5px}
.whatsnew .lab{font-weight:700;color:var(--info);font-size:11px;text-transform:uppercase;letter-spacing:.04em}

/* ---- richer mental-map cards (what / relevance) ---- */
.map-node .mn-what{font-size:12.5px;color:var(--ink-soft);margin-top:5px;line-height:1.5}
.map-node .mn-rel{font-size:11.5px;color:var(--muted);margin-top:7px;border-top:1px dashed var(--border-strong);padding-top:6px;line-height:1.5}
.map-node .mn-rel-lab{display:block;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin-bottom:2px}

/* ---- in-lesson content toggles (top bar) ---- */
.toggle-group{display:flex;gap:6px;flex-wrap:wrap}
.tbtn.toggle{font-size:12px;padding:5px 10px}
.tbtn.toggle[aria-pressed="true"]{background:var(--accent);color:#fff;border-color:var(--accent)}
.tbtn.toggle[aria-pressed="false"]{opacity:.62}
body.hide-concept .b-concept{display:none!important}
body.hide-funcex .b-funcex{display:none!important}
body.hide-code .b-code{display:none!important}

/* ---- syntax breakdown (revealed by "Explain syntax") ---- */
.syntax-panel{display:none;margin:10px 0 0;border:1px solid var(--border);border-left:3px solid var(--accent);border-radius:0 var(--radius-sm) var(--radius-sm) 0;background:var(--surface-2);padding:11px 14px}
body.show-syntax .syntax-panel{display:block}
.syntax-panel .sp-h{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);margin-bottom:7px}
.syntax-panel dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:13px}
.syntax-panel dt{margin:0}
.syntax-panel dt code{font-size:12px;background:var(--accent-weak);color:var(--accent-2);padding:1px 6px;border-radius:6px;white-space:nowrap}
.syntax-panel dd{margin:0;color:var(--ink-soft)}

/* ---- interactive visual blocks (scatter / slider / stepped) ---- */
.viz{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow);padding:16px;margin:16px 0}
.viz .viz-cap{font-size:13.5px;color:var(--muted);margin:0 0 12px}
.viz-body{min-height:36px}
.viz-controls{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.viz-qbtn{border:1px solid var(--border-strong);background:transparent;color:var(--accent);font:inherit;font-size:12.5px;padding:5px 11px;border-radius:8px;cursor:pointer}
.viz-qbtn.sel{background:var(--accent);color:#fff;border-color:var(--accent)}
.viz-scatter-grid{display:grid;grid-template-columns:1fr 200px;gap:14px;align-items:start}
.viz svg.scatter{width:100%;border:1px solid var(--border);border-radius:10px;background:var(--surface-2)}
.viz-near{margin:0;padding-left:18px;font-size:13px;color:var(--ink-soft)}
.viz-near-lab{font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.viz-slider-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.viz-slider-row input[type=range]{accent-color:var(--accent);flex:1;min-width:160px}
.viz-readout{font-size:14px}.viz-readout b{color:var(--accent-2)}
.viz-stop-note{margin-top:10px;font-size:13.5px;color:var(--ink-soft);background:var(--accent-weak);border-radius:var(--radius-sm);padding:10px 13px}
.viz-stop-note .vsn-label{font-weight:700;color:var(--accent-2)}
.viz-steps-nav{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.viz-step-btn{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink-soft);font:inherit;font-size:12.5px;padding:6px 11px;border-radius:8px;cursor:pointer;display:flex;gap:6px;align-items:center}
.viz-step-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.viz-step-btn .vsb-n{font-weight:700}
.viz-step-detail{font-size:14px;color:var(--ink-soft);border-left:3px solid var(--accent);background:var(--surface-2);border-radius:0 var(--radius-sm) var(--radius-sm) 0;padding:12px 15px}
.viz-step-detail h4{margin:0 0 5px;font-size:15px;color:var(--ink)}
@media(max-width:560px){.viz-scatter-grid{grid-template-columns:1fr}}

/* ---- provenance banner (shown when the learner uploaded documents) ---- */
.provenance{display:flex;gap:11px;align-items:flex-start;margin:18px 0;padding:13px 16px;border:1px solid var(--accent);background:var(--accent-weak);border-radius:var(--radius-sm);font-size:13.5px;color:var(--ink-soft)}
.provenance .prov-star{color:var(--accent);font-size:16px;line-height:1.3;flex:none}
.provenance strong{color:var(--accent-2)}
.cites li.src-upload{color:var(--accent-2);font-weight:500}

/* ---- progressive build: "building…" placeholder + nav status ---- */
.building{display:flex;align-items:center;gap:9px;margin:16px 0;padding:13px 15px;border:1px dashed var(--border-strong);border-radius:var(--radius-sm);background:var(--surface-2);color:var(--muted);font-size:13.5px}
.bspin{flex:none;width:13px;height:13px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent);animation:bspin .8s linear infinite}
@keyframes bspin{to{transform:rotate(360deg)}}
.building.failed{border-style:solid;border-color:var(--danger);color:var(--danger);cursor:pointer}
.building.failed .bspin{display:none}
.navitem .ni-status{flex:none;width:7px;height:7px;border-radius:50%;background:transparent;margin-left:auto}
.navitem.building .ni-status{background:var(--warn);animation:pulse 1.1s infinite}
.navitem.failed .ni-status{background:var(--danger);animation:none}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* ===== 27-combo visibility gates (no JS) ===== */
body[data-depth="conceptual"] .needs-technical{display:none}
body[data-depth="technical"] .needs-conceptual{display:none}
body[data-examples="functional"] .needs-code{display:none}
body[data-examples="code"] .needs-functional{display:none}
body[data-level="advanced"] .lvl-beginner-only{display:none}
body[data-level="beginner"] .lvl-advanced-only{display:none}

@media print{
  .topbar,.tbtn,.copy,.deeper-toggle,.map-node .mn-go{display:none!important}
  .deeper{display:block!important}.quiz .answer{display:block!important}
  .syntax-panel{display:block!important}
  .ex-pane{display:block!important}.module{break-inside:avoid;box-shadow:none}
}
@media (max-width:560px){.dcall{grid-template-columns:1fr}.module-head h2{font-size:20px}}
`;
