/**
 * # The web server — Express + Server-Sent Events (SSE)  [Step 1 skeleton]
 *
 * Bridges the browser to the (soon) LangGraph generation pipeline. For now the
 * `/api/learn` route is a STUB that streams the real event contract and returns a
 * small placeholder artifact — so the whole front-end flow (chat slides left,
 * viewer opens right, Download / Open-in-new-window) works today. Step 6 swaps the
 * stub for the real graph with no front-end change.
 *
 * "SSE" (Server-Sent Events) = a one-way stream where the server keeps pushing
 * text to the browser over one long-lived HTTP response. We `write()` `data: …`
 * chunks; the browser reads them live.
 *
 * Graceful-optional invariant: the app boots and serves with ONLY
 * `ANTHROPIC_API_KEY` (and even runs the stub without it). DB / Langfuse /
 * embeddings are all optional.
 */

import "dotenv/config"; // load .env before anything reads process.env
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile, unlink, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getArtifact, updateArtifact } from "./lib/artifacts";
import { loadSource } from "./rag/loaders";
import { addUpload, addRepoUpload } from "./lib/uploads";
import { authEnabled, verifyToken, bearerFrom, getUser } from "./lib/auth";
import { listLessons, rateLesson, getPreferences, savePreferences, getCourse, saveProgress } from "./lib/lessons";
import { listCommunity, getCommunityHtml, likeCommunity, reportCommunity, shareLesson, getContributor, registerContributor, listDrivers, getDriver } from "./lib/community";
import { createJob, getJob, lessonPercent, acquireGenSlot, activeJobs, hasActiveBuildForArtifact } from "./lib/jobs";
import { runOverviewJob, runBuildJob, OVERVIEW_DRAFT_KIND } from "./agent/orchestrator";
import { createSkillJob, getSkillJob, runSkillJob, getCachedSkill, persistSkill, listSavedSkills, getSavedSkill, deleteSavedSkill, type SkillInput } from "./lib/skillgen";
import { dbEnabled, ragEnabled, rawPool, query } from "./lib/db";
import { getBalance, ensureFreeGrant, addCredits, getAccountSummary } from "./lib/credits";
import { billingConfigured, webhookConfigured, createCheckout, verifyWebhookSignature, parseOrder, lessonsForOrder, fetchPricing, type PlanId } from "./lib/lemonsqueezy";
import { makeLangfuseHandler } from "./lib/langfuse";
import { compiledGraph } from "./agent/graph";
import { runDeepDive } from "./agent/nodes";
import { makeLLM } from "./agent/llm";
import { renderArtifact } from "./render/index";
import { handsOnEligible, resolveBlueprint, peekCache, createHandsOnJob, getHandsOnJob, runHandsOnJob } from "./lib/handson";
import { renderModuleFragment } from "./render/components";
import { moduleCacheKey } from "./lib/hash";
import { saveSupportRequest, saveConsent, CONSENT_VERSION, SUPPORT_CATEGORIES } from "./lib/support";
import { sendSupportEmail, sendAckEmail } from "./lib/email";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { ChatMessage, ArtifactRef } from "./agent/state";
import type { Block, Blueprint } from "./render/schema";

/** jsonb may arrive as an object (pg auto-parse) or a string (driver/encoding) — normalize. */
function maybeParseBlueprint(v: unknown): Blueprint | null {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v) as Blueprint; } catch { return null; } }
  return v as Blueprint;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const app = express();

// Behind Render's proxy: trust X-Forwarded-* so req.ip is the real client (rate-limit keys on it).
app.set("trust proxy", 1);

// Security headers (HSTS, nosniff, X-Frame-Options SAMEORIGIN, Referrer-Policy, …). CSP is left
// OFF deliberately: generated lessons + the host page inline their own <script>/<style>, and a
// strict CSP would break them. (A tight CSP + iframe sandbox is a follow-up — see CHECKLIST §4.)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// CORS: allow ONLY our own origins to call /api from a browser. Same-origin requests (the app
// itself, the artifact iframe) send no Origin and are always allowed; this blocks OTHER sites'
// JS from using the API with a visitor's session. Server-to-server / curl (no Origin) pass too.
const ALLOWED_ORIGINS = new Set([
  "https://prathibhax.com",
  "https://www.prathibhax.com",
  "https://agentic-learning-studio.onrender.com",
  "http://localhost:5070",
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(",").map((s) => s.trim()) : []),
]);
app.use(cors({
  origin(origin, cb) { cb(null, !origin || ALLOWED_ORIGINS.has(origin)); },
  credentials: true,
}));

// ---- Lemon Squeezy webhook (RAW body) — MUST be registered BEFORE express.json ----
// Signature verification needs the exact bytes Lemon Squeezy signed; express.json
// would consume + reparse them. This route reads the raw Buffer, verifies the HMAC,
// then credits the buyer. Idempotent (order id is UNIQUE) → always returns 200 so
// Lemon Squeezy stops retrying, even for duplicates.
app.post("/api/lemonsqueezy/webhook", express.raw({ type: "*/*", limit: "1mb" }), async (req, res) => {
  if (!webhookConfigured()) { res.status(503).json({ error: "Webhook not configured." }); return; }
  const raw = req.body as Buffer; // express.raw → Buffer
  const sig = (req.headers["x-signature"] as string | undefined) ?? "";
  if (!Buffer.isBuffer(raw) || !verifyWebhookSignature(raw, sig)) {
    res.status(401).json({ error: "Invalid signature." });
    return;
  }
  let order;
  try { order = parseOrder(JSON.parse(raw.toString("utf8"))); } catch { order = null; }
  // Only act on the paid event; ack everything else so LS stops retrying.
  if (!order || (order.eventName !== "order_created" && order.eventName !== "order_paid")) {
    res.status(200).json({ ok: true, ignored: true });
    return;
  }
  if (!order.userId) { console.warn("[ls-webhook] order missing user_id custom_data", order.orderId); res.status(200).json({ ok: true }); return; }
  const lessons = lessonsForOrder(order.planId, order.quantity);
  if (lessons > 0) {
    try {
      const { credited } = await addCredits(order.userId, lessons, {
        reason: "purchase", planId: order.planId, amountUsd: order.amountUsd, lsOrderId: order.orderId,
      });
      console.log(`[ls-webhook] order ${order.orderId} ${order.planId} x${order.quantity} → ${lessons} lessons for ${order.userId} (${credited ? "credited" : "duplicate"})`);
    } catch (e) {
      // A DB hiccup → 500 so LS retries (still idempotent on the order id).
      console.error("[ls-webhook] addCredits failed", e);
      res.status(500).json({ error: "credit failed" });
      return;
    }
  }
  res.status(200).json({ ok: true });
});

app.use(express.json({ limit: "40mb" })); // base64-encoded uploads ride in the JSON body (25MB file ≈ 34MB base64)
app.use(express.static(PUBLIC_DIR)); // serves the front-end (index.html, app.js, styles.css)

// SPA route: the Account page is a real URL (/account) so it deep-links + survives a
// refresh. There's no client-side router beyond this one path, so serve index.html and
// let app.js switch to the account tab from window.location. (Static assets above win.)
app.get("/account", (_req, res) => res.sendFile(join(PUBLIC_DIR, "index.html")));
// Hands-On notebook page (browser-run Pyodide practice). Opened in a new tab from a lesson.
app.get("/hands-on", (_req, res) => res.sendFile(join(PUBLIC_DIR, "hands-on.html")));

// Legal / compliance pages at pretty URLs (NOT nav tabs — linked only from the home footer).
const PAGE_ROUTES: Record<string, string> = {
  "/security": "security.html",
  "/privacy": "privacy.html",
  "/terms": "terms.html",
  "/report-issue": "report-issue.html",
  "/complaint": "report-issue.html",
  "/grievance": "report-issue.html",
};
for (const [route, file] of Object.entries(PAGE_ROUTES)) {
  app.get(route, (_req, res) => res.sendFile(join(PUBLIC_DIR, file)));
}

// ---- Rate limits (per-IP). Protect CPU + the Anthropic bill from a runaway client. ----
const ipKey = (req: express.Request) => req.ip || "unknown";
// Expensive: generation + uploads (CPU, model spend, repo clone).
const heavyLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false, keyGenerator: ipKey,
  message: { error: "You're going a bit fast — please wait a few minutes and try again." } });
// General API guard (a wide net so one client can't hammer any endpoint).
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, keyGenerator: ipKey });
app.use("/api/", apiLimiter);
// Complaint/grievance intake — tight cap so the form can't be used to spam the operator.
const supportLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, standardHeaders: true, legacyHeaders: false, keyGenerator: ipKey,
  message: { error: "Too many submissions — please wait an hour before sending another, or email anandp.pareek6@gmail.com directly." } });

/** Write one named SSE event with a JSON payload onto a response stream. */
function sseSend(res: express.Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * requireAuth — gate the generation endpoints behind a Supabase session. No-op when
 * auth isn't configured (local dev / open mode), so the app still runs with zero
 * auth setup. The front-end sends `Authorization: Bearer <access_token>`.
 */
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  if (!authEnabled()) {
    next();
    return;
  }
  const token = bearerFrom(req.headers.authorization);
  const user = token ? await verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ error: "Please sign in to continue." });
    return;
  }
  (req as express.Request & { user?: typeof user }).user = user;
  next();
}

// Public config the browser needs to wire up Supabase Auth (anon key is public).
app.get("/api/config", (_req, res) => {
  res.json({
    authEnabled: authEnabled(),
    supabaseUrl: process.env.SUPABASE_URL ?? "",
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? "",
    billingEnabled: billingConfigured(),
    unitPriceUsd: 0.99,
  });
});

// ----------------------------------------------------------------------------
// Lesson credits — balance, checkout. One completed build = 1 credit; the free
// overview/preview costs nothing. New signed-in users get one free credit.
// ----------------------------------------------------------------------------

/** GET /api/credits — the signed-in user's spendable balance (grants the free credit on first call). */
app.get("/api/credits", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.json({ balance: 0, signedIn: false }); return; }
  // First time we see a signed-in user → grant the one free credit (idempotent).
  const balance = await ensureFreeGrant(user.id);
  res.json({ balance, signedIn: true });
});

/** The public origin to send buyers back to after checkout (Render/host or localhost). */
function appOrigin(req: express.Request): string {
  const envUrl = (process.env.APP_URL ?? "").trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const proto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ?? req.protocol;
  return `${proto}://${req.headers.host}`;
}

/**
 * POST /api/checkout — server-built Lemon Squeezy checkout for the Lemon.js overlay.
 * Body: { planId: 'trial-launch' | 'lessons-payg', quantity }. Returns { url }.
 * Quantity is clamped server-side; the webhook is the source of truth for credits.
 */
app.post("/api/checkout", heavyLimiter, requireAuth, async (req, res) => {
  if (!billingConfigured()) { res.status(503).json({ error: "Payments aren't set up yet — check back shortly." }); return; }
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in to buy lesson credits." }); return; }
  const planId = (req.body?.planId === "trial-launch" ? "trial-launch" : "lessons-payg") as PlanId;
  const quantity = Math.min(500, Math.max(1, Math.round(Number(req.body?.quantity) || 1)));
  try {
    const url = await createCheckout({
      planId, quantity, userId: user.id, userEmail: user.email,
      redirectUrl: `${appOrigin(req)}/?purchase=success`,
    });
    res.json({ url });
  } catch (e) {
    console.error("[checkout]", e);
    const detail = e instanceof Error ? e.message : String(e);
    // Surface the upstream Lemon Squeezy reason so checkout failures are diagnosable
    // (e.g. "store not activated", bad variant id). TODO: hide `detail` once billing is stable.
    res.status(502).json({ error: "Couldn't start checkout.", detail });
  }
});

/**
 * GET /api/pricing — live prices + store currency from Lemon Squeezy (public; cached).
 * The pricing page renders these so it always matches the LS config (never hardcoded
 * USD). LS localizes the FINAL charge to the buyer's country at checkout. On error it
 * returns the upstream detail (also a quick health probe for the API key + variants).
 */
app.get("/api/pricing", async (_req, res) => {
  if (!billingConfigured()) { res.json({ configured: false }); return; }
  try {
    const p = await fetchPricing(Date.now());
    res.json({ configured: true, ...p });
  } catch (e) {
    res.status(502).json({ configured: true, error: "pricing-fetch-failed", detail: e instanceof Error ? e.message : String(e) });
  }
});


// ----------------------------------------------------------------------------
// GET /api/lessons — the signed-in user's previous lessons (dashboard). Returns
// title, prompt, days remaining (30-day window), and any rating.
// ----------------------------------------------------------------------------
app.get("/api/lessons", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  res.json({ lessons: await listLessons(user.id, user.email ?? "") });
});

// GET /api/account — the signed-in user's account + usage summary for the /account page
// (identity, plan, live balance, lessons generated, credits spent, member-since).
app.get("/api/account", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  const summary = await getAccountSummary(user.id, user.email ?? "");
  res.json({ ...summary, userId: user.id, email: user.email ?? "" });
});

// GET /api/preferences — the user's stored landing selections (to pre-fill the form).
app.get("/api/preferences", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  res.json({ prefs: await getPreferences(user.id) });
});

// POST /api/profile — save the learner's sign-up profile (industry/role/aspiring role/goal).
app.post("/api/profile", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  const { industry, role, aspiringRole, personalGoal } = (req.body ?? {}) as Record<string, string>;
  const prefs = await getPreferences(user.id);
  const profile = { ...((prefs.profile as object) ?? {}), industry, role, aspiringRole, personalGoal };
  await savePreferences(user.id, user.email, { ...prefs, profile });
  res.json({ ok: true });
});

// GET /api/suggest — 3–4 suggested next topics from the learner's recent lessons + profile.
app.get("/api/suggest", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.json({ topics: [] }); return; }
  const lessons = await listLessons(user.id);
  if (!lessons.length) { res.json({ topics: [] }); return; } // only AFTER the first lesson
  const prefs = await getPreferences(user.id);
  const profile = (prefs.profile as Record<string, string>) ?? {};
  try {
    const llm = makeLLM("haiku", 0.4).withStructuredOutput(z.object({ topics: z.array(z.string()).max(4) }), { name: "suggest" });
    const out = await llm.invoke([
      new SystemMessage("Suggest 3–4 SHORT next lesson topics (each ≤6 words) in agentic/AI engineering that build on what the learner has studied and fit their role/goal. Return concise titles only."),
      new HumanMessage(`Recent lessons: ${lessons.slice(0, 6).map((l) => l.title).join("; ")}\nRole: ${profile.role ?? "?"} (aspiring ${profile.aspiringRole ?? "?"})\nGoal: ${profile.personalGoal ?? "?"}\nIndustry: ${profile.industry ?? "?"}`),
    ]);
    res.json({ topics: out.topics ?? [] });
  } catch { res.json({ topics: [] }); }
});

// POST /api/rate — save a 1..5 rating (+ optional comment) for one of the user's lessons.
app.post("/api/rate", requireAuth, async (req, res) => {
  const { artifactId, rating, comment } = (req.body ?? {}) as { artifactId?: string; rating?: number; comment?: string };
  const user = await getUser(req.headers.authorization);
  if (!user) {
    res.status(401).json({ error: "Please sign in." });
    return;
  }
  if (!artifactId || !rating || rating < 1 || rating > 5) {
    res.status(400).json({ error: "Expected { artifactId, rating: 1..5 }." });
    return;
  }
  const ok = await rateLesson(user.id, artifactId, rating, comment, user.email ?? "");
  res.json({ ok });
});

// POST /api/progress — the host relays the artifact iframe's progress here (the iframe is
// unauthenticated, so it postMessages the host, which posts this with the auth token). Drives
// My Lessons % completed + the Trainer "share & save" popup.
app.post("/api/progress", requireAuth, async (req, res) => {
  const { lessonId, percent, visited, total } = (req.body ?? {}) as { lessonId?: string; percent?: number; visited?: number; total?: number };
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  if (!lessonId) { res.status(400).json({ error: "Missing lessonId." }); return; }
  await saveProgress(user.id, user.email ?? "", lessonId, percent ?? 0, visited ?? 0, total ?? 0);
  res.json({ ok: true });
});

// ----------------------------------------------------------------------------
// POST /api/overview — STAGE 1 of the human-in-the-loop flow ("Generate Overview —
// Free"): design ONLY the overview (skeleton) as a preview-only DRAFT and return a
// jobId immediately. No module bodies are written (free); the learner reviews the
// overview, then clicks "Generate Lesson" (→ /api/build) to commit.
// ----------------------------------------------------------------------------
app.post("/api/overview", heavyLimiter, requireAuth, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) { res.status(400).json({ error: "Missing 'prompt'." }); return; }
  if (prompt.length > 5000) { res.status(400).json({ error: "That request is too long (max 5000 characters)." }); return; }
  const cards = (body.cards as Record<string, string>) ?? {};
  const user = await getUser(req.headers.authorization);
  let userProfile: Record<string, unknown> = {};
  if (user) {
    const prefs = await getPreferences(user.id);
    userProfile = (prefs.profile as Record<string, unknown>) ?? {};
    savePreferences(user.id, user.email, {
      ...prefs, levels: (body.levels as string[]) ?? [], depth: cards.depth, examples: cards.examples,
      density: cards.density, visuals: cards.visuals === "on", syntax: cards.syntax === "on",
      lessonTypes: (body.lessonTypes as string[]) ?? [], industry: (body.industry as string) ?? "",
      buildGoal: (body.buildGoal as string) ?? "", framework: (body.framework as string) ?? "",
      readingMode: (body.readingMode as string) ?? "",
    }).catch(() => {});
  }
  // Take a generation slot LAST (so a failure above can't leak it); the job releases it in its finally.
  if (!acquireGenSlot()) { res.status(429).json({ error: "We're generating a lot of lessons right now — please try again in a minute." }); return; }
  const job = createJob(user?.id ?? "anon");
  // Fire-and-forget: the job runs in the background, surviving this response.
  void runOverviewJob(job, {
    userPrompt: prompt, cards, uploadIds: (body.uploadIds as string[]) ?? [], referOnly: !!body.referOnly,
    industry: (body.industry as string) ?? "", buildGoal: (body.buildGoal as string) ?? "",
    objective: (body.objective as string) ?? "",
    levels: (body.levels as string[]) ?? [], lessonTypes: (body.lessonTypes as string[]) ?? [],
    framework: (body.framework as string) ?? "", readingMode: (body.readingMode as string) ?? "",
    userProfile, userId: user?.id ?? "", userEmail: user?.email ?? "",
  });
  res.json({ jobId: job.id });
});

// POST /api/build — STAGE 2 ("Generate Lesson"): the learner approved the overview
// draft; promote it to a real lesson and write every module body. Returns a jobId;
// the dashboard (My Lessons) polls GET /api/job/:id and opens it as bodies fill in.
// ----------------------------------------------------------------------------
app.post("/api/build", heavyLimiter, requireAuth, async (req, res) => {
  const artifactId = typeof req.body?.artifactId === "string" ? req.body.artifactId : "";
  if (!artifactId) { res.status(400).json({ error: "Missing 'artifactId'." }); return; }
  const art = await getArtifact(artifactId);
  if (!art) { res.status(404).json({ error: "That overview wasn't found (it may have expired)." }); return; }
  const user = await getUser(req.headers.authorization);
  // Credit gate: a completed build costs 1 lesson credit. Grant the one free credit
  // on the first attempt, then block at zero (the buyer is sent to Pricing). Skipped
  // when the DB/auth is off (local dev) so the open-mode flow stays free.
  if (user && dbEnabled()) {
    const bal = await ensureFreeGrant(user.id);
    if (bal < 1) { res.status(402).json({ error: "You're out of lesson credits. Add more to keep generating.", needCredits: true }); return; }
  }
  if (!acquireGenSlot()) { res.status(429).json({ error: "We're generating a lot of lessons right now — please try again in a minute." }); return; }
  const job = createJob(user?.id ?? "anon");
  void runBuildJob(job, artifactId);
  res.json({ jobId: job.id });
});

// GET /api/job/:id — live progress for the dashboard / Trainer.
app.get("/api/job/:id", requireAuth, (req, res) => {
  const job = getJob(req.params.id);
  if (!job) { res.status(404).json({ error: "Job not found (finished, or the server restarted)." }); return; }
  res.json({
    id: job.id, status: job.status, stage: job.stage, error: job.error, isCourse: job.isCourse, courseId: job.courseId,
    lessons: job.lessons.map((l) => ({ index: l.index, title: l.title, artifactId: l.artifactId, status: l.status, percent: lessonPercent(l), builtModules: l.builtModules, totalModules: l.totalModules })),
  });
});

// ----------------------------------------------------------------------------
// LLM Skills — turn a free-text brief into an installable Agent Skill.
// POST /api/skill/generate (requireAuth, FREE in v1) → detached job → {jobId}.
// The browser polls GET /api/skill/job/:id. Grounded by the "Agent Skills" KB
// category when present; generates ungrounded (logged) if not yet ingested.
// ----------------------------------------------------------------------------
app.post("/api/skill/generate", heavyLimiter, requireAuth, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max = 5000) => (typeof v === "string" ? v.slice(0, max) : "");
  const task = str(body.task).trim();
  if (!task) { res.status(400).json({ error: "Tell me what the skill is for (the 'task' field)." }); return; }
  const input: SkillInput = {
    llmInterface: str(body.llmInterface, 200),
    task,
    dataSources: str(body.dataSources, 2000),
    accessMethod: str(body.accessMethod, 2000),
    exampleRequest: str(body.exampleRequest, 2000),
    tools: str(body.tools, 2000),
    constraints: str(body.constraints, 2000),
    skillName: str(body.skillName, 120),
    refDocIds: Array.isArray(body.refDocIds) ? (body.refDocIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 12) : [],
  };
  const user = await getUser(req.headers.authorization);
  input.userId = user?.id ?? "";
  input.userEmail = user?.email ?? "";
  // Cache hit → return a job that's already done (no gen slot needed). Still persist
  // it to THIS user's My Skills (fire-and-forget; never blocks the response).
  const cached = getCachedSkill(input);
  if (cached) {
    const job = createSkillJob(user?.id ?? "anon");
    job.skill = cached;
    job.grounded = (cached.sources ?? []).some((s) => !!s.url);
    job.percent = 100;
    job.status = "done";
    job.saved = true;
    void persistSkill(input.userId, input.userEmail, cached, !!job.grounded);
    res.json({ jobId: job.id });
    return;
  }
  // Take a generation slot LAST (a failure above can't leak it); the job releases it in its finally.
  if (!acquireGenSlot()) { res.status(429).json({ error: "We're generating a lot right now — please try again in a minute." }); return; }
  const job = createSkillJob(user?.id ?? "anon");
  void runSkillJob(job, input);
  res.json({ jobId: job.id });
});

// GET /api/skill/job/:id — live progress + the finished skill package.
app.get("/api/skill/job/:id", requireAuth, (req, res) => {
  const job = getSkillJob(req.params.id);
  if (!job) { res.status(404).json({ error: "Job not found (finished, or the server restarted)." }); return; }
  res.json({ id: job.id, status: job.status, percent: job.percent, error: job.error, grounded: job.grounded, saved: job.saved, skill: job.skill });
});

// GET /api/skills — the signed-in user's saved skills (My Skills list).
app.get("/api/skills", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.json({ skills: [] }); return; }
  const skills = await listSavedSkills(user.id, user.email);
  res.json({ skills });
});

// GET /api/skill/saved/:id — full package of one saved skill (to re-open it).
app.get("/api/skill/saved/:id", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  const row = await getSavedSkill(req.params.id, user.id, user.email);
  if (!row) { res.status(404).json({ error: "That skill wasn't found." }); return; }
  res.json(row);
});

// DELETE /api/skill/saved/:id — remove a saved skill from My Skills.
app.delete("/api/skill/saved/:id", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  const ok = await deleteSavedSkill(req.params.id, user.id, user.email);
  res.json({ ok });
});

// GET /api/jobs/active — the signed-in user's still-running generations (server source of
// truth). Lets My Lessons show a build that's continuing AFTER a page refresh, when the
// client-side poller is gone. Keyed by artifactId so the dashboard can match its rows.
app.get("/api/jobs/active", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.json({ jobs: [] }); return; }
  const out = activeJobs(user.id).flatMap((j) =>
    j.lessons.filter((l) => l.artifactId).map((l) => ({
      jobId: j.id, artifactId: l.artifactId, title: l.title,
      status: j.status, lessonStatus: l.status, percent: lessonPercent(l),
      builtModules: l.builtModules, totalModules: l.totalModules,
    }))
  );
  res.json({ jobs: out });
});

// GET /api/course/:courseId — ordered lessons of a course (for the lesson-tab strip).
app.get("/api/course/:courseId", requireAuth, async (req, res) => {
  res.json({ lessons: await getCourse(req.params.courseId) });
});

// ----------------------------------------------------------------------------
// POST /api/learn — run the real generation graph and stream it over SSE.
// ----------------------------------------------------------------------------
app.post("/api/learn", requireAuth, async (req, res) => {
  const { prompt, cards, threadId, uploadIds, referOnly, industry, buildGoal, objective, levels, lessonTypes, framework, readingMode } = (req.body ?? {}) as {
    prompt?: string;
    cards?: Record<string, string>;
    threadId?: string;
    uploadIds?: string[];
    referOnly?: boolean;
    industry?: string;
    buildGoal?: string;
    objective?: string;
    levels?: string[];
    lessonTypes?: string[];
    framework?: string;
    readingMode?: string;
  };

  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: "Missing 'prompt'." });
    return;
  }

  // Resolve the owner (real user when auth is on; a stable local id otherwise) so
  // the generated lesson lands in their dashboard, and remember their selections.
  const user = await getUser(req.headers.authorization);
  let userProfile: Record<string, unknown> = {};
  if (user) {
    const prefs = await getPreferences(user.id);
    userProfile = (prefs.profile as Record<string, unknown>) ?? {};
    savePreferences(user.id, user.email, {
      ...prefs,
      levels: levels ?? [], depth: cards?.depth, examples: cards?.examples,
      density: cards?.density, visuals: cards?.visuals === "on", syntax: cards?.syntax === "on",
      lessonTypes: lessonTypes ?? [], industry: industry ?? "", buildGoal: buildGoal ?? "", framework: framework ?? "",
      readingMode: readingMode ?? "",
    }).catch(() => {});
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  // Per-request Langfuse handler (null when keys absent → tracing skipped).
  const langfuse = makeLangfuseHandler();
  const thread_id = threadId || `web-${Date.now()}`;
  const config = {
    configurable: { thread_id },
    callbacks: langfuse ? [langfuse] : [],
    runName: `Learn: ${prompt.slice(0, 60)}`,
    metadata: { langfuseSessionId: thread_id, langfuseTags: ["learning-gen"], prompt },
  };

  try {
    sseSend(res, "node", { stage: "start" });
    // streamMode "updates" yields { nodeName: partialUpdate } per node.
    for await (const chunk of await compiledGraph.stream(
      {
        userPrompt: prompt,
        cards: cards ?? {},
        uploadIds: uploadIds ?? [],
        referOnly: !!referOnly,
        industry: industry ?? "",
        buildGoal: buildGoal ?? "",
        objective: objective ?? "",
        levels: levels ?? [],
        lessonTypes: lessonTypes ?? [],
        framework: framework ?? "",
        readingMode: readingMode ?? "",
        userProfile,
        userId: user?.id ?? "",
        userEmail: user?.email ?? "",
      },
      { ...config, streamMode: "updates" }
    )) {
      for (const [nodeName, update] of Object.entries(chunk)) {
        sseSend(res, "node", { stage: nodeName });
        const u = update as { messages?: ChatMessage[]; artifacts?: ArtifactRef[] };
        for (const m of u.messages ?? []) sseSend(res, "message", m);
        for (const a of u.artifacts ?? []) sseSend(res, "artifact", a);
      }
    }
    sseSend(res, "done", { thread_id });
  } catch (err) {
    console.error("[/api/learn]", err);
    sseSend(res, "error", { message: err instanceof Error ? err.message : String(err) });
  } finally {
    if (langfuse) await langfuse.flushAsync().catch(() => {});
    res.end();
  }
});

// ----------------------------------------------------------------------------
// GET /api/artifact/:id — serve the self-contained HTML (used as the viewer's
// iframe source and for "open in new window").
// ----------------------------------------------------------------------------
app.get("/api/artifact/:id", async (req, res) => {
  const art = await getArtifact(req.params.id);
  if (!art) {
    res.status(404).send("<p>Artifact not found.</p>");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // Re-render from the stored Blueprint so EXISTING lessons pick up renderer/CSS fixes
  // (e.g. the no-scroll overview) without regeneration. Fall back to the stored HTML if
  // the blueprint is missing or anything throws — never break an openable lesson.
  if (art.blueprint) {
    // A draft (un-approved overview) renders preview-only — overview shown, nothing builds.
    const previewOnly = art.kind === OVERVIEW_DRAFT_KIND;
    // ?module=<id> — the host passes the reader's current module on a live-build reload so the
    // runtime restores it instead of bouncing to the overview.
    const currentModuleId = typeof req.query.module === "string" ? req.query.module : undefined;
    try { res.send(renderArtifact(art.blueprint, { previewOnly, currentModuleId })); return; }
    catch (e) { console.warn("[artifact] re-render failed, serving stored html:", (e as Error).message?.slice(0, 100)); }
  }
  res.send(art.html);
});

// GET /api/artifact/:id/download — same HTML, but as a file download.
app.get("/api/artifact/:id/download", async (req, res) => {
  const art = await getArtifact(req.params.id);
  if (!art) {
    res.status(404).send("Not found");
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="learning-${art.id}.html"`);
  res.send(art.html);
});

// ----------------------------------------------------------------------------
// POST /api/module — serve ONE module's body, building it OFF the request when needed.
// The artifact's own runtime (iframe / standalone page) calls this for each still-stub module
// (background queue + click-to-prioritize). Returns the rendered fragment to inject, or
// 202 {building:true} when synthesis is in progress (the runtime then POLLS — see runtime.ts pump).
// ----------------------------------------------------------------------------
// PUBLIC (no requireAuth): the artifact's OWN runtime has no auth token. It only builds a module for
// an already-existing artifact (an unguessable UUID, same access model as the public
// /api/artifact/:id), and results are cached, so the cost/abuse surface is bounded. The expensive
// entry points that CREATE lessons (/api/generate, /api/learn) stay auth-gated.

/** Deterministic module_cache key for a module of a blueprint (shared by the route + builder). */
function buildModuleCacheKey(bp: Blueprint, moduleId: string): string {
  const p = bp.learnerProfile;
  return moduleCacheKey({
    topic: bp.meta.topic, moduleId, level: p.level, depth: p.depth, examples: p.examples,
    industry: p.industry, density: p.density, visuals: p.visualsRequested, syntax: p.explainSyntax,
    objective: p.objective, buildGoal: p.buildGoal, framework: p.framework, lessonTypes: p.lessonTypes,
  });
}

// In-flight single-module builds — dedupe so repeated 202 polls don't spawn duplicate synthesis.
const moduleBuildsInFlight = new Set<string>();
/**
 * Build ONE module's body OFF the HTTP request (Render gateway-timeout-safe — B3). Re-fetches the
 * artifact, runs the deep-dive, caches the fragment, and persists the grown blueprint. Idempotent
 * (skips if already built) and deduped (one in-flight build per artifact+module); a failed deep-dive
 * leaves the module as a stub so a later poll re-kicks it.
 */
function ensureModuleBuild(artifactId: string, moduleId: string): void {
  const key = `${artifactId}:${moduleId}`;
  if (moduleBuildsInFlight.has(key)) return;
  moduleBuildsInFlight.add(key);
  void (async () => {
    try {
      const art = await getArtifact(artifactId);
      const bp = art?.blueprint;
      const module = bp?.modules.find((m) => m.id === moduleId);
      if (!art || !bp || !module) return;
      if (module.loadState === "full" && module.blocks.length > 0) return; // already built
      const { ok } = await runDeepDive(bp, moduleId, { uploadIds: art.uploadIds, referOnly: art.referOnly });
      if (!ok) return; // leave as a stub; the next poll re-kicks a build
      const fragmentHtml = renderModuleFragment(module, bp);
      await query(
        `insert into module_cache (cache_key, fragment_html) values ($1, $2)
         on conflict (cache_key) do update set fragment_html = excluded.fragment_html`,
        [buildModuleCacheKey(bp, moduleId), fragmentHtml]
      ).catch(() => {});
      await updateArtifact(artifactId, { blueprint: bp, html: renderArtifact(bp) }).catch(() => {});
    } catch (e) {
      console.warn("[ensureModuleBuild]", moduleId, e instanceof Error ? e.message : String(e));
    } finally {
      moduleBuildsInFlight.delete(key);
    }
  })();
}

app.post("/api/module", async (req, res) => {
  const { artifactId, moduleId } = (req.body ?? {}) as { artifactId?: string; moduleId?: string };
  const art = artifactId ? await getArtifact(artifactId) : undefined;
  const bp = art?.blueprint;
  if (!bp || !moduleId) { res.status(404).json({ error: "Unknown artifact or module." }); return; }
  const module = bp.modules.find((m) => m.id === moduleId);
  if (!module) { res.status(404).json({ error: "No such module." }); return; }

  try {
    const cacheKey = buildModuleCacheKey(bp, moduleId);
    // 1) Cache hit → instant, no Claude call.
    const cached = await query<{ fragment_html: string }>(`select fragment_html from module_cache where cache_key = $1`, [cacheKey]);
    if (cached.length) { res.json({ moduleId, fragmentHtml: cached[0].fragment_html, cached: true }); return; }

    // 2) Already built in the persisted artifact (e.g. runBuildJob finished it) → render now + cache.
    if (module.loadState === "full" && module.blocks.length > 0) {
      const fragmentHtml = renderModuleFragment(module, bp);
      await query(
        `insert into module_cache (cache_key, fragment_html) values ($1, $2)
         on conflict (cache_key) do update set fragment_html = excluded.fragment_html`,
        [cacheKey, fragmentHtml]
      ).catch(() => {});
      res.json({ moduleId, fragmentHtml, cached: false });
      return;
    }

    // 3) Not built → do NOT synthesize on the request (a ~16k-token Sonnet call exceeds Render's
    //    gateway timeout → 502). If a build job is already building this artifact, IT is the builder
    //    — just tell the runtime to poll. Otherwise (standalone / library / restarted-mid-build
    //    lesson) kick a detached single-module build. Either way return 202 so the iframe POLLS.
    if (!hasActiveBuildForArtifact(artifactId!)) ensureModuleBuild(artifactId!, moduleId);
    res.status(202).json({ moduleId, building: true });
  } catch (err) {
    console.error("[/api/module]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/artifact/:id/full — eagerly build EVERY remaining module, then return the
// complete, offline-self-contained HTML as a download (the runtime queue stays inert).
app.get("/api/artifact/:id/full", async (req, res) => {
  const art = await getArtifact(req.params.id);
  const bp = art?.blueprint;
  if (!art || !bp) {
    res.status(404).send("Not found.");
    return;
  }
  try {
    const isStub = (m: (typeof bp.modules)[number]) => !(m.loadState === "full" && m.blocks.length > 0);
    // If the lesson is STILL BUILDING, do NOT block trying to finish it here — that's the
    // background queue's job, and building a module takes longer than the browser/proxy ~30s
    // timeout, so the download used to hang. Serve the best-available HTML IMMEDIATELY (the
    // unbuilt sections carry their own "building…" note); a re-download once it's done gets the
    // complete file. A completed lesson has no stubs and downloads in full as before.
    if (bp.modules.some(isStub)) {
      const partial = art.html || renderArtifact(bp);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="lesson-${art.id}-partial.html"`);
      res.setHeader("X-Lesson-Building", "1"); // a still-building lesson — re-download when complete
      res.send(partial);
      return;
    }
    const html = renderArtifact(bp);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lesson-${art.id}.html"`);
    res.send(html);
  } catch (err) {
    console.error("[/api/artifact/:id/full]", err);
    // Last resort: serve whatever HTML the artifact already has rather than fail the download.
    if (art.html) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="lesson-${art.id}.html"`);
      res.send(art.html);
    } else {
      res.status(500).send("Could not assemble the full lesson.");
    }
  }
});

// ----------------------------------------------------------------------------
// POST /api/ask — "Ask More": answer a learner question from RAG (short reply in chat).
// ----------------------------------------------------------------------------
app.post("/api/ask", requireAuth, async (req, res) => {
  const { artifactId, question } = (req.body ?? {}) as { artifactId?: string; question?: string };
  if (!question?.trim()) { res.status(400).json({ error: "Missing question." }); return; }
  const art = artifactId ? await getArtifact(artifactId) : undefined;
  const bp = art?.blueprint;
  const topic = bp?.meta.topic ?? "";
  try {
    // FAST PATH — answer from the model's own knowledge, NO RAG retrieval. The KB embed +
    // vector search is the slow part, and this is a quick in-chat follow-up that should feel
    // instant. We ground the reply in the lesson's own structure (already in memory: topic,
    // thesis, module titles) so it stays on-topic with zero retrieval latency. The heavier
    // "add details in lesson" action (/api/ask/expand) is unchanged — it still does full
    // grounding when the learner wants a new module written.
    const ctx = bp
      ? `LESSON: ${bp.meta.title}${bp.meta.thesis ? ` — ${bp.meta.thesis}` : ""}\nMODULES: ${bp.modules.map((m) => m.title).join("; ")}`
      : "";
    const sys = `You answer a learner's follow-up question about "${topic}" CONCISELY (3–5 sentences max, plain language). Answer from your own accurate knowledge and stay consistent with the lesson context below. Be concrete; do not pad.`;
    const llm = makeLLM("sonnet", 0.2, { maxTokens: 500 });
    const out = await llm.invoke([new SystemMessage(sys), new HumanMessage(`${ctx ? ctx + "\n\n" : ""}QUESTION: ${question}`)]);
    const answer = typeof out.content === "string" ? out.content : Array.isArray(out.content) ? out.content.map((c) => ("text" in c ? c.text : "")).join("") : String(out.content);
    res.json({ answer, sources: [] });
  } catch (err) {
    console.error("[/api/ask]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/ask/expand — turn a Q&A into a full new module appended to the lesson.
app.post("/api/ask/expand", requireAuth, async (req, res) => {
  const { artifactId, question } = (req.body ?? {}) as { artifactId?: string; question?: string };
  const art = artifactId ? await getArtifact(artifactId) : undefined;
  const bp = art?.blueprint;
  if (!bp || !question?.trim()) { res.status(404).json({ error: "Unknown lesson or question." }); return; }
  try {
    const id = `q-${bp.modules.length + 1}-${Date.now().toString(36)}`;
    bp.modules.push({
      id, order: bp.modules.length + 1, icon: "❓",
      title: question.slice(0, 70), sub: "Added from your question",
      summary: `A focused answer to: ${question}`,
      objectives: [], termIds: [], loadState: "stub", blocks: [], citations: [],
    });
    const { ok } = await runDeepDive(bp, id, { uploadIds: art!.uploadIds, referOnly: art!.referOnly });
    if (!ok) { res.status(502).json({ error: "Couldn't expand this into the lesson." }); return; }
    await updateArtifact(artifactId!, { blueprint: bp, html: renderArtifact(bp) });
    res.json({ ok: true, moduleId: id });
  } catch (err) {
    console.error("[/api/ask/expand]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/check — grade ONE knowledge-check question. MCQ is verified against the
// stored Blueprint ("by DB"); freeText is graded by the LLM.
// PUBLIC (no requireAuth): the artifact runtime grades knowledge-check answers from inside
// the iframe (no auth token). Same access model as /api/artifact/:id; only reads/grades an
// existing artifact's stored questions.
app.post("/api/check", async (req, res) => {
  const { artifactId, slug, source, blockId, questionId, choiceIndex, text } = (req.body ?? {}) as {
    artifactId?: string; slug?: string; source?: string; blockId?: string; questionId?: string; choiceIndex?: number; text?: string;
  };
  // Resolve the blueprint: live user lessons by artifactId; PUBLIC Library / Community
  // lessons by slug (so their knowledge checks grade for real, not "needs the live app").
  let bp: Blueprint | undefined;
  if (artifactId) {
    bp = (await getArtifact(artifactId))?.blueprint;
  } else if (typeof slug === "string" && slug) {
    const table = source === "community" ? "community_lessons" : "prebuilt_lessons";
    const rows = await query<{ blueprint: unknown }>(`select blueprint from ${table} where slug = $1 limit 1`, [slug]).catch(() => []);
    const raw = rows[0]?.blueprint;
    bp = raw ? ((typeof raw === "string" ? JSON.parse(raw) : raw) as Blueprint) : undefined;
  }
  if (!bp || !blockId || !questionId) { res.status(404).json({ error: "Unknown lesson/question." }); return; }
  // Find the knowledgeCheck block + question.
  let q: Extract<Block, { kind: "knowledgeCheck" }>["questions"][number] | undefined;
  // S5 — the single lesson-level knowledge check lives on bp.finalCheck (stable id "_final_check").
  if (bp.finalCheck && bp.finalCheck.id === blockId) {
    q = bp.finalCheck.questions.find((x) => x.id === questionId);
  }
  // Back-compat: older/prebuilt lessons may still carry per-module knowledgeCheck blocks.
  if (!q) for (const m of bp.modules) {
    const blk = m.blocks.find((b) => b.kind === "knowledgeCheck" && b.id === blockId) as Extract<Block, { kind: "knowledgeCheck" }> | undefined;
    if (blk) { q = blk.questions.find((x) => x.id === questionId); break; }
  }
  if (!q) { res.status(404).json({ error: "Question not found." }); return; }

  if (q.kind === "mcq" && q.options) {
    const correctIndex = q.options.findIndex((o) => o.correct);
    const correct = typeof choiceIndex === "number" && choiceIndex === correctIndex;
    res.json({ correct, correctIndex, explanation: q.explanation });
    return;
  }
  // freeText → LLM grade against the reference answer.
  try {
    const grader = makeLLM("haiku", 0).withStructuredOutput(
      z.object({ correct: z.boolean(), feedback: z.string() }), { name: "grade" }
    );
    const out = await grader.invoke([
      new SystemMessage("You grade a learner's free-text answer. Mark correct=true if it captures the key idea (be encouraging, not pedantic). feedback = ONE short sentence of specific feedback."),
      new HumanMessage(`QUESTION: ${q.prompt}\nREFERENCE ANSWER: ${q.acceptableAnswer ?? q.explanation}\nLEARNER ANSWER: ${text ?? ""}`),
    ]);
    res.json({ correct: out.correct, feedback: out.feedback, explanation: q.explanation });
  } catch (err) {
    console.error("[/api/check]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ----------------------------------------------------------------------------
// POST /api/upload — accept ONE document (base64 in JSON), parse + chunk + embed
// it LOCALLY (no API), keep it in the in-memory upload store, return its id. The
// front-end remembers ids for the session and passes them to /api/learn.
// PUBLIC (no requireAuth): the Configurator is open, so learners attach files BEFORE
// signing in (the auth wall is at Generate). Uploads go to the session-scoped in-memory
// store (random docIds, not user data) and generation stays gated, so the real wall holds.
// ----------------------------------------------------------------------------
app.post("/api/upload", heavyLimiter, async (req, res) => {
  const { filename, dataBase64 } = (req.body ?? {}) as { filename?: string; dataBase64?: string };
  if (!filename || !dataBase64) {
    res.status(400).json({ error: "Expected { filename, dataBase64 }." });
    return;
  }
  // Per-file cap (25MB): base64 is ~1.33× the byte size, so ~35M chars ≈ 25MB.
  if (dataBase64.length > 35_000_000) { res.status(413).json({ error: "That file is too large (max 25MB)." }); return; }
  const ext = extname(filename).toLowerCase();
  const tmp = `${tmpdir()}/als-upload-${randomUUID()}${ext}`;
  try {
    await writeFile(tmp, Buffer.from(dataBase64, "base64"));
    const loaded = await loadSource(tmp, filename);
    if (!loaded) {
      res.status(415).json({ error: `Unsupported file type: ${ext || "(none)"}. Try pdf, docx, md, txt, html, json, js/ts.` });
      return;
    }
    loaded.title = filename; // loadSource titles from the temp path — use the real upload name
    const id = randomUUID();
    const info = await addUpload(id, loaded);
    res.json({ docId: id, title: info.title, chunkCount: info.chunkCount, sourceType: loaded.sourceType });
  } catch (err) {
    console.error("[/api/upload]", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    await unlink(tmp).catch(() => {});
  }
});

// ----------------------------------------------------------------------------
// Pre-built lesson library — PUBLIC (no auth, no generation). Pre-rendered HTML
// served straight from the DB, so any visitor browses instantly with zero credits.
// ----------------------------------------------------------------------------
app.get("/api/library", async (_req, res) => {
  const rows = await query<{ slug: string; title: string; description: string; category: string; level: string; est_minutes: number }>(
    `select slug, title, description, category, level, est_minutes from prebuilt_lessons order by category, est_minutes`
  ).catch(() => []);
  res.json({
    lessons: rows.map((r) => ({ slug: r.slug, title: r.title, description: r.description, category: r.category, level: r.level, estMinutes: r.est_minutes })),
  });
});

// GET /api/lesson/:slug — serve a library lesson (public). RE-RENDERS from the stored
// Blueprint so renderer/overview fixes apply to library lessons without re-generating
// (mirrors /api/artifact/:id); falls back to the stored html on any error.
app.get("/api/lesson/:slug", async (req, res) => {
  const rows = await query<{ html: string; blueprint: Blueprint | null }>(
    `select html, blueprint from prebuilt_lessons where slug = $1`,
    [req.params.slug]
  ).catch(() => []);
  if (!rows.length) { res.status(404).send("<p>Lesson not found.</p>"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  const bp = maybeParseBlueprint(rows[0].blueprint);
  if (bp) {
    try { res.send(renderArtifact(bp)); return; }
    catch (e) { console.warn("[lesson] re-render failed, serving stored html:", (e as Error).message?.slice(0, 100)); }
  }
  res.send(rows[0].html);
});

// ----------------------------------------------------------------------------
// Hands-On notebooks — a SEPARATE, ADDITIVE flow. Generated LAZILY on click and
// cached per (lesson, module). FREE (no credit spend). The SERVER NEVER RUNS the
// generated code — it runs in the user's browser via Pyodide; we only validate +
// cache the structured notebook JSON.
// ----------------------------------------------------------------------------
// POST /api/hands-on/start — resolve the lesson's blueprint, re-check eligibility,
// return a cache hit instantly, else kick a detached generator and return a jobId.
app.post("/api/hands-on/start", heavyLimiter, requireAuth, async (req, res) => {
  const lessonId = typeof req.body?.lessonId === "string" ? req.body.lessonId.trim() : "";
  const moduleId = typeof req.body?.moduleId === "string" && req.body.moduleId.trim() ? req.body.moduleId.trim() : null;
  if (!lessonId) { res.status(400).json({ error: "Missing 'lessonId'." }); return; }
  const bp = await resolveBlueprint(lessonId);
  if (!bp) { res.status(404).json({ error: "Lesson not found." }); return; }
  const module = moduleId ? bp.modules.find((m) => m.id === moduleId) : undefined;
  if (!handsOnEligible(bp, module)) {
    res.status(422).json({ error: "A runnable hands-on notebook isn't available for this lesson." });
    return;
  }
  const hit = await peekCache(lessonId, moduleId);
  if (hit) { res.json({ status: "done", notebook: hit.notebook, source: hit.source }); return; }
  const user = await getUser(req.headers.authorization);
  const job = createHandsOnJob(user?.id ?? "anon");
  void runHandsOnJob(job, lessonId, moduleId, bp);
  res.json({ status: "pending", jobId: job.id });
});

// GET /api/hands-on/job/:id — poll the generator's progress.
app.get("/api/hands-on/job/:id", requireAuth, (req, res) => {
  const job = getHandsOnJob(req.params.id);
  if (!job) { res.status(404).json({ error: "That hands-on job wasn't found (it may have finished or the server restarted)." }); return; }
  res.json({ status: job.status, percent: job.percent, notebook: job.notebook, source: job.source, error: job.error });
});

// ----------------------------------------------------------------------------
// Community Courses — learner-shared lessons. Browsing is PUBLIC (no sign-in, like the
// Library); sharing is gated (you share YOUR lesson). Likes are anonymous (client dedupes).
// ----------------------------------------------------------------------------
app.get("/api/community", async (_req, res) => {
  res.json({ lessons: await listCommunity() });
});

// GET /api/community/lesson/:slug — serve a shared lesson (public; re-renders from blueprint).
app.get("/api/community/lesson/:slug", async (req, res) => {
  const html = await getCommunityHtml(req.params.slug);
  if (!html) { res.status(404).send("<p>Lesson not found.</p>"); return; }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// POST /api/community/like — anonymous +1 (the browser prevents double-likes via localStorage).
app.post("/api/community/like", async (req, res) => {
  const slug = typeof req.body?.slug === "string" ? req.body.slug : "";
  if (!slug) { res.status(400).json({ error: "Missing slug." }); return; }
  const likes = await likeCommunity(slug);
  if (likes == null) { res.status(404).json({ error: "Lesson not found." }); return; }
  res.json({ ok: true, likes });
});

// POST /api/community/report — flag a community lesson. Auto-hides it past a threshold
// (pending manual review). Public + rate-limited by the global /api limiter.
app.post("/api/community/report", async (req, res) => {
  const slug = typeof req.body?.slug === "string" ? req.body.slug : "";
  if (!slug) { res.status(400).json({ error: "Missing slug." }); return; }
  const r = await reportCommunity(slug);
  if (!r.ok) { res.status(404).json({ error: "Lesson not found." }); return; }
  res.json({ ok: true, hidden: r.hidden });
});

// POST /api/community/share — snapshot the learner's lesson public + grant 1 free lesson.
// With { contributor: true } it publishes as a contributor (credited name, no reward).
app.post("/api/community/share", requireAuth, async (req, res) => {
  const { lessonId, displayName, contributor } = (req.body ?? {}) as { lessonId?: string; displayName?: string; contributor?: boolean };
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  if (!lessonId) { res.status(400).json({ error: "Missing lessonId." }); return; }
  const result = await shareLesson(lessonId, { id: user.id, email: user.email ?? "" }, displayName, { contributor: !!contributor });
  if (!result.ok) { res.status(400).json({ error: result.error || "Couldn't share." }); return; }
  res.json({ ok: true, slug: result.slug, rewarded: result.rewarded, already: result.already });
});

// ----------------------------------------------------------------------------
// Contributors — one-time registration to BUILD courses for the Community, plus
// the public "Community Drivers" directory + profile pages.
// ----------------------------------------------------------------------------
app.get("/api/contributor/me", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  res.json({ registered: !!(await getContributor(user.id)) });
});

app.post("/api/contributor/register", requireAuth, async (req, res) => {
  const user = await getUser(req.headers.authorization);
  if (!user) { res.status(401).json({ error: "Please sign in." }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  try {
    const result = await registerContributor(
      { id: user.id, email: user.email ?? "" },
      { fullName: String(b.fullName ?? ""), bio: String(b.bio ?? ""), expertise: String(b.expertise ?? ""),
        motivation: b.motivation ? String(b.motivation) : undefined, motivationOther: String(b.motivationOther ?? ""),
        link: String(b.link ?? ""), agreed: !!b.agreed }
    );
    if (!result.ok) { res.status(400).json({ error: result.error }); return; }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message?.slice(0, 120) || "Registration failed." });
  }
});

// Public directory of contributors + their course counts/likes.
app.get("/api/community/drivers", async (_req, res) => {
  res.json({ drivers: await listDrivers() });
});

// Public profile of one contributor + the courses they've published.
app.get("/api/community/driver/:userId", async (req, res) => {
  const d = await getDriver(req.params.userId);
  if (!d) { res.status(404).json({ error: "Contributor not found." }); return; }
  res.json(d);
});

// ----------------------------------------------------------------------------
// POST /api/upload-repo — clone a PUBLIC git repo, extract its text/code, embed it
// LOCALLY into the session upload store (same grounding path as documents).
// PUBLIC (no requireAuth): same reason as /api/upload — learners attach a repo in the open
// Configurator before signing in; generation stays gated. Abuse bounds below (≤400 files /
// ≤4MB / 90s timeout, public https github/gitlab/bitbucket only) are unchanged.
// ----------------------------------------------------------------------------
const execFileP = promisify(execFile);
const REPO_EXT = new Set([".md", ".mdx", ".txt", ".rst", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".py", ".java", ".go", ".rb", ".rs", ".c", ".cpp", ".h", ".cs", ".php", ".kt", ".swift", ".scala", ".sql", ".sh", ".yaml", ".yml", ".json", ".toml", ".html", ".css", ".scss"]);
const REPO_SKIP_DIRS = new Set([".git", "node_modules", "dist", "build", "vendor", "__pycache__", ".next", "target", "out", ".venv", "venv", "coverage", ".turbo"]);

app.post("/api/upload-repo", heavyLimiter, async (req, res) => {
  const repoUrl = typeof req.body?.repoUrl === "string" ? req.body.repoUrl.trim() : "";
  if (!/^https:\/\/(www\.)?(github|gitlab|bitbucket)\.(com|org)\/[\w.-]+\/[\w.-]+/i.test(repoUrl)) {
    res.status(400).json({ error: "Paste a public https GitHub / GitLab / Bitbucket repo URL." });
    return;
  }
  const clean = repoUrl.replace(/\.git$/i, "").replace(/\/$/, "");
  const dir = `${tmpdir()}/als-repo-${randomUUID()}`;
  try {
    await execFileP("git", ["clone", "--depth", "1", "--single-branch", clean + ".git", dir], { timeout: 90000, maxBuffer: 32 * 1024 * 1024 });
    const files: { path: string; content: string }[] = [];
    let totalBytes = 0;
    async function walk(d: string, rel: string): Promise<void> {
      if (files.length >= 400 || totalBytes > 4 * 1024 * 1024) return;
      const entries = await readdir(d, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (files.length >= 400 || totalBytes > 4 * 1024 * 1024) break;
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) { if (!REPO_SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) await walk(join(d, e.name), r); continue; }
        if (!REPO_EXT.has(extname(e.name).toLowerCase())) continue;
        const st = await stat(join(d, e.name)).catch(() => null);
        if (!st || st.size > 200 * 1024) continue; // skip files > 200KB
        const content = await readFile(join(d, e.name), "utf8").catch(() => null);
        if (!content) continue;
        totalBytes += st.size;
        files.push({ path: r, content });
      }
    }
    await walk(dir, "");
    if (!files.length) { res.status(422).json({ error: "No readable text/code files found in that repo." }); return; }
    const title = clean.split("/").slice(-2).join("/");
    const id = randomUUID();
    const info = await addRepoUpload(id, title, files);
    res.json({ docId: id, title, chunkCount: info.chunkCount, fileCount: files.length });
  } catch (err) {
    console.error("[/api/upload-repo]", err);
    res.status(500).json({ error: "Couldn't clone/read that repo. Make sure it's public. " + (err instanceof Error ? err.message.slice(0, 100) : "") });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

// ----------------------------------------------------------------------------
// Support / complaint / grievance / data-rights intake (the /report-issue form).
// PUBLIC: anyone can file a complaint or data request without an account. The
// request is ALWAYS persisted to support_requests (the durable record — never
// dropped); an operator email is sent best-effort if Resend is configured.
// ----------------------------------------------------------------------------
const SupportSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  name: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(5000),
  relatedRef: z.string().trim().max(500).optional(),
  consent: z.literal(true), // the required "I consent…" checkbox
});
app.post("/api/support/complaint", supportLimiter, async (req, res) => {
  const parsed = SupportSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({ error: first?.path?.[0] === "consent" ? "Please tick the consent box to submit." : `Please check the form — ${first?.message ?? "invalid input"}.` });
    return;
  }
  const b = parsed.data;
  const consentText = "I consent to Wizbit / PrathibhaX processing this information to respond to my request.";
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 400);
  let saved;
  try {
    saved = await saveSupportRequest({
      category: b.category, name: b.name, email: b.email, subject: b.subject, message: b.message,
      relatedRef: b.relatedRef, consentText, consentVersion: CONSENT_VERSION, userAgent, ip: req.ip,
    });
  } catch (e) { console.error("[support] save failed:", (e as Error).message); }
  if (!saved) {
    // We could not record it — do NOT pretend success; point the user at direct email.
    res.status(503).json({ error: "We couldn't record your request right now. Please email anandp.pareek6@gmail.com directly." });
    return;
  }
  const payload = { requestId: saved.id, category: b.category, name: b.name, email: b.email, subject: b.subject,
    message: b.message, relatedRef: b.relatedRef, userAgent, createdAt: saved.createdAt };
  sendSupportEmail(payload).catch(() => {}); // best-effort operator notification
  sendAckEmail(payload).catch(() => {});     // best-effort acknowledgement to the submitter
  res.json({ ok: true, requestId: saved.id });
});

// POST /api/consent — append a consent event (e.g. the signup Terms+Privacy checkbox).
// PUBLIC: consent is logged at signup, possibly before a session exists; user id is
// attached when a bearer token is present.
app.post("/api/consent", async (req, res) => {
  const user = await getUser(req.headers.authorization);
  const ConsentSchema = z.object({
    consentType: z.string().trim().max(60).optional(),
    email: z.string().trim().email().max(254).optional(),
  });
  const parsed = ConsentSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ error: "Invalid consent payload." }); return; }
  await saveConsent({
    userId: user?.id,
    email: parsed.data.email || user?.email,
    consentType: parsed.data.consentType || "signup_terms_privacy",
    consentVersion: CONSENT_VERSION,
    consentText: "I agree to the Terms and acknowledge the Privacy Notice.",
    userAgent: String(req.headers["user-agent"] || "").slice(0, 400),
    ip: req.ip,
  });
  res.json({ ok: true });
});

// Health check — runs a LIVE `select 1` so a bad DATABASE_URL (e.g. an unencoded
// `@` in the password) shows as db:false. A configured-but-unreachable DB is the
// usual cause of "my lessons aren't saved / dashboard is empty after refresh".
app.get("/healthz", async (_req, res) => {
  let db = false;
  let dbError: string | undefined;
  if (dbEnabled()) {
    try { const r = await query<{ ok: number }>("select 1 as ok"); db = r.length > 0; }
    catch (e) { db = false; dbError = e instanceof Error ? e.message.slice(0, 120) : String(e); }
  }
  res.json({ ok: true, db, dbConfigured: dbEnabled(), dbError, rag: db, auth: authEnabled() });
});

// ----------------------------------------------------------------------------
// SPA history fallback (registered LAST). Tabs are in-app state with no per-tab
// route, so a direct-load / refresh / share of /pricing, /library, /community,
// /builder, /llm-skills used to hit Express → "Cannot GET /pricing" (404). Serve
// the app shell for any GET that isn't an /api call and isn't a real asset (a path
// with a "." extension), so those deep-links load the SPA; the client then routes
// to the matching tab. Static assets (served above) and /api/* still win / 404 as
// JSON. POST/etc. fall through to Express's default 404.
// ----------------------------------------------------------------------------
app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/") || req.path.includes(".")) return next();
  res.sendFile(join(PUBLIC_DIR, "index.html"));
});

// ----------------------------------------------------------------------------
// Boot.
// ----------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 5070;
const server = app.listen(PORT, () => {
  console.log(`\n  Agentic Learning Studio → http://localhost:${PORT}\n`);
  console.log(`  ANTHROPIC_API_KEY : ${process.env.ANTHROPIC_API_KEY ? "set" : "MISSING (required for real generation)"}`);
  console.log(`  Database (RAG)    : ${dbEnabled() ? "on" : "off (graceful — runs without retrieval)"}`);
  console.log(`  ragEnabled()      : ${ragEnabled()}`);
  console.log(`  Langfuse tracing  : ${process.env.LANGFUSE_PUBLIC_KEY ? "on" : "off"}`);
  console.log(`  Sign-in (Supabase): ${authEnabled() ? "REQUIRED (auth on)" : "off (open — set SUPABASE_URL+SUPABASE_ANON_KEY to require sign-in)"}\n`);
});

// ----------------------------------------------------------------------------
// Graceful shutdown — so `tsx watch` restarts and Ctrl+C exit cleanly and FAST.
//
// Without this the process holds open handles (the HTTP listener, the Postgres
// pool, and — the stubborn one — the local embedding model's onnxruntime-node
// native threads), so the runner times out and force-kills it ("Process hasn't
// exited. Killing process..."). We close what we can, then force-exit shortly
// after since the native threads may never release on their own.
// SIGUSR2 is the signal tsx/nodemon send to trigger a restart.
// ----------------------------------------------------------------------------
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[server] ${signal} — shutting down…`);
  server.close(); // stop accepting new connections + free the port
  rawPool()?.end().catch(() => {}); // close the Postgres pool
  // Force a clean, fast exit (onnxruntime threads can keep the loop alive otherwise).
  setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGUSR2", () => shutdown("SIGUSR2"));
