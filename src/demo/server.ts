/** Local-only, $0 fixture mode. Reuses the real UI and deterministic lesson renderer.
 * No production server, graph, provider, auth, storage or database module is imported.
 * Demo state is ephemeral and the listener is loopback-only. Never deploy this entry.
 */
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { renderArtifact } from "../render/index";
import type { Blueprint, Block } from "../render/schema";

interface Entry { slug: string; title: string; description: string; category: string; level: string; estMinutes: number }
interface DemoArtifact { id: string; entry: Entry; blueprint: Blueprint; preview: boolean; percent: number; createdAt: string }
const root = fileURLToPath(new URL("../../", import.meta.url));
const entries: Entry[] = JSON.parse(readFileSync(`${root}prebuilt/index.json`, "utf8"));
const blueprints = new Map<string, Blueprint>();
const artifacts = new Map<string, DemoArtifact>();
const jobs = new Map<string, object>();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

function blueprint(slug: string): Blueprint | undefined {
  if (!entries.some((entry) => entry.slug === slug)) return undefined;
  if (!blueprints.has(slug)) blueprints.set(slug, JSON.parse(readFileSync(`${root}prebuilt/lessons/${slug}.json`, "utf8")));
  return structuredClone(blueprints.get(slug)!);
}
function lessonHtml(bp: Blueprint, preview = false, slug?: string): string {
  return renderArtifact(bp, { previewOnly: preview, seo: slug ? { slug, source: "library" } : undefined });
}
function recordJob(art: DemoArtifact, stage: "overview" | "build"): string {
  const id = randomUUID();
  jobs.set(id, { id, status: "done", stage, isCourse: false, demo: true,
    lessons: [{ index: 0, title: art.entry.title, artifactId: art.id, status: "done", percent: 100,
      builtModules: stage === "build" ? art.blueprint.modules.length : 0, totalModules: art.blueprint.modules.length }] });
  return id;
}

app.get("/healthz", (_req, res) => res.json({ ok: true, mode: "demo", providerCalls: 0, db: false, auth: false, fixtures: entries.length }));
app.get("/api/config", (_req, res) => res.json({ demoMode: true, authEnabled: false, billingEnabled: false }));
app.get("/api/library", (_req, res) => res.json({ lessons: entries, demo: true }));
app.get("/api/lesson/:slug", (req, res) => {
  const bp = blueprint(req.params.slug);
  if (!bp) { res.status(404).json({ error: "Sample lesson not found." }); return; }
  res.type("html").send(lessonHtml(bp, false, req.params.slug));
});
app.get("/api/preferences", (_req, res) => res.json({ prefs: { profile: { role: "Demo learner" } } }));
app.get("/api/credits", (_req, res) => res.json({ balance: 100, signedIn: false, demo: true }));
app.get("/api/suggest", (_req, res) => res.json({ topics: ["Agent Memory", "Hybrid Retrieval RRF", "AI vs ML vs Deep Learning"] }));
app.get("/api/jobs/active", (_req, res) => res.json({ jobs: [] }));
app.get("/api/skills", (_req, res) => res.json({ skills: [] }));
app.get("/api/community", (_req, res) => res.json({ lessons: [] }));
app.get("/api/community/drivers", (_req, res) => res.json({ drivers: [] }));
app.get("/api/contributor/me", (_req, res) => res.json({ contributor: null }));
app.get("/api/pricing", (_req, res) => res.json({ plans: [], enabled: false, demo: true }));
app.get("/api/account", (_req, res) => res.json({ userId: "local-demo", email: "demo@example.test", plan: "Offline demo", balance: 100,
  lessonsGenerated: [...artifacts.values()].filter((a) => !a.preview).length, creditsSpent: 0, creditsPurchased: 0, isAdmin: false }));
app.get("/api/lessons", (_req, res) => res.json({ lessons: [...artifacts.values()].filter((a) => !a.preview).map((a) => ({
  id: a.id, title: a.entry.title, prompt: a.entry.title, createdAt: a.createdAt, daysRemaining: 999,
  percent: a.percent, buildPct: 100, modules: a.blueprint.modules.length, demo: true,
})) }));
app.post("/api/overview", (req, res) => {
  if (typeof req.body?.prompt !== "string" || !req.body.prompt.trim()) { res.status(400).json({ error: "Enter a topic or try Agent Memory." }); return; }
  const words = req.body.prompt.toLowerCase().split(/[^a-z0-9]+/).filter((w: string) => w.length > 3);
  const ranked = entries.map((entry) => ({ entry, score: words.filter((w: string) => entry.title.toLowerCase().includes(w)).length })).sort((a, b) => b.score - a.score);
  const entry = ranked[0].score > 0 ? ranked[0].entry : entries.find((e) => e.slug === "agent-memory")!;
  const bp = blueprint(entry.slug)!;
  bp.learnerProfile.readingMode = "world";
  const art: DemoArtifact = { id: randomUUID(), entry, blueprint: bp, preview: true, percent: 0, createdAt: new Date().toISOString() };
  artifacts.set(art.id, art);
  res.json({ jobId: recordJob(art, "overview"), demo: true, sampleTitle: entry.title });
});
app.post("/api/build", (req, res) => {
  const art = artifacts.get(req.body?.artifactId);
  if (!art) { res.status(404).json({ error: "Load an example overview first." }); return; }
  art.preview = false;
  res.json({ jobId: recordJob(art, "build"), demo: true });
});
app.get("/api/job/:id", (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) { res.status(404).json({ error: "Demo job expired when the server restarted." }); return; }
  res.json(job);
});
app.get(["/api/artifact/:id", "/api/artifact/:id/download", "/api/artifact/:id/full"], (req, res) => {
  const art = artifacts.get(req.params.id);
  if (!art) { res.status(404).json({ error: "Demo lesson expired when the server restarted." }); return; }
  if (req.path.endsWith("/download") || req.path.endsWith("/full")) res.attachment(`${art.entry.slug}.html`);
  res.type("html").send(lessonHtml(art.blueprint, art.preview));
});
app.post("/api/progress", (req, res) => {
  const art = artifacts.get(req.body?.lessonId);
  if (art) art.percent = Math.max(0, Math.min(100, Number(req.body.percent) || 0));
  res.json({ ok: true, demo: true });
});
app.post(["/api/profile", "/api/event", "/api/consent", "/api/rate"], (_req, res) => res.json({ ok: true, persisted: false, demo: true }));
app.post("/api/check", (req, res) => {
  const { artifactId, slug, blockId, questionId, choiceIndex } = req.body ?? {};
  const bp = artifactId ? artifacts.get(artifactId)?.blueprint : blueprint(String(slug || ""));
  const checks = bp?.modules.flatMap((m) => m.blocks).filter((b): b is Extract<Block, { kind: "knowledgeCheck" }> => b.kind === "knowledgeCheck") ?? [];
  const finalCheck = bp?.finalCheck;
  const q = (finalCheck && finalCheck.id === blockId ? finalCheck : checks.find((b) => b.id === blockId))?.questions.find((q) => q.id === questionId);
  if (!q) { res.status(404).json({ error: "Sample question not found." }); return; }
  if (q.kind !== "mcq" || !q.options) { res.status(409).json({ error: "Free-text grading requires a model and is disabled in this $0 demo." }); return; }
  const correctIndex = q.options.findIndex((o) => o.correct);
  res.json({ correct: choiceIndex === correctIndex, correctIndex, explanation: q.explanation, demo: true });
});
// Fail closed: unsupported provider, upload, payment, auth and mutation endpoints never
// fall through to production handlers or return a fake successful operation.
app.use("/api", (_req, res) => res.status(409).json({ error: "This action is disabled in the local $0 demo. Browse Library or load an example overview.", demo: true }));

const demoUi = `document.addEventListener('DOMContentLoaded',()=>{
  const note=document.createElement('aside');note.id='demo-notice';note.setAttribute('role','status');
  note.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#16233b;color:white;padding:10px 16px;font:14px system-ui;text-align:center';
  note.textContent='LOCAL DEMO · Cached lessons only · No AI calls or database · Progress resets on restart. ';document.body.append(note);document.body.style.paddingBottom='52px';
  const a=document.createElement('a');a.href='/builder';a.textContent='Try Agent Memory';a.style.color='white';a.style.textDecoration='underline';note.append(a);
  const input=document.querySelector('#prompt');if(input&&!input.value)input.value='Agent Memory';
});`;
app.get("/demo-ui.js", (_req, res) => res.type("js").send(demoUi));
function shell(): string {
  return readFileSync(`${root}public/index.html`, "utf8")
    .replace(/<script\s+src="https:\/\/app\.lemonsqueezy\.com\/js\/lemon\.js"[^>]*><\/script>/g, "")
    .replace("</head>", '<script src="/demo-ui.js"></script></head>');
}
app.get(["/", "/index.html"], (_req, res) => res.type("html").send(shell()));
app.use(express.static(`${root}public`, { index: false }));
app.get(/.*/, (_req, res) => res.type("html").send(shell()));
app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[demo]", error.name);
  res.status(500).json({ error: "The bundled example could not be rendered.", demo: true });
});
const port = Number(process.env.PORT) || 5070;
const server = app.listen(port, "127.0.0.1", () => console.log(`Local $0 demo: http://127.0.0.1:${port} · ${entries.length} bundled lessons · no provider/database imports`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit(0)));
