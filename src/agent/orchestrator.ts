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

import { profiler, retriever, planner, architect, coverageBrief, runDeepDive, writeOverviewProse } from "./nodes";
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
    // FAST OVERVIEW: profiler ∥ retriever (the retriever's query degrades gracefully to the raw
    // prompt when the profile isn't resolved yet — fine for grounding a bullets brief).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [profOut, retrOut] = await Promise.all([profiler(st as any, cfg("profiler") as any), retriever(st as any)]);
    Object.assign(st, profOut, retrOut);
    stageLog("profiler+retriever");
    job.status = "running";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = st.profile as any;
    const jl: JobLesson = { index: 1, title: profile?.topic || "Your lesson", artifactId: null, status: "designing", builtModules: 0, totalModules: 0, percent: 12 };
    job.lessons = [jl];
    // FAST OVERVIEW — ONE small Haiku call fills the bullets-only coverage template (framing /
    // concepts / examples / outcomes / planned sections) wrapped in a minimal valid Blueprint.
    // The real skeleton (planner + architect, ~70s) moved into runBuildJob, which honors this
    // approved brief. One quick retry on a transient miss (the call is only a few seconds).
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await coverageBrief(st as any, cfg("coverage-brief") as any));
    } catch (e) {
      console.warn("[runOverviewJob] coverage brief failed — retrying once:", e instanceof Error ? e.message : String(e));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await coverageBrief(st as any, cfg("coverage-brief-retry") as any));
    }
    stageLog("coverage-brief");
    console.log(`[timing] overview TOTAL: ${Date.now() - ovStart}ms`);

    const bp = st.blueprint as Blueprint | null;
    if (!bp) { jl.status = "error"; job.status = "error"; job.error = "Couldn't design an overview for that — try rephrasing."; return; }

    // Persist the FULL generation input (+ resolved intent) with the draft so the build stage
    // can run the real skeleton pipeline faithfully — this also carries the config selections
    // (lessonTypes/framework/cards) that the old build path silently dropped. Rides in the
    // existing `cards` JSONB — no DB migration.
    const draftCards: Record<string, unknown> = { ...(input.cards ?? {}), __genInput: input, __intent: st.intent ?? null };
    const ref = await registerArtifact({
      kind: OVERVIEW_DRAFT_KIND, title: bp.meta.title, html: renderArtifact(bp, { previewOnly: true }), blueprint: bp,
      uploadIds: input.uploadIds, referOnly: input.referOnly, userId: input.userId, userEmail: input.userEmail,
      prompt: input.userPrompt, cards: draftCards, profile: bp.learnerProfile,
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
    if (!art || !art.blueprint) { job.status = "error"; job.error = "That overview wasn't found (it may have expired)."; return; }
    // `let` (not const): a FAST draft's blueprint is REPLACED by the real skeleton below.
    let bp: Blueprint = art.blueprint;

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

    // FAST OVERVIEW → REAL SKELETON. A fast draft carries only the approved coverage brief +
    // section stubs (no mental map/glossary/plan) — the ~70s planner+architect skeleton that
    // used to run in the free overview runs HERE instead, with the approved brief injected so
    // the lesson delivers exactly the coverage the learner signed off on. Old-style drafts
    // (full skeleton, no brief) and re-builds (built modules present) skip this unchanged.
    const isFastDraft = !!bp.brief && !bp.modules.some((m) => m.loadState === "full" && m.blocks.length > 0) && Object.keys(bp.glossary).length === 0;
    if (isFastDraft) {
      jl.status = "designing"; jl.percent = 15;
      const cardsBag = (art.cards ?? {}) as Record<string, unknown>;
      const gi = (cardsBag.__genInput ?? null) as GenerateInput | null;
      const storedIntent = cardsBag.__intent ?? null;
      const st: Record<string, unknown> = {
        userPrompt: gi?.userPrompt ?? art.prompt ?? bp.meta.topic,
        cards: gi?.cards ?? {}, uploadIds: art.uploadIds ?? [], referOnly: !!art.referOnly,
        industry: gi?.industry ?? "", buildGoal: gi?.buildGoal ?? "", objective: gi?.objective ?? "",
        levels: gi?.levels ?? [], lessonTypes: gi?.lessonTypes ?? [], framework: gi?.framework ?? "",
        readingMode: gi?.readingMode ?? "", userProfile: gi?.userProfile ?? {},
        profile: bp.learnerProfile, intent: storedIntent,
        brief: { ...bp.brief, approvedTitle: bp.meta.title },
      };
      const dStart = Date.now();
      let lap = dStart;
      const stageLog = (n: string) => { const t = Date.now(); console.log(`[timing] build-design ${n}: ${t - lap}ms`); lap = t; };
      // The overview stored profile + intent; only an old/partial draft re-derives them.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!storedIntent) { Object.assign(st, await profiler(st as any, cfg("profiler") as any)); stageLog("profiler"); }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await retriever(st as any));
      stageLog("retriever");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await planner(st as any, cfg("planner") as any));
      stageLog("planner");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Object.assign(st, await architect(st as any, cfg("architect") as any));
      stageLog("architect");
      // Same repair policy the overview stage used: re-run only when nothing PARSED.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!(st.blueprint as any) && ((st.reviseCount as number) ?? 0) < 2) { Object.assign(st, await architect(st as any, cfg("architect-retry") as any)); stageLog("architect-retry"); }
      console.log(`[timing] build-design TOTAL: ${Date.now() - dStart}ms`);

      const skeleton = st.blueprint as Blueprint | null;
      if (!skeleton) { jl.status = "error"; job.status = "error"; job.error = "Couldn't design the lesson structure — please try again (you were not charged)."; return; }
      skeleton.meta.title = bp.meta.title; // honor the approved title
      skeleton.brief = bp.brief;           // carry the approved brief on the built lesson
      bp = skeleton;
      await updateArtifact(artifactId, { blueprint: bp, html: renderArtifact(bp) });
      jl.totalModules = bp.modules.length;
      jl.status = "building"; jl.percent = 30;
    }

    // Modules already built (a re-run, or a seeded Module 1) count immediately. The rest build
    // in SPINE ORDER so Module 1 lands in the first wave (A4: the learner can start reading it
    // while the others finish).
    const pending = bp.modules
      .filter((m) => !(m.loadState === "full" && m.blocks.length > 0))
      .sort((a, b) => a.order - b.order);
    jl.builtModules = bp.modules.length - pending.length;
    jl.percent = lessonPercent(jl);

    // DIAGRAMS RETIRED (owner call, 2026-07-14): the curated-visual attach is disabled — the
    // diagram quality wasn't earning its place in lessons; prose/code/interactives carry the
    // content. (`retrieveVisual` + `module.visual` stay in the codebase for old artifacts;
    // the world renderer also skips rendering both curated visuals and `diagram` blocks.)
    void retrieveVisual; // keep the import referenced without attaching visuals

    // Build module bodies in ONE parallel wave with a concurrency cap. Default 5 (covers a typical
    // 5-module lesson in one wave); lowered from 8 to bound PEAK memory — each concurrent build holds
    // a streamed ~16k-token response + the shared blueprint, and several generations can run at once,
    // so a high cap spikes RAM (the 2 GB instance OOM'd with 8 × up-to-4 generations). Sharing `bp`
    // is safe: each module writes only its own slot, and the bp-wide repairBlueprint() is synchronous
    // (atomic in Node) and skips stub modules. Env-overridable (MAX_MODULE_CONCURRENCY).
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
        if (ok) { successCount++; }
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

    // ALL MODULES IN PARALLEL (one wave). The earlier B3 "build module 1 first to warm the prompt
    // cache, then fan out" serialized one full module (~100-200s) before parallelism — but LATENCY is
    // dominated by OUTPUT-token generation, not input/cache, so that warm-up traded wall-clock for a
    // few cents of input cost. Output is the constraint, so fan out everything at once: wall-clock ≈
    // the SLOWEST single module, not the sum. cache_control stays on each call (it still helps
    // within-module retries + back-to-back builds within the 5-min TTL); we just don't gate the wave
    // on it. On Scale-tier OTPM (2M/min) a wave of up to MAX_MODULE_CONCURRENCY 16k-output calls fits.
    let cursor = 0;
    const buildNext = async (): Promise<void> => {
      for (;;) {
        const idx = cursor++;
        if (idx >= pending.length) return;
        await buildOne(pending[idx]);
      }
    };
    const workerCount = Math.min(MODULE_CONCURRENCY, pending.length);
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
    // FULL success = there WAS work to do AND every pending module built (none kept as a stub).
    // `pending.length > 0` guards the empty-pending case (a re-build / double-click where everything
    // was already built) so we never charge a credit for building nothing. (Audit P0-5.)
    const fullSuccess = pending.length > 0 && failCount === 0;
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
