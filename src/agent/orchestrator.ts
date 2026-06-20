/**
 * # Orchestrator — background generation with progressive availability
 *
 * Runs DETACHED from the HTTP request so the learner can watch the dashboard. The
 * key latency win: each lesson's artifact is registered the moment its SKELETON
 * (overview + mental map + module stubs) is ready — BEFORE any module body is
 * written — so the "Open" link activates early while modules fill in behind it.
 *
 * For a broad ask ("teach me everything about X") a planner splits the topic into
 * a short COURSE of 2–5 lessons; the kick-off lesson is built first, the rest
 * follow, each linking back to the previous with a recap card.
 */

import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { randomUUID } from "node:crypto";
import { makeLLM } from "./llm";
import { profiler, retriever, architect, runDeepDive } from "./nodes";
import { registerArtifact, updateArtifact } from "../lib/artifacts";
import { renderArtifact } from "../render/index";
import { lessonPercent, type Job } from "../lib/jobs";
import type { Blueprint } from "../render/schema";

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

const LessonPlanSchema = z.object({
  lessons: z
    .array(z.object({ title: z.string(), summary: z.string(), subtopics: z.array(z.string()).default([]) }))
    .min(1)
    .max(5),
});

const COURSE_PLANNER_SYSTEM = `You decide whether a learning request is best taught as ONE focused lesson or a short COURSE of 2–5 lessons.
Rules:
- DEFAULT to ONE lesson. Return a single lesson for any focused ask (a concept, a comparison, a how-to) that fits in ~4–6 modules.
- Split into a COURSE only when the topic is genuinely BROAD: the learner asks to learn "everything"/"complete"/"comprehensive"/"master"/"end-to-end"/"from scratch", OR the scope spans clearly distinct sub-areas that each deserve their own ~4–5 module lesson.
- Each lesson must be COHERENT, ordered foundational→advanced, and small enough to teach well in ~5 modules (this keeps each lesson within the generator's token budget — never cram a broad topic into one bloated lesson). Max 5 lessons.
- Lesson 1 is the KICK-OFF: the foundation the rest build on.
Return lessons[] with {title, summary (one sentence), subtopics[] (the concrete things THIS lesson covers)}. For a focused ask, return EXACTLY ONE lesson.`;

async function planLessons(userPrompt: string, topic: string, learningGoal: string, mustCover: string[], level: string) {
  const hint = /everything|complete|comprehensive|master|end.?to.?end|from scratch|deep dive|bootcamp|full course|all about|in depth/i.test(userPrompt)
    ? "The phrasing suggests BROAD/comprehensive coverage — a course of several lessons is likely appropriate."
    : "The phrasing suggests a focused ask — one lesson is likely enough.";
  const llm = makeLLM("sonnet", 0.2, { maxTokens: 1400 }).withStructuredOutput(LessonPlanSchema, { name: "plan" });
  const out = await llm.invoke([
    new SystemMessage(COURSE_PLANNER_SYSTEM),
    new HumanMessage(`REQUEST: ${userPrompt}\nTOPIC: ${topic}\nGOAL: ${learningGoal}\nMUST COVER: ${mustCover.join(", ")}\nLEVEL: ${level}\nHINT: ${hint}`),
  ]);
  return out.lessons;
}

/** Run a full generation job (1 lesson, or a multi-lesson course) in the background. */
export async function runJob(job: Job, input: GenerateInput): Promise<void> {
  try {
    // 1. Profile the request once (resolves level/depth/examples/topic/intent).
    const baseState: Record<string, unknown> = {
      userPrompt: input.userPrompt, cards: input.cards ?? {}, uploadIds: input.uploadIds ?? [], referOnly: !!input.referOnly,
      industry: input.industry ?? "", buildGoal: input.buildGoal ?? "", levels: input.levels ?? [], lessonTypes: input.lessonTypes ?? [],
      framework: input.framework ?? "", readingMode: input.readingMode ?? "", userProfile: input.userProfile ?? {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(baseState, await profiler(baseState as any, {} as any));
    job.status = "running";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = baseState.profile as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const intent = baseState.intent as any;

    // 2. Plan: one lesson, or a short course.
    const plan = await planLessons(input.userPrompt, profile.topic, intent?.learningGoal ?? "", intent?.mustCover ?? [], profile.level);
    job.isCourse = plan.length > 1;
    job.courseId = job.isCourse ? randomUUID() : undefined;
    job.lessons = plan.map((l, i) => ({ index: i + 1, title: l.title, artifactId: null, status: "pending" as const, builtModules: 0, totalModules: 0, percent: 2 }));

    // 3. Build each lesson: skeleton → register (overview ready) → modules.
    let prev: { title: string; points: string[] } | null = null;
    for (let i = 0; i < plan.length; i++) {
      const spec = plan[i];
      const jl = job.lessons[i];
      jl.status = "designing"; jl.percent = lessonPercent(jl);

      const subs = spec.subtopics ?? [];
      const st: Record<string, unknown> = { ...baseState };
      if (job.isCourse) {
        st.profile = { ...profile, topic: spec.title };
        st.intent = { ...intent, learningGoal: spec.summary, mustCover: subs.length ? subs : intent?.mustCover ?? [] };
        st.userPrompt = `${input.userPrompt}\n\n[Course part ${i + 1} of ${plan.length}. This lesson covers ONLY: ${spec.title} — ${spec.summary}. Subtopics: ${subs.join(", ")}. Do not re-teach the other parts.]`;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await retriever(st as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await architect(st as any, {} as any));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(st.validation as any)?.ok && ((st.reviseCount as number) ?? 0) < 2) Object.assign(st, await architect(st as any, {} as any));

      const bp = st.blueprint as Blueprint | null;
      if (!bp) { jl.status = "error"; continue; }
      if (prev) bp.meta.recap = { previousTitle: prev.title, points: prev.points };
      if (job.isCourse) bp.meta.course = { index: i + 1, total: plan.length, title: spec.title };

      const ref = await registerArtifact({
        kind: "learning-artifact", title: bp.meta.title, html: renderArtifact(bp), blueprint: bp,
        uploadIds: input.uploadIds, referOnly: input.referOnly, userId: input.userId, userEmail: input.userEmail,
        prompt: input.userPrompt, cards: input.cards, profile: bp.learnerProfile,
        course: job.isCourse ? { id: job.courseId!, index: i + 1, total: plan.length, title: spec.title } : undefined,
      });
      jl.artifactId = ref.id; jl.totalModules = bp.modules.length; jl.builtModules = 0;
      jl.status = "building"; jl.percent = lessonPercent(jl);

      for (const m of bp.modules) {
        if (m.loadState === "full" && m.blocks.length > 0) { jl.builtModules++; jl.percent = lessonPercent(jl); continue; }
        await runDeepDive(bp, m.id, { uploadIds: input.uploadIds, referOnly: input.referOnly });
        jl.builtModules++; jl.percent = lessonPercent(jl);
        await updateArtifact(ref.id, { blueprint: bp, html: renderArtifact(bp) });
      }
      jl.status = "done"; jl.percent = 100;
      prev = { title: bp.meta.title, points: bp.modules.slice(0, 5).map((m) => m.title) };
    }
    job.status = "done";
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
    console.error("[runJob]", e);
  }
}
