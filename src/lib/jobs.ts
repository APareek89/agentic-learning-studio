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

/** Compute a lesson's percent from its build progress (overview ready = 30%). */
export function lessonPercent(l: JobLesson): number {
  if (l.status === "pending" || l.status === "designing") return l.status === "designing" ? 12 : 2;
  if (l.status === "done") return 100;
  if (!l.totalModules) return 30;
  return Math.min(99, 30 + Math.round((70 * l.builtModules) / l.totalModules));
}
