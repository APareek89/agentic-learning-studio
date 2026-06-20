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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { getArtifact, updateArtifact } from "./lib/artifacts";
import { loadSource } from "./rag/loaders";
import { addUpload } from "./lib/uploads";
import { authEnabled, verifyToken, bearerFrom, getUser } from "./lib/auth";
import { listLessons, rateLesson, getPreferences, savePreferences } from "./lib/lessons";
import { dbEnabled, ragEnabled, rawPool, query } from "./lib/db";
import { makeLangfuseHandler } from "./lib/langfuse";
import { compiledGraph } from "./agent/graph";
import { runDeepDive } from "./agent/nodes";
import { renderArtifact } from "./render/index";
import { renderModuleFragment } from "./render/components";
import { moduleCacheKey } from "./lib/hash";
import type { ChatMessage, ArtifactRef } from "./agent/state";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "..", "public");

const app = express();
app.use(express.json({ limit: "30mb" })); // base64-encoded uploads ride in the JSON body
app.use(express.static(PUBLIC_DIR)); // serves the front-end (index.html, app.js, styles.css)

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
  });
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
  res.json({ lessons: await listLessons(user.id) });
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
  const ok = await rateLesson(user.id, artifactId, rating, comment);
  res.json({ ok });
});

// ----------------------------------------------------------------------------
// POST /api/learn — run the real generation graph and stream it over SSE.
// ----------------------------------------------------------------------------
app.post("/api/learn", requireAuth, async (req, res) => {
  const { prompt, cards, threadId, uploadIds, referOnly, industry, buildGoal, levels, lessonTypes } = (req.body ?? {}) as {
    prompt?: string;
    cards?: Record<string, string>;
    threadId?: string;
    uploadIds?: string[];
    referOnly?: boolean;
    industry?: string;
    buildGoal?: string;
    levels?: string[];
    lessonTypes?: string[];
  };

  if (!prompt || !prompt.trim()) {
    res.status(400).json({ error: "Missing 'prompt'." });
    return;
  }

  // Resolve the owner (real user when auth is on; a stable local id otherwise) so
  // the generated lesson lands in their dashboard, and remember their selections.
  const user = await getUser(req.headers.authorization);
  if (user) {
    savePreferences(user.id, user.email, {
      levels: levels ?? [], depth: cards?.depth, examples: cards?.examples,
      density: cards?.density, visuals: cards?.visuals === "on", syntax: cards?.syntax === "on",
      lessonTypes: lessonTypes ?? [], industry: industry ?? "", buildGoal: buildGoal ?? "",
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
        levels: levels ?? [],
        lessonTypes: lessonTypes ?? [],
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
// POST /api/module — build (or serve from cache) ONE module's body on demand.
// The artifact's own runtime calls this for each still-stub module (background
// queue + click-to-prioritize). Returns the rendered fragment to inject.
// ----------------------------------------------------------------------------
app.post("/api/module", requireAuth, async (req, res) => {
  const { artifactId, moduleId } = (req.body ?? {}) as { artifactId?: string; moduleId?: string };
  const art = artifactId ? await getArtifact(artifactId) : undefined;
  const bp = art?.blueprint;
  if (!bp || !moduleId) {
    res.status(404).json({ error: "Unknown artifact or module." });
    return;
  }
  const module = bp.modules.find((m) => m.id === moduleId);
  if (!module) {
    res.status(404).json({ error: "No such module." });
    return;
  }

  const p = bp.learnerProfile;
  const cacheKey = moduleCacheKey({
    topic: bp.meta.topic, moduleId, level: p.level, depth: p.depth, examples: p.examples,
    industry: p.industry, density: p.density, visuals: p.visualsRequested, syntax: p.explainSyntax,
  });

  try {
    // Cache hit → instant, no Claude call.
    const cached = await query<{ fragment_html: string }>(`select fragment_html from module_cache where cache_key = $1`, [cacheKey]);
    if (cached.length) {
      res.json({ moduleId, fragmentHtml: cached[0].fragment_html, cached: true });
      return;
    }

    // Miss → generate this module's blocks (same upload grounding as the initial run),
    // render the fragment, cache it.
    const { ok } = await runDeepDive(bp, moduleId, { uploadIds: art.uploadIds, referOnly: art.referOnly });
    if (!ok) {
      res.status(502).json({ error: "Module generation failed." });
      return;
    }
    const fragmentHtml = renderModuleFragment(module, bp);
    await query(
      `insert into module_cache (cache_key, fragment_html) values ($1, $2)
       on conflict (cache_key) do update set fragment_html = excluded.fragment_html`,
      [cacheKey, fragmentHtml]
    ).catch(() => {});
    // Refresh the stored artifact HTML so reloads / the /full download reflect built modules.
    await updateArtifact(artifactId!, { blueprint: bp, html: renderArtifact(bp) });
    res.json({ moduleId, fragmentHtml, cached: false });
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
    // Build every stub. Re-check between passes so a build running concurrently in the
    // open lesson's background queue (both mutate the same stored Blueprint) can't leave
    // a straggler stub in the rendered snapshot. Bounded so a genuinely-failing module
    // (runDeepDive ok:false) can't loop forever.
    const isStub = (m: (typeof bp.modules)[number]) => !(m.loadState === "full" && m.blocks.length > 0);
    for (let pass = 0; pass < 4; pass++) {
      const stubs = bp.modules.filter(isStub);
      if (!stubs.length) break;
      for (const m of stubs) await runDeepDive(bp, m.id, { uploadIds: art.uploadIds, referOnly: art.referOnly });
    }
    const html = renderArtifact(bp);
    await updateArtifact(req.params.id, { blueprint: bp, html });
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="lesson-${art.id}.html"`);
    res.send(html);
  } catch (err) {
    console.error("[/api/artifact/:id/full]", err);
    res.status(500).send("Could not assemble the full lesson.");
  }
});

// ----------------------------------------------------------------------------
// POST /api/upload — accept ONE document (base64 in JSON), parse + chunk + embed
// it LOCALLY (no API), keep it in the in-memory upload store, return its id. The
// front-end remembers ids for the session and passes them to /api/learn.
// ----------------------------------------------------------------------------
app.post("/api/upload", requireAuth, async (req, res) => {
  const { filename, dataBase64 } = (req.body ?? {}) as { filename?: string; dataBase64?: string };
  if (!filename || !dataBase64) {
    res.status(400).json({ error: "Expected { filename, dataBase64 }." });
    return;
  }
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

// Health check.
app.get("/healthz", (_req, res) => res.json({ ok: true }));

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
