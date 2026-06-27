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
// Each lesson generation = 1 Opus + ~5 Sonnet calls. We allow at most this many to run
// at once across ALL users; over the cap, the route returns 429 "busy, try shortly".
// In-memory = correct for the single Render instance (see CHECKLIST scaling note).
export const MAX_CONCURRENT_GENERATIONS = Number(process.env.MAX_CONCURRENT_GENERATIONS) || 4;
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
