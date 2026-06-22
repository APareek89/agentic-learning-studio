/**
 * # Orchestrator — two-stage generation with a human-in-the-loop OVERVIEW gate
 *
 * Generation is split so the learner aligns on the OVERVIEW before any (paid)
 * module bodies are written:
 *   - runOverviewJob: profile → retrieve → architect → register the skeleton
 *     (overview + mental map + module stubs) as a DRAFT (kind "overview-draft",
 *     hidden from My Lessons, rendered preview-only so nothing builds). Cheap +
 *     fast — this is the "Generate Overview — Free" step.
 *   - runBuildJob: once the learner clicks "Generate Lesson", promote the draft
 *     to a real lesson (kind "learning-artifact") and write every module body.
 *
 * Both run DETACHED from the HTTP request so the learner can watch progress on
 * the dashboard / Trainer. (Auto course-splitting was retired from the live flow:
 * the gate is about aligning on ONE lesson's overview. Existing multi-lesson
 * course artifacts still render and open fine.)
 */

import { profiler, retriever, architect, runDeepDive } from "./nodes";
import { registerArtifact, getArtifact, updateArtifact } from "../lib/artifacts";
import { renderArtifact } from "../render/index";
import { lessonPercent, releaseGenSlot, type Job, type JobLesson } from "../lib/jobs";
import { makeLangfuseHandler } from "../lib/langfuse";
import type { Blueprint } from "../render/schema";

/** Drafts (un-approved overviews) carry this kind so My Lessons can hide them. */
export const OVERVIEW_DRAFT_KIND = "overview-draft";
/** A real, learner-approved lesson. */
export const LESSON_KIND = "learning-artifact";

export interface GenerateInput {
  userPrompt: string;
  cards?: Record<string, string>;
  uploadIds?: string[];
  referOnly?: boolean;
  industry?: string;
  buildGoal?: string;
  levels?: string[];
  lessonTypes?: string[];
  framework?: string;
  readingMode?: string;
  userProfile?: Record<string, unknown>;
  userId?: string;
  userEmail?: string;
}

/**
 * STAGE 1 — design the OVERVIEW only (skeleton), register it as a preview-only
 * DRAFT, and stop. No module bodies are written, so this is fast and free.
 */
export async function runOverviewJob(job: Job, input: GenerateInput): Promise<void> {
  job.stage = "overview";
  // Per-job Langfuse handler (null when keys absent → tracing skipped). Wires the
  // LIVE path into Langfuse so real lesson generations are traced (the legacy
  // /api/learn SSE route has its own handler).
  const langfuse = makeLangfuseHandler();
  const config = {
    callbacks: langfuse ? [langfuse] : [],
    runName: `lesson:${input.userPrompt?.slice(0, 60) ?? ""}`,
    metadata: { langfuseTags: ["live-generation"], stage: "overview" },
  };
  try {
    const st: Record<string, unknown> = {
      userPrompt: input.userPrompt, cards: input.cards ?? {}, uploadIds: input.uploadIds ?? [], referOnly: !!input.referOnly,
      industry: input.industry ?? "", buildGoal: input.buildGoal ?? "", levels: input.levels ?? [], lessonTypes: input.lessonTypes ?? [],
      framework: input.framework ?? "", readingMode: input.readingMode ?? "", userProfile: input.userProfile ?? {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await profiler(st as any, config as any));
    job.status = "running";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = st.profile as any;
    const jl: JobLesson = { index: 1, title: profile?.topic || "Your lesson", artifactId: null, status: "designing", builtModules: 0, totalModules: 0, percent: 12 };
    job.lessons = [jl];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await retriever(st as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await architect(st as any, config as any));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(st.validation as any)?.ok && ((st.reviseCount as number) ?? 0) < 2) Object.assign(st, await architect(st as any, config as any));

    const bp = st.blueprint as Blueprint | null;
    if (!bp) { jl.status = "error"; job.status = "error"; job.error = "Couldn't design an overview for that — try rephrasing."; return; }

    const ref = await registerArtifact({
      kind: OVERVIEW_DRAFT_KIND, title: bp.meta.title, html: renderArtifact(bp, { previewOnly: true }), blueprint: bp,
      uploadIds: input.uploadIds, referOnly: input.referOnly, userId: input.userId, userEmail: input.userEmail,
      prompt: input.userPrompt, cards: input.cards, profile: bp.learnerProfile,
    });
    jl.artifactId = ref.id; jl.title = bp.meta.title; jl.totalModules = bp.modules.length;
    jl.status = "ready"; jl.percent = 100;
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
    console.error("[runOverviewJob]", e);
  } finally {
    releaseGenSlot();
    // Background jobs can exit before traces flush — force the flush.
    if (langfuse) await langfuse.flushAsync().catch(() => {});
  }
}

/**
 * STAGE 2 — the learner approved the overview: promote the draft to a real
 * lesson and write every module body (the old build loop), updating the stored
 * artifact after each so the lesson is readable while the rest fill in.
 */
export async function runBuildJob(job: Job, artifactId: string): Promise<void> {
  job.stage = "build";
  // Per-job Langfuse handler (null when keys absent → tracing skipped). Traces
  // the LIVE build path so each module body's model calls appear in Langfuse.
  const langfuse = makeLangfuseHandler();
  try {
    const art = await getArtifact(artifactId);
    const bp = art?.blueprint;
    if (!art || !bp) { job.status = "error"; job.error = "That overview wasn't found (it may have expired)."; return; }

    const config = {
      callbacks: langfuse ? [langfuse] : [],
      runName: `lesson:${bp.meta.title?.slice(0, 60) ?? ""}`,
      metadata: { langfuseTags: ["live-generation"], stage: "build" },
    };

    // Promote draft → real lesson so it appears in My Lessons from now on.
    if (art.kind !== LESSON_KIND) await updateArtifact(artifactId, { kind: LESSON_KIND });
    job.status = "running";

    const jl: JobLesson = { index: 1, title: bp.meta.title, artifactId, status: "building", builtModules: 0, totalModules: bp.modules.length, percent: 30 };
    job.lessons = [jl];
    jl.percent = lessonPercent(jl);

    for (const m of bp.modules) {
      if (m.loadState === "full" && m.blocks.length > 0) { jl.builtModules++; jl.percent = lessonPercent(jl); continue; }
      await runDeepDive(bp, m.id, { uploadIds: art.uploadIds, referOnly: art.referOnly, config });
      jl.builtModules++; jl.percent = lessonPercent(jl);
      await updateArtifact(artifactId, { blueprint: bp, html: renderArtifact(bp) });
    }
    jl.status = "done"; jl.percent = 100;
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
    console.error("[runBuildJob]", e);
  } finally {
    releaseGenSlot();
    // Background jobs can exit before traces flush — force the flush.
    if (langfuse) await langfuse.flushAsync().catch(() => {});
  }
}
