// ============================================================================
// LLM Skills tab — turn a free-text brief into an installable Agent Skill.
//
// Loaded as a classic script AFTER app.js, so it shares app.js's global scope
// (escapeHtml, authHeaders, openAuth, authRequiredAndOut, fileToBase64,
// MAX_UPLOAD_BYTES/MB). It reuses the existing upload (/api/upload[-repo]) + auth
// infra; the result is a structured SkillPackage rendered DETERMINISTICALLY
// (every field escaped — the model never emits HTML/JS).
//
// Kept in its OWN file (not appended to app.js) to avoid edit contention with the
// parallel UI sessions that also touch app.js.
// ============================================================================
(function llmSkills() {
  const formState = document.getElementById("skill-form-state");
  const progState = document.getElementById("skill-progress-state");
  const resultState = document.getElementById("skill-result-state");
  const genBtn = document.getElementById("skill-generate");
  if (!formState || !genBtn) return; // tab not present
  loadCssOnce("/skills.css"); // this tab's styles (kept out of the contended styles.css)

  // ---- scoped reference-upload state (separate from the Builder's) ----
  const skillDocs = [];
  let skillPendingUploads = 0;
  const chips = document.getElementById("skill-upload-chips");
  const fileInputEl = document.getElementById("skill-file-input");
  const addDocsEl = document.getElementById("skill-add-docs");
  const repoUrlInput = document.getElementById("skill-repo-url");
  const addRepoEl = document.getElementById("skill-add-repo");
  const upHint = document.getElementById("skill-upload-hint");

  function setUploadPending(delta) {
    skillPendingUploads = Math.max(0, skillPendingUploads + delta);
    const busy = skillPendingUploads > 0;
    genBtn.disabled = busy;
    genBtn.classList.toggle("waiting-upload", busy);
    if (upHint) {
      upHint.hidden = !busy;
      if (busy) upHint.textContent = "Reading your file/repo on the server… Generate unlocks once it's ready.";
    }
  }
  function addSkillChip(name, meta) {
    const el = document.createElement("div");
    el.className = "chip uploading";
    el.innerHTML = `<span class="chip-name"></span><span class="chip-meta"></span><button class="chip-x" type="button" aria-label="Remove">×</button>`;
    el.querySelector(".chip-name").textContent = name;
    el.querySelector(".chip-meta").textContent = meta;
    el.querySelector(".chip-x").addEventListener("click", () => {
      const id = el.dataset.docId;
      if (id) { const i = skillDocs.findIndex((d) => d.docId === id); if (i >= 0) skillDocs.splice(i, 1); }
      el.remove();
    });
    chips.appendChild(el);
    return el;
  }
  if (addDocsEl) addDocsEl.addEventListener("click", () => fileInputEl.click());
  if (fileInputEl) fileInputEl.addEventListener("change", async () => {
    for (const file of Array.from(fileInputEl.files)) {
      if (file.size > MAX_UPLOAD_BYTES) {
        const c = addSkillChip(file.name, `✕ too large — max ${MAX_UPLOAD_MB}MB`);
        c.classList.remove("uploading"); c.classList.add("failed");
        continue;
      }
      const chip = addSkillChip(file.name, "uploading…");
      setUploadPending(1);
      try {
        const dataBase64 = await fileToBase64(file);
        const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ filename: file.name, dataBase64 }) });
        if (res.status === 401) { openAuth("signin"); throw new Error("Sign in to add files."); }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "upload failed");
        skillDocs.push({ docId: data.docId, title: data.title });
        chip.dataset.docId = data.docId; chip.classList.remove("uploading");
        chip.querySelector(".chip-meta").textContent = data.chunkCount + (data.chunkCount === 1 ? " chunk" : " chunks");
      } catch (e) {
        chip.classList.add("failed"); chip.querySelector(".chip-meta").textContent = "✕ " + e.message;
      } finally { setUploadPending(-1); }
    }
    fileInputEl.value = "";
  });
  if (addRepoEl) addRepoEl.addEventListener("click", async () => {
    const url = (repoUrlInput.value || "").trim();
    if (!url) { repoUrlInput.focus(); return; }
    const chip = addSkillChip(url.replace(/^https?:\/\//, ""), "cloning & reading…");
    addRepoEl.disabled = true; setUploadPending(1);
    try {
      const res = await fetch("/api/upload-repo", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ repoUrl: url }) });
      if (res.status === 401) { openAuth("signin"); throw new Error("Sign in to add a repo."); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "clone failed");
      skillDocs.push({ docId: data.docId, title: data.title });
      chip.dataset.docId = data.docId; chip.classList.remove("uploading");
      chip.querySelector(".chip-name").textContent = "📦 " + data.title;
      chip.querySelector(".chip-meta").textContent = `${data.fileCount} files · ${data.chunkCount} chunks`;
      repoUrlInput.value = "";
    } catch (e) {
      chip.classList.add("failed"); chip.querySelector(".chip-meta").textContent = "✕ " + e.message;
    } finally { addRepoEl.disabled = false; setUploadPending(-1); }
  });
  if (repoUrlInput) repoUrlInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addRepoEl.click(); } });

  const mySkillsState = document.getElementById("skill-myskills-state");

  // ---- state machine ----
  function show(state) {
    if (formState) formState.hidden = state !== "form";
    if (progState) progState.hidden = state !== "progress";
    if (resultState) resultState.hidden = state !== "result";
    if (mySkillsState) mySkillsState.hidden = state !== "myskills";
    window.scrollTo(0, 0);
  }
  const progFill = document.getElementById("skill-prog-fill");
  const progLabel = document.getElementById("skill-prog-label");
  const progErr = document.getElementById("skill-prog-err");
  const LABELS = [[18, "Grounding in the Agent Skills knowledge base…"], [32, "Reading your references…"], [46, "Writing SKILL.md + scripts…"], [88, "Finishing up…"]];
  function setProgress(pct) {
    if (progFill) progFill.style.width = Math.max(4, Math.min(100, pct)) + "%";
    if (progLabel) { let lab = "Designing your skill…"; for (const [p, t] of LABELS) if (pct >= p) lab = t; progLabel.textContent = lab; }
  }
  function showError(msg) {
    show("progress");
    if (progFill) progFill.style.width = "100%";
    if (progLabel) progLabel.textContent = "Couldn't generate the skill";
    if (progErr) { progErr.hidden = false; progErr.innerHTML = `<span class="skill-err-msg"></span> <button class="vbtn" id="skill-err-back" type="button">← Edit brief</button>`; progErr.querySelector(".skill-err-msg").textContent = msg; progErr.querySelector("#skill-err-back").addEventListener("click", () => show("form")); }
  }

  // ---- generate + poll ----
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function buildPayload() {
    return {
      llmInterface: val("skill-interface"), task: val("skill-task"), dataSources: val("skill-data"),
      accessMethod: val("skill-access"), exampleRequest: val("skill-example"), tools: val("skill-tools"),
      constraints: val("skill-constraints"), skillName: val("skill-name"), refDocIds: skillDocs.map((d) => d.docId),
    };
  }
  let pollTimer = null;
  async function startGen() {
    if (skillPendingUploads > 0) return;
    if (!val("skill-task")) { const t = document.getElementById("skill-task"); if (t) t.focus(); return; }
    if (authRequiredAndOut()) { openAuth("signup"); return; }
    if (progErr) progErr.hidden = true;
    show("progress"); setProgress(4);
    try {
      const res = await fetch("/api/skill/generate", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(buildPayload()) });
      if (res.status === 401) { show("form"); openAuth("signin"); return; }
      const d = await res.json();
      // Item 2/3: a skill costs 0.5 credits — at 0 balance the server returns 402; show the buy-a-plan popup.
      if (res.status === 402) { show("form"); if (window.openBuyCredits) window.openBuyCredits(d.error || "You need 0.5 credits to generate a skill."); else showError(d.error || "Out of credits."); return; }
      if (!res.ok) { showError(d.error || "Could not start generation."); return; }
      poll(d.jobId);
    } catch (e) { showError(e.message || "Network error — please try again."); }
  }
  function poll(jobId) {
    clearTimeout(pollTimer);
    const tick = async () => {
      let job;
      try {
        const r = await fetch("/api/skill/job/" + jobId, { headers: authHeaders() });
        if (!r.ok) { if (r.status === 401) { show("form"); openAuth("signin"); return; } throw new Error("lost"); }
        job = await r.json();
      } catch (e) { showError("Lost the generation — please try again."); return; }
      setProgress(job.percent || 0);
      if (job.status === "done") { if (job.skill) { if (window.track) window.track("skill_generated", job.skill && job.skill.slug); renderResult(job.skill, job.grounded, job.saved); if (job.saved) loadMySkills(); } else showError("Generation finished but returned nothing — try again."); return; }
      if (job.status === "error") { showError(job.error || "Generation failed — try again."); return; }
      pollTimer = setTimeout(tick, 1500);
    };
    tick();
  }
  genBtn.addEventListener("click", startGen);

  // ---- result render (deterministic; everything escaped) ----
  let currentSkill = null;
  const pane = document.getElementById("skill-pane");
  const rail = document.getElementById("skill-rail");
  const newBtn = document.getElementById("skill-new");
  const resTitle = document.getElementById("skill-result-title");
  const groundedBadge = document.getElementById("skill-grounded");
  if (newBtn) newBtn.addEventListener("click", () => show("form"));

  function loadScriptOnce(src) {
    return new Promise((res, rej) => {
      const ex = document.querySelector(`script[data-load="${src}"]`);
      if (ex) { if (ex.dataset.ready === "1") return res(); ex.addEventListener("load", () => res()); ex.addEventListener("error", () => rej(new Error("load failed"))); return; }
      const s = document.createElement("script"); s.src = src; s.dataset.load = src;
      s.onload = () => { s.dataset.ready = "1"; res(); }; s.onerror = () => rej(new Error("load failed"));
      document.head.appendChild(s);
    });
  }
  function loadCssOnce(href) {
    if (document.querySelector(`link[data-load="${href}"]`)) return;
    const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.dataset.load = href; document.head.appendChild(l);
  }

  // Small, SAFE markdown → HTML (escape first, then add a fixed set of tags).
  function skillMd(src) {
    src = String(src || "");
    const blocks = [];
    src = src.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => { const i = blocks.length; blocks.push(`<pre class="md-pre"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`); return ` B${i} `; });
    let html = escapeHtml(src);
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/^######\s?(.+)$/gm, "<h6>$1</h6>").replace(/^#####\s?(.+)$/gm, "<h5>$1</h5>").replace(/^####\s?(.+)$/gm, "<h4>$1</h4>").replace(/^###\s?(.+)$/gm, "<h3>$1</h3>").replace(/^##\s?(.+)$/gm, "<h2>$1</h2>").replace(/^#\s?(.+)$/gm, "<h1>$1</h1>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    html = html.replace(/(?:^|\n)((?:[ \t]*[-*][ \t]+.+(?:\n|$))+)/g, (m, list) => { const items = list.trim().split(/\n/).map((l) => `<li>${l.replace(/^[ \t]*[-*][ \t]+/, "")}</li>`).join(""); return `\n<ul>${items}</ul>`; });
    html = html.replace(/(?:^|\n)((?:[ \t]*\d+\.[ \t]+.+(?:\n|$))+)/g, (m, list) => { const items = list.trim().split(/\n/).map((l) => `<li>${l.replace(/^[ \t]*\d+\.[ \t]+/, "")}</li>`).join(""); return `\n<ol>${items}</ol>`; });
    html = "<p>" + html.replace(/\n{2,}/g, "</p><p>") + "</p>";
    html = html.replace(/\n/g, "<br>");
    html = html.replace(/ B(\d+) /g, (m, i) => blocks[+i]);
    html = html.replace(/<p>\s*<\/p>/g, "").replace(/<p>(<h[1-6]>)/g, "$1").replace(/(<\/h[1-6]>)<\/p>/g, "$1").replace(/<p>(<ul>|<ol>|<pre)/g, "$1").replace(/(<\/ul>|<\/ol>|<\/pre>)<\/p>/g, "$1").replace(/<br>(<\/?(?:ul|ol|li|h[1-6]|pre)>)/g, "$1");
    return html;
  }

  function fileCards(skill) {
    const dl = `<div class="skill-files-bar"><span class="skill-files-count">${skill.files.length} file${skill.files.length === 1 ? "" : "s"}</span><button class="generate sm" id="skill-dl-all" type="button">⬇ Download all (.zip)</button></div>`;
    const cards = skill.files.map((f, i) => {
      const lang = (f.language || "").toLowerCase();
      return `<div class="skill-file"><div class="skill-file-head"><span class="skill-file-path">${escapeHtml(f.path)}</span><span class="skill-file-lang">${escapeHtml(f.language || "text")}</span><button class="vbtn skill-dl" data-i="${i}" type="button">⬇ Download</button></div><pre class="skill-code"><code class="language-${escapeHtml(lang)}" data-i="${i}"></code></pre></div>`;
    }).join("");
    return dl + cards;
  }
  function sampleIO(skill) {
    const io = ((skill.overview && skill.overview.sampleIO) || []).map((s) => `<div class="skill-io"><div class="skill-io-cell"><span class="skill-io-lab">Input</span><span class="skill-io-txt">${escapeHtml(s.input)}</span></div><div class="skill-io-cell out"><span class="skill-io-lab">Output</span><span class="skill-io-txt">${escapeHtml(s.output)}</span></div></div>`).join("");
    return io ? `<div class="skill-io-list">${io}</div>` : "";
  }
  function sourcesHtml(skill) {
    const ss = skill.sources || [];
    if (!ss.length) return `<p class="skill-empty">No external sources were cited for this skill.</p>`;
    return `<ul class="skill-sources">${ss.map((s) => { const t = escapeHtml(s.title || s.url || "Source"); return s.url ? `<li><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer">${t}</a></li>` : `<li>${t}</li>`; }).join("")}</ul>`;
  }

  function renderResult(skill, grounded, saved) {
    currentSkill = skill;
    const meta = skill.meta || {};
    const overview = skill.overview || {};
    const howToUse = skill.howToUse || {};
    if (resTitle) resTitle.textContent = meta.name || "Your skill";
    if (groundedBadge) groundedBadge.hidden = !grounded;
    // "Saved to My Skills" chip (created once, lives in the result head).
    let savedBadge = document.getElementById("skill-saved-badge");
    if (!savedBadge && resTitle) {
      savedBadge = document.createElement("span");
      savedBadge.id = "skill-saved-badge";
      savedBadge.className = "skill-saved-badge";
      savedBadge.textContent = "✓ Saved to My Skills";
      resTitle.parentNode.appendChild(savedBadge);
    }
    if (savedBadge) savedBadge.hidden = !saved;
    pane.innerHTML =
      `<div class="skill-mod" data-mod="overview"><h3>${escapeHtml(meta.name || "Skill")}</h3>` +
        `<p class="skill-sub">${escapeHtml(meta.task || "")} · for <strong>${escapeHtml(meta.llmInterface || "your LLM")}</strong></p>` +
        `<div class="skill-md">${skillMd(overview.whatItDoes || meta.summary || "")}</div>` +
        (sampleIO(skill) ? `<h4 class="skill-h">Sample requests → output</h4>${sampleIO(skill)}` : "") +
      `</div>` +
      `<div class="skill-mod" data-mod="howto" hidden>` +
        `<h4 class="skill-h">Install</h4><div class="skill-md">${skillMd(howToUse.install || "")}</div>` +
        `<h4 class="skill-h">Invoke it in ${escapeHtml(meta.llmInterface || "your LLM")}</h4><div class="skill-md">${skillMd(howToUse.invoke || "")}</div>` +
        `<h4 class="skill-h">Connect the data sources</h4><div class="skill-md">${skillMd(howToUse.connectDataSources || "")}</div>` +
      `</div>` +
      `<div class="skill-mod" data-mod="files" hidden>${fileCards(skill)}</div>` +
      `<div class="skill-mod" data-mod="sources" hidden>${sourcesHtml(skill)}</div>`;
    // Fill code via textContent (safe), then lazy-highlight.
    const codes = pane.querySelectorAll("code[data-i]");
    codes.forEach((c) => { c.textContent = (skill.files[+c.dataset.i] || {}).content || ""; });
    loadScriptOnce("https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/highlight.min.js")
      .then(() => { loadCssOnce("https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.9.0/build/styles/github-dark.min.css"); if (window.hljs) codes.forEach((c) => { try { window.hljs.highlightElement(c); } catch (e) {} }); })
      .catch(() => {});
    // Reset rail to the first section.
    rail.querySelectorAll(".skill-rail-item").forEach((b, i) => b.classList.toggle("active", i === 0));
    pane.querySelectorAll(".skill-mod").forEach((m) => { m.hidden = m.dataset.mod !== "overview"; });
    show("result");
  }

  if (rail) rail.addEventListener("click", (e) => {
    const b = e.target.closest(".skill-rail-item");
    if (!b) return;
    rail.querySelectorAll(".skill-rail-item").forEach((x) => x.classList.toggle("active", x === b));
    pane.querySelectorAll(".skill-mod").forEach((m) => { m.hidden = m.dataset.mod !== b.dataset.mod; });
  });

  function dlBlob(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: type || "text/plain" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
  }
  if (pane) pane.addEventListener("click", async (e) => {
    const one = e.target.closest(".skill-dl");
    if (one) { const f = currentSkill.files[+one.dataset.i]; dlBlob(f.path.split("/").pop(), f.content, "text/plain"); return; }
    const all = e.target.closest("#skill-dl-all");
    if (all) {
      all.disabled = true; const orig = all.textContent; all.textContent = "Zipping…";
      try {
        await loadScriptOnce("https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js");
        const root = (currentSkill.meta && currentSkill.meta.slug) || "skill";
        const zip = new window.JSZip();
        currentSkill.files.forEach((f) => zip.file(root + "/" + f.path, f.content));
        const blob = await zip.generateAsync({ type: "blob" });
        dlBlob(root + ".zip", blob, "application/zip");
      } catch (err) { all.textContent = "✕ zip failed"; setTimeout(() => { all.textContent = orig; all.disabled = false; }, 1500); return; }
      all.textContent = orig; all.disabled = false;
    }
  });

  // ---- Nav dropdown (Build a Skill / My Skills) — mirrors the Trainer dropdown ----
  const skillsDd = document.getElementById("skills-dd");
  const skillsCaret = document.getElementById("skills-caret");
  const skillsMenu = document.getElementById("skills-menu");
  function closeSkillsMenu() { if (skillsMenu) skillsMenu.hidden = true; if (skillsCaret) skillsCaret.setAttribute("aria-expanded", "false"); if (skillsDd) skillsDd.classList.remove("open"); }
  if (skillsCaret) skillsCaret.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = skillsMenu.hidden;
    skillsMenu.hidden = !open;
    skillsCaret.setAttribute("aria-expanded", String(open));
    skillsDd.classList.toggle("open", open);
  });
  document.addEventListener("click", (e) => { if (skillsDd && !skillsDd.contains(e.target)) closeSkillsMenu(); });

  function goBuild() { switchTab("llm-skills"); closeSkillsMenu(); show("form"); }
  function goMySkills() { switchTab("llm-skills"); closeSkillsMenu(); show("myskills"); loadMySkills(); }
  const menuBuild = document.getElementById("skills-menu-build");
  const menuMine = document.getElementById("skills-menu-mine");
  if (menuBuild) menuBuild.addEventListener("click", goBuild);
  if (menuMine) menuMine.addEventListener("click", goMySkills);
  // The main "LLM Skills" tab button opens Build a Skill (the generic switchTab also runs).
  const mainBtn = document.getElementById("tab-btn-llm-skills");
  if (mainBtn) mainBtn.addEventListener("click", () => { show("form"); });
  const buildNewBtn = document.getElementById("skill-build-new");
  if (buildNewBtn) buildNewBtn.addEventListener("click", goBuild);

  // ---- My Skills list ----
  const listEl = document.getElementById("skill-myskills-list");
  const noteEl = document.getElementById("skill-myskills-note");
  async function loadMySkills() {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (noteEl) noteEl.textContent = "Loading…";
    if (authRequiredAndOut()) { if (noteEl) noteEl.textContent = ""; openAuth("signin"); return; }
    let skills = [];
    try {
      const r = await fetch("/api/skills", { headers: authHeaders() });
      if (r.status === 401) { if (noteEl) noteEl.textContent = ""; openAuth("signin"); return; }
      skills = (await r.json()).skills || [];
    } catch (e) { if (noteEl) noteEl.textContent = "Couldn't load your skills."; return; }
    if (!skills.length) {
      if (noteEl) noteEl.textContent = "";
      listEl.innerHTML = `<div class="skill-empty-card">No saved skills yet. <button class="linklike" id="skill-empty-build" type="button">Build your first skill →</button></div>`;
      const eb = document.getElementById("skill-empty-build"); if (eb) eb.addEventListener("click", goBuild);
      return;
    }
    if (noteEl) noteEl.textContent = `${skills.length} saved skill${skills.length === 1 ? "" : "s"}`;
    listEl.innerHTML = skills.map((s) => {
      const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";
      const grounded = s.grounded ? `<span class="ms-badge">✓ KB-grounded</span>` : "";
      return `<div class="ms-card" data-id="${escapeHtml(s.id)}">
        <div class="ms-main">
          <div class="ms-title">${escapeHtml(s.name)}</div>
          <div class="ms-task">${escapeHtml(s.task || "")}</div>
          <div class="ms-meta"><span class="ms-iface">${escapeHtml(s.llmInterface || "")}</span>${grounded}<span class="ms-date">${escapeHtml(date)}</span></div>
        </div>
        <div class="ms-actions">
          <button class="vbtn ms-open" data-id="${escapeHtml(s.id)}" type="button">Open</button>
          <button class="vbtn ms-del" data-id="${escapeHtml(s.id)}" type="button" title="Delete">🗑</button>
        </div>
      </div>`;
    }).join("");
  }
  if (listEl) listEl.addEventListener("click", async (e) => {
    const open = e.target.closest(".ms-open");
    const del = e.target.closest(".ms-del");
    if (open) { openSavedSkill(open.dataset.id); return; }
    if (del) {
      const id = del.dataset.id;
      del.disabled = true;
      try {
        const r = await fetch("/api/skill/saved/" + encodeURIComponent(id), { method: "DELETE", headers: authHeaders() });
        if (r.ok) { const card = del.closest(".ms-card"); if (card) card.remove(); loadMySkills(); }
        else del.disabled = false;
      } catch (err) { del.disabled = false; }
    }
  });
  async function openSavedSkill(id) {
    try {
      const r = await fetch("/api/skill/saved/" + encodeURIComponent(id), { headers: authHeaders() });
      if (r.status === 401) { openAuth("signin"); return; }
      if (!r.ok) return;
      const d = await r.json();
      if (d.skill) renderResult(d.skill, d.grounded, true);
    } catch (e) { /* ignore */ }
  }
})();
