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

// Bar-2 Dark toggle — the lesson renders in a same-origin iframe, so we flip the shared
// `als-theme` and post it live to the frame (its runtime applies it without a reload).
const viewerTheme = document.getElementById("viewer-theme");
if (viewerTheme) {
  const reflectTheme = () => { try { viewerTheme.textContent = localStorage.getItem("als-theme") === "dark" ? "☀ Light" : "🌙 Dark"; } catch (e) {} };
  reflectTheme();
  viewerTheme.addEventListener("click", () => {
    let next = "dark";
    try { next = localStorage.getItem("als-theme") === "dark" ? "light" : "dark"; localStorage.setItem("als-theme", next); } catch (e) {}
    try { if (viewerFrame.contentWindow) viewerFrame.contentWindow.postMessage({ type: "als-theme", value: next }, "*"); } catch (e) {}
    reflectTheme();
  });
}
askMoreBtn.addEventListener("click", () => toggleChat());
chatCloseBtn.addEventListener("click", () => toggleChat(false));
function toggleChat(force) {
  const open = force === undefined ? !workspace.classList.contains("chat-open") : force;
  workspace.classList.toggle("chat-open", open);
  chatEl.hidden = !open;
  if (open) chatInput.focus();
}

// Selections collected from the dropdowns.
const sel = { level: null, depth: [], examples: [], density: null, extras: [], lessonType: [], framework: null, readingMode: null, objective: null };
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
let currentViewModule = null; // module the reader is on in the viewer iframe (null = overview); used to
                              // restore their place when a live-build reload re-renders the iframe.
let basePrompt = ""; // the lesson's original ask (so "modify" keeps context)
let activeJobId = null;
let activeJobTimer = null;
let currentCourse = null; // { courseId, lessons:[{index,title,artifactId,status}], activeIndex }
let overviewArtifactId = null; // the free overview draft currently under review (gate)
let lastOverviewPayload = null; // the payload used to build it (so "Edit overview" can re-run)
let currentLessonOwned = false; // is the open Trainer lesson the user's own (eligible for progress + share)?
let contribBuild = false; // is the active overview/build a "Build for Community" contributor course?
let contribPublishId = null; // artifactId to auto-publish to Community once its build finishes
let lastBuildArtifactId = null; // last lesson we tried to build (so a failed build can be retried)
// Fix 4: the open lessons live in a DROPDOWN under the "Trainer" main tab (sub-tabs) instead of
// a visible bar that ate horizontal space. lessonTabsEl is now that dropdown's menu container.
const lessonTabsEl = document.getElementById("trainer-tabs-menu");
const trainerDdEl = document.getElementById("trainer-dd");
const trainerCaretEl = document.getElementById("trainer-caret");
function closeTrainerMenu() { if (lessonTabsEl) lessonTabsEl.hidden = true; if (trainerCaretEl) trainerCaretEl.setAttribute("aria-expanded", "false"); if (trainerDdEl) trainerDdEl.classList.remove("open"); }
function toggleTrainerMenu(force) {
  if (!lessonTabsEl) return;
  const open = force === undefined ? lessonTabsEl.hidden : force;
  lessonTabsEl.hidden = !open;
  if (trainerCaretEl) trainerCaretEl.setAttribute("aria-expanded", String(open));
  if (trainerDdEl) trainerDdEl.classList.toggle("open", open);
}
if (trainerCaretEl) trainerCaretEl.addEventListener("click", (e) => { e.stopPropagation(); toggleTrainerMenu(); });
// Click-away closes the open-lessons menu (mirrors the configurator dropdowns).
document.addEventListener("click", (e) => { if (trainerDdEl && !trainerDdEl.contains(e.target)) closeTrainerMenu(); });

// ---- Trainer tabs: up to 5 open lessons/overviews. One generation at a time; a
// generating tab keeps running in the background (survives tab-close + page refresh).
const MAX_TABS = 5;
const TABS_KEY = "als-tabs-v1";
let tabs = [];          // [{ id, type:'generating'|'overview'|'lesson'|'library'|'community', title, art, slug, prompt, building, percent }]
let activeTabId = null;
let genTabId = null;    // tab that owns the single in-flight generation (null once its tab is closed)
let tabSeq = 1;
const tabById = (id) => tabs.find((t) => t.id === id);

// Friendly labels for the dropdown summary.
const VALUE_LABELS = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  conceptual: "Conceptual", technical: "Technical",
  functional: "Functional", code: "Code",
  low: "Low", medium: "Medium", high: "High",
  visuals: "Visuals", syntax: "Syntax",
  content: "Content", knowledge_check: "Knowledge check",
  vertical: "Vertical scroll", horizontal: "Horizontal scroll",
  learning: "Learning", learn_and_apply: "Learn & apply", build: "Build something",
  exam_prep: "Exam prep", interview_prep: "Interview prep", other: "Other",
};
const DD_DEFAULTS = { level: "Any", depth: "Auto", examples: "Auto", density: "Balanced", extras: "None", lessonType: "Content", framework: "Pick one", readingMode: "Vertical scroll", objective: "Any" };

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

// ---- Upload gating + size cap ----
// A file/repo is parsed + chunked + embedded ON THE SERVER; the front-end only learns its
// docId once that finishes. So while ANY upload is in flight we DISABLE "Generate Overview" —
// otherwise a click mid-upload sends an empty uploadIds and the lesson is generated WITHOUT the
// just-added grounding (the reported bug). 25MB hard cap, checked client- and server-side.
const MAX_UPLOAD_MB = 25;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
let pendingUploads = 0;
function setUploadPending(delta) {
  pendingUploads = Math.max(0, pendingUploads + delta);
  refreshUploadGate();
}
function refreshUploadGate() {
  const busy = pendingUploads > 0;
  if (generateBtn) {
    generateBtn.disabled = busy;
    generateBtn.classList.toggle("waiting-upload", busy);
    generateBtn.title = busy ? "Finishing reading your file/repo…" : "";
  }
  if (busy) {
    uploadHint.hidden = false;
    uploadHint.textContent = "Reading your file/repo on the server… Generate unlocks once it's ready, so your lesson includes it.";
  } else {
    updateUploadUI();
  }
}

addDocsBtn.addEventListener("click", () => fileInput.click());
referChk.addEventListener("change", updateUploadUI);
fileInput.addEventListener("change", async () => {
  for (const file of Array.from(fileInput.files)) {
    if (file.size > MAX_UPLOAD_BYTES) {
      const c = addChip(file.name, `✕ too large — max ${MAX_UPLOAD_MB}MB`);
      c.classList.remove("uploading");
      c.classList.add("failed");
      continue;
    }
    const chip = addChip(file.name, "uploading…");
    setUploadPending(1);
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
    } finally {
      setUploadPending(-1);
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
  setUploadPending(1);
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
  } finally { addRepoBtn.disabled = false; setUploadPending(-1); }
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
  if (pendingUploads > 0) return; // refreshUploadGate owns the hint + button while an upload is in flight
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
    objective: sel.objective || "",
    uploadIds: uploadedDocs.map((d) => d.docId),
    referOnly: referChk.checked,
    threadId,
  };
}

// ---- Submit ----
generateBtn.addEventListener("click", () => {
  if (pendingUploads > 0) return; // button is disabled while uploads finish; belt-and-suspenders
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
  planner: "Mapping the lesson structure…",
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
// Open a saved lesson the user owns (delegates into the tab manager).
function openInViewer(id, title) { openTab({ type: "lesson", title: title, art: id }); }

// ---- Tab manager ----------------------------------------------------------
// Free a slot when at the cap by evicting the oldest tab that isn't active and
// isn't mid-generation. Returns false only if every tab is busy.
function makeRoomForTab() {
  if (tabs.length < MAX_TABS) return true;
  const victim = tabs.find((t) => t.id !== activeTabId && t.id !== genTabId && t.type !== "generating" && !t.building);
  if (!victim) return false;
  tabs = tabs.filter((t) => t !== victim);
  return true;
}

// Open a descriptor as a tab — focusing an equivalent already-open tab instead of duplicating.
function openTab(desc) {
  const same = tabs.find((t) => (desc.art && t.art === desc.art) || (desc.slug && t.slug === desc.slug && t.type === desc.type));
  if (same) {
    // Bug 1: if we're re-opening the SAME artifact but its kind changed from a preview
    // overview draft → a real lesson (e.g. opened from My Lessons after Generate Lesson),
    // the open iframe is still the preview-locked render. Force a reload so it unlocks.
    const wasPreview = same.type === "overview" && desc.type === "lesson";
    Object.assign(same, desc, { id: same.id });
    switchTab("trainer"); activateTab(same.id);
    if (wasPreview) reloadViewer();
    return same;
  }
  if (!makeRoomForTab()) { alert("You can keep up to " + MAX_TABS + " lessons open — close one first."); return null; }
  const t = Object.assign({ id: "t" + tabSeq++ }, desc);
  tabs.push(t);
  switchTab("trainer");
  activateTab(t.id);
  return t;
}

function closeTab(id) {
  const t = tabById(id);
  if (!t) return;
  const idx = tabs.indexOf(t);
  // If this tab owns the in-flight generation, DETACH it — the server job keeps running
  // and the lesson shows up in My Lessons when done; we just stop showing it here.
  if (genTabId === id) genTabId = null;
  tabs = tabs.filter((x) => x.id !== id);
  if (activeTabId === id) {
    const next = tabs[idx] || tabs[idx - 1] || tabs[tabs.length - 1];
    if (next) activateTab(next.id); else showNoTabs();
  } else { renderTabBar(); }
  persistTabs();
}

function showNoTabs() {
  activeTabId = null;
  currentArtifactId = null; overviewArtifactId = null; currentLessonOwned = false; currentViewUrl = null; currentViewModule = null;
  viewerFrame.hidden = true; genOverlay.hidden = true; viewerEmpty.hidden = false;
  downloadBtn.hidden = true; openWindowBtn.hidden = true; askMoreBtn.hidden = true; ratingEl.hidden = true; setOverviewMode(false);
  document.getElementById("viewer-title").textContent = "Lesson";
  renderTabBar();
}

// Point the single iframe + the viewer bar at a tab, and sync the global mirrors the
// rest of the app reads (currentArtifactId / overviewArtifactId / currentViewUrl / …).
function activateTab(id) {
  const t = tabById(id);
  if (!t) return;
  activeTabId = id;
  toggleChat(false); chatLog.innerHTML = "";
  currentArtifactId = null; overviewArtifactId = null; currentLessonOwned = false; currentViewUrl = null; currentViewModule = null;
  basePrompt = t.prompt || t.title || "";
  document.getElementById("viewer-title").textContent = t.title || "Lesson";
  // Bug 2: while a build hasn't finished its FIRST module, show the "building" overlay instead of
  // the lesson — so we never land the reader on a still-empty / work-in-progress module.
  const buildingFirst = t.type === "lesson" && t.building && !t._firstReady;
  if (t.type === "generating" || buildingFirst) {
    viewerFrame.hidden = true; viewerEmpty.hidden = true; genOverlay.hidden = false;
    genLabel.textContent = buildingFirst ? "Building your lesson — this takes a couple of minutes. Your first section opens as soon as it's ready…" : ((t.percent || 0) > 8 ? "Designing the lesson outline…" : "Designing your overview — usually about a minute…");
    downloadBtn.hidden = true; openWindowBtn.hidden = true; askMoreBtn.hidden = true; ratingEl.hidden = true; setOverviewMode(false);
  } else {
    const url = t.art ? "/api/artifact/" + t.art : t.type === "community" ? "/api/community/lesson/" + t.slug : "/api/lesson/" + t.slug;
    currentViewUrl = url;
    genOverlay.hidden = true; viewerEmpty.hidden = true; viewerFrame.hidden = false;
    // Bug 1: when a build is running in ANOTHER tab, the iframe may currently be showing that WIP
    // lesson (the live-build reload cache-busts its src). FORCE a fresh load of the selected lesson
    // so the reader is never left stuck on the building lesson's content.
    const fresh = (activeJobId && t.id !== genTabId) ? url + (url.indexOf("?") < 0 ? "?" : "&") + "v=" + Date.now() : url;
    if (viewerFrame.getAttribute("src") !== fresh) viewerFrame.src = fresh;
    if (t.type === "overview") {
      overviewArtifactId = t.art;
      downloadBtn.hidden = true; askMoreBtn.hidden = true; ratingEl.hidden = true; openWindowBtn.hidden = false; setOverviewMode(true);
    } else if (t.type === "lesson") {
      currentArtifactId = t.art; currentLessonOwned = true;
      downloadBtn.hidden = false; downloadBtn.href = "/api/artifact/" + t.art + "/full";
      openWindowBtn.hidden = false; askMoreBtn.hidden = false; resetStars(); ratingEl.hidden = false; setOverviewMode(false);
    } else { // library / community (public, read-only)
      downloadBtn.hidden = true; askMoreBtn.hidden = true; ratingEl.hidden = true; openWindowBtn.hidden = false; setOverviewMode(false);
    }
  }
  renderTabBar();
  persistTabs();
}

// Force the viewer iframe to re-fetch its CURRENT artifact even though the URL path is
// unchanged (the tab manager skips a reload when src matches). Used after "Generate Lesson"
// promotes an overview draft → lesson for the SAME id: /api/artifact/:id then re-renders
// WITHOUT the preview lock, so the open Trainer tab stops showing the "🔒 overview" note
// without a manual refresh. A cache-bust query makes the iframe reload reliably.
function reloadViewer() {
  const t = tabById(activeTabId);
  if (!t || !t.art) return;
  const base = "/api/artifact/" + t.art;
  currentViewUrl = base;
  viewerFrame.hidden = false; viewerEmpty.hidden = true; genOverlay.hidden = true;
  // Keep the reader on their current module across a live-build reload (Bug: finishing WIP
  // modules used to bounce them back to the overview).
  const mq = currentViewModule ? "&module=" + encodeURIComponent(currentViewModule) : "";
  viewerFrame.src = base + "?v=" + Date.now() + mq;
}

// Fix 4: render the open lessons into the dropdown menu UNDER the "Trainer" tab (was a visible
// bar). Behavior preserved: open/close/switch/active, the "+" new, and the building spinner. The
// caret next to "Trainer" appears only when ≥1 lesson is open; selecting a lesson closes the menu.
function renderTabBar() {
  if (!lessonTabsEl) return;
  lessonTabsEl.innerHTML = "";
  // Caret visibility tracks whether there's anything to drop down.
  if (trainerCaretEl) trainerCaretEl.hidden = tabs.length === 0;
  if (tabs.length === 0) { closeTrainerMenu(); return; }
  tabs.forEach((t) => {
    const b = document.createElement("button");
    b.className = "lesson-tab" + (t.id === activeTabId ? " active" : "");
    b.type = "button"; b.setAttribute("role", "menuitem");
    const spin = (t.type === "generating" || t.building) ? '<span class="lt-spin"></span>' : "";
    b.innerHTML = `${spin}<span class="lt-title">${escapeHtml(t.title || "Lesson")}</span><span class="lt-x" title="Close">×</span>`;
    b.addEventListener("click", (e) => {
      if (e.target.classList && e.target.classList.contains("lt-x")) { e.stopPropagation(); closeTab(t.id); return; }
      // Picking a lesson from the dropdown must also bring the Trainer panel to the front —
      // otherwise, when opened from another top-level tab (Library, Home, …), the lesson loads
      // into the hidden Trainer panel and the user appears to stay put. (Matches openTab's order.)
      switchTab("trainer"); activateTab(t.id); closeTrainerMenu();
    });
    lessonTabsEl.appendChild(b);
  });
  if (tabs.length < MAX_TABS) {
    const add = document.createElement("button");
    add.className = "lesson-tab lt-add"; add.type = "button"; add.title = "New lesson"; add.setAttribute("role", "menuitem"); add.textContent = "+ New lesson";
    add.addEventListener("click", () => { switchTab("configurator"); closeTrainerMenu(); if (promptEl) promptEl.focus(); });
    lessonTabsEl.appendChild(add);
  }
}

// Persist non-generating tabs (stable view sources) so a refresh keeps them open.
function persistTabs() {
  try {
    const save = tabs.filter((t) => t.type !== "generating" && (t.art || t.slug))
      .map((t) => ({ type: t.type, title: t.title, art: t.art || null, slug: t.slug || null, prompt: t.prompt || null }));
    const act = tabById(activeTabId);
    sessionStorage.setItem(TABS_KEY, JSON.stringify({ tabs: save, active: act && act.type !== "generating" ? tabs.filter((t) => t.type !== "generating" && (t.art || t.slug)).indexOf(act) : 0 }));
  } catch { /* ignore */ }
}
function restoreTabs() {
  let data; try { data = JSON.parse(sessionStorage.getItem(TABS_KEY) || "null"); } catch { data = null; }
  if (!data || !Array.isArray(data.tabs) || !data.tabs.length) return false;
  tabs = data.tabs.map((d) => Object.assign({ id: "t" + tabSeq++, building: false }, d));
  const act = tabs[Math.max(0, Math.min(tabs.length - 1, data.active | 0))];
  renderTabBar();
  // Set up the saved Trainer tabs, but land the user back on the top-level tab they were on
  // (My Lessons / Library / …), NOT always Trainer. `als-toptab` is written by switchTab().
  if (act) {
    let top = "trainer"; try { top = sessionStorage.getItem("als-toptab") || "trainer"; } catch { /* ignore */ }
    activateTab(act.id);
    switchTab(top);
  }
  return true;
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
const TAB_PANELS = { home: "tab-home", configurator: "tab-configurator", "llm-skills": "tab-llm-skills", trainer: "tab-trainer", library: "tab-library", pricing: "tab-pricing", community: "tab-community", "build-community": "tab-build-community", dashboard: "tab-dashboard", account: "tab-account", auth: "tab-auth" };
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
  // Account is the one tab with its own URL — leaving it returns the address bar to "/".
  if (name !== "account" && location.pathname.replace(/\/+$/, "") === "/account") {
    try { history.replaceState({}, "", "/"); } catch { /* ignore */ }
  }
  // Remember where the user is across refresh — but never "account" (URL-restored) or "auth"
  // (a transient sign-in page; a refresh shouldn't dump them back onto it).
  try { if (name !== "account" && name !== "auth") sessionStorage.setItem("als-toptab", name); } catch { /* ignore */ }
  if (name === "dashboard") loadDashboard();
  if (name === "library") loadLibrary();
  if (name === "community") loadCommunity();
  if (name === "build-community") loadBuildCommunity();
}

// ---- Home tab (Halo landing) interactions ----
// Every "Generate / Browse / Meet" CTA just routes to an existing tab via data-goto.
document.querySelectorAll("#tab-home [data-goto]").forEach((el) => {
  el.addEventListener("click", () => { switchTab(el.dataset.goto); window.scrollTo(0, 0); });
});
// "Quick look" preview tabs: toggle the .on pane (purely illustrative, no network).
const ptabs = document.getElementById("ptabs");
if (ptabs) {
  ptabs.addEventListener("click", (e) => {
    const b = e.target.closest(".ptab");
    if (!b) return;
    ptabs.querySelectorAll(".ptab").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("#tab-home .pv").forEach((p) => p.classList.toggle("on", p.dataset.p === b.dataset.p));
  });
}
// Sample knowledge-check options highlight on click (demo only).
document.querySelectorAll("#tab-home .kc .opt").forEach((o) => {
  o.addEventListener("click", () => o.classList.toggle("correct"));
});

// ---- Dashboard tab ----
const dashGrid = document.getElementById("dash-grid");
const dashNote = document.getElementById("dash-note");
const dashEmpty = document.getElementById("dash-empty");
const dashActive = document.getElementById("dash-active");
const tabBtnDashboard = document.getElementById("tab-btn-dashboard");

let dashboardPollTimer = null;
async function loadDashboard() {
  // Don't fire authed fetches before the Supabase token is attached (a boot tab-restore can
  // call this before bootAuth/applySession resolves → 401 race). applySession re-runs the
  // dashboard load once the session is ready, so simply skipping here is safe.
  if (authRequiredAndOut()) return;
  try {
    // /api/lessons = saved lessons; /api/jobs/active = builds still running on the SERVER (so a
    // build that's continuing after a page refresh — when the client poller is gone — still shows).
    const [res, jobsRes] = await Promise.all([
      fetch("/api/lessons", { headers: authHeaders() }),
      fetch("/api/jobs/active", { headers: authHeaders() }).catch(() => null),
    ]);
    if (!res.ok) return;
    const { lessons } = await res.json();
    dashGrid.innerHTML = "";
    if (!lessons || !lessons.length) { dashEmpty.hidden = false; dashNote.textContent = ""; return; }
    dashEmpty.hidden = true;
    // Building progress. The SERVER's active-jobs list is AUTHORITATIVE when available: a
    // completed build won't appear there, so it must NOT show a stale "Building…" from a local
    // tab whose poller stopped (multitask/refresh — the B5 bug). Only fall back to the local
    // building tab when the server's list is unavailable.
    const building = {}; // artifactId -> percent
    let serverJobsOk = false;
    try { if (jobsRes && jobsRes.ok) { serverJobsOk = true; const { jobs } = await jobsRes.json(); for (const j of (jobs || [])) if (j.artifactId) building[j.artifactId] = j.percent; } } catch { /* ignore */ }
    if (!serverJobsOk) { const localBuild = tabs.find((t) => t.building); if (localBuild && localBuild.art) building[localBuild.art] = localBuild.percent || 0; }
    for (const l of lessons) dashGrid.appendChild(lessonCard(l, l.id in building ? building[l.id] : null));
    dashNote.textContent = `${lessons.length} saved · Download to keep a permanent copy`;
    // If a build is active but there's NO client-side poller (e.g. right after a refresh),
    // self-refresh so the badge advances + flips to done. During a live generation, pollJob
    // already drives loadDashboard (activeJobId set) — don't stack a second timer then.
    if (dashboardPollTimer) { clearTimeout(dashboardPollTimer); dashboardPollTimer = null; }
    const dashOpen = !document.getElementById("tab-dashboard").hidden;
    if (Object.keys(building).length && dashOpen && !activeJobId) dashboardPollTimer = setTimeout(loadDashboard, 4000);
  } catch { /* ignore */ }
}
function lessonCard(l, buildingPct) {
  const el = document.createElement("div");
  el.className = "lesson-row";
  const days = l.daysRemaining;
  const warn = days <= 5 ? " warn" : "";
  // Only show a countdown when expiry is actually near (≤30 days); otherwise it just reads "Saved".
  const expiryBadge = days <= 30 ? `<span class="lc-badge${warn}">${days}d left</span>` : `<span class="lc-badge">Saved</span>`;
  const isCourse = l.courseId && (l.courseTotal || 0) > 1;
  const ratingHtml = l.rating ? `<span class="lc-stars">${"★".repeat(l.rating)}${"☆".repeat(5 - l.rating)}</span>` : "";
  const industry = l.industry ? `<span>${escapeHtml(l.industry)}</span>` : "";
  const courseBadge = isCourse ? `<span class="lc-badge">Course · ${l.courseTotal} parts</span>` : "";
  const building = typeof buildingPct === "number";
  const pct = building ? Math.max(0, Math.min(100, buildingPct)) : Math.max(0, Math.min(100, l.percent || 0));
  const shared = isShared(l.id);
  const buildBadge = building ? `<span class="lc-badge building"><span class="lt-spin"></span> Building…</span>` : "";
  const progLabel = building ? `${pct}% built` : `${pct}% complete`;
  el.innerHTML = `
    <div class="lr-main">
      <div class="lr-title">${escapeHtml(l.title)}</div>
      <div class="lr-meta">${buildBadge}${expiryBadge}${courseBadge}${industry}${ratingHtml}</div>
      <div class="lr-prog"><div class="lr-bar"><i style="width:${pct}%"></i></div><span class="lr-pct">${progLabel}</span></div>
    </div>
    <div class="lr-actions">
      <button class="ghost lr-open" type="button">${isCourse ? "Open course" : "Open"}</button>
      ${isCourse ? "" : `<a class="ghost lr-dl" href="/api/artifact/${l.id}/full" download>Download</a>`}
      <button class="lr-share${shared ? " shared" : ""}" type="button" ${shared ? "disabled" : ""}>${shared ? "✓ Shared" : "Community Share — 1 Free Lesson"}</button>
    </div>`;
  el.querySelector(".lr-open").addEventListener("click", () => {
    if (isCourse) { openCourseById(l.courseId, l.title); return; }
    openLessonInWorkspace(l.id, l.title, l.prompt);
  });
  const share = el.querySelector(".lr-share");
  if (share && !shared) share.addEventListener("click", () => openShareModal(l.id));
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
// Per-category card covers: light tints with a faint top-right icon (category color-
// coding, unchanged from the blue app). The app's BASE theme (chrome, buttons, links,
// gradient, lessons) is uniformly blue; these swatches just differentiate categories.
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

// Per-category thumbnail images (optimized webp, ~5–10KB each) live in THIS environment's own
// Supabase Storage public bucket `lesson-thumbs` (CDN-backed). The base URL is derived from the
// supabaseUrl that /api/config returns, so staging + prod each serve from their OWN project.
// Library + Community read these via catStyle().img; set by setThumbBase() once config loads.
const CATEGORY_IMG = {
  "Agents": "agents", "RAG": "rag", "LLMs": "llms", "Frameworks": "frameworks", "Generative": "generative",
  "Evaluation": "evaluation", "Infrastructure": "infrastructure", "Safety": "safety", "Foundations": "foundations", "Build Projects": "build",
};
function setThumbBase(supabaseUrl) {
  if (!supabaseUrl) return; // no Supabase → cards fall back to their flat category colour
  const base = supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/lesson-thumbs/";
  for (const [cat, key] of Object.entries(CATEGORY_IMG)) { if (CATEGORY_STYLE[cat]) CATEGORY_STYLE[cat].img = base + key + ".webp"; }
  // refresh covers if a catalog already rendered before config arrived
  if (libLoaded) renderLibrary();
  if (commLoaded) renderCommunity();
}

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
    if (s.img) el.style.setProperty("--cov-img", `url("${s.img}")`);
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

function openLibraryLesson(slug, title) { openTab({ type: "library", title: title, slug: slug }); }

// ---- Item 4: "while you wait" — relevant free Library lessons shown during overview generation ----
const genSuggest = document.getElementById("gen-suggest");
const genSuggestGrid = document.getElementById("gen-suggest-grid");
async function ensureLibForWait() {
  if (libAll.length) return;
  try { const r = await fetch("/api/library"); const d = await r.json(); libAll = d.lessons || []; } catch { /* ignore — just no suggestions */ }
}
// Rank library lessons by how many >3-char prompt words appear in title/description/category;
// pad with other lessons so we always show up to `n` cards (relevant first, then variety).
function relevantLibrary(promptText, n) {
  const toks = (promptText || "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const scored = libAll.map((l) => {
    const hay = (l.title + " " + (l.description || "") + " " + (l.category || "")).toLowerCase();
    let score = 0; for (const t of toks) if (hay.includes(t)) score++;
    return { l, score };
  });
  scored.sort((a, b) => b.score - a.score);
  const out = [], seen = new Set();
  for (const x of scored) { if (out.length >= n) break; if (x.score > 0) { out.push(x.l); seen.add(x.l.slug); } }
  for (const l of libAll) { if (out.length >= n) break; if (!seen.has(l.slug)) { out.push(l); seen.add(l.slug); } }
  return out.slice(0, n);
}
async function showWhileYouWait(promptText) {
  if (!genSuggest || !genSuggestGrid) return;
  await ensureLibForWait();
  const picks = relevantLibrary(promptText, 4);
  if (!picks.length) { genSuggest.hidden = true; return; }
  genSuggestGrid.innerHTML = "";
  for (const l of picks) {
    // Reuse the Library card's cover treatment: category thumbnail (--cov-img, set once
    // setThumbBase has run) + icon watermark + title, over a level·minutes meta row. The
    // cover height is capped in CSS (.gen-suggest-grid scope) so the overlay stack stays on-screen.
    const s = catStyle(l.category);
    const card = document.createElement("button");
    card.type = "button"; card.className = "lib-card";
    card.style.setProperty("--cov-bg", s.bg);
    card.style.setProperty("--cov-icon", s.icon);
    card.style.setProperty("--cov-text", s.text);
    if (s.img) card.style.setProperty("--cov-img", `url("${s.img}")`);
    card.innerHTML =
      `<div class="lib-cover">` +
        `<span class="lib-ico" aria-hidden="true">${s.svg}</span>` +
        `<div class="lib-cover-text"><span class="lib-title">${escapeHtml(l.title)}</span></div>` +
      `</div>` +
      `<div class="lib-foot"><span class="lib-pill">${escapeHtml(l.category || "Lesson")}</span><span class="lib-dot">·</span><span class="lib-lvl">${escapeHtml(l.level || "")}</span><span class="lib-dot">·</span><span>${l.estMinutes || "?"} min</span></div>`;
    card.addEventListener("click", () => openLibraryLesson(l.slug, l.title)); // opens in a NEW Trainer tab
    genSuggestGrid.appendChild(card);
  }
  genSuggest.hidden = false;
}
function hideWhileYouWait() { if (genSuggest) genSuggest.hidden = true; }

// ---- Item 3: out-of-credits "buy a plan" popup (reused by the lesson + skill 402s) ----
const buyModal = document.getElementById("buy-modal");
function openBuyCredits(msg) {
  if (!buyModal) { switchTab("pricing"); return; }
  const m = document.getElementById("buy-modal-msg");
  if (m && msg) m.textContent = msg;
  buyModal.hidden = false;
}
function closeBuyCredits() { if (buyModal) buyModal.hidden = true; }
if (buyModal) {
  const go = document.getElementById("buy-modal-go"), x = document.getElementById("buy-modal-x"), later = document.getElementById("buy-modal-later");
  if (go) go.addEventListener("click", () => { closeBuyCredits(); switchTab("pricing"); });
  if (x) x.addEventListener("click", closeBuyCredits);
  if (later) later.addEventListener("click", closeBuyCredits);
  buyModal.addEventListener("click", (e) => { if (e.target === buyModal) closeBuyCredits(); });
}
window.openBuyCredits = openBuyCredits; // skills.js (a separate script) reuses this on a skill 402

// ============================================================================
// Community courses — learner-shared lessons (public browse), likes, and the
// "Community Share — 1 Free Lesson" flow (My Lessons + the Trainer 2-module popup).
// ============================================================================
const commSearch = document.getElementById("comm-search");
const commFeatured = document.getElementById("comm-featured");
const commFeatGrid = document.getElementById("comm-feat-grid");
const commAllH = document.getElementById("comm-all-h");
const commGrid = document.getElementById("comm-grid");
const commEmpty = document.getElementById("comm-empty");
let commAll = [];
let commLoaded = false;

// ---- anonymous like dedupe (per-browser) ----
function likedSet() { try { return new Set(JSON.parse(localStorage.getItem("als-liked") || "[]")); } catch { return new Set(); } }
function saveLiked(set) { try { localStorage.setItem("als-liked", JSON.stringify([...set])); } catch { /* ignore */ } }
// ---- which of the user's lessons have already been shared (hide the offer) ----
function sharedSet() { try { return new Set(JSON.parse(localStorage.getItem("als-shared") || "[]")); } catch { return new Set(); } }
function isShared(id) { return sharedSet().has(id); }
function markShared(id) { const s = sharedSet(); s.add(id); try { localStorage.setItem("als-shared", JSON.stringify([...s])); } catch { /* ignore */ } }

async function loadCommunity() {
  try {
    const res = await fetch("/api/community");
    const { lessons } = await res.json();
    commAll = lessons || [];
    commLoaded = true;
    renderCommunity();
  } catch { commGrid.innerHTML = ""; commEmpty.hidden = false; commEmpty.textContent = "Couldn't load community courses."; }
}

function communityTile(l) {
  const s = catStyle(l.category || "Community");
  const liked = likedSet().has(l.slug);
  const el = document.createElement("div");
  el.className = "lib-card comm-card";
  el.style.setProperty("--cov-bg", s.bg);
  el.style.setProperty("--cov-icon", s.icon);
  el.style.setProperty("--cov-text", s.text);
  if (s.img) el.style.setProperty("--cov-img", `url("${s.img}")`);
  el.innerHTML =
    `<button class="lib-open" type="button" aria-label="Open ${escapeHtml(l.title)}">` +
      `<div class="lib-cover"><span class="lib-ico" aria-hidden="true">${s.svg}</span>` +
        `<div class="lib-cover-text"><span class="lib-title">${escapeHtml(l.title)}</span>` +
        (l.description ? `<span class="lib-desc">${escapeHtml(l.description)}</span>` : "") + `</div></div>` +
    `</button>` +
    `<div class="lib-foot">` +
      `<span class="lib-pill">${escapeHtml(l.category || "Community")}</span>` +
      `<span class="comm-by">by ${escapeHtml(l.submitter || "a learner")}</span>` +
      `<button class="comm-like${liked ? " liked" : ""}" type="button" aria-pressed="${liked}" title="Like this lesson">♥ <b class="comm-likes">${l.likes || 0}</b></button>` +
      `<button class="comm-report" type="button" title="Report this lesson">⚐</button>` +
    `</div>`;
  el.querySelector(".lib-open").addEventListener("click", () => openCommunityLesson(l.slug, l.title));
  el.querySelector(".comm-like").addEventListener("click", (e) => { e.stopPropagation(); likeCommunityCard(l, el.querySelector(".comm-like")); });
  el.querySelector(".comm-report").addEventListener("click", (e) => { e.stopPropagation(); reportCommunityCard(l, el); });
  return el;
}

async function likeCommunityCard(l, btn) {
  const set = likedSet();
  if (set.has(l.slug)) return; // one like per browser
  try {
    const res = await fetch("/api/community/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: l.slug }) });
    const data = await res.json();
    if (!res.ok) return;
    l.likes = data.likes;
    set.add(l.slug); saveLiked(set);
    btn.classList.add("liked"); btn.setAttribute("aria-pressed", "true");
    const c = btn.querySelector(".comm-likes"); if (c) c.textContent = data.likes;
  } catch { /* ignore */ }
}

async function reportCommunityCard(l, cardEl) {
  if (!confirm("Report this lesson as inappropriate, inaccurate, or infringing? Our team will review it.")) return;
  try {
    const res = await fetch("/api/community/report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: l.slug }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return;
    if (data.hidden) { cardEl.remove(); } // pulled pending review
    else { const b = cardEl.querySelector(".comm-report"); if (b) { b.textContent = "⚐ reported"; b.disabled = true; } }
  } catch { /* ignore */ }
}

function renderCommunity() {
  const q = (commSearch.value || "").trim().toLowerCase();
  if (!commAll.length) {
    commFeatured.hidden = true; commAllH.hidden = true; commGrid.innerHTML = "";
    commEmpty.hidden = false; commEmpty.textContent = "No community courses yet — share one of yours from My Lessons!";
    return;
  }
  const matches = commAll.filter((l) => !q || (l.title + " " + (l.description || "") + " " + (l.category || "") + " " + (l.submitter || "")).toLowerCase().includes(q));
  // Featured = top 10 by likes; hidden while searching so results are unambiguous.
  if (!q) {
    const featured = [...commAll].sort((a, b) => (b.likes || 0) - (a.likes || 0)).slice(0, 10);
    commFeatGrid.innerHTML = ""; featured.forEach((l) => commFeatGrid.appendChild(communityTile(l)));
    commFeatured.hidden = false; commAllH.hidden = false;
  } else {
    commFeatured.hidden = true; commAllH.hidden = true;
  }
  commGrid.innerHTML = "";
  matches.forEach((l) => commGrid.appendChild(communityTile(l)));
  commEmpty.hidden = matches.length > 0;
  if (!matches.length) commEmpty.textContent = "No community courses match your search.";
}
commSearch.addEventListener("input", () => { if (commLoaded) renderCommunity(); });

function openCommunityLesson(slug, title) { openTab({ type: "community", title: title, slug: slug }); }

// ---- Share flow: confirm a display name → POST /api/community/share → show the code ----
const shareOverlay = document.getElementById("share-overlay");
const shareName = document.getElementById("share-name");
const shareMsg = document.getElementById("share-msg");
const shareGo = document.getElementById("share-go");
const codeOverlay = document.getElementById("code-overlay");
const codeSub = document.getElementById("code-sub");
let shareLessonId = null;
const offeredShare = {}; // per-lesson, so the Trainer popup only fires once per session

function openShareModal(lessonId) {
  if (authRequiredAndOut()) { openAuth("signin"); return; }
  shareLessonId = lessonId;
  shareMsg.hidden = true; shareMsg.textContent = "";
  if (!shareName.value) shareName.value = defaultDisplayName();
  shareOverlay.hidden = false;
  shareName.focus();
}
function defaultDisplayName() { return currentUserEmail ? currentUserEmail.split("@")[0] : ""; }
document.getElementById("share-close").addEventListener("click", () => { shareOverlay.hidden = true; });
document.getElementById("code-close").addEventListener("click", () => { codeOverlay.hidden = true; });
shareGo.addEventListener("click", async () => {
  if (!shareLessonId) { shareOverlay.hidden = true; return; }
  shareGo.disabled = true; shareGo.textContent = "Sharing…";
  try {
    const res = await fetch("/api/community/share", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ lessonId: shareLessonId, displayName: shareName.value.trim() }) });
    if (res.status === 401) { shareOverlay.hidden = true; openAuth("signin"); return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Couldn't share this lesson.");
    markShared(shareLessonId);
    shareOverlay.hidden = true;
    // Tailor the success copy: a fresh reward vs. an already-shared / cap-reached share.
    if (codeSub) codeSub.innerHTML = data.rewarded
      ? "Your lesson is now in <strong>Community courses</strong>, and we've added <strong>1 free lesson</strong> to your account 🎉"
      : "Your lesson is now live in <strong>Community courses</strong>. Thanks for contributing!";
    codeOverlay.hidden = false;
    if (data.rewarded) loadCredits(); // a free lesson landed — refresh the nav pill
    if (!document.getElementById("tab-dashboard").hidden) loadDashboard(); // refresh the row → "✓ Shared"
  } catch (e) {
    shareMsg.hidden = false; shareMsg.textContent = "⚠️ " + e.message;
  } finally {
    shareGo.disabled = false; shareGo.textContent = "Share & get my free lesson →";
  }
});
document.getElementById("code-view").addEventListener("click", () => { codeOverlay.hidden = true; switchTab("community"); commLoaded = false; loadCommunity(); });

// ---- Progress relay (from the artifact iframe) → server + the Trainer share popup ----
window.addEventListener("message", (e) => {
  // Only accept progress from the LIVE viewer iframe — not a stale/background window or an
  // external page — so a late message from a previous lesson can't be mis-attributed to the
  // one now on screen. (The iframe is sandboxed → e.origin may be "null"; e.source is the guard.)
  if (e.source !== viewerFrame.contentWindow) return;
  const d = e.data;
  if (!d) return;
  // "⚡ Get Hands on" → open the browser-run notebook page in a new tab.
  if (d.type === "als-handson") {
    const lid = encodeURIComponent(d.lessonId || "");
    const mid = encodeURIComponent(d.moduleId || "");
    if (lid) window.open(`/hands-on?lesson=${lid}&module=${mid}`, "_blank");
    return;
  }
  if (d.type !== "als-progress") return;
  // Track which module the reader is on (for ALL lessons, before the owned-only guard) so a
  // live-build reload can restore their place instead of bouncing them to the overview.
  currentViewModule = typeof d.module === "string" ? d.module : null;
  if (!currentLessonOwned || !currentArtifactId) return; // only the user's own lessons
  const lessonId = currentArtifactId;
  // Persist (authed; the host has the token, the iframe doesn't).
  fetch("/api/progress", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ lessonId, percent: d.percent || 0, visited: d.visited || 0, total: d.total || 0 }) }).catch(() => {});
  // After two modules, offer the share-and-save once (unless already shared).
  if ((d.visited || 0) >= 2 && !offeredShare[lessonId] && !isShared(lessonId)) {
    offeredShare[lessonId] = 1;
    openShareModal(lessonId);
  }
});

// ============================================================================
// Community sub-tabs (Courses | Drivers) + the Community Drivers directory.
// ============================================================================
let driversLoaded = false;
document.querySelectorAll(".comm-subtab").forEach((b) => b.addEventListener("click", () => setCommSub(b.dataset.comm)));
function setCommSub(which) {
  document.querySelectorAll(".comm-subtab").forEach((b) => b.classList.toggle("active", b.dataset.comm === which));
  document.getElementById("comm-sub-courses").hidden = which !== "courses";
  document.getElementById("comm-sub-drivers").hidden = which !== "drivers";
  if (which === "courses") { if (!commLoaded) loadCommunity(); }
  else { document.getElementById("driver-profile").hidden = true; loadDrivers(); }
}

const driversGrid = document.getElementById("drivers-grid");
const driversEmpty = document.getElementById("drivers-empty");
const driverProfile = document.getElementById("driver-profile");

async function loadDrivers() {
  try {
    const res = await fetch("/api/community/drivers");
    const { drivers } = await res.json();
    driversLoaded = true;
    driversGrid.innerHTML = "";
    driversGrid.hidden = false;
    if (!drivers || !drivers.length) { driversEmpty.hidden = false; return; }
    driversEmpty.hidden = true;
    drivers.forEach((d) => driversGrid.appendChild(driverCard(d)));
  } catch { driversEmpty.hidden = false; driversEmpty.textContent = "Couldn't load contributors."; }
}
function initials(name) { return (name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function driverCard(d) {
  const el = document.createElement("button");
  el.className = "driver-card"; el.type = "button";
  el.innerHTML =
    `<div class="dc-top"><span class="dc-avatar">${escapeHtml(initials(d.name))}</span>` +
      `<div class="dc-id"><span class="dc-name">${escapeHtml(d.name)}</span>` +
      (d.expertise ? `<span class="dc-exp">${escapeHtml(d.expertise)}</span>` : "") + `</div></div>` +
    (d.headline ? `<p class="dc-bio">${escapeHtml(d.headline)}</p>` : "") +
    `<div class="dc-stats"><span>${d.courses} course${d.courses === 1 ? "" : "s"}</span><span class="lib-dot">·</span><span>♥ ${d.likes}</span></div>`;
  el.addEventListener("click", () => openDriver(d.userId));
  return el;
}
async function openDriver(userId) {
  try {
    const res = await fetch("/api/community/driver/" + encodeURIComponent(userId));
    if (!res.ok) return;
    const { profile, courses } = await res.json();
    driversGrid.hidden = true; driversEmpty.hidden = true;
    driverProfile.hidden = false;
    const motiv = profile.motivation === "other" ? (profile.motivation_other || "Other") :
      (profile.motivation ? { money: "Earning", knowledge: "Sharing knowledge", recognition: "Recognition" }[profile.motivation] || profile.motivation : "");
    driverProfile.innerHTML =
      `<button class="ghost dp-back" type="button">← All contributors</button>` +
      `<div class="dp-head"><span class="dc-avatar lg">${escapeHtml(initials(profile.full_name))}</span>` +
        `<div><h2 class="dp-name">${escapeHtml(profile.full_name)}</h2>` +
        (profile.expertise ? `<div class="dp-exp">${escapeHtml(profile.expertise)}</div>` : "") +
        (profile.link ? `<a class="dp-link" href="${escapeHtml(profile.link)}" target="_blank" rel="noopener">${escapeHtml(profile.link)}</a>` : "") +
        `</div></div>` +
      (profile.bio ? `<p class="dp-bio">${escapeHtml(profile.bio)}</p>` : "") +
      (motiv ? `<div class="dp-motiv">Contributes for: <strong>${escapeHtml(motiv)}</strong></div>` : "") +
      `<h3 class="comm-all-h" style="display:block">Published courses (${courses.length})</h3>` +
      `<div class="lib-grid" id="dp-courses"></div>`;
    driverProfile.querySelector(".dp-back").addEventListener("click", () => { driverProfile.hidden = true; driversGrid.hidden = false; });
    const cg = driverProfile.querySelector("#dp-courses");
    if (courses.length) courses.forEach((c) => cg.appendChild(communityTile(c)));
    else cg.innerHTML = '<p class="lib-empty" style="display:block">No published courses yet.</p>';
  } catch { /* ignore */ }
}

// ============================================================================
// Build for Community — one-time contributor registration, then build a course
// (reuses the Configurator overview→build flow with the contributor's content).
// ============================================================================
const bcRegister = document.getElementById("bc-register");
const bcBuild = document.getElementById("bc-build");
const bcSignedout = document.getElementById("bc-signedout");
let contributorChecked = false;
let isContributor = false;

async function loadBuildCommunity() {
  if (authRequiredAndOut()) { showBcState("signedout"); return; }
  try {
    const res = await fetch("/api/contributor/me", { headers: authHeaders() });
    if (res.status === 401) { showBcState("signedout"); return; }
    const data = await res.json();
    isContributor = !!data.registered; contributorChecked = true;
    showBcState(isContributor ? "build" : "register");
  } catch { showBcState("register"); }
}
function showBcState(s) {
  bcRegister.hidden = s !== "register";
  bcBuild.hidden = s !== "build";
  bcSignedout.hidden = s !== "signedout";
}
document.getElementById("bc-signin").addEventListener("click", () => openAuth("signin"));

// --- registration form ---
const bcMotivOther = document.getElementById("bc-motiv-other");
document.getElementById("bc-motiv").addEventListener("change", (e) => {
  if (e.target.name === "bc-motivation") bcMotivOther.hidden = e.target.value !== "other";
});
document.getElementById("bc-register-go").addEventListener("click", async () => {
  const msg = document.getElementById("bc-msg");
  const fullName = document.getElementById("bc-name").value.trim();
  const bio = document.getElementById("bc-bio").value.trim();
  const expertise = document.getElementById("bc-expertise").value.trim();
  const motivationEl = document.querySelector('input[name="bc-motivation"]:checked');
  const agreed = document.getElementById("bc-agree").checked;
  if (!fullName || !bio || !expertise || !motivationEl || !agreed) {
    msg.hidden = false; msg.className = "bc-msg err"; msg.textContent = "Please fill name, background, areas, a reason, and accept the guidelines.";
    return;
  }
  const body = { fullName, bio, expertise, motivation: motivationEl.value, motivationOther: document.getElementById("bc-motiv-other").value.trim(), link: document.getElementById("bc-link").value.trim(), agreed: true };
  try {
    const res = await fetch("/api/contributor/register", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(body) });
    if (res.status === 401) { openAuth("signin"); return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registration failed.");
    isContributor = true; showBcState("build");
  } catch (e) { msg.hidden = false; msg.className = "bc-msg err"; msg.textContent = "⚠️ " + e.message; }
});

// --- course content uploads (own store, separate from the Configurator's) ---
const bcDocs = [];
const bcFileInput = document.getElementById("bc-file-input");
const bcChips = document.getElementById("bc-chips");
document.getElementById("bc-add-docs").addEventListener("click", () => bcFileInput.click());
bcFileInput.addEventListener("change", async () => {
  for (const file of Array.from(bcFileInput.files)) {
    const chip = bcAddChip(file.name, "uploading…");
    try {
      const dataBase64 = await fileToBase64(file);
      const res = await fetch("/api/upload", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ filename: file.name, dataBase64 }) });
      if (res.status === 401) { openAuth("signin"); throw new Error("Sign in to upload."); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "upload failed");
      bcDocs.push({ docId: data.docId, title: data.title });
      chip.dataset.docId = data.docId; chip.classList.remove("uploading");
      chip.querySelector(".chip-meta").textContent = data.chunkCount + (data.chunkCount === 1 ? " chunk" : " chunks");
    } catch (e) { chip.classList.add("failed"); chip.querySelector(".chip-meta").textContent = "✕ " + e.message; }
  }
  bcFileInput.value = "";
});
function bcAddChip(name, meta) {
  const chip = document.createElement("span");
  chip.className = "chip uploading";
  chip.innerHTML = `<span class="chip-name"></span><span class="chip-meta"></span>`;
  chip.querySelector(".chip-name").textContent = name;
  chip.querySelector(".chip-meta").textContent = meta;
  bcChips.appendChild(chip);
  return chip;
}

// --- build a contributor course: reuse the overview→build flow, then auto-publish ---
document.getElementById("bc-generate").addEventListener("click", () => {
  const msg = document.getElementById("bc-build-msg");
  const title = document.getElementById("bc-title").value.trim();
  const desc = document.getElementById("bc-desc").value.trim();
  if (!title || !desc) { msg.hidden = false; msg.className = "bc-msg err"; msg.textContent = "Please add a title and description."; return; }
  if (!bcDocs.length) { msg.hidden = false; msg.className = "bc-msg err"; msg.textContent = "Please upload at least one document — the course is built from your content."; return; }
  msg.hidden = true;
  const level = document.getElementById("bc-level").value;
  const extra = document.getElementById("bc-prompt").value.trim();
  const prompt = `${title}. ${desc}${extra ? "\n\nAuthor guidance: " + extra : ""}`;
  contribBuild = true; // mark this overview/build as a contributor course → auto-publish on build
  startOverview({
    prompt, cards: {}, levels: [level], lessonTypes: ["content"], framework: "", readingMode: "vertical",
    industry: "", buildGoal: "", uploadIds: bcDocs.map((d) => d.docId), referOnly: true, threadId: null,
  });
});

// ============================================================================
// Background generation jobs — start, poll, show progress on the dashboard,
// open as soon as the overview exists. Handles single lessons AND courses.
// ============================================================================
// ---- STAGE 1: the FREE OVERVIEW (human-in-the-loop gate) ----
// Generate only the overview (skeleton), land on the Trainer, show progress, then
// render the overview with two CTAs: Generate Lesson / Edit overview.
async function startOverview(payload) {
  if (activeJobId) { alert("One lesson generates at a time — let the current one finish, then start the next."); return; }
  lastOverviewPayload = payload;
  // Open a "generating" tab — it shows progress and can be left and returned to.
  const title = payload && payload.prompt ? String(payload.prompt).slice(0, 48) : "New lesson…";
  const t = openTab({ type: "generating", title, percent: 0 });
  if (!t) return;
  genTabId = t.id;
  showWhileYouWait(payload && payload.prompt); // item 4: relevant free lessons to read while it generates
  let jobId;
  try {
    const res = await fetch("/api/overview", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify(payload) });
    if (res.status === 401) { genTabId = null; closeTab(t.id); openAuth("signin"); return; }
    const data = await res.json();
    if (!res.ok || !data.jobId) throw new Error(data.error || "Could not start the overview.");
    jobId = data.jobId;
  } catch (e) {
    genTabId = null;
    if (t.id === activeTabId) showGenError(escapeHtml(e.message), () => startOverview(payload)); else closeTab(t.id);
    return;
  }
  activeJobId = jobId;
  if (promptEl) promptEl.value = "";
  pollOverview(jobId, t.id);
}

// Show a generation failure in the viewer with a one-click "Try again".
function showGenError(msg, retryFn) {
  genOverlay.hidden = true; viewerFrame.hidden = true; viewerEmpty.hidden = false;
  viewerEmpty.innerHTML = `⚠️ ${escapeHtml(msg)} <button class="ghost" id="gen-retry" style="margin-left:8px">Try again</button>`;
  const b = document.getElementById("gen-retry");
  if (b && retryFn) b.addEventListener("click", retryFn);
}

// Poll an overview job; updates ITS tab (not whatever's on screen) so the user can read
// another tab meanwhile. On done the tab becomes an overview draft with the gate CTAs.
function pollOverview(jobId, tabId) {
  if (activeJobTimer) clearTimeout(activeJobTimer);
  const tick = async () => {
    if (activeJobId !== jobId) return;
    let job;
    try { const r = await fetch("/api/job/" + jobId, { headers: authHeaders() }); if (!r.ok) throw new Error("lost"); job = await r.json(); }
    catch { activeJobTimer = setTimeout(tick, 3000); return; }
    const l = job.lessons && job.lessons[0];
    const t = tabById(tabId); // may be null if the user closed the tab
    if (job.status === "error") {
      activeJobId = null; genTabId = null;
      if (t && t.id === activeTabId) showGenError(job.error || "The AI was busy — please try again.", () => { if (lastOverviewPayload) startOverview(lastOverviewPayload); });
      else if (t) closeTab(t.id);
      return;
    }
    if (job.status === "done" && l && l.artifactId) {
      activeJobId = null; genTabId = null;
      if (t) { t.type = "overview"; t.art = l.artifactId; t.title = l.title || t.title; if (t.id === activeTabId) activateTab(t.id); else { renderTabBar(); persistTabs(); } }
      return;
    }
    if (t) { t.percent = (l && l.percent) || 8; if (t.id === activeTabId) genLabel.textContent = l && l.status === "designing" ? "Designing the lesson outline…" : "Generating your overview…"; renderTabBar(); }
    activeJobTimer = setTimeout(tick, 2000);
  };
  tick();
}

// Toggle the overview-gate CTAs (Generate Lesson / Edit overview).
function setOverviewMode(on) {
  if (genLessonBtn) genLessonBtn.hidden = !on;
  if (editOverviewBtn) editOverviewBtn.hidden = !on;
}

// ---- STAGE 2: approve → build the full lesson IN ITS TAB (readable as modules fill in) ----
async function startBuild(artifactId) {
  if (activeJobId) { alert("One lesson generates at a time — let the current one finish first."); return; }
  let jobId;
  try {
    const res = await fetch("/api/build", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ artifactId }) });
    if (res.status === 401) { openAuth("signin"); return; }
    if (res.status === 402) { // out of credits — show the buy-a-plan popup (item 3)
      const d = await res.json().catch(() => ({}));
      openBuyCredits((d.error || "You're out of credits.") + " Your overview is saved — buy credits and click Generate Lesson again.");
      return;
    }
    const data = await res.json();
    if (!res.ok || !data.jobId) throw new Error(data.error || "Could not start the lesson build.");
    jobId = data.jobId;
  } catch (e) { showGenError(escapeHtml(e.message), () => startBuild(artifactId)); return; }
  activeJobId = jobId;
  lastBuildArtifactId = artifactId; // remember for a retry if the build fails
  if (contribBuild) contribPublishId = artifactId; // auto-publish this one to Community when built
  // Promote the overview tab into a (building) lesson tab and open it — readable as it builds.
  let t = tabs.find((x) => x.art === artifactId) || tabById(activeTabId);
  if (t) { t.type = "lesson"; t.art = artifactId; t.building = true; t._firstReady = false; t.percent = 30; t.prompt = t.prompt || basePrompt; genTabId = t.id; activateTab(t.id); }
  else { t = openTab({ type: "lesson", title: "Building…", art: artifactId, building: true, percent: 30 }); if (t) t._firstReady = false; genTabId = t ? t.id : null; }
  // Bug 2: do NOT reveal the lesson yet. activateTab() shows the "building" overlay until the FIRST
  // module is ready; pollJob flips `_firstReady` + re-activates the tab, which loads the now-promoted
  // (kind-flipped, preview-lock-dropped) lesson. (Was: an eager reloadViewer() here that dropped the
  // reader straight onto a still-WIP module.)
  updateGenStatus(true);
  pollJob(jobId, genTabId);
}

// Auto-publish a finished contributor course to the Community (no discount popup).
async function autoPublishContributor(lessonId) {
  try {
    const res = await fetch("/api/community/share", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ lessonId, contributor: true }) });
    if (res.ok) { markShared(lessonId); commLoaded = false; driversLoaded = false; }
  } catch { /* ignore — the lesson is still in My Lessons; they can share manually */ }
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

// Poll a BUILD job; updates its tab's progress + My Lessons. A closed tab (genTabId
// cleared) keeps building server-side and just shows up in My Lessons when done.
function pollJob(jobId, tabId) {
  if (activeJobTimer) clearTimeout(activeJobTimer);
  const tick = async () => {
    if (activeJobId !== jobId) return;
    let job;
    try {
      const r = await fetch("/api/job/" + jobId, { headers: authHeaders() });
      if (!r.ok) {
        // The in-memory job is gone (a Render redeploy/restart dropped it mid-build). Modules persist
        // to Postgres incrementally, so DON'T revert to 0%/failed — reveal the PERSISTED lesson and
        // let the artifact's own on-demand queue (/api/module, now durable) finish any remaining
        // modules. (404 means "poller lost — re-read persisted state," not "failed.")
        activeJobId = null; genTabId = null; updateGenStatus(false);
        const tt = tabById(tabId);
        if (tt) {
          tt.building = false; tt._firstReady = true;       // reveal persisted state, not the building overlay
          if (tt.id === activeTabId) activateTab(tt.id);     // loads /api/artifact/:id (built modules + self-building stubs)
          renderTabBar(); persistTabs();
        }
        loadDashboard();
        return;
      }
      job = await r.json();
    }
    catch { activeJobTimer = setTimeout(tick, 3000); return; }
    const l = job.lessons && job.lessons[0];
    const t = tabById(tabId);
    if (t) { t.percent = (l && l.percent) || t.percent; renderTabBar(); }
    let didReload = false;
    if (t && l && typeof l.builtModules === "number") {
      if (t._built == null) t._built = 0;
      // Bug 2: reveal the lesson only once the FIRST module is built (until then activateTab shows
      // the "building" overlay). Re-activating loads the now-promoted, preview-unlocked lesson.
      if (t.building && !t._firstReady && l.builtModules >= 1) {
        t._firstReady = true;
        if (t.id === activeTabId) { activateTab(t.id); didReload = true; }
      }
      // Live build: as each LATER module lands, refresh the open lesson — only while it's the tab on
      // screen AND already revealed — so it grows in real time. (Server persists after every module.)
      if (!didReload && t._firstReady && l.builtModules > t._built && t.id === activeTabId) reloadViewer();
      t._built = l.builtModules;
    }
    if (!document.getElementById("tab-dashboard").hidden) loadDashboard();
    if (job.status === "done" || job.status === "error") {
      activeJobId = null; genTabId = null; updateGenStatus(false);
      if (t) { t.building = false; renderTabBar(); persistTabs(); }
      // Contributor course finished → auto-publish it to the Community (credited to them).
      if (job.status === "done" && contribBuild && contribPublishId) {
        const lid = contribPublishId; contribBuild = false; contribPublishId = null; autoPublishContributor(lid);
      } else if (job.status === "error" && t && t.id === activeTabId) {
        showGenError("The build didn't finish — the AI may have been busy.", () => { if (lastBuildArtifactId) startBuild(lastBuildArtifactId); });
      }
      if (job.status === "done") loadCredits(); // a completed build spent 1 credit — refresh the pill
      loadDashboard(); loadSuggestions(); return;
    }
    activeJobTimer = setTimeout(tick, 2500);
  };
  tick();
}

// Open a lesson (own/course) into a Trainer tab.
function openLessonInWorkspace(id, title, prompt) { openTab({ type: "lesson", title, art: id, prompt }); }
// Courses open their first lesson as a single tab (the old course sub-strip is retired).
function openCourse(courseId, lessons, activeIndex) {
  const a = (lessons || [])[activeIndex || 0] || (lessons || [])[0];
  if (a && a.artifactId) openTab({ type: "lesson", title: a.title, art: a.artifactId });
}
async function openCourseById(courseId, title) {
  try {
    const res = await fetch("/api/course/" + courseId, { headers: authHeaders() });
    const { lessons } = await res.json();
    if (!lessons || !lessons.length) return;
    const a = lessons[0];
    openTab({ type: "lesson", title: a.title || title, art: a.id });
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
let currentUserEmail = "";
let currentUserId = "";
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
const authConsentRow = document.getElementById("auth-consent-row");
const authConsent = document.getElementById("auth-consent");
const logoutBtn = document.getElementById("logout");
const authWho = document.getElementById("auth-who");

function authHeaders() { return accessToken ? { Authorization: "Bearer " + accessToken } : {}; }
function authRequiredAndOut() { return authIsEnabled && !accessToken; }
function showAuthMsg(text, kind) { authMsg.hidden = !text; authMsg.textContent = text || ""; authMsg.className = "auth-msg" + (kind ? " " + kind : ""); }
// The overlay is an on-demand MODAL (gates generation/dashboard; browsing stays open).
// Auth is a full PAGE now (#tab-auth), not a modal. openAuth() routes to it; every existing
// gated-action call site (openAuth("signin"/"signup")) keeps working unchanged.
function openAuth(mode) {
  setAuthMode(mode || "signin");
  if (authLoading) authLoading.hidden = true;
  if (authForm) authForm.hidden = false;
  switchTab("auth");
  window.scrollTo(0, 0);
}
function closeAuth() { if (!document.getElementById("tab-auth").hidden) switchTab("home"); }
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create your account" : "Sign in";
  authSub.textContent = signup ? "Sign up to start generating lessons." : "Welcome back.";
  authSubmit.textContent = signup ? "Create account" : "Sign in";
  authSwitchText.textContent = signup ? "Already have an account?" : "New here?";
  authToggle.textContent = signup ? "Sign in" : "Create an account";
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  // The Terms+Privacy consent checkbox is required for sign-up only.
  if (authConsentRow) authConsentRow.hidden = !signup;
  if (authConsent && !signup) authConsent.checked = false;
  showAuthMsg("");
}
// Record the signup consent (Terms + Privacy). Best-effort; the server attaches the user id
// when a session token exists, else logs it against the email.
function logSignupConsent(email) {
  fetch("/api/consent", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ consentType: "signup_terms_privacy", email }) }).catch(() => {});
}
function applySession(session) {
  accessToken = (session && session.access_token) || null;
  const email = (session && session.user && session.user.email) || "";
  currentUserEmail = email;
  currentUserId = (session && session.user && session.user.id) || "";
  const signedIn = !!accessToken;
  if (logoutBtn) logoutBtn.hidden = !signedIn;
  if (authWho) { authWho.hidden = !signedIn; authWho.textContent = email; }
  if (tabBtnDashboard) tabBtnDashboard.hidden = !signedIn;
  if (authActions) authActions.hidden = signedIn || !authIsEnabled;
  if (signedIn) {
    closeAuth();
    loadDashboard(); loadPreferences(); loadSuggestions(); maybeOnboard(); loadCredits();
  } else {
    updateCreditPill(null);
    clearCachedCredits();
  }
  updateProfileUI(signedIn, email);
  routeFromUrl(); // honor a /account deep-link once auth state is known
}

document.getElementById("btn-signin").addEventListener("click", () => openAuth("signin"));
document.getElementById("btn-signup").addEventListener("click", () => openAuth("signup"));

// OAuth (Google / Apple) — Supabase redirects out and back to the app origin. The provider
// must be enabled in the Supabase project (Auth → Providers) for this to succeed.
async function oauthSignIn(provider) {
  if (!sb) { showAuthMsg("Sign-in isn't ready yet — please try again in a moment.", "err"); return; }
  showAuthMsg("Redirecting to " + (provider === "google" ? "Google" : "Apple") + "…", "ok");
  try {
    const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin + "/" } });
    if (error) throw error;
  } catch (err) {
    showAuthMsg((err && err.message) || "Couldn't start " + provider + " sign-in.", "err");
  }
}
const oauthGoogle = document.getElementById("oauth-google");
const oauthApple = document.getElementById("oauth-apple");
if (oauthGoogle) oauthGoogle.addEventListener("click", () => oauthSignIn("google"));
if (oauthApple) oauthApple.addEventListener("click", () => oauthSignIn("apple"));

// Show an OAuth button ONLY for providers actually enabled in Supabase (read from GoTrue's
// public /auth/v1/settings). So the buttons stay hidden until Google/Apple are turned on in
// the Supabase dashboard, and then appear automatically — no code/env change needed.
async function applyOAuthProviders(supabaseUrl, anonKey) {
  let ext = {};
  try {
    const r = await fetch(supabaseUrl.replace(/\/$/, "") + "/auth/v1/settings", { headers: { apikey: anonKey } });
    if (r.ok) ext = (await r.json()).external || {};
  } catch (e) { /* leave all hidden on error — email/password still works */ }
  const g = document.getElementById("oauth-google");
  const a = document.getElementById("oauth-apple");
  if (g) g.hidden = !ext.google;
  if (a) a.hidden = !ext.apple;
  const anyOn = !!(ext.google || ext.apple);
  const row = document.querySelector(".oauth-row");
  const orDiv = document.querySelector(".auth-or");
  if (row) row.hidden = !anyOn;
  if (orDiv) orDiv.hidden = !anyOn;
}

async function bootAuth() {
  let cfg;
  try { cfg = await (await fetch("/api/config")).json(); } catch { cfg = { authEnabled: false }; }
  authIsEnabled = !!cfg.authEnabled;
  billingIsEnabled = !!cfg.billingEnabled;
  setThumbBase(cfg.supabaseUrl); // point catalog thumbnails at this env's own Supabase Storage bucket

  if (!authIsEnabled) {
    // Open mode (local dev): no gate; dashboard + prefs use the server's local id.
    if (tabBtnDashboard) tabBtnDashboard.hidden = false;
    loadDashboard(); loadPreferences(); loadSuggestions(); maybeOnboard(); loadCredits();
    routeFromUrl(); // honor a /account deep-link in open (no-auth) mode too
    return;
  }

  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    if (authActions) authActions.hidden = false; // still show the buttons (they'll report the error)
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  applyOAuthProviders(cfg.supabaseUrl, cfg.supabaseAnonKey); // reveal only enabled OAuth buttons
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
    if (authMode === "signup" && authConsent && !authConsent.checked) {
      showAuthMsg("Please agree to the Terms and acknowledge the Privacy Notice to create an account.", "err"); return;
    }
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
          logSignupConsent(email);
          setAuthMode("signin"); authEmail.value = email;
          showAuthMsg("✉️ Verify your email — we sent a confirmation link to " + email + ". Click it, then sign in here.", "ok");
        } else {
          // Email confirmation is OFF on the project → signed in immediately.
          logSignupConsent(email);
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
// Re-open any Trainer tabs the learner had before a refresh (sessionStorage).
restoreTabs();

// ============================================================================
// Lesson credits + Pricing — the credit pill in the nav, the slider/cost on the
// Pricing tab, and Lemon Squeezy checkout (Lemon.js overlay). The webhook is the
// source of truth for crediting; the front-end just reflects the balance.
// ============================================================================
// Live pricing from Lemon Squeezy — replaces the old hardcoded USD. `pricing` is a
// fallback until /api/pricing loads the real store currency + amounts.
let pricing = { currency: "USD", paygUnitCents: 99, trialCents: 500, paygFormatted: "", trialFormatted: "" };
function fmtMoney(cents) {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: pricing.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: 2 }).format((cents || 0) / 100); }
  catch { return ((cents || 0) / 100).toFixed(2) + " " + pricing.currency; }
}
function renderPricing() {
  const slider = document.getElementById("payg-slider");
  const n = Number(slider && slider.value) || 1;
  const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  // Single-unit fields prefer LS's own formatted string (matches the dashboard exactly);
  // totals are computed in the detected currency.
  set("payg-cost", fmtMoney(n * pricing.paygUnitCents));
  set("payg-each", pricing.paygFormatted || fmtMoney(pricing.paygUnitCents));
  set("trial-cost", pricing.trialFormatted || fmtMoney(pricing.trialCents));
  set("trial-each", fmtMoney(Math.round((pricing.trialCents || 0) / 10)));
  set("trial-btn-cost", pricing.trialFormatted || fmtMoney(pricing.trialCents));
}
async function loadPricing() {
  try {
    const res = await fetch("/api/pricing");
    const d = await res.json();
    if (d && d.configured && typeof d.paygUnitCents === "number" && d.paygUnitCents > 0) {
      pricing = { currency: d.currency || "USD", paygUnitCents: d.paygUnitCents, trialCents: d.trialCents || 0, paygFormatted: d.paygFormatted || "", trialFormatted: d.trialFormatted || "" };
    }
  } catch { /* keep fallback */ }
  renderPricing();
}
let billingIsEnabled = false;
const creditPill = document.getElementById("credit-pill");
const creditCount = document.getElementById("credit-count");

function updateCreditPill(balance) {
  if (!creditPill) return;
  if (balance == null) { creditPill.hidden = true; return; }
  creditPill.hidden = false;
  if (creditCount) creditCount.textContent = String(balance);
  creditPill.classList.toggle("empty", balance <= 0);
}

// Persist the last-known balance so the pill can render INSTANTLY on the next page
// load — otherwise it stays hidden for ~1-2s while Supabase restores the session and
// /api/credits round-trips (the "pill flashes away on refresh" bug).
function cacheCredits(balance) { try { localStorage.setItem("wb-credits", String(balance)); } catch (e) {} }
function clearCachedCredits() { try { localStorage.removeItem("wb-credits"); } catch (e) {} }

async function loadCredits() {
  if (!accessToken && authIsEnabled) { updateCreditPill(null); clearCachedCredits(); return; }
  try {
    const res = await fetch("/api/credits", { headers: authHeaders() });
    if (!res.ok) { updateCreditPill(null); clearCachedCredits(); return; }
    const d = await res.json();
    const balance = typeof d.balance === "number" ? d.balance : 0;
    updateCreditPill(balance);
    cacheCredits(balance);
    const bal = document.getElementById("pricing-balance");
    if (bal && !bal.classList.contains("low")) {
      bal.hidden = false;
      bal.textContent = `You have ${balance} credit${balance === 1 ? "" : "s"}.`;
    }
  } catch { /* keep the optimistic cached pill on a transient error */ }
}

// Optimistic paint: if we credited this browser before, show that balance immediately
// on load. loadCredits() reconciles a moment later (and hides on a real sign-out).
(function showCachedPill() {
  try { const c = localStorage.getItem("wb-credits"); if (c != null && c !== "") updateCreditPill(Number(c)); } catch (e) {}
})();

// Poll a few times after a purchase — the webhook credits asynchronously.
function refreshCreditsRetry(tries) {
  tries = tries || 6;
  loadCredits();
  if (tries > 1) setTimeout(() => refreshCreditsRetry(tries - 1), 2000);
}

// Central credit refresh: re-fetch the balance whenever the tab regains focus/visibility — covers
// returning from a checkout opened in another tab, or being away while a webhook lands. (loadCredits
// already no-ops + clears the pill when signed out, so this is safe to call unconditionally.)
let _lastCreditRefresh = 0;
function refreshCreditsOnReturn() {
  if (authIsEnabled && !accessToken) return; // not signed in → nothing to refresh
  const now = (window.performance && performance.now()) || 0;
  if (now - _lastCreditRefresh < 1500) return; // debounce focus+visibilitychange double-fire
  _lastCreditRefresh = now;
  loadCredits();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCreditsOnReturn(); });
window.addEventListener("focus", refreshCreditsOnReturn);

// Pill → Pricing tab.
if (creditPill) {
  creditPill.addEventListener("click", () => switchTab("pricing"));
  creditPill.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchTab("pricing"); } });
}

// ---- Pricing tab interactions ----
(function initPricing() {
  const slider = document.getElementById("payg-slider");
  const nEls = [document.getElementById("payg-n"), document.getElementById("payg-n2"), document.getElementById("buy-payg-n")];
  const sEl = document.getElementById("payg-s");
  function syncSlider() {
    const n = Number(slider.value) || 1;
    nEls.forEach((el) => { if (el) el.textContent = String(n); });
    if (sEl) sEl.textContent = n === 1 ? "" : "s";
    renderPricing(); // currency-aware cost for the current N
  }
  if (slider) { slider.addEventListener("input", syncSlider); syncSlider(); }
  loadPricing(); // pull live currency + amounts from Lemon Squeezy

  async function buy(planId, quantity) {
    if (authIsEnabled && !accessToken) { openAuth("signin"); return; }
    if (!billingIsEnabled) { const s = document.getElementById("pricing-soon"); if (s) s.hidden = false; return; }
    const btn = planId === "trial-launch" ? document.getElementById("buy-trial") : document.getElementById("buy-payg");
    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Starting checkout…"; }
    try {
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() }, body: JSON.stringify({ planId, quantity }) });
      if (res.status === 401) { openAuth("signin"); return; }
      const d = await res.json();
      if (!res.ok || !d.url) throw new Error(d.detail ? `${d.error || "Checkout failed"} — ${d.detail}` : (d.error || "Couldn't start checkout."));
      // Open the Lemon.js overlay if available; otherwise fall back to a new tab.
      if (window.LemonSqueezy && window.LemonSqueezy.Url && typeof window.LemonSqueezy.Url.Open === "function") {
        window.LemonSqueezy.Url.Open(d.url);
      } else {
        window.open(d.url, "_blank");
      }
      // Reflect the new balance once the webhook lands.
      refreshCreditsRetry();
    } catch (e) {
      const s = document.getElementById("pricing-soon");
      if (s) { s.hidden = false; s.textContent = e.message; }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }

  const buyPayg = document.getElementById("buy-payg");
  const buyTrial = document.getElementById("buy-trial");
  if (buyPayg) buyPayg.addEventListener("click", () => buy("lessons-payg", Number(slider && slider.value) || 1));
  if (buyTrial) buyTrial.addEventListener("click", () => buy("trial-launch", 1));
  const signinLink = document.getElementById("pricing-signin-link");
  if (signinLink) signinLink.addEventListener("click", (e) => { e.preventDefault(); openAuth("signin"); });

  // Show the right helper line when Pricing is opened.
  document.querySelectorAll('.tab[data-tab="pricing"], #credit-pill').forEach((el) => {
    el.addEventListener("click", () => {
      const needSignin = authIsEnabled && !accessToken;
      const signinEl = document.getElementById("pricing-signin");
      const soonEl = document.getElementById("pricing-soon");
      if (signinEl) signinEl.hidden = !needSignin;
      if (soonEl) soonEl.hidden = billingIsEnabled || needSignin;
      if (!needSignin) loadCredits();
    });
  });
})();

// Lemon.js overlay: initialize when the deferred script is ready + refresh on success.
function setupLemon() {
  if (typeof window.createLemonSqueezy === "function") {
    window.createLemonSqueezy();
    if (window.LemonSqueezy && typeof window.LemonSqueezy.Setup === "function") {
      window.LemonSqueezy.Setup({ eventHandler: (ev) => { if (ev && ev.event === "Checkout.Success") refreshCreditsRetry(); } });
    }
  }
}
if (document.readyState === "complete") setupLemon();
else window.addEventListener("load", setupLemon);

// Returning from a hosted checkout (?purchase=success) → land on Pricing, poll the balance, clean the URL.
(function handlePurchaseReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("purchase") === "success") {
    switchTab("pricing");
    refreshCreditsRetry();
    const note = document.getElementById("pricing-balance");
    if (note) { note.hidden = false; note.textContent = "Thanks for your purchase! Your credits will appear here in a moment."; }
    try { window.history.replaceState({}, "", window.location.pathname); } catch (e) {}
  }
})();

// ============================================================================
// Profile menu — top-right avatar replaces the old email + Sign-out in the nav.
// Click → { Account Details, Sign out }. Account Details shows name/email/credits
// + a Top-up button. (Email + sign-out are no longer in the top bar.)
// ============================================================================
const profileWrap = document.getElementById("profile-wrap");
const profileBtn = document.getElementById("profile-btn");
const profileMenu = document.getElementById("profile-menu");
const profileAvatar = document.getElementById("profile-avatar");

function displayNameFrom(email) {
  if (!email) return "there";
  const local = email.split("@")[0].replace(/[._-]+/g, " ");
  return local.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Show/hide the avatar with the user's initial. Driven from applySession.
function updateProfileUI(signedIn, email) {
  if (profileWrap) profileWrap.hidden = !signedIn;
  if (signedIn && profileAvatar) profileAvatar.textContent = (email || "U").trim().charAt(0).toUpperCase() || "U";
  if (!signedIn) closeProfileMenu();
}

function openProfileMenu() { if (profileMenu) { profileMenu.hidden = false; profileBtn.setAttribute("aria-expanded", "true"); } }
function closeProfileMenu() { if (profileMenu) { profileMenu.hidden = true; profileBtn && profileBtn.setAttribute("aria-expanded", "false"); } }

if (profileBtn) profileBtn.addEventListener("click", (e) => { e.stopPropagation(); profileMenu.hidden ? openProfileMenu() : closeProfileMenu(); });
document.addEventListener("click", (e) => { if (profileWrap && !profileWrap.contains(e.target)) closeProfileMenu(); });

// --- Account page (/account) ---
// Reached from the profile menu AND as a real URL, so it deep-links and survives a
// refresh. The profile menu only shows when signed in; a direct /account hit while
// signed out bounces to the sign-in modal (and lands here once auth completes).
function gotoAccount(push) {
  closeProfileMenu();
  if (authRequiredAndOut()) { openAuth("signin"); return; }
  switchTab("account");
  if (push !== false) { try { history.pushState({ tab: "account" }, "", "/account"); } catch (e) {} }
  window.scrollTo(0, 0);
  loadAccount();
}
function openAccount() { gotoAccount(true); }
// If we boot (or finish signing in) on /account, show the page without a second push.
// Map a deep-linked / refreshed URL to its tab so /pricing, /library, etc. land on the
// right tab (the server's SPA fallback serves the shell; this routes once auth state is known).
const URL_TAB_MAP = { "/builder": "configurator", "/library": "library", "/community": "community", "/pricing": "pricing", "/llm-skills": "llm-skills", "/build-community": "build-community", "/trainer": "trainer" };
function routeFromUrl() {
  const p = location.pathname.replace(/\/+$/, "");
  if (p === "/account") { gotoAccount(false); return; }
  if (URL_TAB_MAP[p]) switchTab(URL_TAB_MAP[p]);
}
function fmtMemberSince(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); }
  catch (e) { return "—"; }
}
async function loadAccount() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  // Paint what we already know instantly; /api/account fills usage + the live balance.
  set("acct-name", displayNameFrom(currentUserEmail));
  set("acct-email", currentUserEmail || "—");
  set("acct-uuid", currentUserId || "—");
  const cached = (() => { try { return localStorage.getItem("wb-credits"); } catch (e) { return null; } })();
  set("acct-credits", cached != null && cached !== "" ? `${cached} lesson${cached === "1" ? "" : "s"}` : "…");
  try {
    const res = await fetch("/api/account", { headers: authHeaders() });
    if (!res.ok) return;
    const d = await res.json();
    set("acct-name", displayNameFrom(d.email || currentUserEmail));
    set("acct-email", d.email || currentUserEmail || "—");
    set("acct-uuid", d.userId || currentUserId || "—");
    set("acct-plan", d.plan || "Free");
    set("acct-credits", `${d.balance} credit${d.balance === 1 ? "" : "s"}`);
    set("acct-lessons", String(d.lessonsGenerated ?? 0));
    set("acct-spent", String(d.creditsSpent ?? 0));
    set("acct-bought", String(d.creditsPurchased ?? 0));
    set("acct-since", fmtMemberSince(d.memberSince));
    updateCreditPill(d.balance); cacheCredits(d.balance); // keep the nav pill in sync
  } catch (e) {}
}
// Back/forward between /account and the rest of the SPA.
window.addEventListener("popstate", () => {
  if (location.pathname.replace(/\/+$/, "") === "/account") { gotoAccount(false); return; }
  let top = "home"; try { top = sessionStorage.getItem("als-toptab") || "home"; } catch (e) {}
  if (top === "account") top = "home";
  switchTab(top);
});

const pmAccount = document.getElementById("pm-account");
const pmSignout = document.getElementById("pm-signout");
if (pmAccount) pmAccount.addEventListener("click", openAccount);
if (pmSignout) pmSignout.addEventListener("click", async () => {
  closeProfileMenu();
  try { if (sb) await sb.auth.signOut(); } catch (e) {}
  resetWorkspace();   // bug: the previous user's lesson stayed on screen after sign-out
  applySession(null);
});

// Wipe the lesson workspace on sign-out so the next user lands clean on Home (not still
// looking at the previous account's generated lesson). Clears tabs, the viewer iframe,
// the live-lesson globals, the persisted tabs, and the in-flight poller.
function resetWorkspace() {
  tabs = []; activeTabId = null; genTabId = null; activeJobId = null;
  if (activeJobTimer) { clearTimeout(activeJobTimer); activeJobTimer = null; }
  currentArtifactId = null; overviewArtifactId = null; currentLessonOwned = false; currentViewUrl = null; currentViewModule = null;
  try { if (viewerFrame) viewerFrame.src = "about:blank"; } catch (e) {}
  renderTabBar();
  try { sessionStorage.removeItem(TABS_KEY); sessionStorage.removeItem("als-toptab"); } catch (e) {}
  switchTab("home");
}
const acctTopup = document.getElementById("acct-topup");
if (acctTopup) acctTopup.addEventListener("click", () => switchTab("pricing"));
