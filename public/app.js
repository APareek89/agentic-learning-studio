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
const sel = { level: [], depth: null, examples: null, density: null, extras: [], lessonType: [], framework: null };

let currentArtifactId = null;
let currentThreadId = null;
let basePrompt = ""; // the lesson's original ask (so "modify" keeps context)

// Friendly labels for the dropdown summary.
const VALUE_LABELS = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced",
  conceptual: "Conceptual", technical: "Technical",
  functional: "Functional", code: "Code",
  low: "Low", medium: "Medium", high: "High",
  visuals: "Visuals", syntax: "Syntax",
  content: "Content", knowledge_check: "Knowledge check",
};
const DD_DEFAULTS = { level: "Any", depth: "Auto", examples: "Auto", density: "Balanced", extras: "None", lessonType: "Content", framework: "Pick one" };

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

// The code-framework dropdown only matters when Code examples are chosen.
function updateFrameworkVisibility() {
  const dd = document.getElementById("dd-framework");
  if (!dd) return;
  const show = sel.examples === "code";
  dd.hidden = !show;
  if (!show) {
    sel.framework = null;
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
  if (sel.depth) cards.depth = sel.depth;
  if (sel.examples) cards.examples = sel.examples;
  if (sel.density) cards.density = sel.density;
  if (sel.extras.includes("visuals")) cards.visuals = "on";
  if (sel.extras.includes("syntax")) cards.syntax = "on";
  return {
    prompt: promptText,
    cards,
    levels: sel.level,
    lessonTypes: sel.lessonType.length ? sel.lessonType : ["content"],
    framework: sel.framework || "",
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
  currentThreadId = "web-" + Date.now();
  startGeneration(p, currentThreadId);
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
openWindowBtn.addEventListener("click", () => { if (currentArtifactId) window.open("/api/artifact/" + currentArtifactId, "_blank"); });

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

function resetToLanding() {
  workspace.hidden = true;
  toggleChat(false);
  landing.hidden = false;
  viewerFrame.src = "about:blank";
  viewerFrame.hidden = true;
  viewerEmpty.hidden = false;
  viewerEmpty.textContent = "Your lesson will open here…";
  genOverlay.hidden = true;
  downloadBtn.hidden = true;
  openWindowBtn.hidden = true;
  askMoreBtn.hidden = true;
  ratingEl.hidden = true;
  currentArtifactId = null;
  loadDashboard();
  loadSuggestions();
}

// ---- Tabs (Learning / Dashboard) ----
const TAB_PANELS = { learning: "tab-learning", dashboard: "tab-dashboard" };
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
}

// ---- Dashboard tab ----
const dashGrid = document.getElementById("dash-grid");
const dashNote = document.getElementById("dash-note");
const dashEmpty = document.getElementById("dash-empty");
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
  const ratingHtml = l.rating ? `<span class="lc-stars">${"★".repeat(l.rating)}${"☆".repeat(5 - l.rating)}</span>` : "";
  const industry = l.industry ? `<span>${escapeHtml(l.industry)}</span>` : "";
  el.innerHTML = `
    <div class="lc-title">${escapeHtml(l.title)}</div>
    <div class="lc-meta"><span class="lc-badge${warn}">${days}d left</span>${industry}${ratingHtml}</div>
    <div class="lc-actions">
      <button class="ghost lc-open" type="button">Open / revise</button>
      <a class="ghost lc-dl" href="/api/artifact/${l.id}/full" download>Download</a>
    </div>`;
  el.querySelector(".lc-open").addEventListener("click", () => {
    switchTab("learning");
    basePrompt = l.prompt || l.title;
    currentThreadId = "web-" + Date.now();
    landing.hidden = true; workspace.hidden = false; chatLog.innerHTML = "";
    toggleChat(false);
    openInViewer(l.id, l.title);
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
const logoutBtn = document.getElementById("logout");
const authWho = document.getElementById("auth-who");

function authHeaders() { return accessToken ? { Authorization: "Bearer " + accessToken } : {}; }
function authRequiredAndOut() { return authIsEnabled && !accessToken; }
function showAuthMsg(text, kind) { authMsg.hidden = !text; authMsg.textContent = text || ""; authMsg.className = "auth-msg" + (kind ? " " + kind : ""); }
// The overlay is a GATE (blocks the app until signed in when auth is on).
function showAuthGate() { authLoading.hidden = true; authForm.hidden = false; authOverlay.hidden = false; }
function openAuth(mode) { setAuthMode(mode || "signin"); showAuthGate(); }
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
  if (signedIn) {
    authOverlay.hidden = true;
    loadDashboard(); loadPreferences(); loadSuggestions(); maybeOnboard();
  } else if (authIsEnabled) {
    showAuthGate(); // not signed in + auth on → block behind the gate
  }
}

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
    authLoading.textContent = "Sign-in is misconfigured — check SUPABASE_URL / SUPABASE_ANON_KEY.";
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  setAuthMode("signup"); // new visitors sign up first

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
        if (!d.session) { showAuthMsg("Account created — check your email to confirm, then sign in.", "ok"); setAuthMode("signin"); }
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
    applyPref("level", prefs.levels, true);
    applyPref("depth", prefs.depth, false);
    applyPref("examples", prefs.examples, false);
    applyPref("density", prefs.density, false);
    if (prefs.visuals) applyPref("extras", "visuals", true, true);
    if (prefs.syntax) applyPref("extras", "syntax", true, true);
    applyPref("lessonType", prefs.lessonTypes, true);
    if (prefs.industry) industryEl.value = prefs.industry;
    if (prefs.buildGoal) buildGoalEl.value = prefs.buildGoal;
    updateFrameworkVisibility();
    if (prefs.framework && sel.examples === "code") applyPref("framework", prefs.framework, false);
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
