/**
 * # Hands-On notebooks — lazy, cached, browser-runnable Python practice
 *
 * A SEPARATE, ADDITIVE subsystem. It does NOT touch the lesson-generation pipeline,
 * the Blueprint schema, the validation gates, or the credit flow. Notebooks are
 * generated LAZILY on click (never during a lesson build, never per-user) and
 * CACHED per (lesson, module).
 *
 * Phase 1 = live Haiku generation + cache. The model emits STRUCTURED JSON only
 * (NotebookSchema); the page renders cells deterministically. Generated code runs
 * ENTIRELY in the user's browser via Pyodide — the server never executes it — so we
 * still validate every code cell server-side (defence in depth) before caching.
 *
 * Graceful-optional: if the `hands_on_notebooks` table doesn't exist yet (migration
 * not applied), the DB cache is skipped and an in-process memory cache serves repeats.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { makeLLM } from "../agent/llm";
import { dbEnabled, query } from "./db";
import { getArtifact } from "./artifacts";
import { sha256 } from "./hash";
import { handsOnEligible } from "../render/eligibility";
import type { Blueprint, Module } from "../render/schema";

// Bumping this invalidates every cached notebook (cache_key includes it).
// v2: code cells carry heading/explain + every cell must print illustrative output + a verify pass.
export const SCHEMA_VERSION = "v2";

// ---- Notebook shape (shared by live gen + Phase-2 templates) ----
export const NotebookSchema = z.object({
  title: z.string(),
  kernelNote: z.string().optional(),
  cells: z
    .array(
      z.object({
        type: z.enum(["markdown", "code"]),
        source: z.string(),
        // For CODE cells: a short heading + a 1–2 line "what this does + what output to expect"
        // note, rendered ABOVE the editor so every code block is explained.
        heading: z.string().optional(),
        explain: z.string().optional(),
      })
    )
    .min(2)
    .max(6),
});
export type Notebook = z.infer<typeof NotebookSchema>;

export type NotebookSource = "live" | "template" | "fallback";
export interface NotebookResult {
  notebook: Notebook;
  source: NotebookSource;
}

// ---- cache key ----
export function cacheKey(lessonId: string, moduleId: string | null): string {
  return sha256(`${lessonId}|${moduleId ?? ""}|${SCHEMA_VERSION}`);
}

// ============================================================================
// VALIDATION — code runs in the user's browser, so reject anything network/FS/
// shell/paid-SDK before we store or render it. (Defence in depth; Pyodide is also
// sandboxed.) On a fail we regenerate once stricter, then fall back to a safe demo.
// ============================================================================
const FORBIDDEN: RegExp[] = [
  /\bimport\s+(?:os|subprocess|socket|requests|urllib|http|shutil)\b/i,
  /\bfrom\s+(?:os|subprocess|socket|requests|urllib|http|shutil|sys)\s+import\b/i,
  /\bsys\.exit\b/i,
  /\bopen\s*\([^)]*,\s*['"][wax]\+?['"]/i, // open(..., 'w'|'a'|'x')
  /\beval\s*\(|\bexec\s*\(|\bcompile\s*\(|__import__/i,
  /\bsubprocess\b|\bpopen\b|\bsystem\s*\(/i,
  /\bopenai\b|\banthropic\b|google\.genai|vertexai|\bboto3\b|\bcohere\b|transformers\.Trainer/i,
  /\bpip\s+install\b|\bmicropip\b/i,
  /\bsocket\.|\.connect\s*\(|requests\.(?:get|post)\b/i,
];
const ALLOWED_IMPORTS = new Set([
  "math", "random", "json", "statistics", "collections", "itertools",
  "functools", "datetime", "re", "dataclasses", "typing", "numpy", "pandas",
]);

function importRoots(src: string): string[] {
  const roots: string[] = [];
  for (const raw of src.split("\n")) {
    const line = raw.trim();
    let m: RegExpExecArray | null;
    if ((m = /^import\s+(.+)$/.exec(line))) {
      for (const part of m[1].split(",")) {
        const root = part.trim().split(/\s+as\s+/)[0].split(".")[0].trim();
        if (root) roots.push(root);
      }
    } else if ((m = /^from\s+([\w.]+)\s+import\b/.exec(line))) {
      roots.push(m[1].split(".")[0].trim());
    }
  }
  return roots;
}

export function validateNotebook(nb: Notebook): { ok: boolean; reason?: string } {
  for (const cell of nb.cells) {
    if (cell.type !== "code") continue;
    const src = cell.source ?? "";
    for (const re of FORBIDDEN) if (re.test(src)) return { ok: false, reason: `forbidden pattern ${re}` };
    for (const root of importRoots(src)) if (!ALLOWED_IMPORTS.has(root)) return { ok: false, reason: `import not allowed: ${root}` };
  }
  return { ok: true };
}

// ============================================================================
// GENERATION (Phase 1 — live Haiku)
// ============================================================================
const HANDSON_SYSTEM = `Generate a TINY runnable Python notebook (2–4 code cells) so a learner can practice ONE idea from their lesson AND SEE IT WORK.
HARD RULES:
- Pure standard-library Python (numpy/pandas ONLY if essential). TINY HARDCODED data inline — no datasets, no downloads.
- NO network, NO API keys, NO paid-model SDKs (openai/anthropic/etc), NO training, NO GPU, NO file writes, NO shell/subprocess.
- The code MUST run top-to-bottom with NO errors and NO edits. Define every name before use; keep variables/state consistent across cells.
- EVERY code cell MUST PRINT a clear, illustrative output that DEMONSTRATES the concept so the learner SEES it happen — e.g. an
  agent loop printing each step's decision/action/observation, a retriever printing the top matches with scores, a tokenizer
  printing the tokens, an evaluation printing the metric. Never leave a cell with no visible output.
FOR EACH CODE CELL also fill:
- heading: a short title (≤6 words).
- explain: 1–2 plain sentences = what this code does + what output to expect.
STRUCTURE: an optional 1-cell markdown intro, then 2–4 code cells that build on each other (setup → demonstrate → vary).
Output ONLY the structured notebook.`;
const STRICT_SUFFIX = `STRICTER PASS: your previous attempt used a forbidden construct. Use ONLY: math, random, json, statistics, collections, itertools, functools, datetime, re, dataclasses, typing (and numpy/pandas only if essential). No file/network/shell/eval/exec/imports outside that list.`;

// A SECOND Haiku agent reviews the generated notebook and returns a corrected version that is
// guaranteed (to its best reasoning) to run top-to-bottom with no error and print output — the
// "feedback loop" gate. (The server never RUNS the code; Pyodide does, client-side.)
const VERIFY_SYSTEM = `You are a meticulous Python reviewer. You are given a tiny notebook (markdown + code cells) that will run TOP-TO-BOTTOM in a restricted Pyodide kernel. Only these imports are allowed: math, random, json, statistics, collections, itertools, functools, datetime, re, dataclasses, typing, numpy, pandas. No network, files, shell, eval/exec, or paid-model SDKs.
Carefully trace execution and FIX any problem so it runs CLEANLY:
- syntax errors, NameError (use-before-define across cells), TypeError, IndexError/KeyError, infinite loops, wrong indentation.
- a code cell that produces NO visible output → add a print(...) that demonstrates the result.
- a disallowed import or unsafe call → rewrite with allowed tools only.
Keep it TINY, keep the same title/structure, and keep each code cell's heading + explain accurate to the (possibly fixed) code.
Return the corrected notebook and set ok=true ONLY if the original already ran cleanly and printed output for every code cell (no fix needed).`;
const VerifySchema = z.object({ ok: z.boolean(), notebook: NotebookSchema });

async function verifyNotebook(nb: Notebook): Promise<{ ok: boolean; notebook: Notebook }> {
  try {
    const llm = makeLLM("haiku", 0).withStructuredOutput(VerifySchema, { name: "verify_notebook" });
    const out = await llm.invoke([
      new SystemMessage(VERIFY_SYSTEM),
      new HumanMessage("Review and fix this notebook so EVERY code cell runs with no error and prints clear output:\n\n" + JSON.stringify(nb).slice(0, 7000)),
    ]);
    const fixed = NotebookSchema.parse(out.notebook);
    const v = validateNotebook(fixed); // never accept a "fix" that breaks the safety rules
    if (!v.ok) return { ok: true, notebook: nb };
    return { ok: !!out.ok, notebook: fixed };
  } catch (e) {
    console.warn(`[handson] verify pass unavailable for "${nb.title}":`, (e as Error).message?.slice(0, 100));
    return { ok: true, notebook: nb }; // verifier down → proceed with the validated notebook
  }
}

export interface NotebookContext {
  topic: string;
  moduleTitle?: string;
  moduleSummary?: string;
  codeSamples: string[];
  level: string;
}

function buildContext(bp: Blueprint, module?: Module): NotebookContext {
  const codeSamples: string[] = [];
  const mods = module ? [module] : bp.modules.slice(0, 1);
  for (const m of mods) {
    for (const b of m.blocks) {
      if (b.kind === "codeExample") codeSamples.push((b as { code?: string }).code ?? "");
    }
  }
  return {
    topic: bp.meta.title || bp.meta.topic,
    moduleTitle: module?.title,
    moduleSummary: module?.summary,
    codeSamples: codeSamples.filter(Boolean).slice(0, 2),
    level: bp.learnerProfile.level,
  };
}

export async function generateNotebook(ctx: NotebookContext, strict = false): Promise<Notebook> {
  const llm = makeLLM("haiku", 0).withStructuredOutput(NotebookSchema, { name: "hands_on_notebook" });
  const sys = strict ? `${HANDSON_SYSTEM}\n\n${STRICT_SUFFIX}` : HANDSON_SYSTEM;
  const human =
    `Lesson topic: ${ctx.topic}\n` +
    (ctx.moduleTitle ? `Module: ${ctx.moduleTitle}\n` : "") +
    (ctx.moduleSummary ? `What it covers: ${ctx.moduleSummary}\n` : "") +
    `Learner level: ${ctx.level}\n` +
    (ctx.codeSamples.length
      ? `The lesson's own code (for flavour only — write FRESH tiny code, don't copy):\n${ctx.codeSamples.join("\n---\n").slice(0, 1500)}\n`
      : "") +
    `\nWrite the notebook now.`;
  const out = await llm.invoke([new SystemMessage(sys), new HumanMessage(human.slice(0, 4000))]);
  return NotebookSchema.parse(out);
}

// A generic, always-valid, always-runnable demo (last-resort fallback).
function safeFallbackNotebook(topic: string): Notebook {
  return {
    title: `Hands-on: ${topic}`.slice(0, 80),
    kernelNote: "A tiny runnable warm-up you can edit and re-run.",
    cells: [
      { type: "markdown", source: "# Hands-on warm-up\nA tiny Python demo that runs in your browser. Click a code cell and press **Shift+Enter** (or **▶ Run**)." },
      { type: "code", heading: "Set up", explain: "Imports the standard library and seeds randomness so results are repeatable. Output: prints \"ready\".", source: "import math, random\nrandom.seed(0)\nprint(\"ready\")" },
      { type: "code", heading: "Generate and summarise data", explain: "Builds a tiny list of numbers and prints them with their mean. Output: the list, then its average.", source: "nums = [random.randint(1, 100) for _ in range(8)]\nprint(\"numbers:\", nums)\nprint(\"mean:\", round(sum(nums) / len(nums), 2))" },
      { type: "code", heading: "A small computation", explain: "Prints the cosine of a few angles. Output: each angle mapped to its cosine value.", source: "for deg in [0, 30, 45, 60, 90]:\n    print(deg, \"->\", round(math.cos(math.radians(deg)), 3))" },
    ],
  };
}

// ============================================================================
// CACHE (DB durable + in-memory fallback) + getOrCreate
// ============================================================================
const memCache = new Map<string, NotebookResult>();

async function readCache(key: string): Promise<NotebookResult | null> {
  const mem = memCache.get(key);
  if (mem) return mem;
  if (!dbEnabled()) return null;
  try {
    const rows = await query<{ notebook: Notebook | string; source: string }>(
      `select notebook, source from hands_on_notebooks where cache_key = $1`,
      [key]
    );
    if (rows.length) {
      const nb = typeof rows[0].notebook === "string" ? (JSON.parse(rows[0].notebook) as Notebook) : rows[0].notebook;
      const result: NotebookResult = { notebook: nb, source: (rows[0].source as NotebookSource) || "live" };
      memCache.set(key, result);
      return result;
    }
  } catch {
    /* table may not exist yet (migration not applied) → skip DB cache */
  }
  return null;
}

async function writeCache(key: string, lessonId: string, moduleId: string | null, result: NotebookResult, model: string): Promise<void> {
  memCache.set(key, result);
  if (!dbEnabled()) return;
  try {
    await query(
      `insert into hands_on_notebooks (lesson_id, module_id, cache_key, notebook, source, model)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (cache_key) do nothing`,
      [lessonId, moduleId, key, JSON.stringify(result.notebook), result.source, model]
    );
  } catch {
    /* table may not exist yet → the memory cache still serves this session */
  }
}

/** Non-generating cache peek (memory → DB). Lets /start return instantly on a hit. */
export async function peekCache(lessonId: string, moduleId: string | null): Promise<NotebookResult | null> {
  return readCache(cacheKey(lessonId, moduleId));
}

/** Cache → live-gen → validate (one stricter retry) → safe fallback → store. */
export async function getOrCreate(lessonId: string, moduleId: string | null, bp: Blueprint): Promise<NotebookResult> {
  const key = cacheKey(lessonId, moduleId);
  const hit = await readCache(key);
  if (hit) return hit;

  const module = moduleId ? bp.modules.find((m) => m.id === moduleId) : undefined;
  const ctx = buildContext(bp, module);

  let result: NotebookResult;
  let model = "claude-haiku";
  // One attempt + one stricter retry. The retry covers BOTH a validation failure AND a
  // structured-output parse throw (Haiku occasionally returns unparseable JSON), so a single
  // flaky response doesn't drop us straight to the fallback.
  const tryGen = async (strict: boolean): Promise<Notebook | null> => {
    try {
      const nb = await generateNotebook(ctx, strict);
      const v = validateNotebook(nb);
      if (v.ok) return nb;
      console.warn(`[handson] gen failed validation (${v.reason}) for "${ctx.topic}"${strict ? " [strict]" : ""}`);
      return null;
    } catch (e) {
      console.warn(`[handson] gen threw for "${ctx.topic}"${strict ? " [strict]" : ""}:`, (e as Error).message?.slice(0, 120));
      return null;
    }
  };
  let nb = await tryGen(false);
  if (!nb) nb = await tryGen(true);
  if (nb) {
    // Feedback loop: a second Haiku agent traces + fixes the code so it runs error-free and
    // prints output. Up to 2 passes; stop as soon as it certifies the notebook is clean.
    for (let i = 0; i < 2; i++) {
      const vr = await verifyNotebook(nb);
      nb = vr.notebook;
      if (vr.ok) break;
    }
    result = { notebook: nb, source: "live" };
  } else {
    result = { notebook: safeFallbackNotebook(ctx.topic), source: "fallback" };
    model = "fallback";
  }

  await writeCache(key, lessonId, moduleId, result, model);
  return result;
}

// ============================================================================
// Blueprint resolver — a lessonId can be a user-lesson artifact id (lessons table),
// a Library slug (prebuilt_lessons), or a Community slug (community_lessons).
// ============================================================================
export async function resolveBlueprint(lessonId: string): Promise<Blueprint | null> {
  const art = await getArtifact(lessonId);
  if (art?.blueprint) return art.blueprint;
  if (dbEnabled()) {
    try {
      const rows = await query<{ blueprint: Blueprint | string | null }>(
        `select blueprint from prebuilt_lessons where slug = $1
         union all
         select blueprint from community_lessons where slug = $1
         limit 1`,
        [lessonId]
      );
      const bp = rows[0]?.blueprint;
      if (bp) return typeof bp === "string" ? (JSON.parse(bp) as Blueprint) : bp;
    } catch {
      /* ignore — not found */
    }
  }
  return null;
}

// Re-export the eligibility check so the server imports everything Hands-On from one lib.
export { handsOnEligible };

// ============================================================================
// In-memory job registry (detached generator + progress), mirrors lib/jobs.ts.
// Hands-On jobs are tiny and notebook-shaped, so they get their own registry
// rather than overloading the lesson-build Job type.
// ============================================================================
export type HandsOnStatus = "running" | "done" | "error";
export interface HandsOnJob {
  id: string;
  userId: string;
  status: HandsOnStatus;
  percent: number;
  notebook?: Notebook;
  source?: NotebookSource;
  error?: string;
  createdAt: number;
}
const hoJobs = new Map<string, HandsOnJob>();

export function createHandsOnJob(userId: string): HandsOnJob {
  const job: HandsOnJob = { id: randomUUID(), userId, status: "running", percent: 10, createdAt: Date.now() };
  hoJobs.set(job.id, job);
  // light GC: drop jobs older than 30 min so the map can't grow unbounded
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of hoJobs) if (j.createdAt < cutoff) hoJobs.delete(id);
  return job;
}

export function getHandsOnJob(id: string): HandsOnJob | undefined {
  return hoJobs.get(id);
}

/** Detached generator: moves percent 10 → 40 → 70 → 100 across the steps. */
export async function runHandsOnJob(job: HandsOnJob, lessonId: string, moduleId: string | null, bp: Blueprint): Promise<void> {
  try {
    job.percent = 40;
    const result = await getOrCreate(lessonId, moduleId, bp);
    job.percent = 70;
    job.notebook = result.notebook;
    job.source = result.source;
    job.status = "done";
    job.percent = 100;
  } catch (e) {
    job.status = "error";
    job.error = (e as Error).message;
  }
}
