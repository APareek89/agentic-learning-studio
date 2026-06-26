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
/* ---- Wizbit theme: SAME blue palette as the host app (styles.css) + Plus Jakarta
   Sans, so lessons match the rest of the app. Only token VALUES + font families
   change vs the original theme; every component rule, the 27-combo gates,
   horizontal mode and diagrams are untouched. Fonts have system fallbacks so an
   OFFLINE lesson still renders without the CDN. ---- */
:root{
  --accent:#2563eb; --accent-2:#1d4ed8; --accent-weak:#e8efff;
  --ink:#0f1729; --ink-soft:#27324a; --muted:#56607a; --faint:#8893ab;
  --bg:#f5f8ff; --surface:#ffffff; --surface-2:#f9fbff;
  --border:#e3e9f5; --border-strong:#d0d9ee;
  --ok:#1d9e75; --ok-weak:#e6f6ef; --warn:#b9770a; --warn-weak:#fbf1de;
  --danger:#d2433a; --danger-weak:#fcebea; --info:#2563eb; --info-weak:#e8efff;
  --code-bg:#0b1228; --code-ink:#e7ecff;
  --radius:14px; --radius-sm:9px; --measure:780px;
  --font-body:"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --font-head:"Plus Jakarta Sans",ui-sans-serif,system-ui,sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --shadow:0 1px 2px rgba(15,23,41,.05),0 10px 30px rgba(37,99,235,.08);
}
[data-theme="dark"]{
  --ink:#eaf0ff; --ink-soft:#c8d2ea; --muted:#9aa6c4; --faint:#76829f;
  --bg:#0a0f1f; --surface:#121829; --surface-2:#161d31;
  --border:#222a44; --border-strong:#313b5c; --accent-weak:#142149;
  /* semantic "weak" fills must flip in dark too, else callouts + quiz states render as
     light boxes with invisible (light-on-light) text. Dark tints matched to the blk-* set. */
  --info-weak:#142149; --ok-weak:#0e2419; --warn-weak:#241d0f; --danger-weak:#2a1416;
  --code-bg:#070b18; --shadow:0 1px 2px rgba(0,0,0,.3),0 12px 34px rgba(0,0,0,.5);
  /* Emphasis text + inline code use --accent-2; the light-theme dark-blue (#1d4ed8) is
     low-contrast on a dark background, so lift it to a light, readable blue in dark mode. */
  --accent-2:#9db8ff;
}
/* Dark mode: accent-colored TEXT must read light on dark. (--accent itself stays saturated
   so filled chips/buttons — the "(i)" badge, Reveal, active nav number, "Open →" — keep
   readable white text.) */
[data-theme="dark"] a,
[data-theme="dark"] .eyebrow,
[data-theme="dark"] .deeper-toggle,
[data-theme="dark"] .hx-see,
[data-theme="dark"] .ov-covers li::before{color:#7aa2ff}
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

/* Make the hidden attribute authoritative (author #overview/#workbench rules below
   would otherwise override the UA [hidden] rule and break the overview↔workbench swap). */
[hidden]{display:none!important}

/* ===== Overview = a comfortable, FLEXIBLE screen — concept/process map + a short
   "what you'll cover" summary =====
   It FILLS the viewport and stays on one screen when it fits, but FLOWS (the page scrolls)
   instead of clipping/cramming when the content is genuinely tall (e.g. a 5-card map + the
   covers list on a short window). Uses min-height (not a hard height) + natural overflow so the
   blocks always get their room and the layout adjusts. Scoped to :not([hidden]). */
#overview:not([hidden]){min-height:calc(100dvh - 54px);display:flex;flex-direction:column}
/* width:100% so the auto side-margins don't shrink the shell to content width. */
#overview .shell{flex:1;width:100%;display:flex;flex-direction:column;padding:16px 26px 24px}
#overview .hero{flex:none;padding:2px 0 0}
#overview .hero h1{font-size:25px;margin:.05em 0 .1em}
#overview .thesis{font-size:14.5px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#overview .meta-line{margin-top:6px;font-size:12.5px}
#overview .ov-hint{flex:none;margin:12px 0 0;font-size:12.5px}
/* the map takes the available space and centres its cards; flex 1 1 auto so it GROWS for tall
   content rather than clipping. A generous min-height keeps the cards roomy when space is tight. */
#overview .map{flex:1 1 auto;min-height:320px;display:flex;flex-direction:column;margin:14px 0 0;padding:18px}
#overview .map h2{font-size:14px}
#overview .map .cap{margin:0 0 10px}
#overview .map-body{flex:1;display:flex;align-items:center;justify-content:center;padding:6px 0}
#overview .map-path,#overview .map-concept,#overview .map-options{width:100%;justify-content:center;align-content:center;align-items:stretch;}
/* roomier squares so the cards aren't cramped; scale down on narrower windows */
#overview .map .map-node{width:clamp(162px,14.5vw,204px)}
@media(max-width:1100px){ #overview .map .map-node{width:clamp(150px,22vw,204px)} }
@media(max-width:820px){
  #overview .map-body{align-items:flex-start}
  #overview .map .map-node{width:clamp(150px,44vw,204px)}
}
/* "This lesson will cover" — a compact ≤4-bullet summary below the map. */
#overview .ov-covers{flex:none;margin:14px 0 0;border-top:1px solid var(--border);padding-top:12px}
.ov-covers .ovc-h{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--faint);font-weight:700;margin:0 0 8px}
.ov-covers ul{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:6px 26px}
.ov-covers li{font-size:13px;color:var(--ink-soft);line-height:1.4;padding-left:18px;position:relative}
.ov-covers li::before{content:"✓";position:absolute;left:0;top:0;color:var(--accent);font-weight:800;font-size:11px}
@media(max-width:820px){ .ov-covers ul{grid-template-columns:1fr} }

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
/* VS Code "Dark+" syntax tokens (the code surface is always dark in both themes). */
pre.code .tk-c{color:#6a9955;font-style:italic}
pre.code .tk-s{color:#ce9178}
pre.code .tk-k{color:#569cd6}
pre.code .tk-n{color:#b5cea8}
pre.code .tk-f{color:#dcdcaa}
pre.code .tk-t{color:#4ec9b0}
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
.synth-lead{margin:6px 0 8px;color:var(--ink-soft)}
.recap-list{margin:8px 0 6px;padding-left:20px}
.recap-list li{margin:7px 0;font-size:14.5px}
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

/* ===== Phase 2 — colored block types (break the monotony of text) ===== */
.blk-explain{background:linear-gradient(180deg,var(--surface) 0%,var(--surface) 100%);border-left:3px solid var(--accent)}
.blk-example{background:#fff8ec;border-left:3px solid #f0a92b}
[data-theme="dark"] .blk-example{background:#241d0f}
.blk-code{background:#eef4ff;border-left:3px solid var(--accent-2)}
[data-theme="dark"] .blk-code{background:#0e1733}
.blk-check{background:#f0fbf5;border-left:3px solid var(--ok)}
[data-theme="dark"] .blk-check{background:#0e2419}
.block.blk-explain,.block.blk-example,.block.blk-code,.block.blk-check{border-radius:12px;padding:14px 16px;margin:14px 0}

/* "In plain words" analogy callout */
.analogy{background:var(--accent-weak);border-radius:10px;padding:9px 12px;margin:2px 0 10px;font-size:14.5px;color:var(--ink-soft)}
.analogy .an-lab{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);margin-bottom:2px}
body[data-level="advanced"] .analogy,body[data-level="advanced"] .mn-layman{display:none}

/* Collapsible example/code (keep landing light on text) */
.collapse{margin:6px 0}
.collapse-h{display:flex;align-items:center;gap:9px;width:100%;text-align:left;border:1px dashed var(--border-strong);background:transparent;color:var(--ink-soft);font:inherit;font-size:13.5px;font-weight:600;padding:9px 12px;border-radius:9px;cursor:pointer}
.collapse-h:hover{border-color:var(--accent);color:var(--accent-2)}
.collapse-h .col-ico{font-family:var(--font-mono)}
.collapse-h .col-chev{margin-left:auto;transition:transform .15s}
.collapse.open .collapse-h .col-chev{transform:rotate(90deg)}
.collapse-body{display:none;padding-top:10px}
.collapse.open .collapse-body{display:block;animation:fadein .25s ease}
@keyframes fadein{from{opacity:0;transform:translateY(4px)}to{opacity:1}}

/* Knowledge check */
.kc h3{margin:.1em 0 .4em}
.kc-intro{color:var(--muted);font-size:14px;margin:0 0 12px}
.kc-score{font-size:13px;color:var(--ok);font-weight:600;margin-bottom:10px}
.kc-item{border-top:1px solid var(--border);padding:13px 0}
.kc-item:first-of-type{border-top:none}
.kc-q{font-weight:600;font-size:14.5px;margin-bottom:9px;display:flex;gap:8px}
.kc-n{flex:none;background:var(--ok);color:#fff;font-size:11px;font-weight:700;border-radius:6px;padding:1px 7px;height:fit-content}
.kc-opts{display:flex;flex-direction:column;gap:7px}
.kc-opt{text-align:left;border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:14px;padding:9px 12px;border-radius:9px;cursor:pointer;transition:border-color .12s,background .12s}
.kc-opt:hover{border-color:var(--accent)}
.kc-opt.correct{border-color:var(--ok);background:var(--ok-weak);color:#0f6e4f}
.kc-opt.wrong{border-color:var(--danger);background:var(--danger-weak);color:var(--danger)}
.kc-opt[disabled]{cursor:default;opacity:.85}
.kc-free{display:flex;flex-direction:column;gap:8px}
.kc-input{border:1px solid var(--border-strong);border-radius:9px;font:inherit;font-size:14px;padding:9px 11px;resize:vertical;background:var(--surface);color:var(--ink)}
.kc-input:focus{outline:none;border-color:var(--accent)}
.kc-submit{align-self:flex-start;border:none;background:var(--accent);color:#fff;font:inherit;font-size:13px;font-weight:600;padding:7px 15px;border-radius:9px;cursor:pointer}
.kc-submit[disabled]{opacity:.6;cursor:default}
.kc-feedback{font-size:13.5px;font-weight:600;margin-bottom:8px;padding:8px 11px;border-radius:8px}
.kc-feedback.ok{background:var(--ok-weak);color:#0f6e4f}
.kc-feedback.no{background:var(--danger-weak);color:var(--danger)}
.kc-feedback.grading{background:var(--accent-weak);color:var(--accent-2)}
.kc-explain{font-size:13.5px;color:var(--muted);margin-top:9px;padding-left:11px;border-left:2px solid var(--border-strong)}
/* Tier-A retention: recall-first gate, confidence calibration, source link */
.kc-recall{display:flex;flex-direction:column;gap:8px;margin-bottom:4px}
.kc-recall-input{border:1px dashed var(--border-strong);border-radius:9px;font:inherit;font-size:14px;padding:9px 11px;resize:vertical;background:var(--surface);color:var(--ink)}
.kc-recall-input:focus{outline:none;border-color:var(--accent)}
.kc-recall-done{align-self:flex-start;border:1px solid var(--accent);background:var(--accent-weak,transparent);color:var(--accent-2,var(--accent));font:inherit;font-size:13px;font-weight:600;padding:6px 13px;border-radius:9px;cursor:pointer}
.kc-recall-done[disabled]{opacity:.55;cursor:default}
.kc-recall.done .kc-recall-input{opacity:.7}
.kc-confidence{display:flex;flex-wrap:wrap;align-items:center;gap:7px;margin-bottom:9px}
.kc-conf-lab{font-size:12.5px;color:var(--muted);font-weight:600;margin-right:2px}
.kc-conf{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-size:12.5px;padding:5px 11px;border-radius:999px;cursor:pointer;transition:border-color .12s,background .12s}
.kc-conf:hover{border-color:var(--accent)}
.kc-conf.sel{border-color:var(--accent);background:var(--accent-weak,var(--surface));color:var(--accent-2,var(--accent));font-weight:600}
.kc-source{display:inline-block;margin-top:8px;border:none;background:none;color:var(--accent-2,var(--accent));font:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0}
.kc-source:hover{text-decoration:underline}

/* Scroll-reveal — blocks ease in as you reach them */
.reveal{opacity:0;transform:translateY(10px);transition:opacity .45s ease,transform .45s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}

/* Module head icon + reading time */
.module-head{display:flex;gap:13px;align-items:flex-start}
.module-head .m-ico{flex:none;width:42px;height:42px;display:flex;align-items:center;justify-content:center;font-size:22px;background:var(--accent-weak);border-radius:11px}
.module-head .mh-text{min-width:0}
.m-time{font-size:12px;color:var(--muted);margin-top:4px}

/* Course recap card (overview top, lessons 2..N) */
.recap{background:var(--accent-weak);border:1px solid var(--border);border-radius:12px;padding:12px 14px;margin:12px 0 0}
.recap-h{font-weight:700;font-size:13px;color:var(--accent-2);margin-bottom:6px}
.recap ul{margin:0;padding-left:18px;font-size:13px;color:var(--ink-soft)}
.recap li{margin:2px 0}

/* ===== Overview = a CONCEPT/PROCESS MAP of uniform SQUARE blocks (advance organizer) =====
   Every block is the same size (aspect-ratio:1). A corner badge (number for an ordered
   process, icon for a concept/option map) sits with its CENTRE on the top-left corner.
   Ordered maps are a left-to-right SEQUENCE joined by animated arrows; conceptual/comparative
   maps are wrapping rows of squares. Card content = headline + short description only. */
.map-body{margin-top:8px}

/* the uniform square block. overflow:visible so the corner badge can sit on the corner;
   the text is clipped inside .mn-body instead, so every square stays the same size. */
.map .map-node{
  position:relative;box-sizing:border-box;
  flex:0 0 auto;width:clamp(150px,15vw,196px);min-width:0;aspect-ratio:1;
  text-align:left;border:1px solid var(--border-strong);background:var(--surface-2);
  border-radius:14px;padding:16px 14px 14px;cursor:pointer;font:inherit;color:var(--ink);
  overflow:visible;transition:border-color .12s,transform .08s,box-shadow .12s;
}
.map .map-node:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow)}
.map .map-node.spine{border-color:var(--accent);border-width:1.5px}
.map .map-node.no-link{cursor:default}
.map .map-node.no-link:hover{transform:none;box-shadow:none}
/* clipped text region fills the square so long text can never grow it past a square */
.map .mn-body{display:flex;flex-direction:column;gap:6px;height:100%;overflow:hidden}
/* corner badge — its CENTRE lands ON the top-left corner of the square */
.map .mn-num,.map .mn-ico{
  position:absolute;top:0;left:0;transform:translate(-42%,-42%);
  width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-weight:800;font-size:14px;box-shadow:0 1px 3px rgba(0,0,0,.18);margin:0;z-index:1;
}
.map .mn-num{background:var(--accent);color:#fff}
.map .mn-ico{background:var(--surface);border:1px solid var(--border-strong);font-size:16px}
.map .map-node.is-start .mn-num{box-shadow:0 0 0 4px var(--accent-weak),0 1px 3px rgba(0,0,0,.18)}
.map .mn-title{font-weight:700;font-size:14px;line-height:1.25;margin-top:2px}
.map .mn-desc{font-size:12px;color:var(--muted);line-height:1.42;
  display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
/* hover-only open cue — absolute so it never resizes the square; a pill backdrop keeps it
   legible over the description's last line */
.map .mn-go{position:absolute;right:9px;bottom:8px;font-size:10.5px;font-weight:700;color:#fff;
  background:var(--accent);border-radius:99px;padding:2px 9px;box-shadow:0 1px 4px rgba(0,0,0,.15);
  opacity:0;transform:translateY(3px);transition:opacity .12s,transform .12s}
.map .map-node:hover .mn-go{opacity:1;transform:none}

/* ordered: ONE non-wrapping row of equal squares joined by animated arrows. Cards flex to
   share the row (min-width:0) so the whole sequence stays on one screen with no scroll. */
.map-path{margin:0;padding:16px 10px 8px;display:flex;flex-wrap:nowrap;align-items:center;justify-content:center;gap:8px}
.map-path .map-node{flex:1 1 0;min-width:0;width:auto;max-width:200px}
.map-conn{flex:none;position:relative;width:clamp(20px,3vw,34px);height:3px;border-radius:2px;
  background:linear-gradient(90deg,var(--border-strong),var(--accent));overflow:visible}
.map-conn::after{content:"";position:absolute;right:-1px;top:50%;transform:translateY(-50%);
  border-left:7px solid var(--accent);border-top:4px solid transparent;border-bottom:4px solid transparent}
.map-conn .spark{position:absolute;top:50%;margin-top:-3px;left:0;width:6px;height:6px;border-radius:50%;
  background:var(--accent);box-shadow:0 0 8px 2px var(--accent);animation:flowx 1.8s linear infinite}
@keyframes flowx{0%{left:-4px;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:calc(100% - 4px);opacity:0}}
@media (prefers-reduced-motion:reduce){.map-conn .spark{animation:none;display:none}}

/* conceptual / comparative: wrapping rows of equal squares, centred */
.map-concept,.map-options{display:flex;flex-wrap:wrap;gap:16px 12px;align-items:flex-start;justify-content:center;padding:14px 10px 6px}

/* ===== Spine inside the module ===== */
.m-spine{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:5px}
.m-pos{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--accent-2);background:var(--accent-weak);border-radius:99px;padding:2px 9px}
.m-prev{font-size:12px;color:var(--muted)}
.m-what{font-size:15.5px;color:var(--ink-soft);margin:12px 0 0;line-height:1.5}
.m-rel{margin-top:10px;font-size:13.5px;color:var(--ink-soft);background:var(--surface-2);border-left:3px solid var(--accent);border-radius:0 8px 8px 0;padding:8px 12px}
.m-rel-lab{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--accent-2);margin-bottom:2px}
.next-step{margin-top:20px;border:1px solid var(--accent);background:var(--accent-weak);color:var(--accent-2);font:inherit;font-weight:700;font-size:13.5px;padding:10px 16px;border-radius:10px;cursor:pointer}
.next-step:hover{background:var(--accent);color:#fff}

/* Key terms — subtle attention pulse on hover */
.term-chip,.term{transition:background .15s,color .15s,transform .12s}
.term-chip:hover,.term:hover{transform:translateY(-1px)}

@media print{
  .topbar,.tbtn,.copy,.deeper-toggle,.map-node .mn-go{display:none!important}
  .deeper{display:block!important}.quiz .answer{display:block!important}
  .syntax-panel{display:block!important}.collapse-body{display:block!important}
  .reveal{opacity:1!important;transform:none!important}
  .ex-pane{display:block!important}.module{break-inside:avoid;box-shadow:none}
}
@media (max-width:560px){.dcall{grid-template-columns:1fr}.module-head h2{font-size:20px}}

/* ============================================================================
   HORIZONTAL reading mode — a fixed-viewport paged deck (additive; vertical mode
   never sees these rules). The learner stays on one in-viewport screen the whole
   time; only the left TOC stays put. Heavy blocks open in a modal, not inline.
   ============================================================================ */
.h-mode-tag{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--accent-2);background:var(--accent-weak);border-radius:99px;padding:3px 10px}
/* pages are fixed in the viewport, so force scroll-reveal blocks visible up front */
[data-reading="horizontal"] .reveal{opacity:1!important;transform:none!important}
#hworkbench{display:grid;grid-template-columns:248px 1fr;align-items:stretch}
#hworkbench #blocknav{position:sticky;top:0;align-self:start;max-height:100vh;overflow:auto;border-right:1px solid var(--border);padding:14px 10px;display:flex;flex-direction:column;gap:3px;background:var(--surface)}
.h-stage{position:relative;overflow:hidden;height:100dvh;display:flex;flex-direction:column}
.hx-tools{display:flex;align-items:center;gap:8px}
.hx-tools .progress{width:84px;height:6px;border-radius:999px;background:var(--bg);overflow:hidden;flex:none}
.hx-tools .progress i{display:block;height:100%;background:var(--accent);border-radius:999px}
.h-track{display:flex;height:100%;transition:transform .38s cubic-bezier(.4,0,.2,1);will-change:transform}
@media (prefers-reduced-motion:reduce){.h-track{transition:none}}
.h-page{flex:0 0 100%;width:100%;height:100%;display:flex;flex-direction:column;min-width:0}
.h-page-body{flex:1 1 auto;min-height:0;overflow-y:auto;padding:24px 40px;width:100%;max-width:1000px;margin:0 auto}
.h-page-body .block p,.h-page-body .block ul,.h-page-body .block ol,.h-page-body .module-body>p{max-width:760px}
.h-page .h-next{flex:none;align-self:flex-end;margin:8px 40px 18px auto;border:1px solid var(--accent);background:var(--accent);color:#fff;font:inherit;font-weight:700;font-size:13.5px;padding:10px 20px;border-radius:10px;cursor:pointer}
.h-page .h-next:hover{filter:brightness(1.06)}
/* the module's own "Next" (.next-step from moduleInner) sits inside the body and advances the deck */
.h-page .next-step{display:inline-block}
/* in horizontal mode a collapsible advertises that it opens in a modal */
[data-reading="horizontal"] .collapse-h .col-chev{transform:none;font-size:0}
[data-reading="horizontal"] .collapse-h .col-chev::after{content:"⤢ open";font-size:12px;color:var(--accent-2);font-weight:700}
[data-reading="horizontal"] .collapse-body{display:none!important}

/* modal that heavy/expandable blocks open into (examples, code, "go deeper") */
.hmodal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;background:rgba(8,12,24,.55);padding:24px}
.hmodal[hidden]{display:none}
.hmodal-card{position:relative;background:var(--surface);border:1px solid var(--border-strong);border-radius:var(--radius);box-shadow:var(--shadow);width:100%;max-width:780px;max-height:86vh;overflow:auto;padding:22px 24px}
.hmodal-x{position:absolute;top:12px;right:14px;border:1px solid var(--border-strong);background:var(--surface);color:var(--muted);font:inherit;font-size:18px;line-height:1;width:30px;height:30px;border-radius:8px;cursor:pointer}
.hmodal-x:hover{border-color:var(--accent);color:var(--accent-2)}
.hmodal-title{font-family:var(--font-head);font-weight:700;font-size:17px;margin:0 40px 14px 0;color:var(--ink)}
.hmodal-body .collapse-body,.hmodal-body .deeper{display:block!important}
.hmodal-body .deeper-toggle{display:none}
.kc-pending .kc-intro{color:var(--muted)}

/* ---- horizontal v2: left = lesson modules; right = the active module's TABS ---- */
.hx-head{display:flex;align-items:center;gap:12px;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--surface);flex:none}
.hx-eyebrow{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--accent-2)}
.hx-title{font-family:var(--font-head);font-weight:700;font-size:18px;letter-spacing:-.01em;line-height:1.2}
.hx-grow{flex:1}
.hx-pos{display:flex;align-items:center;gap:5px}
.hx-d{width:7px;height:7px;border-radius:50%;background:var(--border-strong)}
.hx-d.on{background:var(--accent);width:18px;border-radius:999px}
.hx-poslab{font-size:12px;color:var(--muted);font-weight:600;margin-left:4px}
.hx-nav{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font:inherit;font-weight:600;font-size:13px;padding:7px 14px;border-radius:10px;cursor:pointer}
.hx-nav[hidden]{display:none}
.hx-next{border-color:var(--accent);color:var(--accent-2);background:var(--accent-weak);animation:hxpulse 1.2s ease-in-out infinite}
.hx-next:hover{filter:brightness(1.03)}
@keyframes hxpulse{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,0)}50%{box-shadow:0 0 0 4px rgba(37,99,235,.14)}}
@media (prefers-reduced-motion:reduce){.hx-next{animation:none}}
.hx-panes{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column}
.hx-mod{flex:1;min-height:0;display:flex;flex-direction:column}
.hx-mod.hidden,.hx-tab.hidden{display:none}
.hx-tab{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:14px;padding:20px 28px}
.hx-concept,.hx-examples{width:100%;max-width:1040px;margin-left:auto;margin-right:auto}
.hx-concept{flex:none}
.hx-concept>.block:first-child{margin-top:0}
.hx-examples{flex:1 1 auto;display:grid;grid-template-columns:1fr 1fr;gap:14px;min-height:200px}
.hx-examples.one{grid-template-columns:1fr}
.hx-ex{border:1px solid var(--border-strong);border-radius:12px;background:var(--surface);display:flex;flex-direction:column;overflow:hidden;min-height:0}
.hx-exh{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--border);flex:none}
.hx-ic{width:19px;height:19px;border-radius:6px;background:var(--accent-weak);color:var(--accent-2);display:grid;place-items:center;font-size:11px}
.hx-t{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.hx-exc{flex:1;padding:12px 14px;position:relative;overflow:hidden;min-height:0}
.hx-exc>.block{margin:0}
.hx-fade{position:absolute;left:0;right:0;bottom:0;height:46px;background:linear-gradient(transparent,var(--surface) 80%);pointer-events:none}
.hx-exf{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;border-top:1px solid var(--border);flex:none}
.hx-ell{color:var(--muted);font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em}
.hx-see{border:1px solid var(--accent);background:transparent;color:var(--accent-2);font:inherit;font-weight:600;font-size:12.5px;padding:6px 13px;border-radius:9px;cursor:pointer}
.hx-see:hover{background:var(--accent-weak)}

@media (max-width:820px){
  #hworkbench{grid-template-columns:1fr}
  #hworkbench #blocknav{position:static;flex-direction:row;flex-wrap:nowrap;overflow-x:auto;max-height:none;border-right:none;border-bottom:1px solid var(--border);gap:6px;padding:10px}
  #hworkbench #blocknav .navitem{flex:0 0 auto}
  .h-stage{height:calc(100dvh - 112px)}
  .hx-head{padding:10px 16px}
  .hx-tab{padding:14px 16px}
  .hx-examples{grid-template-columns:1fr}
}
`;
