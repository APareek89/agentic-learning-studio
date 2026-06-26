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

import { profiler, retriever, planner, architect, runDeepDive, writeOverviewProse } from "./nodes";
import { registerArtifact, getArtifact, updateArtifact } from "../lib/artifacts";
import { spendOne } from "../lib/credits";
import { retrieveVisual } from "../lib/visuals";
import { renderArtifact } from "../render/index";
import { lessonPercent, releaseGenSlot, type Job, type JobLesson } from "../lib/jobs";
import { makeRootedLangfuseHandler } from "../lib/langfuse";
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
  objective?: string;
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
  // ONE root trace per generation → every node nests under it as a labelled CHILD (an expandable
  // TREE in Langfuse, not N flat top-level traces). `cfg(name)` names each child observation.
  const langfuse = makeRootedLangfuseHandler(
    `lesson:${input.userPrompt?.slice(0, 60) ?? ""}`,
    { langfuseTags: ["live-generation"], stage: "overview" }
  );
  const cfg = (runName: string) => ({ callbacks: langfuse ? [langfuse] : [], runName });
  try {
    const st: Record<string, unknown> = {
      userPrompt: input.userPrompt, cards: input.cards ?? {}, uploadIds: input.uploadIds ?? [], referOnly: !!input.referOnly,
      industry: input.industry ?? "", buildGoal: input.buildGoal ?? "", objective: input.objective ?? "", levels: input.levels ?? [], lessonTypes: input.lessonTypes ?? [],
      framework: input.framework ?? "", readingMode: input.readingMode ?? "", userProfile: input.userProfile ?? {},
    };
    // B3 measurement: per-stage wall-clock so the slow leg is visible (Langfuse also traces).
    const ovStart = Date.now();
    let lap = ovStart;
    const stageLog = (n: string) => { const t = Date.now(); console.log(`[timing] overview ${n}: ${t - lap}ms`); lap = t; };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await profiler(st as any, cfg("profiler") as any));
    stageLog("profiler");
    job.status = "running";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = st.profile as any;
    const jl: JobLesson = { index: 1, title: profile?.topic || "Your lesson", artifactId: null, status: "designing", builtModules: 0, totalModules: 0, percent: 12 };
    job.lessons = [jl];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await retriever(st as any));
    stageLog("retriever");
    // SONNET plans the STRUCTURE (lean/fast — was Opus, the slow leg); the architect (Sonnet) then
    // WRITES the prose from it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await planner(st as any, cfg("planner") as any));
    stageLog("planner");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Object.assign(st, await architect(st as any, cfg("architect") as any));
    stageLog("architect");
    // Deterministic overview repair (A5): only re-run Opus when the skeleton didn't PARSE (no
    // usable blueprint). A validation-GATE miss already carries a repairBlueprint()-fixed
    // best-effort skeleton — ship it rather than pay a second ~56s Opus call. The overview is a
    // FREE, user-reviewed preview (editable via "Edit overview"), so best-effort is the right
    // default; a genuine parse/shape failure (architect returns no blueprint) still re-gens.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(st.blueprint as any) && ((st.reviseCount as number) ?? 0) < 2) { Object.assign(st, await architect(st as any, cfg("architect") as any)); stageLog("architect-retry"); }
    console.log(`[timing] overview TOTAL: ${Date.now() - ovStart}ms`);

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
  // Declared here so the `finally` can flush it; CREATED inside the try (below) once we have the
  // title — which also means a Langfuse-ctor throw can't leak the gen slot (releaseGenSlot's
  // finally now covers it).
  let langfuse: ReturnType<typeof makeRootedLangfuseHandler> = null;
  try {
    const art = await getArtifact(artifactId);
    const bp = art?.blueprint;
    if (!art || !bp) { job.status = "error"; job.error = "That overview wasn't found (it may have expired)."; return; }

    // ONE root trace for the whole build; each module body + the prose writer nests under it as a
    // labelled child (a tree in Langfuse). `cfg(name)` names each child observation.
    langfuse = makeRootedLangfuseHandler(
      `lesson:${bp.meta.title?.slice(0, 60) ?? ""}`,
      { langfuseTags: ["live-generation"], stage: "build" }
    );
    const cfg = (runName: string) => ({ callbacks: langfuse ? [langfuse] : [], runName });

    // Promote draft → real lesson so it appears in My Lessons from now on.
    if (art.kind !== LESSON_KIND) await updateArtifact(artifactId, { kind: LESSON_KIND });
    job.status = "running";

    const jl: JobLesson = { index: 1, title: bp.meta.title, artifactId, status: "building", builtModules: 0, totalModules: bp.modules.length, percent: 30 };
    job.lessons = [jl];

    // Modules already built (a re-run, or a seeded Module 1) count immediately. The rest build
    // in SPINE ORDER so Module 1 lands in the first wave (A4: the learner can start reading it
    // while the others finish).
    const pending = bp.modules
      .filter((m) => !(m.loadState === "full" && m.blocks.length > 0))
      .sort((a, b) => a.order - b.order);
    jl.builtModules = bp.modules.length - pending.length;
    jl.percent = lessonPercent(jl);

    // Attach a CURATED concept diagram to a module when one strongly matches (deterministic
    // retrieval — NOT model output; one visual per module, max). try/catch so a visual lookup
    // can NEVER fail a build. Already-built modules (e.g. a seeded Module 1) get a pass here too.
    const attachVisual = async (mod: (typeof bp.modules)[number]): Promise<void> => {
      try {
        if (mod.visual) return;
        const hit = await retrieveVisual({ topic: bp.meta.title, moduleTitle: mod.title, moduleSummary: mod.summary });
        if (hit) mod.visual = { title: hit.title, svg: hit.svg };
      } catch { /* never fail a build over a visual */ }
    };
    await Promise.all(bp.modules.filter((m) => m.loadState === "full" && m.blocks.length > 0).map(attachVisual));

    // A1/B3 — build module bodies in PARALLEL with a concurrency cap. Raised 3→5 (one wave for a
    // 5-module lesson) now that prompt caching cuts per-call load: module 1 is built FIRST (below)
    // so it WRITES the cached MODULE_SYSTEM prefix, then the rest fan out and READ it — so the wave
    // is both cheaper and lighter on the rate/overload limit (the per-call jittered 429/529 backoff
    // in withOverloadRetry still covers a burst). Sharing `bp` is safe: each module writes only its
    // own slot, and the bp-wide repairBlueprint() is synchronous (atomic in Node) and skips stub
    // modules, so concurrent builds can't corrupt each other. Env-overridable.
    const MODULE_CONCURRENCY = Math.max(1, Number(process.env.MAX_MODULE_CONCURRENCY) || 5);

    // Persist serially in completion order (A4 — incremental render) so the stored lesson grows
    // monotonically and the front-end shows each module as soon as it's ready. renderArtifact is
    // evaluated when the chain runs, so it always captures the latest blueprint state.
    let persistChain: Promise<void> = Promise.resolve();
    const persist = () => {
      persistChain = persistChain.then(() =>
        updateArtifact(artifactId, { blueprint: bp, html: renderArtifact(bp) }).then(() => {}).catch(() => {})
      );
      return persistChain;
    };

    // B3 measurement: per-module + total wall-clock (Langfuse also traces; this is the cheap log).
    const buildStart = Date.now();
    // DURABILITY (B3): build ONE module with skip-and-continue — a single module that errors (a 502,
    // an overload that exhausts retries, a parse fault) becomes a STUB and the build CONTINUES, so
    // the lesson reaches a usable state even if one module fails (the stub then builds on demand via
    // /api/module). runDeepDive already rides out transient 429/529 internally (withOverloadRetry).
    let successCount = 0, failCount = 0;
    const buildOne = async (mod: (typeof bp.modules)[number]): Promise<void> => {
      const t = Date.now();
      let ok = false;
      try {
        const r = await runDeepDive(bp, mod.id, { uploadIds: art.uploadIds, referOnly: art.referOnly, config: cfg(`module ${mod.order}: ${mod.title}`) });
        ok = !!r.ok;
        if (ok) { successCount++; await attachVisual(mod); }
        else { failCount++; console.warn(`[runBuildJob] module ${mod.order} "${mod.title}" did not build (kept as stub; builds on demand)`); }
      } catch (e) {
        failCount++; // never let one module throw the whole build
        console.warn(`[runBuildJob] module ${mod.order} "${mod.title}" threw — skipping, build continues:`, e instanceof Error ? e.message : String(e));
      }
      jl.builtModules++; // count toward progress regardless so the build can reach 100%
      jl.percent = lessonPercent(jl);
      await persist();
      console.log(`[timing] build module ${mod.order} "${mod.title}": ${Date.now() - t}ms ok=${ok}`);
    };

    // DEFERRED OVERVIEW PROSE: the glossary definitions + synthesis were left empty by the (fast)
    // overview architect — write them HERE, in parallel with the module bodies, so they overlap and
    // add ~0 to the build wall-clock (the preview never showed them). Independent of module blocks.
    const proseTask = (async () => {
      try {
        await writeOverviewProse(bp, { config: cfg("glossary+synthesis") });
        await persist();
      } catch (e) {
        console.warn("[runBuildJob] overview-prose:", e instanceof Error ? e.message : String(e));
      }
    })();

    // CACHE WARM-UP (B3): build module 1 ALONE first so its call WRITES the cached MODULE_SYSTEM
    // (+ tool) prefix; only then fan out the rest, which READ the cache (a cache entry is readable
    // only after the first response streams — a simultaneous fan-out would all miss + each pay full
    // price). Cost: module 1 doesn't overlap the wave, but the cache reads more than pay it back.
    let cursor = 0;
    if (pending.length) await buildOne(pending[cursor++]);
    const buildNext = async (): Promise<void> => {
      for (;;) {
        const idx = cursor++;
        if (idx >= pending.length) return;
        await buildOne(pending[idx]);
      }
    };
    const workerCount = Math.min(MODULE_CONCURRENCY, Math.max(0, pending.length - cursor));
    await Promise.all([proseTask, ...Array.from({ length: workerCount }, () => buildNext())]);
    await persistChain; // make sure the final, complete state is written
    console.log(`[timing] build TOTAL: ${Date.now() - buildStart}ms (${successCount} ok, ${failCount} failed of ${pending.length})`);

    jl.status = "done"; jl.percent = 100;
    // Charge ONE lesson credit — ONLY on a FULL success (every module built). A partial build (a
    // module failed → kept as a stub) is left in a usable state but is NOT charged; a hard failure
    // falls through to catch and is never charged. The free overview/preview never costs. No-op
    // when there's no user / DB (local open-mode dev). FIFO over the buyer's credit lots. MUST run
    // BEFORE job.status="done": the front-end refreshes the credit pill the instant it polls "done",
    // so the deduction has to be committed first or the pill shows the stale (pre-spend) balance.
    const fullSuccess = failCount === 0; // every pending module built (none kept as a stub)
    if (fullSuccess && art.userId) {
      try { await spendOne(art.userId); }
      catch (e) { console.error("[runBuildJob] credit deduct failed", e); }
    } else if (!fullSuccess) {
      console.warn(`[runBuildJob] partial build (${failCount} stub(s)) — NOT charging; remaining modules build on demand via /api/module.`);
    }
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
