/**
 * # Front-end logic (vanilla JavaScript, runs in the browser)
 *
 * Responsibilities for the Step-1 skeleton:
 *   1. Let the user select OPTIONAL starter cards (one per row, toggleable).
 *   2. On "Generate", switch from the landing view to the 30/70 workspace.
 *   3. POST the prompt + cards to /api/learn and read the Server-Sent Events
 *      stream, rendering each message in the left chat.
 *   4. When an `artifact` event arrives, show it in the right viewer (an iframe)
 *      and enable Download + Open-in-new-window.
 *
 * The generation engine behind /api/learn is stubbed for now; this front-end is
 * the real thing and won't change when the engine is wired in.
 */

// ---- Grab elements ----
const promptEl = document.getElementById("prompt");
const generateBtn = document.getElementById("generate");
const landing = document.getElementById("landing");
const workspace = document.getElementById("workspace");
const chatLog = document.getElementById("chat-log");
const viewerFrame = document.getElementById("viewer-frame");
const viewerEmpty = document.getElementById("viewer-empty");
const downloadBtn = document.getElementById("download");
const openWindowBtn = document.getElementById("open-window");
document.getElementById("new-thread").addEventListener("click", resetToLanding);

// Currently selected starter cards, e.g. { level: "beginner" }. Only set axes are sent.
const selectedCards = {};
let currentArtifactId = null;

// ---- Starter card selection: one selectable value per row, click again to clear ----
// Covers Level / Depth / Examples AND the new Text (density) row — all single-select.
document.querySelectorAll(".card-row").forEach((row) => {
  const axis = row.dataset.axis; // "level" | "depth" | "examples" | "density"
  row.querySelectorAll(".starter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const already = btn.classList.contains("selected");
      // Clear any other selection in this row first (single-select per row).
      row.querySelectorAll(".starter").forEach((b) => b.classList.remove("selected"));
      if (already) {
        delete selectedCards[axis]; // toggle off
      } else {
        btn.classList.add("selected");
        selectedCards[axis] = btn.dataset.value;
      }
    });
  });
});

// ---- On/off extras (Visuals & demos, Explain syntax): independent toggles ----
document.querySelectorAll(".opt-toggle").forEach((btn) => {
  const key = btn.dataset.toggle; // "visuals" | "syntax"
  btn.addEventListener("click", () => {
    const on = btn.classList.toggle("on");
    btn.setAttribute("aria-pressed", String(on));
    if (on) selectedCards[key] = "on";
    else delete selectedCards[key];
  });
});

// ---- Document uploads (session-scoped: kept until page refresh, reusable across lessons) ----
const uploadedDocs = []; // [{ docId, title }]
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
    r.onload = () => resolve(String(r.result).split(",")[1]); // strip "data:...;base64,"
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
    if (id) {
      const i = uploadedDocs.findIndex((d) => d.docId === id);
      if (i >= 0) uploadedDocs.splice(i, 1);
    }
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

// ---- Submit ----
generateBtn.addEventListener("click", startGeneration);
promptEl.addEventListener("keydown", (e) => {
  // Cmd/Ctrl + Enter submits.
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") startGeneration();
});

async function startGeneration() {
  const prompt = promptEl.value.trim();
  if (!prompt) {
    promptEl.focus();
    return;
  }

  // Switch to the workspace (chat left, viewer right).
  landing.hidden = true;
  workspace.hidden = false;
  chatLog.innerHTML = "";
  addUserBubble(prompt);
  const statusEl = addStatus("Starting…");

  try {
    const res = await fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        prompt,
        cards: selectedCards,
        uploadIds: uploadedDocs.map((d) => d.docId),
        referOnly: referChk.checked,
      }),
    });
    if (res.status === 401) { authOverlay.hidden = false; throw new Error("Please sign in to continue."); }
    if (!res.ok || !res.body) throw new Error("Request failed: " + res.status);

    await readSse(res.body, (event, data) => {
      if (event === "node") statusEl.querySelector(".label").textContent = data.message || data.stage;
      else if (event === "message") addAssistantBubble(data);
      else if (event === "artifact") showArtifact(data);
      else if (event === "error") addAssistantBubble({ node: "Error", content: "⚠️ " + data.message });
      else if (event === "done") statusEl.remove();
    });
  } catch (err) {
    statusEl.remove();
    addAssistantBubble({ node: "Error", content: "⚠️ " + err.message });
  }
}

// ---- SSE reader: POST + manual parse of the text/event-stream body ----
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
      let event = "message";
      let dataLine = "";
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
      }
      if (!dataLine) continue;
      try {
        onEvent(event, JSON.parse(dataLine));
      } catch {
        /* ignore malformed chunk */
      }
    }
  }
}

// ---- Viewer ----
function showArtifact(ref) {
  currentArtifactId = ref.id;
  viewerEmpty.hidden = true;
  viewerFrame.hidden = false;
  viewerFrame.src = "/api/artifact/" + ref.id;
  document.getElementById("viewer-title").textContent = ref.title || "Lesson";
  downloadBtn.hidden = false;
  // /full eagerly builds any not-yet-generated modules so the saved file is complete offline.
  downloadBtn.href = "/api/artifact/" + ref.id + "/full";
  openWindowBtn.hidden = false;
}
openWindowBtn.addEventListener("click", () => {
  if (currentArtifactId) window.open("/api/artifact/" + currentArtifactId, "_blank");
});

// ---- Chat rendering ----
function addUserBubble(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `<div class="who">You</div>${mdLite(text)}`;
  chatLog.appendChild(el);
  scrollDown();
}
function addAssistantBubble({ node, content }) {
  const el = document.createElement("div");
  el.className = "msg";
  el.innerHTML = `<div class="who">${escapeHtml(node || "Studio")}</div>${mdLite(content)}`;
  chatLog.appendChild(el);
  scrollDown();
}
function addStatus(text) {
  const el = document.createElement("div");
  el.className = "status";
  el.innerHTML = `<span class="spin"></span><span class="label">${escapeHtml(text)}</span>`;
  chatLog.appendChild(el);
  scrollDown();
  return el;
}

function resetToLanding() {
  workspace.hidden = true;
  landing.hidden = false;
  viewerFrame.src = "about:blank";
  viewerFrame.hidden = true;
  viewerEmpty.hidden = false;
  downloadBtn.hidden = true;
  openWindowBtn.hidden = true;
  currentArtifactId = null;
}

// ---- Tiny helpers ----
function scrollDown() { chatLog.scrollTop = chatLog.scrollHeight; }
function mdLite(s) { return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>"); }
function escapeHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ============================================================================
// Supabase Auth — gates generation when configured (SUPABASE_URL+ANON_KEY set
// on the server); fully open otherwise so local dev needs no auth. The browser
// gets the public anon key from /api/config, manages the session client-side,
// and sends the access token as a Bearer header on gated requests.
// ============================================================================
let sb = null;
let accessToken = null;
let authMode = "signin";
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

// Hoisted so the gated fetches above can use it regardless of auth state.
function authHeaders() {
  return accessToken ? { Authorization: "Bearer " + accessToken } : {};
}
function showAuthMsg(text, kind) {
  authMsg.hidden = !text;
  authMsg.textContent = text || "";
  authMsg.className = "auth-msg" + (kind ? " " + kind : "");
}
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  authTitle.textContent = signup ? "Create your account" : "Sign in";
  authSub.textContent = signup ? "Sign up to start generating lessons." : "Sign in to generate lessons.";
  authSubmit.textContent = signup ? "Create account" : "Sign in";
  authSwitchText.textContent = signup ? "Already have an account?" : "New here?";
  authToggle.textContent = signup ? "Sign in" : "Create an account";
  authPassword.autocomplete = signup ? "new-password" : "current-password";
  showAuthMsg("");
}
function applySession(session) {
  accessToken = (session && session.access_token) || null;
  const email = (session && session.user && session.user.email) || "";
  authOverlay.hidden = !!accessToken; // hide the gate once signed in
  if (logoutBtn) logoutBtn.hidden = !accessToken;
  if (authWho) { authWho.hidden = !accessToken; authWho.textContent = email; }
}

async function bootAuth() {
  let cfg;
  try { cfg = await (await fetch("/api/config")).json(); } catch { cfg = { authEnabled: false }; }
  if (!cfg.authEnabled) { authOverlay.hidden = true; return; } // open / local-dev mode
  if (!window.supabase || !cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    authLoading.textContent = "Sign-in is misconfigured — check SUPABASE_URL / SUPABASE_ANON_KEY.";
    return;
  }
  sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  authLoading.hidden = true;
  authForm.hidden = false;
  setAuthMode("signin");

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
        // If email confirmation is OFF, a session is returned and onAuthStateChange hides the gate.
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
bootAuth();
