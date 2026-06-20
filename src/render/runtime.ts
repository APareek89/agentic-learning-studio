/**
 * # Artifact runtime — the ONE inline script every generated page carries
 *
 * Hand-written and tested once; the model never writes JavaScript. A single
 * delegated click handler powers everything:
 *   - mental-map node / nav button → enter the WORKBENCH and show that block
 *   - "← Overview"                 → return to the overview (mental map)
 *   - `.term` / `.term-chip`       → open the (i) soft popover
 *   - `.deeper-toggle`             → progressive disclosure ("Go deeper")
 *   - `.quiz .opt` / `.reveal`     → self-check scoring + answer reveal
 *   - `#theme`                     → light/dark toggle (persisted)
 *   - `.copy`                      → copy a code block (with fallback)
 * Plus a progress bar driven by how many building blocks you've opened.
 */

export const RUNTIME_JS = String.raw`
(function(){
  "use strict";
  var glossary = {};
  try { glossary = JSON.parse(document.getElementById("glossary-data").textContent || "{}"); } catch(e){}
  var depth = document.body.getAttribute("data-depth") || "conceptual_technical";
  var showTech = depth.indexOf("technical") !== -1;
  var pop = document.getElementById("popover");

  function lsGet(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }
  function lsSet(k,v){ try { localStorage.setItem(k,v); } catch(e){} }

  // ---- theme ----
  function applyTheme(t){ document.body.setAttribute("data-theme", t); document.documentElement.setAttribute("data-theme", t); var b=document.getElementById("theme"); if(b) b.textContent = t==="dark" ? "☀ Light" : "☾ Dark"; }
  applyTheme(lsGet("als-theme") || "light");

  // ---- progress (which building blocks have been opened) ----
  var moduleIds = Array.prototype.map.call(document.querySelectorAll(".navitem:not(.nav-special)"), function(b){ return b.getAttribute("data-goto"); });
  var total = moduleIds.length || 1;
  var visited = {};
  function markVisited(id){ if(moduleIds.indexOf(id) !== -1 && !visited[id]){ visited[id]=1; setProgress(); } }
  function setProgress(){ var n=Object.keys(visited).length; var bar=document.querySelector(".progress > i"); if(bar) bar.style.width = Math.round(n/total*100)+"%"; }

  // ---- overview <-> workbench ----
  function enterWorkbench(id){
    var ov=document.getElementById("overview"), wb=document.getElementById("workbench"), back=document.getElementById("to-overview");
    if(ov) ov.hidden=true; if(wb) wb.hidden=false; if(back) back.hidden=false;
    activatePanel(id);
    window.scrollTo(0,0);
  }
  function showOverview(){
    var ov=document.getElementById("overview"), wb=document.getElementById("workbench"), back=document.getElementById("to-overview");
    if(ov) ov.hidden=false; if(wb) wb.hidden=true; if(back) back.hidden=true;
    closePopover(); window.scrollTo(0,0);
  }
  function activatePanel(id){
    var found=false;
    document.querySelectorAll(".panel").forEach(function(p){ var on = p.getAttribute("data-panel")===id; p.classList.toggle("active", on); if(on) found=true; });
    document.querySelectorAll(".navitem").forEach(function(b){ b.classList.toggle("active", b.getAttribute("data-goto")===id); });
    if(found) markVisited(id);
    var main=document.getElementById("blockmain"); if(main) main.scrollTop=0;
  }

  // ---- term popover ----
  function openPopover(btn){
    var t = glossary[btn.getAttribute("data-term")];
    if(!t){ return; }
    var tech = (showTech && t.technicalNote) ? '<div class="ptech">'+esc(t.technicalNote)+'</div>' : '';
    var acr = t.acronymExpansion ? '<div class="px">'+esc(t.acronymExpansion)+'</div>' : '';
    var src = (t.sources && t.sources.length) ? '<div class="psrc">Source: '+esc(t.sources.join(", "))+'</div>' : '';
    pop.innerHTML = '<div class="pt">'+esc(t.label)+'</div>'+acr+'<div class="pn">'+esc(t.laymanDefinition)+'</div>'+tech+src;
    pop.classList.add("on");
    var r = btn.getBoundingClientRect();
    var top = r.bottom + 8, left = Math.min(r.left, window.innerWidth - 320);
    if(top + pop.offsetHeight > window.innerHeight) top = r.top - pop.offsetHeight - 8;
    pop.style.top = Math.max(8, top) + "px";
    pop.style.left = Math.max(8, left) + "px";
  }
  function closePopover(){ pop.classList.remove("on"); pop._for=null; }

  function copyCode(btn){
    var pre = btn.parentElement.querySelector("pre.code"); if(!pre) return;
    var txt = pre.innerText;
    if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(function(){flash(btn);}); }
    else { var ta=document.createElement("textarea"); ta.value=txt; document.body.appendChild(ta); ta.select(); try{document.execCommand("copy");}catch(e){} document.body.removeChild(ta); flash(btn); }
  }
  function flash(btn){ var o=btn.textContent; btn.textContent="Copied"; setTimeout(function(){btn.textContent=o;},1200); }
  function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  // ---- one delegated click handler ----
  document.addEventListener("click", function(ev){
    var t = ev.target.closest("[data-deepdive],[data-goto],#to-overview,.term,.term-chip,.deeper-toggle,.quiz .opt,.quiz .reveal,#theme,.copy,.toggle,.building,.collapse-h,.kc-opt,.kc-submit");
    if(!t){ if(!ev.target.closest("#popover")) closePopover(); return; }

    if(t.matches(".collapse-h")){ var col=t.closest(".collapse"); var open=col.classList.toggle("open"); t.setAttribute("aria-expanded", String(open)); return; }
    if(t.matches(".kc-opt")){ kcAnswerMcq(t); return; }
    if(t.matches(".kc-submit")){ kcAnswerFree(t); return; }

    if(t.matches("[data-deepdive],[data-goto]")){ ev.preventDefault(); var gid=t.getAttribute("data-deepdive")||t.getAttribute("data-goto"); enterWorkbench(gid); if(isStub(gid)) prioritize(gid); return; }
    if(t.matches(".building")){ var bp_=t.closest(".panel[data-module]"); if(bp_){ var mid=bp_.getAttribute("data-module"); t.classList.remove("failed"); t.innerHTML='<span class="bspin"></span> Building this section…'; prioritize(mid); } return; }
    if(t.id==="to-overview"){ showOverview(); return; }
    if(t.matches(".term,.term-chip")){ ev.preventDefault(); ev.stopPropagation(); if(pop.classList.contains("on") && pop._for===t){ closePopover(); } else { openPopover(t); pop._for=t; } return; }
    if(t.matches(".deeper-toggle")){ var mod=t.closest(".panel"); mod.classList.toggle("show-deeper"); t.textContent = mod.classList.contains("show-deeper") ? "Hide advanced detail" : t.getAttribute("data-label"); return; }
    if(t.matches(".quiz .reveal")){ t.closest(".quiz").classList.add("revealed"); return; }
    if(t.matches(".quiz .opt")){
      var correct = t.getAttribute("data-correct")==="1";
      t.classList.add(correct?"correct":"wrong");
      if(!correct){ var c=t.closest(".quiz").querySelector('.opt[data-correct="1"]'); if(c) c.classList.add("correct"); }
      t.closest(".quiz").classList.add("revealed"); return;
    }
    if(t.id==="theme"){ var cur=document.body.getAttribute("data-theme")==="dark"?"light":"dark"; applyTheme(cur); lsSet("als-theme",cur); return; }
    if(t.matches(".copy")){ copyCode(t); return; }
    // ---- in-lesson content toggles: Concept / Functional / Code / Explain-syntax ----
    if(t.classList.contains("toggle")){
      ev.preventDefault();
      var pressed = t.getAttribute("aria-pressed")==="true";
      if(t.id==="t-concept"){ document.body.classList.toggle("hide-concept", pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      else if(t.id==="t-funcex"){ document.body.classList.toggle("hide-funcex", pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      else if(t.id==="t-code"){ document.body.classList.toggle("hide-code", pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      else if(t.id==="t-syntax"){ document.body.classList.toggle("show-syntax", !pressed); t.setAttribute("aria-pressed", String(!pressed)); }
      return;
    }
  });

  document.addEventListener("keydown", function(e){ if(e.key==="Escape") closePopover(); });
  window.addEventListener("resize", closePopover);

  // ---- knowledge check (grades via /api/check; MCQ vs the stored Blueprint, freeText by LLM) ----
  function kcBumpScore(kc){
    var items=kc.querySelectorAll(".kc-item"), got=0;
    items.forEach(function(it){ if(it.getAttribute("data-result")==="ok") got++; });
    var sc=kc.querySelector(".kc-score"); if(sc){ sc.hidden=false; var b=sc.querySelector("b"); if(b) b.textContent=String(got); }
  }
  function kcShow(item, ok, msg){
    var fb=item.querySelector(".kc-feedback"); if(fb){ fb.hidden=false; fb.className="kc-feedback "+(ok?"ok":"no"); fb.textContent=msg||(ok?"Correct ✓":"Not quite"); }
    var ex=item.querySelector(".kc-explain"); if(ex) ex.hidden=false;
    item.setAttribute("data-result", ok?"ok":"no");
    kcBumpScore(item.closest(".kc"));
  }
  function kcCheck(payload){
    return fetch("/api/check",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)}).then(function(r){ return r.json(); });
  }
  function kcAnswerMcq(btn){
    var item=btn.closest(".kc-item"); if(item.getAttribute("data-done")) return;
    var kc=btn.closest(".kc"), bid=kc.getAttribute("data-block"), qid=btn.getAttribute("data-qid"), choice=+btn.getAttribute("data-choice");
    item.setAttribute("data-done","1");
    item.querySelectorAll(".kc-opt").forEach(function(o){ o.setAttribute("disabled","1"); });
    if(!ARTIFACT_ID){ kcShow(item,true,"Saved (grading needs the live app)."); btn.classList.add("correct"); return; }
    kcCheck({artifactId:ARTIFACT_ID,blockId:bid,questionId:qid,choiceIndex:choice}).then(function(res){
      if(res.correct){ btn.classList.add("correct"); }
      else{ btn.classList.add("wrong"); if(typeof res.correctIndex==="number"){ var c=item.querySelectorAll(".kc-opt")[res.correctIndex]; if(c) c.classList.add("correct"); } }
      kcShow(item,!!res.correct);
    }).catch(function(){ item.removeAttribute("data-done"); item.querySelectorAll(".kc-opt").forEach(function(o){ o.removeAttribute("disabled"); }); });
  }
  function kcAnswerFree(btn){
    var item=btn.closest(".kc-item"), inp=item.querySelector(".kc-input"); if(!inp||!inp.value.trim()) return;
    var kc=btn.closest(".kc"), bid=kc.getAttribute("data-block"), qid=btn.getAttribute("data-qid");
    var fb=item.querySelector(".kc-feedback"); if(fb){ fb.hidden=false; fb.className="kc-feedback grading"; fb.textContent="Grading your answer…"; }
    btn.setAttribute("disabled","1");
    if(!ARTIFACT_ID){ kcShow(item,true,"Saved (grading needs the live app)."); return; }
    kcCheck({artifactId:ARTIFACT_ID,blockId:bid,questionId:qid,text:inp.value.trim()}).then(function(res){
      kcShow(item,!!res.correct,res.feedback||(res.correct?"Correct ✓":"Not quite"));
    }).catch(function(){ btn.removeAttribute("disabled"); if(fb){ fb.className="kc-feedback no"; fb.textContent="Couldn't grade — try again."; } });
  }

  // ---- scroll-reveal: blocks ease in as they enter the viewport ----
  var revObs=null;
  if("IntersectionObserver" in window){
    revObs=new IntersectionObserver(function(entries){ entries.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add("in"); revObs.unobserve(e.target); } }); }, {rootMargin:"0px 0px -8% 0px"});
  }
  function observeReveals(root){
    var els=(root||document).querySelectorAll(".reveal:not(.in)");
    if(!revObs){ els.forEach(function(el){ el.classList.add("in"); }); return; }
    els.forEach(function(el){ revObs.observe(el); });
  }

  // ---- hydrate interactive visual blocks (data-only → live SVG/controls) ----
  function vEsc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function buildScatter(body, data){
    var pts=(data.points||[]), qs=(data.queries||[]);
    if(pts.length<1||qs.length<1){ return; }
    var W=460,H=300,PAD=34;
    function sx(x){ return PAD + (Math.max(0,Math.min(100,x))/100)*(W-2*PAD); }
    function sy(y){ return PAD + (Math.max(0,Math.min(100,y))/100)*(H-2*PAD); }
    body.innerHTML = '<div class="viz-controls">'+qs.map(function(q,i){return '<button class="viz-qbtn'+(i===0?' sel':'')+'" data-qi="'+i+'">'+vEsc(q.label)+'</button>';}).join("")+'</div>'+
      '<div class="viz-scatter-grid"><svg class="scatter" viewBox="0 0 '+W+' '+H+'"></svg><div><div class="viz-near-lab">Nearest matches</div><ol class="viz-near"></ol></div></div>';
    var svg=body.querySelector("svg.scatter"), near=body.querySelector(".viz-near"), maxD=Math.hypot(100,100);
    function draw(qi){
      var q=qs[qi];
      var ranked=pts.map(function(p){return {p:p,d:Math.hypot((p.x||0)-q.x,(p.y||0)-q.y)};}).sort(function(a,b){return a.d-b.d;});
      var nearSet={}; ranked.slice(0,3).forEach(function(r){ nearSet[r.p.label]=1; });
      var h="";
      ranked.slice(0,3).forEach(function(r){ h+='<line x1="'+sx(q.x)+'" y1="'+sy(q.y)+'" x2="'+sx(r.p.x)+'" y2="'+sy(r.p.y)+'" stroke="var(--accent)" stroke-width="1.5" stroke-dasharray="3 3" opacity="0.5"/>'; });
      pts.forEach(function(p){ var on=nearSet[p.label]; h+='<circle cx="'+sx(p.x)+'" cy="'+sy(p.y)+'" r="'+(on?7:5)+'" fill="'+(on?'var(--accent)':'var(--border-strong)')+'" stroke="var(--surface)" stroke-width="2"/><text x="'+(sx(p.x)+9)+'" y="'+(sy(p.y)+4)+'" font-size="10.5" fill="'+(on?'var(--accent-2)':'var(--muted)')+'" font-weight="'+(on?700:500)+'">'+vEsc(p.label)+'</text>'; });
      h+='<text x="'+sx(q.x)+'" y="'+(sy(q.y)+6)+'" font-size="20" text-anchor="middle" fill="var(--accent)">★</text>';
      svg.innerHTML=h;
      near.innerHTML=ranked.slice(0,3).map(function(r){ return '<li>'+vEsc(r.p.label)+' <span style="color:var(--faint)">· '+Math.max(0,1-r.d/maxD).toFixed(2)+'</span></li>'; }).join("");
    }
    body.querySelector(".viz-controls").addEventListener("click", function(e){ var b=e.target.closest(".viz-qbtn"); if(!b)return; body.querySelectorAll(".viz-qbtn").forEach(function(x){x.classList.remove("sel");}); b.classList.add("sel"); draw(+b.getAttribute("data-qi")); });
    draw(0);
  }
  function buildSlider(body, data){
    var min=+data.min, max=+data.max, unit=data.unit||"", stops=(data.stops||[]).slice().sort(function(a,b){return a.at-b.at;});
    if(stops.length<2||!(max>min)){ return; }
    var step=(max-min)/100; if(!(step>0)) step=1;
    body.innerHTML='<div class="viz-slider-row"><span class="viz-readout">'+vEsc(String(min))+'</span><input type="range" min="'+min+'" max="'+max+'" step="'+step+'" value="'+stops[0].at+'"><span class="viz-readout">'+vEsc(String(max))+'</span></div>'+
      '<div class="viz-readout" style="margin-top:8px">Value: <b class="vs-val"></b> '+vEsc(unit)+'</div>'+
      '<div class="viz-stop-note"><span class="vsn-label vs-lab"></span><span class="vs-note"></span></div>';
    var range=body.querySelector("input"), val=body.querySelector(".vs-val"), lab=body.querySelector(".vs-lab"), note=body.querySelector(".vs-note");
    function nearest(v){ var best=stops[0],bd=Math.abs(v-stops[0].at); for(var i=1;i<stops.length;i++){var d=Math.abs(v-stops[i].at); if(d<bd){bd=d;best=stops[i];}} return best; }
    function upd(){ var v=+range.value; val.textContent=Math.round(v*100)/100; var s=nearest(v); lab.textContent=s.label+" — "; note.textContent=s.note; }
    range.addEventListener("input", upd); upd();
  }
  function buildStepped(body, data){
    var steps=(data.steps||[]); if(steps.length<2){ return; }
    body.innerHTML='<div class="viz-steps-nav">'+steps.map(function(s,i){return '<button class="viz-step-btn'+(i===0?' active':'')+'" data-si="'+i+'"><span class="vsb-n">'+(i+1)+'</span>'+(s.icon?vEsc(s.icon)+' ':'')+vEsc(s.label)+'</button>';}).join("")+'</div><div class="viz-step-detail"></div>';
    var detail=body.querySelector(".viz-step-detail");
    function show(i){ var s=steps[i]; detail.innerHTML='<h4>'+(s.icon?vEsc(s.icon)+' ':'')+vEsc(s.label)+'</h4>'+vEsc(s.detail); body.querySelectorAll(".viz-step-btn").forEach(function(b,bi){b.classList.toggle("active", bi===i);}); }
    body.querySelector(".viz-steps-nav").addEventListener("click", function(e){ var b=e.target.closest(".viz-step-btn"); if(!b)return; show(+b.getAttribute("data-si")); });
    show(0);
  }
  function hydrateViz(viz){
    var kind=viz.getAttribute("data-viz"), dataEl=viz.querySelector(".viz-data"), body=viz.querySelector(".viz-body");
    if(!dataEl||!body||viz._hydrated) return;
    viz._hydrated=true;
    var data; try { data=JSON.parse(dataEl.textContent||"{}"); } catch(e){ return; }
    try {
      if(kind==="scatter") buildScatter(body,data);
      else if(kind==="slider") buildSlider(body,data);
      else if(kind==="stepped") buildStepped(body,data);
    } catch(e){ /* a bad payload never breaks the page */ }
  }
  // Hydrate every .viz under a root (whole doc at init, or a freshly-injected panel).
  function hydrate(root){ Array.prototype.forEach.call((root||document).querySelectorAll(".viz"), hydrateViz); }

  // ---- progressive background build queue (this iframe calls the server directly) ----
  var cfg={}; try { cfg=JSON.parse(document.getElementById("lesson-config").textContent||"{}"); } catch(e){}
  // The artifactId is in this iframe's own URL: /api/artifact/<id>. (A downloaded
  // file:// page has no match → ARTIFACT_ID "" → no fetching, which is correct.)
  var _m=(location.pathname||"").match(/\/api\/artifact\/([^\/?#]+)/);
  var ARTIFACT_ID=_m?_m[1]:"";
  var queue=(cfg.stubModuleIds||[]).slice();
  var busy=false;
  function cssEsc(s){ return String(s).replace(/["\\]/g,"\\$&"); }
  function navItem(id){ return document.querySelector('.navitem[data-goto="'+cssEsc(id)+'"]'); }
  function panelEl(id){ return document.querySelector('.panel[data-module="'+cssEsc(id)+'"]'); }
  function isStub(id){ var p=panelEl(id); return !!(p && p.classList.contains("is-stub")); }
  function pump(){
    if(busy || !ARTIFACT_ID) return;
    var id=queue.shift(); if(!id) return;
    if(!isStub(id)){ pump(); return; }            // already built (e.g. via priority) — skip
    busy=true;
    var nav=navItem(id);
    fetch("/api/module",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({artifactId:ARTIFACT_ID,moduleId:id})})
      .then(function(r){ if(!r.ok) throw new Error("HTTP "+r.status); return r.json(); })
      .then(function(data){
        var panel=panelEl(id);
        if(panel && data && data.fragmentHtml){ panel.innerHTML=data.fragmentHtml; panel.classList.remove("is-stub"); hydrate(panel); observeReveals(panel); }
        if(nav){ nav.classList.remove("building","failed"); }
      })
      .catch(function(){
        if(nav){ nav.classList.remove("building"); nav.classList.add("failed"); }
        var panel=panelEl(id), b=panel&&panel.querySelector(".building");
        if(b){ b.classList.add("failed"); b.textContent="⚠ Couldn't build this section — tap to retry."; }
      })
      .then(function(){ busy=false; pump(); });
  }
  function prioritize(id){
    var i=queue.indexOf(id);
    if(i>0){ queue.splice(i,1); queue.unshift(id); }
    else if(i===-1 && isStub(id)){ queue.unshift(id); }
    pump();
  }

  hydrate(document);
  observeReveals(document);
  setProgress();
  pump();             // start building the remaining modules, one by one
})();
`;
