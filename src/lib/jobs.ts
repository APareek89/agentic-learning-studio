/**
 * # Generation jobs — in-memory progress tracking for background lesson builds
 *
 * A generation runs detached from the HTTP request (so the learner can leave the
 * tab / watch the dashboard). This registry holds live progress; the dashboard
 * polls GET /api/job/:id. The ARTIFACTS themselves are persisted to Postgres, so
 * if the process restarts mid-build the overview + already-built modules survive —
 * only the in-flight job tracking is lost (the lesson is still openable).
 *
 * A single lesson is just a course of one (no lesson tabs shown).
 */

import { randomUUID } from "node:crypto";
import { dbEnabled, query } from "./db";

export type LessonPhase = "pending" | "designing" | "ready" | "building" | "done" | "error";

export interface JobLesson {
  index: number;
  title: string;
  artifactId: string | null; // set once the overview (skeleton) is registered → openable
  status: LessonPhase;
  builtModules: number;
  totalModules: number;
  percent: number; // 0..100 for this lesson
}

export interface Job {
  id: string;
  userId: string;
  status: "planning" | "running" | "done" | "error";
  /** which stage this job is: the free overview, or the full lesson build. */
  stage?: "overview" | "build";
  error?: string;
  isCourse: boolean;
  courseId?: string;
  lessons: JobLesson[];
  createdAt: number;
}

const jobs = new Map<string, Job>();

// ---- Global concurrency cap on generation (protects RAM + the Anthropic bill) ----
// Each lesson generation runs several Sonnet calls + holds a large blueprint in memory. We allow at
// most this many at once across ALL users; over the cap, the route returns 429 "busy, try shortly".
// Default 2 (lowered from 4) to bound PEAK RAM on the 2 GB instance. In-memory = correct for the
// single Render instance (see CHECKLIST scaling note). Env-overridable (MAX_CONCURRENT_GENERATIONS).
export const MAX_CONCURRENT_GENERATIONS = Number(process.env.MAX_CONCURRENT_GENERATIONS) || 2;
let activeGenerations = 0;
/** Try to take a generation slot. Returns false if we're at the cap. */
export function acquireGenSlot(): boolean {
  if (activeGenerations >= MAX_CONCURRENT_GENERATIONS) return false;
  activeGenerations++;
  return true;
}
/** Release a slot when a generation job finishes (call in a finally). */
export function releaseGenSlot(): void {
  if (activeGenerations > 0) activeGenerations--;
}

export function createJob(userId: string): Job {
  const job: Job = { id: randomUUID(), userId, status: "planning", isCourse: false, lessons: [], createdAt: Date.now() };
  jobs.set(job.id, job);
  void persistJob(job); // write-through so another instance can serve the first poll (multi-instance)
  // Light GC (memory-leak fix): drop trackers older than 60 min so this Map can't grow unbounded
  // (matches the skillgen/handson job maps, which already sweep). A Job is just an EPHEMERAL progress
  // tracker — the lesson itself is persisted in Postgres (the job holds only an artifactId pointer),
  // and pollJob reconstructs from the persisted artifact if a tracker is ever missing. 60 min
  // comfortably exceeds any build, so an in-flight generation is never affected.
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, j] of jobs) if (j.createdAt < cutoff) jobs.delete(id);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** A learner's still-running jobs (drops anything older than 30 min so the dashboard stays clean). */
export function activeJobs(userId: string): Job[] {
  const cutoff = Date.now() - 30 * 60 * 1000;
  return [...jobs.values()].filter((j) => j.userId === userId && j.createdAt > cutoff && j.status !== "done" && j.status !== "error");
}

/**
 * Is a BUILD job currently building this artifact? Used by the public /api/module endpoint to decide
 * whether the background runBuildJob is already the builder (just poll) vs. needs an on-demand
 * single-module build kicked (standalone / library / restarted-mid-build lessons). Cross-user by
 * design — /api/module is unauthenticated (the artifact UUID is the access token).
 */
export function hasActiveBuildForArtifact(artifactId: string): boolean {
  for (const j of jobs.values()) {
    if (j.stage === "build" && (j.status === "running" || j.status === "planning") && j.lessons.some((l) => l.artifactId === artifactId)) return true;
  }
  return false;
}

/** Compute a lesson's percent from its build progress (overview ready = 30%). */
export function lessonPercent(l: JobLesson): number {
  if (l.status === "pending" || l.status === "designing") return l.status === "designing" ? 12 : 2;
  if (l.status === "done") return 100;
  if (!l.totalModules) return 30;
  return Math.min(99, 30 + Math.round((70 * l.builtModules) / l.totalModules));
}

// ---- Cross-instance persistence (additive) ---------------------------------------------------
// The in-memory Map above is the fast path and the single-instance source of truth. To allow
// horizontal scaling (multiple Render instances behind the LB), the generating instance also
// write-throughs its job trackers to `gen_jobs`, and GET /api/job/:id falls back to that table
// when the job isn't in local memory. All best-effort: a DB hiccup never affects generation.

/** Upsert one job tracker to Postgres (best-effort). */
export async function persistJob(job: Job): Promise<void> {
  if (!dbEnabled()) return;
  try {
    await query(
      `insert into gen_jobs (id, user_id, status, stage, error, data, updated_at)
         values ($1,$2,$3,$4,$5,$6, now())
       on conflict (id) do update set
         status = excluded.status, stage = excluded.stage, error = excluded.error,
         data = excluded.data, updated_at = now()`,
      [job.id, job.userId, job.status, job.stage ?? null, job.error ?? null, JSON.stringify(job)],
    );
  } catch { /* best-effort — in-memory is authoritative on this instance */ }
}

/** Read a job tracker persisted by ANOTHER instance (or before a restart). Null if absent/off. */
export async function getPersistedJob(id: string): Promise<Job | null> {
  if (!dbEnabled()) return null;
  try {
    const rows = await query<{ data: unknown }>(`select data from gen_jobs where id = $1 limit 1`, [id]);
    if (!rows.length) return null;
    const d = rows[0].data;
    return (typeof d === "string" ? JSON.parse(d) : d) as Job;
  } catch { return null; }
}

// Flush active trackers to the DB every 2s (terminal jobs are written once). Cheap: the Map is
// GC'd to <60 min, and only non-terminal jobs re-flush. unref() so it never holds the process open.
const flushedDone = new Set<string>();
function flushJobs(): void {
  if (!dbEnabled()) return;
  for (const j of jobs.values()) {
    const terminal = j.status === "done" || j.status === "error";
    if (terminal && flushedDone.has(j.id)) continue;
    if (terminal) flushedDone.add(j.id);
    void persistJob(j);
  }
  for (const id of [...flushedDone]) if (!jobs.has(id)) flushedDone.delete(id);
}
const _jobFlushTimer = setInterval(flushJobs, 2000);
if (typeof _jobFlushTimer.unref === "function") _jobFlushTimer.unref();
