/**
 * # Front-end logic (vanilla JS) — Phase 1
 *
 *  - Click-based dropdown controls (Level multi · Depth · Examples · Text ·
 *    Extras multi · Lesson type multi) + two open-text context fields.
 *  - Dashboard of the user's previous lessons (30-day window) — open or download.
 *  - Generation streams over SSE; the raw node names are hidden behind a friendly
 *    progress line. A persistent chat lets the learner ask to modify the plan.
 *  - Star rating saved to the server. Animated neural-network hero backdrop.
 *  - Supabase auth via a modal opened from the Sign in / Sign up buttons.
 */

// ---- Elements ----
const promptEl = document.getElementById("prompt");
const industryEl = document.getElementById("industry");
const buildGoalEl = document.getElementById("build-goal");
const generateBtn = document.getElementById("generate");
const landing = document.getElementById("landing");
const workspace = document.getElementById("workspace");
const chatLog = document.getElementById("chat-log");
const viewerFrame = document.getElementById("viewer-frame");
const viewerEmpty = document.getElementById("viewer-empty");
const downloadBtn = document.getElementById("download");
const openWindowBtn = document.getElementById("open-window");
const ratingEl = document.getElementById("rating");
const chatCompose = document.getElementById("chat-compose");
const chatInput = document.getElementById("chat-input");
const chatSend = document.getElementById("chat-send");
const chatEl = document.getElementById("chat");
const askMoreBtn = document.getElementById("ask-more");
const chatCloseBtn = document.getElementById("chat-close");
const genOverlay = document.getElementById("gen-overlay");
const genLabel = document.getElementById("gen-label");
const genStatus = document.getElementById("gen-status");
// Overview-gate elements (human-in-the-loop: review a free overview before building).
const genLessonBtn = document.getElementById("gen-lesson");
const editOverviewBtn = document.getElementById("edit-overview");
const editOverlay = document.getElementById("edit-overlay");
const editFeedback = document.getElementById("edit-feedback");
const editRegenBtn = document.getElementById("edit-regen");
const editCloseBtn = document.getElementById("edit-close");
if (genStatus) genStatus.addEventListener("click", () => switchTab("dashboard"));
document.getElementById("new-thread").addEventListener("click", resetToLanding);
askMoreBtn.addEventListener("click", () => toggleChat());
chatCloseBtn.addEventListener("click", () => toggleChat(false));
function toggleChat(force) {
  const open = force === undefined ? !workspace.classList.contains("chat-open") : force;
  workspace.classList.toggle("chat-open", open);
  chatEl.hidden = !open;
  if (open) chatInput.focus();
}

// Selections collected from the dropdowns.
const sel = { level: null, depth: [], examples: [], density: null, extras: [], lessonType: [], framework: null, readingMode: null };
// Combine a multi-select axis into the backend enum (e.g. both → "conceptual_technical").
function combineAxis(arr, a, b, both) {
  const hasA = arr.includes(a), hasB = arr.includes(b);
  if (hasA && hasB) return both;
  if (hasA) return a;
  if (hasB) return b;
  return null;
}
function axisToValues(enumStr) {
  if (!enumStr) return [];
  if (enumStr.includes("_")) return enumStr.split("_");
  return [enumStr];
}

let currentArtifactId = null;
let currentThreadId = null;
let currentViewUrl = null; // what "open in new window" points at (artifact OR library lesson)
let basePrompt = ""; // the lesson's original ask (so "modify" keeps context)
let activeJobId = null;
let activeJobTimer = null;
let currentCourse = null; // { courseId, lessons:[{index,title,artifactId,status}], activeIndex }
let overviewArtifactId = null; // the free overview draft currently under review (gate)
let lastOverviewPayload = null; // the payload used to build it (so "Edit overview" can re-run)
const lessonTabsEl = document.getElementById("lesson-tabs");

// Friendly labels for the dropdown summary.
const VALUE_LABELS = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  conceptual: "Conceptual", technical: "Technical",
  functional: "Functional", code: "Code",
  low: "Low", medium: "Medium", high: "High",
  visuals: "Visuals", syntax: "Syntax",
  content: "Content", knowledge_check: "Knowledge check",
  vertical: "Vertical scroll", horizontal: "Horizontal scroll",
};
const DD_DEFAULTS = { level: "Any", depth: "Auto", examples: "Auto", density: "Balanced", extras: "None", lessonType: "Content", framework: "Pick one", readingMode: "Vertical scroll" };

// ---- Dropdown wiring (single + multi) ----
document.querySelectorAll(".dd").forEach((dd) => {
  const field = dd.dataset.field;
  const multi = dd.dataset.multi === "true";
  const btn = dd.querySelector(".dd-btn");
  const menu = dd.querySelector(".dd-menu");
  const valueEl = dd.querySelector(".dd-value");

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = dd.classList.contains("open");
    closeAllDropdowns();
    if (!wasOpen) { dd.classList.add("open"); menu.hidden = false; }
  });

  menu.addEventListener("click", (e) => e.stopPropagation()); // keep multi-select open
  menu.querySelectorAll(".dd-opt").forEach((opt) => {
    opt.addEventListener("click", () => {
      const v = opt.dataset.value;
      if (multi) {
        const arr = sel[field];
        const i = arr.indexOf(v);
        if (i >= 0) { arr.splice(i, 1); opt.classList.remove("sel"); }
        else { arr.push(v); opt.classList.add("sel"); }
      } else {
        const turningOff = sel[field] === v;
        menu.querySelectorAll(".dd-opt").forEach((o) => o.classList.remove("sel"));
        sel[field] = turningOff ? null : v;
        if (!turningOff) opt.classList.add("sel");
        dd.classList.remove("open"); menu.hidden = true;
      }
      renderDdValue(dd, field, multi, valueEl);
      if (field === "examples") updateFrameworkVisibility();
    });
  });
});

// The code-framework dropdown is a CONTEXTUAL follow-on: by design it appears only
// when Code examples are chosen (no point picking a language without code). It stays
// put as long as Code is selected (selecting a framework never hides it); it's only
// cleared when Code is deselected. We spotlight it on reveal so the appearance is
// obvious rather than a silent layout shift.
function updateFrameworkVisibility() {
  const dd = document.getElementById("dd-framework");
  if (!dd) return;
  const show = sel.examples.includes("code");
  const wasHidden = dd.hidden;
  dd.hidden = !show;
  if (show) {
    // Briefly spotlight it the first time it appears so it's clearly tied to "Code".
    if (wasHidden) {
      dd.classList.remove("dd-spotlight");
      void dd.offsetWidth; // restart the animation
      dd.classList.add("dd-spotlight");
    }
  } else {
    sel.framework = null;
    dd.classList.remove("dd-spotlight");
    dd.querySelectorAll(".dd-opt").forEach((o) => o.classList.remove("sel"));
    renderDdValue(dd, "framework", false, dd.querySelector(".dd-value"));
  }
}

function renderDdValue(dd, field, multi, valueEl) {
  let text, set;
  if (multi) {
    const arr = sel[field];
    set = arr.length > 0;
    text = set ? arr.map((v) => VALUE_LABELS[v] || v).join(", ") : DD_DEFAULTS[field];
  } else {
    set = !!sel[field];
    text = set ? VALUE_LABELS[sel[field]] : DD_DEFAULTS[field];
  }
  valueEl.textContent = text;
  dd.classList.toggle("is-set", set);
}
function closeAllDropdowns() {
  document.querySelectorAll(".dd.open").forEach((d) => { d.classList.remove("open"); d.querySelector(".dd-menu").hidden = true; });
}
document.addEventListener("click", closeAllDropdowns);

// ---- Document uploads (session-scoped) ----
const uploadedDocs = [];
const fileInput = document.getElementById("file-input");
const addDocsBtn = document.getElementById("add-docs");
const chipsEl = document.getElementById("upload-chips");
const referWrap = document.getElementById("refer-only-wrap");
const referChk = document.getElementById("refer-only");
const uploadHint = document.getElementById("upload-hint");

addDocsBtn.addEventListener("click", () => fileInput.click());
referChk.addEventListener("change", updateUploadUI);
fileInput.addEventListener("change", async () => {
  for (const file of Array.from(fileInput.files)) {
    const chip = addChip(file.name, "uploading…");
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ filename: file.name, dataBase64 }),
      });
      // Defensive: /api/upload is public now, but if it ever 401s, surface sign-in
      // (mirrors the repo handler) instead of a dead "✕ Please sign in" on the chip.
      if (res.status === 401) { openAuth("signin"); throw new Error("Sign in to add files."); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      uploadedDocs.push({ docId: data.docId, title: data.title });
      chip.dataset.docId = data.docId;
      chip.classList.remove("uploading");
      chip.querySelector(".chip-meta").textContent = data.chunkCount + (data.chunkCount === 1 ? " chunk" : " chunks");
      updateUploadUI();
    } catch (e) {
      chip.classList.add("failed");
      chip.querySelector(".chip-meta").textContent = "✕ " + e.message;
    }
  }
  fileInput.value = "";
});

// ---- GitHub repo grounding (clone + extract on the server, same as documents) ----
const repoUrlEl = document.getElementById("repo-url");
const addRepoBtn = document.getElementById("add-repo");
addRepoBtn.addEventListener("click", async () => {
  const url = (repoUrlEl.value || "").trim();
  if (!url) { repoUrlEl.focus(); return; }
  const chip = addChip(url.replace(/^https?:\/\//, ""), "cloning & reading…");
  addRepoBtn.disabled = true;
  try {
    const res = await fetch("/api/upload-repo", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ repoUrl: url }) });
    if (res.status === 401) { openAuth("signin"); throw new Error("Sign in to add a repo."); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "clone failed");
    uploadedDocs.push({ docId: data.docId, title: data.title });
    chip.dataset.docId = data.docId;
    chip.classList.remove("uploading");
    chip.querySelector(".chip-name").textContent = "📦 " + data.title;
    chip.querySelector(".chip-meta").textContent = `${data.fileCount} files · ${data.chunkCount} chunks`;
    repoUrlEl.value = "";
    updateUploadUI();
  } catch (e) {
    chip.classList.add("failed");
    chip.querySelector(".chip-meta").textContent = "✕ " + e.message;
  } finally { addRepoBtn.disabled = false; }
});
repoUrlEl.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addRepoBtn.click(); } });

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function addChip(name, meta) {
  const el = document.createElement("div");
  el.className = "chip uploading";
  el.innerHTML = `<span class="chip-name"></span><span class="chip-meta"></span><button class="chip-x" type="button" aria-label="Remove">×</button>`;
  el.querySelector(".chip-name").textContent = name;
  el.querySelector(".chip-meta").textContent = meta;
  el.querySelector(".chip-x").addEventListener("click", () => {
    const id = el.dataset.docId;
    if (id) { const i = uploadedDocs.findIndex((d) => d.docId === id); if (i >= 0) uploadedDocs.splice(i, 1); }
    el.remove();
    updateUploadUI();
  });
  chipsEl.appendChild(el);
  return el;
}
function updateUploadUI() {
  const n = uploadedDocs.length;
  referWrap.hidden = n === 0;
  uploadHint.hidden = n === 0;
  if (n) {
    uploadHint.textContent = referChk.checked
      ? "This lesson will use ONLY your documents — nothing from the knowledge base."
      : "Your documents are used first; the knowledge base and general knowledge fill the rest.";
  }
}

// ---- Build the /api/learn payload from the current selections ----
function buildPayload(promptText, threadId) {
  const cards = {};
  const depth = combineAxis(sel.depth, "conceptual", "technical", "conceptual_technical");
  const examples = combineAxis(sel.examples, "functional", "code", "functional_code");
  if (depth) cards.depth = depth;
  if (examples) cards.examples = examples;
  if (sel.density) cards.density = sel.density;
  if (sel.extras.includes("visuals")) cards.visuals = "on";
  if (sel.extras.includes("syntax")) cards.syntax = "on";
  return {
    prompt: promptText,
    cards,
    levels: sel.level ? [sel.level] : [],
    lessonTypes: sel.lessonType.length ? sel.lessonType : ["content"],
    framework: sel.framework || "",
    readingMode: sel.readingMode || "vertical",
    industry: industryEl.value.trim(),
    buildGoal: buildGoalEl.value.trim(),
    uploadIds: uploadedDocs.map((d) => d.docId),
    referOnly: referChk.checked,
    threadId,
  };
}

// ---- Submit ----
generateBtn.addEventListener("click", () => {
  const p = promptEl.value.trim();
  if (!p) { promptEl.focus(); return; }
  if (authRequiredAndOut()) { openAuth("signup"); return; }
  basePrompt = p;
  startOverview(buildPayload(p, null));
});
promptEl.addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generateBtn.click(); });

// "Ask more" composer — answers from RAG (short reply), with an option to expand into the lesson.
chatCompose.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !currentArtifactId) return;
  addUserBubble(text);
  chatInput.value = "";
  chatInput.style.height = "auto";
  askQuestion(text);
});
chatInput.addEventListener("input", () => { chatInput.style.height = "auto"; chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px"; });
chatInput.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatCompose.requestSubmit(); } });

async function askQuestion(question) {
  const thinking = addStatus("Thinking…");
  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ artifactId: currentArtifactId, question }),
    });
    if (res.status === 401) { thinking.remove(); openAuth("signin"); return; }
    const data = await res.json();
    thinking.remove();
    if (!res.ok) { addAssistantBubble({ content: "⚠️ " + (data.error || "Couldn't answer that.") }); return; }
    const bubble = addAssistantBubble({ content: data.answer });
    const srcs = (data.sources || []).filter(Boolean);
    if (srcs.length) { const s = document.createElement("div"); s.className = "sugg-srcs"; s.textContent = "Sources: " + srcs.slice(0, 3).join(", "); bubble.appendChild(s); }
    // Offer to expand the answer into a full lesson section.
    const add = document.createElement("button");
    add.className = "add-to-lesson";
    add.textContent = "➕ Add this to my lesson in detail";
    add.addEventListener("click", () => expandIntoLesson(question, add));
    bubble.appendChild(add);
  } catch (err) {
    thinking.remove();
    addAssistantBubble({ content: "⚠️ " + err.message });
  }
}

async function expandIntoLesson(question, btn) {
  btn.disabled = true;
  btn.textContent = "Adding to your lesson… (keep reading)";
  try {
    const res = await fetch("/api/ask/expand", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ artifactId: currentArtifactId, question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "expand failed");
    btn.textContent = "✓ Added — open it";
    btn.disabled = false;
    btn.onclick = () => { viewerFrame.src = "/api/artifact/" + currentArtifactId; };
    addAssistantBubble({ content: "Added a new section to your lesson. It's in the menu on the left of the lesson — click **open it** above to jump there." });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "➕ Add this to my lesson in detail";
    addAssistantBubble({ content: "⚠️ Couldn't add it: " + err.message });
  }
}

// Friendly progress text (we hide the raw node names from the learner).
const STAGE_TEXT = {
  start: "Getting started…",
  profiler: "Understanding your goal…",
  retriever: "Gathering grounded sources…",
  architect: "Designing the lesson outline…",
  seedFirstModule: "Writing your first building block…",
  composer: "Assembling your interactive lesson…",
};

async function startGeneration(promptText, threadId) {
  landing.hidden = true;
  workspace.hidden = false;
  toggleChat(false);
  chatLog.innerHTML = "";
  // Full-screen lesson view: progress shows as an overlay on the viewer, not a chat.
  viewerFrame.hidden = true;
  viewerEmpty.hidden = true;
  ratingEl.hidden = true;
  askMoreBtn.hidden = true;
  downloadBtn.hidden = true;
  openWindowBtn.hidden = true;
  genOverlay.hidden = false;
  genLabel.textContent = "Getting started…";

  try {
    const res = await fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(buildPayload(promptText, threadId)),
    });
    if (res.status === 401) { genOverlay.hidden = true; openAuth("signin"); return; }
    if (!res.ok || !res.body) throw new Error("Request failed: " + res.status);

    await readSse(res.body, (event, data) => {
      if (event === "node") genLabel.textContent = STAGE_TEXT[data.stage] || "Working…";
      else if (event === "artifact") showArtifact(data);
      else if (event === "error") { genOverlay.hidden = true; viewerEmpty.hidden = false; viewerEmpty.textContent = "⚠️ " + data.message; }
      else if (event === "done") { genOverlay.hidden = true; loadDashboard(); loadSuggestions(); }
    });
  } catch (err) {
    genOverlay.hidden = true;
    viewerEmpty.hidden = false;
    viewerEmpty.textContent = "⚠️ " + err.message;
  }
}

// ---- SSE reader ----
async function readSse(body, onEvent) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      let event = "message"; let dataLine = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      try { onEvent(event, JSON.parse(dataLine)); } catch { /* ignore */ }
    }
  }
}

// ---- Viewer ----
function showArtifact(ref) {
  openInViewer(ref.id, ref.title || "Lesson");
}
function openInViewer(id, title) {
  currentArtifactId = id;
  overviewArtifactId = null; setOverviewMode(false); // a real lesson, not an overview draft
  currentViewUrl = "/api/artifact/" + id;
  genOverlay.hidden = true;
  viewerEmpty.hidden = true;
  viewerFrame.hidden = false;
  viewerFrame.src = "/api/artifact/" + id;
  document.getElementById("viewer-title").textContent = title;
  downloadBtn.hidden = false;
  downloadBtn.href = "/api/artifact/" + id + "/full";
  openWindowBtn.hidden = false;
  askMoreBtn.hidden = false;
  resetStars();
  ratingEl.hidden = false;
}
openWindowBtn.addEventListener("click", () => { const u = currentViewUrl || (currentArtifactId && "/api/artifact/" + currentArtifactId); if (u) window.open(u, "_blank"); });

// ---- Rating ----
const stars = Array.from(document.querySelectorAll(".star"));
const rateThanks = document.getElementById("rate-thanks");
stars.forEach((s) => s.addEventListener("click", () => submitRating(Number(s.dataset.v))));
function paintStars(v) { stars.forEach((s) => s.classList.toggle("on", Number(s.dataset.v) <= v)); }
function resetStars() { paintStars(0); rateThanks.hidden = true; }
async function submitRating(v) {
  if (!currentArtifactId) return;
  paintStars(v);
  try {
    const res = await fetch("/api/rate", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ artifactId: currentArtifactId, rating: v }),
    });
    if (res.status === 401) { openAuth("signin"); return; }
    rateThanks.hidden = false;
  } catch { /* ignore */ }
}

// ---- Chat rendering ----
function addUserBubble(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `<div class="who">You</div>${mdLite(text)}`;
  chatLog.appendChild(el); scrollDown();
}
function addAssistantBubble({ content }) {
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<div class="who">Studio</div><div class="msg-body">${mdLite(content)}</div>`;
  chatLog.appendChild(el); scrollDown();
  return el;
}
function addStatus(text) {
  const el = document.createElement("div");
  el.className = "status";
  el.innerHTML = `<span class="spin"></span><span class="label">${escapeHtml(text)}</span>`;
  chatLog.appendChild(el); scrollDown();
  return el;
}

// "New" → go to the Configurator for a fresh lesson. The Trainer KEEPS its current
// lesson (it only changes when you open one from My Lessons), so we don't touch the viewer.
function resetToLanding() {
  toggleChat(false);
  switchTab("configurator");
  promptEl.value = "";
  promptEl.focus();
  loadSuggestions();
}

// ---- Tabs (Configurator / Trainer / My Lessons / Library) ----
const TAB_PANELS = { configurator: "tab-configurator", trainer: "tab-trainer", library: "tab-library", dashboard: "tab-dashboard" };
document.querySelectorAll(".tab[data-tab]").forEach((t) => {
  if (t.disabled) return;
  t.addEventListener("click", () => switchTab(t.dataset.tab));
});
function switchTab(name) {
  document.querySelectorAll(".tab[data-tab]").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", String(on));
  });
  Object.entries(TAB_PANELS).forEach(([n, id]) => { const el = document.getElementById(id); if (el) el.hidden = n !== name; });
  if (name === "dashboard") loadDashboard();
  if (name === "library") loadLibrary();
}

// ---- Dashboard tab ----
const dashGrid = document.getElementById("dash-grid");
const dashNote = document.getElementById("dash-note");
const dashEmpty = document.getElementById("dash-empty");
const dashActive = document.getElementById("dash-active");
const tabBtnDashboard = document.getElementById("tab-btn-dashboard");

async function loadDashboard() {
  try {
    const res = await fetch("/api/lessons", { headers: authHeaders() });
    if (!res.ok) return;
    const { lessons } = await res.json();
    dashGrid.innerHTML = "";
    if (!lessons || !lessons.length) { dashEmpty.hidden = false; dashNote.textContent = ""; return; }
    dashEmpty.hidden = true;
    for (const l of lessons) dashGrid.appendChild(lessonCard(l));
    dashNote.textContent = `${lessons.length} saved · kept for 30 days`;
  } catch { /* ignore */ }
}
function lessonCard(l) {
  const el = document.createElement("div");
  el.className = "lesson-card";
  const days = l.daysRemaining;
  const warn = days <= 5 ? " warn" : "";
  const isCourse = l.courseId && (l.courseTotal || 0) > 1;
  const ratingHtml = l.rating ? `<span class="lc-stars">${"★".repeat(l.rating)}${"☆".repeat(5 - l.rating)}</span>` : "";
  const industry = l.industry ? `<span>${escapeHtml(l.industry)}</span>` : "";
  const courseBadge = isCourse ? `<span class="lc-badge">Course · ${l.courseTotal} parts</span>` : "";
  el.innerHTML = `
    <div class="lc-title">${escapeHtml(l.title)}</div>
    <div class="lc-meta"><span class="lc-badge${warn}">${days}d left</span>${courseBadge}${industry}${ratingHtml}</div>
    <div class="lc-actions">
      <button class="ghost lc-open" type="button">${isCourse ? "Open course" : "Open / revise"}</button>
      ${isCourse ? "" : `<a class="ghost lc-dl" href="/api/artifact/${l.id}/full" download>Download</a>`}
    </div>`;
  el.querySelector(".lc-open").addEventListener("click", () => {
    if (isCourse) { openCourseById(l.courseId, l.title); return; }
    openLessonInWorkspace(l.id, l.title, l.prompt);
  });
  return el;
}

// ---- Suggested next topics (after the first lesson; from the learner's context) ----
const suggestedEl = document.getElementById("suggested");
const suggChips = document.getElementById("sugg-chips");
async function loadSuggestions() {
  try {
    const res = await fetch("/api/suggest", { headers: authHeaders() });
    if (!res.ok) { suggestedEl.hidden = true; return; }
    const { topics } = await res.json();
    if (!topics || !topics.length) { suggestedEl.hidden = true; return; }
    suggChips.innerHTML = "";
    topics.forEach((t) => {
      const c = document.createElement("button");
      c.className = "sugg-chip"; c.type = "button"; c.textContent = t;
      c.addEventListener("click", () => { promptEl.value = t; promptEl.focus(); promptEl.scrollIntoView({ behavior: "smooth", block: "center" }); });
      suggChips.appendChild(c);
    });
    suggestedEl.hidden = false;
  } catch { suggestedEl.hidden = true; }
}

// ---- Library (public pre-built lessons) ----
const libGrid = document.getElementById("lib-grid");
const libCatsEl = document.getElementById("lib-cats");
const libSearch = document.getElementById("lib-search");
const libEmpty = document.getElementById("lib-empty");
let libAll = [];
let libCat = "All";
let libLoaded = false;
// Image-free "course tile" covers: a flat category-colored fill + a faint watermark icon.
// Icons are inline line-SVGs (no icon-font dependency); stroke=currentColor so each picks up
// its category's mid color. Two stops per family: light `bg` fill, dark `text` (title); the
// `icon` mid color is the watermark, and the description blends text↔bg in CSS.
function svgIcon(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
const CATEGORY_STYLE = {
  "Agents":          { bg: "#EEEDFE", icon: "#7F77DD", text: "#3C3489", svg: svgIcon(`<rect x="5" y="8" width="14" height="11" rx="2"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/><circle cx="9.5" cy="13" r="1.1"/><circle cx="14.5" cy="13" r="1.1"/><path d="M9.5 16.5h5"/>`) },
  "RAG":             { bg: "#E1F5EE", icon: "#1D9E75", text: "#0F6E56", svg: svgIcon(`<circle cx="11" cy="11" r="6"/><path d="M20 20l-3.6-3.6"/>`) },
  "LLMs":            { bg: "#E6F1FB", icon: "#378ADD", text: "#0C447C", svg: svgIcon(`<rect x="7" y="7" width="10" height="10" rx="1.5"/><rect x="10" y="10" width="4" height="4"/><path d="M10 7V4M14 7V4M10 20v-3M14 20v-3M7 10H4M7 14H4M20 10h-3M20 14h-3"/>`) },
  "Frameworks":      { bg: "#EEF0FE", icon: "#6366F1", text: "#3730A3", svg: svgIcon(`<rect x="4" y="4" width="10" height="10" rx="1.5"/><rect x="10.5" y="10.5" width="9.5" height="9.5" rx="1.5"/>`) },
  "Generative":      { bg: "#FBEAF0", icon: "#D4537E", text: "#993556", svg: svgIcon(`<path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7z"/><path d="M18 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>`) },
  "Evaluation":      { bg: "#FAEEDA", icon: "#BA7517", text: "#633806", svg: svgIcon(`<path d="M4 20h16"/><rect x="6" y="11" width="3" height="6"/><rect x="11" y="7" width="3" height="10"/><rect x="16" y="13" width="3" height="4"/>`) },
  "Infrastructure":  { bg: "#EEF2F6", icon: "#64748B", text: "#334155", svg: svgIcon(`<rect x="4" y="5" width="16" height="6" rx="1.5"/><rect x="4" y="13" width="16" height="6" rx="1.5"/><path d="M8 8h.01M8 16h.01"/>`) },
  "Safety":          { bg: "#FCEBEB", icon: "#E24B4A", text: "#791F1F", svg: svgIcon(`<path d="M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/>`) },
  "Foundations":     { bg: "#EAF3DE", icon: "#639922", text: "#27500A", svg: svgIcon(`<path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2z"/><path d="M18 16H7a2 2 0 0 0-2 2"/>`) },
  "Build Projects":  { bg: "#FAECE7", icon: "#D85A30", text: "#712B13", svg: svgIcon(`<path d="M14.7 6.3a3.6 3.6 0 0 0-4.9 4.4l-5.6 5.6 1.5 1.5 5.6-5.6a3.6 3.6 0 0 0 4.4-4.9l-2.1 2.1-1.6-.4-.4-1.6z"/>`) },
};
const DEFAULT_STYLE = { bg: "#EEF2F6", icon: "#64748B", text: "#334155", svg: svgIcon(`<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>`) };
function catStyle(cat) { return CATEGORY_STYLE[cat] || DEFAULT_STYLE; }
async function loadLibrary() {
  if (libLoaded) { renderLibrary(); return; }
  try {
    const res = await fetch("/api/library");
    const { lessons } = await res.json();
    libAll = lessons || [];
    libLoaded = true;
    const cats = ["All", ...Array.from(new Set(libAll.map((l) => l.category)))];
    libCatsEl.innerHTML = "";
    cats.forEach((c) => {
      const b = document.createElement("button");
      b.className = "lib-cat" + (c === libCat ? " active" : "");
      b.textContent = c; b.type = "button";
      b.addEventListener("click", () => { libCat = c; libCatsEl.querySelectorAll(".lib-cat").forEach((x) => x.classList.toggle("active", x.textContent === c)); renderLibrary(); });
      libCatsEl.appendChild(b);
    });
    renderLibrary();
  } catch { libEmpty.hidden = false; libEmpty.textContent = "Couldn't load the library."; }
}
function renderLibrary() {
  const q = (libSearch.value || "").trim().toLowerCase();
  const items = libAll.filter((l) =>
    (libCat === "All" || l.category === libCat) &&
    (!q || (l.title + " " + l.description + " " + l.category).toLowerCase().includes(q))
  );
  libGrid.innerHTML = "";
  libEmpty.hidden = items.length > 0;
  for (const l of items) {
    const el = document.createElement("button");
    el.className = "lib-card"; el.type = "button";
    const s = catStyle(l.category);
    el.style.setProperty("--cov-bg", s.bg);
    el.style.setProperty("--cov-icon", s.icon);
    el.style.setProperty("--cov-text", s.text);
    el.innerHTML =
      `<div class="lib-cover">` +
        `<span class="lib-ico" aria-hidden="true">${s.svg}</span>` +
        `<div class="lib-cover-text">` +
          `<span class="lib-title">${escapeHtml(l.title)}</span>` +
          (l.description ? `<span class="lib-desc">${escapeHtml(l.description)}</span>` : "") +
        `</div>` +
      `</div>` +
      `<div class="lib-foot"><span class="lib-pill">${escapeHtml(l.category)}</span><span class="lib-dot">·</span><span class="lib-lvl">${escapeHtml(l.level || "")}</span><span class="lib-dot">·</span><span>${l.estMinutes || "?"} min</span></div>`;
    el.addEventListener("click", () => openLibraryLesson(l.slug, l.title));
    libGrid.appendChild(el);
  }
}
libSearch.addEventListener("input", () => { if (libLoaded) renderLibrary(); });

function openLibraryLesson(slug, title) {
  switchTab("trainer");
  chatLog.innerHTML = "";
  toggleChat(false);
  overviewArtifactId = null; setOverviewMode(false);
  lessonTabsEl.hidden = true; currentCourse = null;
  genOverlay.hidden = true; viewerEmpty.hidden = true; viewerFrame.hidden = false;
  viewerFrame.src = "/api/lesson/" + slug;
  document.getElementById("viewer-title").textContent = title;
  currentArtifactId = null; currentViewUrl = "/api/lesson/" + slug;
  ratingEl.hidden = true; downloadBtn.hidden = true; askMoreBtn.hidden = true;
  openWindowBtn.hidden = false;
}

// ============================================================================
// Background generation jobs — start, poll, show progress on the dashboard,
// open as soon as the overview exists. Handles single lessons AND courses.
// ============================================================================
// ---- STAGE 1: the FREE OVERVIEW (human-in-the-loop gate) ----
// Generate only the overview (skeleton), land on the Trainer, show progress, then
// render the overview with two CTAs: Generate Lesson / Edit overview.
async function startOverview(payload) {
  lastOverviewPayload = payload;
  let jobId;
  // Land on the Trainer and show overview-generation progress over the viewer.
  switchTab("trainer");
  lessonTabsEl.hidden = true; currentCourse = null;
  toggleChat(false);
  setOverviewMode(false);
  viewerFrame.hidden = true; viewerEmpty.hidden = true;
  downloadBtn.hidden = true; openWindowBtn.hidden = true; askMoreBtn.hidden = true; ratingEl.hidden = true;
  genOverlay.hidden = false;
  genLabel.textContent = "Designing your overview…";
  try {
    const res = await fetch("/api/overview", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
    if (res.status === 401) { genOverlay.hidden = true; openAuth("signin"); return; }
    const data = await res.json();
    if (!res.ok || !data.jobId) throw new Error(data.error || "Could not start the overview.");
    jobId = data.jobId;
  } catch (e) { genOverlay.hidden = true; viewerEmpty.hidden = false; viewerEmpty.innerHTML = "⚠️ " + escapeHtml(e.message); return; }
  activeJobId = jobId;
  promptEl.value = "";
  pollOverview(jobId);
}

function pollOverview(jobId) {
  if (activeJobTimer) clearTimeout(activeJobTimer);
  const tick = async () => {
    if (activeJobId !== jobId) return;
    let job;
    try { const r = await fetch("/api/job/" + jobId, { headers: authHeaders() }); if (!r.ok) throw new Error("lost"); job = await r.json(); }
    catch { activeJobTimer = setTimeout(tick, 3000); return; }
    const l = job.lessons && job.lessons[0];
    if (job.status === "error") { activeJobId = null; genOverlay.hidden = true; viewerEmpty.hidden = false; viewerEmpty.innerHTML = "⚠️ " + escapeHtml(job.error || "Overview generation failed."); return; }
    if (job.status === "done" && l && l.artifactId) { activeJobId = null; openOverviewDraft(l.artifactId, l.title); return; }
    genLabel.textContent = l && l.status === "designing" ? "Designing the lesson outline…" : "Generating your overview…";
    activeJobTimer = setTimeout(tick, 2000);
  };
  tick();
}

// Show the overview draft with the approve/refine CTAs (no Ask/Download/Rate — it's free, not a full lesson yet).
function openOverviewDraft(id, title) {
  overviewArtifactId = id;
  currentArtifactId = null; // not a real lesson yet → Ask-more etc. stay off
  currentViewUrl = "/api/artifact/" + id;
  genOverlay.hidden = true; viewerEmpty.hidden = true;
  viewerFrame.hidden = false; viewerFrame.src = "/api/artifact/" + id;
  document.getElementById("viewer-title").textContent = title || "Overview";
  downloadBtn.hidden = true; askMoreBtn.hidden = true; ratingEl.hidden = true;
  openWindowBtn.hidden = false;
  setOverviewMode(true);
}

// Toggle the overview-gate CTAs (Generate Lesson / Edit overview).
function setOverviewMode(on) {
  if (genLessonBtn) genLessonBtn.hidden = !on;
  if (editOverviewBtn) editOverviewBtn.hidden = !on;
}

// ---- STAGE 2: approve → build the full lesson, then go to My Lessons (current flow) ----
async function startBuild(artifactId) {
  let jobId;
  try {
    const res = await fetch("/api/build", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ artifactId }) });
    if (res.status === 401) { openAuth("signin"); return; }
    const data = await res.json();
    if (!res.ok || !data.jobId) throw new Error(data.error || "Could not start the lesson build.");
    jobId = data.jobId;
  } catch (e) { dashActive.innerHTML = `<div class="job-card"><div class="job-meta">⚠️ ${escapeHtml(e.message)}</div></div>`; switchTab("dashboard"); return; }
  activeJobId = jobId;
  overviewArtifactId = null;
  setOverviewMode(false);
  // Send the learner to My Lessons, where the build progresses and opens when ready.
  updateGenStatus(true);
  switchTab("dashboard");
  pollJob(jobId);
}

// CTA wiring for the overview gate.
if (genLessonBtn) genLessonBtn.addEventListener("click", () => { if (overviewArtifactId) startBuild(overviewArtifactId); });
if (editOverviewBtn) editOverviewBtn.addEventListener("click", openEditOverview);
if (editCloseBtn) editCloseBtn.addEventListener("click", () => { editOverlay.hidden = true; });
if (editRegenBtn) editRegenBtn.addEventListener("click", () => {
  const fb = (editFeedback.value || "").trim();
  if (!lastOverviewPayload) { editOverlay.hidden = true; return; }
  const payload = { ...lastOverviewPayload };
  if (fb) payload.prompt = (basePrompt || lastOverviewPayload.prompt || "") + "\n\n[Please revise the overview based on this feedback: " + fb + "]";
  editOverlay.hidden = true;
  startOverview(payload);
});
function openEditOverview() {
  if (editFeedback) editFeedback.value = "";
  if (editOverlay) editOverlay.hidden = false;
  if (editFeedback) editFeedback.focus();
}

// The "⏳ generating" pill in the Trainer's bar (links to My Lessons for progress).
function updateGenStatus(active) { if (genStatus) genStatus.hidden = !active; }

function pollJob(jobId) {
  if (activeJobTimer) clearTimeout(activeJobTimer);
  const tick = async () => {
    if (activeJobId !== jobId) return;
    let job;
    try { const r = await fetch("/api/job/" + jobId, { headers: authHeaders() }); if (!r.ok) { dashActive.innerHTML = ""; activeJobId = null; loadDashboard(); return; } job = await r.json(); }
    catch { activeJobTimer = setTimeout(tick, 3000); return; }
    renderJobCard(job);
    if (currentCourse && job.courseId && currentCourse.courseId === job.courseId) refreshCourseTabs(job.lessons);
    if (job.status === "done" || job.status === "error") {
      activeJobId = null; dashActive.innerHTML = ""; updateGenStatus(false);
      // If the Trainer is still on the generating empty-state (nothing opened), nudge the user.
      if (!currentArtifactId) {
        viewerEmpty.innerHTML = job.status === "done"
          ? "✓ Your lesson is ready — open it from <strong>My Lessons</strong>."
          : "⚠️ Generation failed — see <strong>My Lessons</strong>.";
      }
      loadDashboard(); loadSuggestions(); return;
    }
    activeJobTimer = setTimeout(tick, 2500);
  };
  tick();
}

function renderJobCard(job) {
  const first = job.lessons && job.lessons[0];
  const pct = first ? first.percent : (job.status === "planning" ? 5 : 8);
  const openable = !!(first && first.artifactId);
  let parts = "";
  if (job.isCourse) {
    parts = `<div class="job-parts">` + job.lessons.map((l) => {
      const ico = l.status === "done" ? "✓" : (l.artifactId ? "▸" : (l.status === "designing" || l.status === "building" ? "⏳" : "·"));
      const pctTxt = (l.status !== "pending" && l.status !== "done") ? ` · ${l.percent}%` : "";
      return `<div class="job-part ${l.status === "done" ? "done" : ""}"><span class="jp-ico">${ico}</span>${escapeHtml(l.title)}${pctTxt}</div>`;
    }).join("") + `</div>`;
  }
  const headline = job.isCourse ? `Course · ${job.lessons.length} lessons` : (first && first.title ? first.title : "Designing your lesson…");
  const statusText = job.status === "error" ? ("⚠️ " + (job.error || "Generation failed")) :
    openable ? (job.isCourse ? "Kick-off ready — open while the rest build" : "Overview ready — open and read while modules build") : "Designing your lesson…";
  dashActive.innerHTML = `<div class="job-card">
      <div class="job-title"><span class="job-spin"></span>${escapeHtml(headline)}</div>
      <div class="job-bar"><i style="width:${pct}%"></i></div>
      <div class="job-meta"><span>${escapeHtml(statusText)}</span><button class="job-open" ${openable ? "" : "disabled"}>${openable ? "Open →" : pct + "%"}</button></div>
      ${parts}
    </div>`;
  const btn = dashActive.querySelector(".job-open");
  if (btn && openable) btn.addEventListener("click", () => openFromJob(job));
}

function openFromJob(job) {
  if (job.isCourse) openCourse(job.courseId, job.lessons.map((l) => ({ index: l.index, title: l.title, artifactId: l.artifactId, status: l.status })), 0);
  else { const f = job.lessons[0]; if (f && f.artifactId) openLessonInWorkspace(f.artifactId, f.title); }
}

// ---- Course view (lesson-tab strip) ----
function openLessonInWorkspace(id, title, prompt) {
  switchTab("trainer");
  chatLog.innerHTML = "";
  toggleChat(false);
  lessonTabsEl.hidden = true; currentCourse = null;
  basePrompt = prompt || title;
  openInViewer(id, title);
}
function openCourse(courseId, lessons, activeIndex) {
  switchTab("trainer");
  chatLog.innerHTML = "";
  toggleChat(false);
  currentCourse = { courseId, lessons, activeIndex: activeIndex || 0 };
  renderLessonTabs();
  const a = lessons[currentCourse.activeIndex];
  if (a && a.artifactId) openInViewer(a.artifactId, a.title);
}
function renderLessonTabs() {
  if (!currentCourse) { lessonTabsEl.hidden = true; return; }
  lessonTabsEl.hidden = false;
  lessonTabsEl.innerHTML = "";
  currentCourse.lessons.forEach((l, i) => {
    const ready = !!l.artifactId;
    const b = document.createElement("button");
    b.className = "lesson-tab" + (i === currentCourse.activeIndex ? " active" : "");
    if (!ready) b.disabled = true;
    const ico = l.status === "done" || ready ? "" : "⏳ ";
    b.innerHTML = `${ico}<b>${i + 1}.</b> ${escapeHtml(l.title)}`;
    b.addEventListener("click", () => { if (ready) { currentCourse.activeIndex = i; renderLessonTabs(); openInViewer(l.artifactId, l.title); } });
    lessonTabsEl.appendChild(b);
  });
}
function refreshCourseTabs(jobLessons) {
  if (!currentCourse) return;
  // merge artifactIds/status as later lessons come online
  currentCourse.lessons = jobLessons.map((l) => ({ index: l.index, title: l.title, artifactId: l.artifactId, status: l.status }));
  renderLessonTabs();
}
async function openCourseById(courseId, title) {
  try {
    const res = await fetch("/api/course/" + courseId, { headers: authHeaders() });
    const { lessons } = await res.json();
    if (!lessons || !lessons.length) return;
    openCourse(courseId, lessons.map((l) => ({ index: l.index, title: l.title, artifactId: l.id, status: "done" })), 0);
  } catch { /* ignore */ }
}

// ---- Tiny helpers ----
function scrollDown() { chatLog.scrollTop = chatLog.scrollHeight; }
function mdLite(s) { return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"); }
function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

// ============================================================================
// Animated neural-network hero backdrop (canvas; respects reduced motion).
// ============================================================================
(function neural() {
  const canvas = document.getElementById("neural");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w, h, nodes, raf;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.width = Math.max(1, r.width * dpr);
    h = canvas.height = Math.max(1, r.height * dpr);
    const count = Math.min(64, Math.floor((r.width * r.height) / 14000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.18 * dpr, vy: (Math.random() - 0.5) * 0.18 * dpr,
      r: (Math.random() * 1.6 + 1.1) * dpr,
    }));
  }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    const linkDist = 150 * (Math.min(window.devicePixelRatio || 1, 2));
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > w) a.vx *= -1;
      if (a.y < 0 || a.y > h) a.vy *= -1;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d < linkDist) {
          const o = (1 - d / linkDist) * 0.5;
          ctx.strokeStyle = `rgba(96,165,250,${o})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }
    for (const n of nodes) {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(125,211,252,0.9)"; ctx.fill();
    }
    if (!reduce) raf = requestAnimationFrame(frame);
  }
  resize();
  frame();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => { cancelAnimationFrame(raf); resize(); frame(); }, 150); });
})();

// ============================================================================
// Supabase Auth — modal opened from Sign in / Sign up. When auth is OFF (no
// SUPABASE_URL/ANON on the server) the app runs open and the dashboard uses a
// local identity, so everything works locally with zero auth config.
// ============================================================================
let sb = null;
let accessToken = null;
let authMode = "signin";
let authIsEnabled = false;
const authOverlay = document.getElementById("auth-overlay");
const authActions = document.getElementById("auth-actions");
const authLoading = document.getElementById("auth-loading");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authSub = document.getElementById("auth-sub");
const authEmail = document.getElementById("auth-email");
const authPassword = document.getElementById("auth-password");
const authMsg = document.getElementById("auth-msg");
const authSubmit = document.getElementById("auth-submit");
const authSwitchText = document.getElementById("auth-switch-text");
const authToggle = document.getElementById("auth-toggle");
const authClose = document.getElementById("auth-close");
const logoutBtn = document.getElementById("logout");
const authWho = document.getElementById("auth-who");

function authHeaders() { return accessToken ? { Authorization: "Bearer " + accessToken } : {}; }
function authRequiredAndOut() { return authIsEnabled && !accessToken; }
function showAuthMsg(text, kind) { authMsg.hidden = !text; authMsg.textContent = text || ""; authMsg.className = "auth-msg" + (kind ? " " + kind : ""); }
// The overlay is an on-demand MODAL (gates generation/dashboard; browsing stays open).
function openAuth(mode) { setAuthMode(mode || "signin"); authLoading.hidden = true; authForm.hidden = false; authOverlay.hidden = false; }
function closeAuth() { authOverlay.hidden = true; }
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create your account" : "Sign in";
  authSub.textContent = signup ? "Sign up to start generating lessons." : "Welcome back.";
  authSubmit.textContent = signup ? "Create account" : "Sign in";
  authSwitchText.textContent = signup ? "Already have an account?" : "New here?";
  authToggle.textContent = signup ? "Sign in" : "Create an account";
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  showAuthMsg("");
}
function applySession(session) {
  accessToken = (session && session.access_token) || null;
  const email = (session && session.user && session.user.email) || "";
  const signedIn = !!accessToken;
  if (logoutBtn) logoutBtn.hidden = !signedIn;
  if (authWho) { authWho.hidden = !signedIn; authWho.textContent = email; }
  if (tabBtnDashboard) tabBtnDashboard.hidden = !signedIn;
  if (authActions) authActions.hidden = signedIn || !authIsEnabled;
  if (signedIn) {
    closeAuth();
    loadDashboard(); loadPreferences(); loadSuggestions(); maybeOnboard();
  }
}

document.getElementById("btn-signin").addEventListener("click", () => openAuth("signin"));
document.getElementById("btn-signup").addEventListener("click", () => openAuth("signup"));
if (authClose) authClose.addEventListener("click", closeAuth);
authOverlay.addEventListener("click", (e) => { if (e.target === authOverlay) closeAuth(); });

async function bootAuth() {
  let cfg;
  try { cfg = await (await fetch("/api/config")).json(); } catch { cfg = { authEnabled: false }; }
  authIsEnabled = !!cfg.authEnabled;

  if (!authIsEnabled) {
    // Open mode (local dev): no gate; dashboard + prefs use the server's local id.
    authOverlay.hidden = true;
    if (tabBtnDashboard) tabBtnDashboard.hidden = false;
    loadDashboard(); loadPreferences(); loadSuggestions(); maybeOnboard();
    return;
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    if (authActions) authActions.hidden = false; // still show the buttons (they'll report the error)
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  setAuthMode("signup"); // new visitors default to sign-up

  const { data } = await sb.auth.getSession();
  applySession(data.session);
  sb.auth.onAuthStateChange((_e, session) => applySession(session));

  authToggle.addEventListener("click", () => setAuthMode(authMode === "signin" ? "signup" : "signin"));
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const password = authPassword.value;
    if (!email || password.length < 6) { showAuthMsg("Enter an email and a 6+ character password.", "err"); return; }
    authSubmit.disabled = true;
    showAuthMsg("Working…");
    try {
      if (authMode === "signup") {
        const { data: d, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        // Supabase returns a user with EMPTY identities when the email already exists.
        if (d.user && Array.isArray(d.user.identities) && d.user.identities.length === 0) {
          setAuthMode("signin"); authEmail.value = email;
          showAuthMsg("This email is already registered — sign in instead (or reset your password).", "err");
        } else if (!d.session) {
          // Email confirmation is ON → verify before signing in.
          setAuthMode("signin"); authEmail.value = email;
          showAuthMsg("✉️ Verify your email — we sent a confirmation link to " + email + ". Click it, then sign in here.", "ok");
        } else {
          // Email confirmation is OFF on the project → signed in immediately.
          showAuthMsg("Account created — you're signed in.", "ok");
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      showAuthMsg((err && err.message) || "Sign-in failed.", "err");
    } finally {
      authSubmit.disabled = false;
    }
  });
  if (logoutBtn) logoutBtn.addEventListener("click", async () => { await sb.auth.signOut(); applySession(null); });
}

// ---- Preferences: pre-fill the dropdowns + context fields from last time ----
async function loadPreferences() {
  try {
    const res = await fetch("/api/preferences", { headers: authHeaders() });
    if (!res.ok) return;
    const { prefs } = await res.json();
    if (!prefs) return;
    applyPref("level", prefs.levels && prefs.levels[0], false);
    applyPref("depth", axisToValues(prefs.depth), true);
    applyPref("examples", axisToValues(prefs.examples), true);
    applyPref("density", prefs.density, false);
    if (prefs.visuals) applyPref("extras", "visuals", true, true);
    if (prefs.syntax) applyPref("extras", "syntax", true, true);
    applyPref("lessonType", prefs.lessonTypes, true);
    if (prefs.readingMode) applyPref("readingMode", prefs.readingMode, false);
    if (prefs.industry) industryEl.value = prefs.industry;
    if (prefs.buildGoal) buildGoalEl.value = prefs.buildGoal;
    updateFrameworkVisibility();
    if (prefs.framework && sel.examples.includes("code")) applyPref("framework", prefs.framework, false);
  } catch { /* ignore */ }
}
function applyPref(field, value, multi, append) {
  const dd = document.querySelector(`.dd[data-field="${field}"]`);
  if (!dd || value == null) return;
  const valueEl = dd.querySelector(".dd-value");
  const values = multi ? (Array.isArray(value) ? value : [value]) : [value];
  if (!append) { sel[field] = multi ? [] : null; dd.querySelectorAll(".dd-opt").forEach((o) => o.classList.remove("sel")); }
  for (const v of values) {
    if (!v) continue;
    const opt = dd.querySelector(`.dd-opt[data-value="${v}"]`);
    if (!opt) continue;
    opt.classList.add("sel");
    if (multi) { if (!sel[field].includes(v)) sel[field].push(v); } else { sel[field] = v; }
  }
  renderDdValue(dd, field, multi, valueEl);
}

// ---- Onboarding: one optional question at a time, after first sign-up ----
const onboardOverlay = document.getElementById("onboard-overlay");
const obSteps = Array.from(document.querySelectorAll(".ob-step"));
const obNext = document.getElementById("ob-next");
const obSkip = document.getElementById("ob-skip");
let obStep = 0;
function showOnboardStep(i) {
  obSteps.forEach((s, si) => { s.hidden = si !== i; });
  obNext.textContent = i >= obSteps.length - 1 ? "Finish" : "Next →";
  const inp = obSteps[i].querySelector("input"); if (inp) setTimeout(() => inp.focus(), 50);
}
async function finishOnboarding() {
  const payload = {
    industry: (document.getElementById("ob-industry").value || "").trim(),
    role: (document.getElementById("ob-role").value || "").trim(),
    aspiringRole: (document.getElementById("ob-aspiring").value || "").trim(),
    personalGoal: (document.getElementById("ob-goal").value || "").trim(),
  };
  onboardOverlay.hidden = true;
  try { localStorage.setItem("als-onboarded", "1"); } catch (e) {}
  try { await fetch("/api/profile", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) }); } catch (e) {}
  loadPreferences(); loadSuggestions();
}
obNext.addEventListener("click", () => { if (obStep >= obSteps.length - 1) finishOnboarding(); else { obStep++; showOnboardStep(obStep); } });
obSkip.addEventListener("click", () => { try { localStorage.setItem("als-onboarded", "1"); } catch (e) {} onboardOverlay.hidden = true; });
async function maybeOnboard() {
  try { if (localStorage.getItem("als-onboarded")) return; } catch (e) {}
  try {
    const res = await fetch("/api/preferences", { headers: authHeaders() });
    const { prefs } = await res.json();
    const p = (prefs && prefs.profile) || {};
    if (p.industry || p.role || p.aspiringRole || p.personalGoal) return;
    obStep = 0; showOnboardStep(0); onboardOverlay.hidden = false;
  } catch (e) {}
}

bootAuth();
