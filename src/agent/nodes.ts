/**
 * # Graph nodes — the steps that turn a request into a rendered lesson
 *
 *   profiler  → resolve the learner profile (level/depth/examples + topic/industry/build)
 *   architect → produce a validated Blueprint (the structured lesson), repairing once
 *               if the deterministic gates fail
 *   composer  → render the Blueprint to interactive HTML + register the artifact
 *
 * (RAG retrieval and an LLM critic come in later build steps; the deterministic
 * validation gates already enforce the hard requirements — (i) on every term,
 * acronym expansion, decision coverage, etc.)
 */

import { z } from "zod";
import type { RunnableConfig } from "@langchain/core/runnables";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { makeLLM, withOverloadRetry } from "./llm";
import type { GraphStateType, LearnerProfile } from "./state";
import {
  BlueprintSchema,
  BlockSchema,
  LevelSchema,
  DepthSchema,
  ExamplesSchema,
  validateBlueprint,
  repairBlueprint,
} from "../render/schema";
import type { Blueprint, Block } from "../render/schema";
import { renderArtifact } from "../render/index";
import { registerArtifact } from "../lib/artifacts";
import { PROFILER_SYSTEM, PLANNER_SYSTEM, SKELETON_SYSTEM, MODULE_SYSTEM, OVERVIEW_PROSE_SYSTEM, plannerUserPrompt, architectUserPrompt, moduleUserPrompt, overviewProseUserPrompt } from "./prompts";
import { measureModule, repairDensity } from "./density";
import { retrieve } from "../rag/retrieve";
import { ragEnabled } from "../lib/db";
import { hasUploads, getUploadTitles, retrieveFromUploads } from "../lib/uploads";
import type { Intent, RetrievedSource } from "./state";

// Profiler runs on HAIKU: it's a small prompt→structured-inference task (who/what extraction),
// not content generation — Haiku is ~3x cheaper + faster and accurate enough here. Env-overridable.
const profilerLLM = makeLLM("haiku", 0);
// OVERVIEW = a TWO-STAGE split (planner / writer) so each model does the job it's best at:
//   planner (OPUS) → the STRUCTURE only: spine, module plan, mental-map shape, glossary term
//     list, structureType. The reasoning-heavy step — kept LEAN (NO prose), so Opus is fast +
//     cheap. ~9k cap is plenty for a structure-only object.
//   architect / writer (SONNET) → WRITES the skeleton's prose (each node's orient, module
//     summaries + objectives, glossary definitions, synthesis), following the planner's
//     structure EXACTLY. Sonnet is cheaper/faster for prose; raw-parsed via coerceSkeleton.
//     16k streaming so a prose-rich skeleton doesn't truncate (Sonnet streams fine; the
//     Opus-only streaming double-encode bug doesn't apply to Sonnet).
// If the planner fails (e.g. a hard overload), state.plan is null and the architect plans +
// writes in one Sonnet call (graceful fallback — see plannerUserPrompt / architectUserPrompt).
// PLANNER on SONNET (was Opus 4.8 — the slow leg of the overview; B3 latency). Sonnet plans the
// structure fast enough, and the graceful fallback (architect plans+writes in one) still covers a
// miss. Env-overridable via ANTHROPIC_MODEL_SONNET (set ANTHROPIC_MODEL_OPUS-tier here to revert).
const plannerLLM = makeLLM("sonnet", 0.2, { maxTokens: 9000 });
const skeletonLLM = makeLLM("sonnet", 0.3, { maxTokens: 16000, streaming: true });
// Each module's blocks are written by a SEPARATE small call (Module 1 up front in
// seedFirstModule; the rest on demand via runDeepDive / POST /api/module). streaming
// keeps us safe if a visuals+syntax+high-density module runs long.
// 16k (streaming) so code/example-heavy modules don't truncate mid-tool-call (a
// truncated structured output = a persistent "couldn't build this section" failure,
// not a transient one). Streaming keeps it under the SDK's non-streaming ceiling.
const moduleLLM = makeLLM("sonnet", 0.3, { maxTokens: 16000, streaming: true });

/** Structured-output shape for one module's body: blocks + the map node's detail lines. */
const ModuleBlocksSchema = z.object({
  blocks: z.array(BlockSchema),
  // The DETAIL-layer lines for THIS module's overview node (rendered in the module head):
  nodeMeta: z.object({ what: z.string().optional(), relevance: z.string().optional(), laymanExplanation: z.string().optional() }).optional(),
});

/**
 * Cautiously infer a learning LEVEL from the learner's saved sign-up role — used
 * ONLY as a gap-fill when no level was selected and none was implied by the request.
 * Precedence is the caller's: selection > request-implied > THIS > cautious default.
 *
 * Rules (deliberately conservative — never returns "advanced"):
 *  - an explicitly "technical" role/title, or a role/aspiration in a technical track
 *    (engineer, developer, ML, data science, …) → "intermediate"
 *  - any other stated, non-technical role (e.g. plain "product manager") → "beginner"
 *  - no role info at all → null (let the caller fall through to its cautious default)
 */
function inferLevelFromRole(role?: string, aspiringRole?: string): LearnerProfile["level"] | null {
  const r = (role ?? "").toLowerCase().trim();
  const ar = (aspiringRole ?? "").toLowerCase().trim();
  if (!r && !ar) return null;
  const TECHNICAL = /(technical|engineer|developer|programmer|coder|software|swe|sde|data scien|machine learning|\bml\b|\bai\b|architect|devops|sre|researcher|scientist|cto|tech lead)/;
  // A technical current role, or aspiring INTO a technical track, earns a step up — but
  // only to intermediate; we never assume advanced from a job title.
  if (TECHNICAL.test(r) || TECHNICAL.test(ar)) return "intermediate";
  // A stated non-technical role → beginner (the most scaffolding).
  return "beginner";
}

// What the Profiler model returns (small; we assemble the full profile in code).
const InferenceSchema = z.object({
  topic: z.string(),
  industry: z.string().optional(),
  buildGoal: z.string().optional(),
  level: LevelSchema.optional(),
  depth: DepthSchema.optional(),
  examples: ExamplesSchema.optional(),
  // Fix 1 — capture the PRECISE ask so the lesson answers the real question.
  learningGoal: z.string(),
  lessonFocus: z.string(),
  mustCover: z.array(z.string()).default([]),
});

// ============================================================================
// NODE 1 — profiler
// ============================================================================
export async function profiler(state: GraphStateType, config: RunnableConfig) {
  const cards = state.cards ?? {};
  // Ride out a transient Anthropic 529/overload during the (free) overview rather than failing it.
  const inf = await withOverloadRetry(() =>
    profilerLLM
      .withStructuredOutput(InferenceSchema, { name: "infer" })
      .invoke([new SystemMessage(PROFILER_SYSTEM), new HumanMessage(state.userPrompt)], config)
  );

  // Level can now be MULTI-select on the landing. The base `level` (used for the
  // 27-combo gating + acronym policy) is the LEAST-advanced selected, so a mixed
  // audience still gets the most scaffolding; the full set rides in `levels`.
  const LEVEL_ORDER: LearnerProfile["level"][] = ["beginner", "intermediate", "advanced"];
  const pickedLevels = (state.levels ?? []).filter((l): l is LearnerProfile["level"] => LEVEL_ORDER.includes(l as LearnerProfile["level"]));
  const baseFromPicked = LEVEL_ORDER.find((l) => pickedLevels.includes(l));

  // GAP-FILL PRECEDENCE for level: selection > request-implied > profile-inferred >
  // cautious default. A picked level always wins; only when nothing was selected AND
  // the request didn't imply one do we cautiously read the saved role (never advanced).
  const up = state.userProfile ?? {};
  const level =
    baseFromPicked ||
    (cards.level as LearnerProfile["level"]) || // selection
    inf.level ||                                 // request-implied
    inferLevelFromRole(up.role, up.aspiringRole) || // profile-inferred (cautious)
    "beginner";                                  // cautious default
  const depth = (cards.depth as LearnerProfile["depth"]) || inf.depth || "conceptual_technical";
  const examples = (cards.examples as LearnerProfile["examples"]) || inf.examples || "functional_code";
  const noCards = !(pickedLevels.length || cards.level || cards.depth || cards.examples);

  // New landing controls (all optional; sensible defaults preserve old behaviour).
  const density = (["low", "medium", "high"].includes(cards.density as string) ? cards.density : "medium") as LearnerProfile["density"];
  const visualsRequested = cards.visuals === "on";
  const explainSyntax = cards.syntax === "on";

  // GAP-FILL PRECEDENCE for industry: explicit landing field (selection) >
  // request-implied > profile-inferred. The saved profile industry only fills a gap
  // the request left open — it must NEVER reframe the subject (that stays the ask).
  const industry = (state.industry ?? "").trim() || inf.industry || up.industry || undefined;
  const buildGoal = (state.buildGoal ?? "").trim() || inf.buildGoal || undefined;
  // Learner's PURPOSE (landing "Objective"): curates emphasis, never the subject. Only a
  // valid enum value rides through; anything else falls back to neutral (undefined).
  const OBJECTIVES = ["learning", "learn_and_apply", "build", "exam_prep", "interview_prep", "other"] as const;
  const objective = (OBJECTIVES as readonly string[]).includes((state.objective ?? "").trim())
    ? ((state.objective as string).trim() as LearnerProfile["objective"])
    : undefined;
  // Code-example framework only matters when code examples are in play.
  const codeWanted = examples === "code" || examples === "functional_code";
  const framework = codeWanted ? ((state.framework ?? "").trim() || undefined) : undefined;
  const lessonTypes = ((state.lessonTypes ?? []).filter((t) => t === "content" || t === "knowledge_check") as ("content" | "knowledge_check")[]);
  let finalLessonTypes = lessonTypes.length ? lessonTypes : (["content"] as ("content" | "knowledge_check")[]);

  // Reading preference (renderer-only). Horizontal mode ENDS on a knowledge-check page,
  // so it implies generating questions — fold knowledge_check in so the modules produce
  // the knowledgeCheck blocks the final page is built from.
  const readingMode: LearnerProfile["readingMode"] = state.readingMode === "horizontal" ? "horizontal" : "vertical";
  if (readingMode === "horizontal" && !finalLessonTypes.includes("knowledge_check")) {
    finalLessonTypes = [...finalLessonTypes, "knowledge_check"];
  }

  const profile: LearnerProfile = {
    level,
    depth,
    examples,
    topic: inf.topic,
    industry,
    buildGoal,
    objective,
    role: up.role || undefined,
    aspiringRole: up.aspiringRole || undefined,
    framework,
    levels: pickedLevels.length ? pickedLevels : undefined,
    lessonTypes: finalLessonTypes,
    inferred: noCards,
    // Beginner + intermediate must never see an unexpanded acronym (validation enforces it).
    expandAcronymsOnFirstUse: level !== "advanced",
    showTermPopovers: true,
    density,
    visualsRequested,
    explainSyntax,
    readingMode,
  };

  const intent: Intent = {
    learningGoal: inf.learningGoal,
    lessonFocus: inf.lessonFocus,
    mustCover: inf.mustCover ?? [],
  };

  const focus = profile.industry ? ` for **${profile.industry}**` : "";
  const shape =
    inf.lessonFocus === "compare_and_choose"
      ? "I'll compare the options and recommend one"
      : inf.lessonFocus === "how_to_build"
        ? "I'll lay out the build steps"
        : inf.lessonFocus === "understand_mechanism"
          ? "I'll explain how it works"
          : "I'll map out the landscape";
  return {
    profile,
    intent,
    messages: [
      {
        role: "assistant" as const,
        node: "Profiler",
        content: `**${level}** lesson on **${inf.topic}**${focus} — ${shape}. ${depth.replace("_", " + ")}, ${examples.replace("_", " + ")} examples.`,
      },
    ],
  };
}

// ============================================================================
// NODE 1.5 — retriever (RAG: pull grounding from the knowledge base)
// ============================================================================
export async function retriever(state: GraphStateType) {
  const intent = state.intent;
  const query = [state.profile?.topic, intent?.learningGoal, (intent?.mustCover ?? []).join(" "), state.userPrompt]
    .filter(Boolean)
    .join(" — ");
  const uploadIds = state.uploadIds ?? [];
  const referOnly = !!state.referOnly && hasUploads(uploadIds);

  // 1) the learner's own uploaded documents (prioritized; independent of the DB).
  let upSources: RetrievedSource[] = [];
  if (hasUploads(uploadIds)) {
    try {
      const hits = await retrieveFromUploads(query, uploadIds, 8);
      upSources = hits.map((h, i) => ({ sid: `U${i + 1}`, kbChunkId: "", title: h.title || "Your document", content: h.content, origin: "upload" as const }));
    } catch {
      /* ignore — fall back to KB / model knowledge */
    }
  }

  // 2) the shared knowledge base — skipped entirely when "refer only this" is on.
  let kbSources: RetrievedSource[] = [];
  let coverage = 0;
  if (!referOnly && ragEnabled()) {
    try {
      const r = await retrieve(query, 8);
      coverage = r.coverage;
      kbSources = r.chunks.map((c, i) => ({ sid: `S${i + 1}`, kbChunkId: c.id, title: c.title, url: c.url, content: c.content, asOfDate: c.asOfDate, origin: "kb" as const }));
    } catch {
      /* graceful: proceed with whatever we have */
    }
  }

  const sources = [...upSources, ...kbSources];
  const upTitles = getUploadTitles(uploadIds);
  const plural = upTitles.length > 1 ? "s" : "";
  let msg: string;
  if (referOnly) {
    msg = `Using **only your uploaded document${plural}** (${upTitles.join(", ")}) — I'll build the lesson strictly from these and cite them.`;
  } else if (upSources.length && kbSources.length) {
    msg = `Grounding in **your document${plural}** (${upTitles.join(", ")}) first, then **${kbSources.length} knowledge-base note(s)** (coverage ${Math.round(coverage * 100)}%). Your docs take priority; everything is cited.`;
  } else if (upSources.length) {
    msg = `Grounding in **your document${plural}** (${upTitles.join(", ")}). I'll cite them.`;
  } else if (kbSources.length) {
    msg = `Pulled **${kbSources.length} relevant notes** from the knowledge base (coverage ${Math.round(coverage * 100)}%). I'll ground the lesson in these and cite them.`;
  } else {
    msg = `No documents or close knowledge-base matches — using the model's own knowledge.`;
  }

  return { retrieved: sources, coverage, messages: [{ role: "assistant" as const, node: "Retriever", content: msg }] };
}

/** Pull the Blueprint JSON object out of a raw model response (tolerates a ```json fence
 *  or stray prose around it). Throws if no object / parse fails → caught as a repair retry. */
function extractJsonObject(text: string): unknown {
  let t = (text || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const a = t.indexOf("{");
  const b = t.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error("no JSON object found in model output");
  return JSON.parse(t.slice(a, b + 1));
}

/**
 * Normalize a RAW-parsed skeleton, then Zod-validate it. With raw parsing (vs the old
 * withStructuredOutput, which forced every required field) the model can omit a few
 * required arrays (termIds/citations/edges/…); we fill those safe defaults, inject the
 * app's resolved learnerProfile (the skeleton's echo is ignored anyway), then run
 * BlueprintSchema so the rest is validated + defaulted. A genuinely malformed object
 * throws → the architect's catch routes it to a repair retry.
 */
/** Recursively delete null-valued keys — the model emits `null` for optional fields it
 *  doesn't fill, but Zod `.optional()` accepts `undefined`, not `null`. */
function stripNulls<T>(v: T): T {
  if (Array.isArray(v)) return (v.map(stripNulls).filter((x) => x !== null) as unknown) as T;
  if (v && typeof v === "object") {
    const r = v as Record<string, unknown>;
    for (const k of Object.keys(r)) { if (r[k] === null) delete r[k]; else r[k] = stripNulls(r[k]); }
  }
  return v;
}

function coerceSkeleton(input: unknown, profile: LearnerProfile): Blueprint {
  const o = stripNulls((input && typeof input === "object" ? input : {}) as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
  o.schemaVersion = "1.0";
  o.meta = o.meta && typeof o.meta === "object" ? o.meta : {};
  o.meta.topic = o.meta.topic || profile.topic;
  o.meta.title = o.meta.title || profile.topic;
  o.learnerProfile = profile; // the app's resolved profile is authoritative
  o.mentalMap = o.mentalMap && typeof o.mentalMap === "object" ? o.mentalMap : {};
  o.mentalMap.nodes = Array.isArray(o.mentalMap.nodes) ? o.mentalMap.nodes : [];
  o.mentalMap.edges = Array.isArray(o.mentalMap.edges) ? o.mentalMap.edges : [];
  o.mentalMap.title = o.mentalMap.title || `${profile.topic} — the map`;
  o.mentalMap.oneLineThesis = o.mentalMap.oneLineThesis || o.meta.thesis || "";
  o.modules = Array.isArray(o.modules) ? o.modules : [];
  o.modules.forEach((m: Record<string, any>, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    m.id = m.id || `m${i + 1}`;
    m.order = typeof m.order === "number" ? m.order : i + 1;
    m.title = m.title || `Module ${i + 1}`;
    m.summary = m.summary || "";
    m.objectives = Array.isArray(m.objectives) ? m.objectives : [];
    m.termIds = Array.isArray(m.termIds) ? m.termIds : [];
    m.citations = Array.isArray(m.citations) ? m.citations : [];
    m.blocks = Array.isArray(m.blocks) ? m.blocks : [];
    m.loadState = m.loadState === "full" ? "full" : "stub";
  });
  // glossary / citations: the model often emits an ARRAY of {id,…}; the schema wants a
  // record keyed by id. Convert.
  const toRecord = (v: unknown): Record<string, any> => { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (Array.isArray(v)) { const r: Record<string, any> = {}; for (const it of v as any[]) if (it && it.id) r[it.id] = it; return r; } // eslint-disable-line @typescript-eslint/no-explicit-any
    return v && typeof v === "object" ? (v as Record<string, any>) : {}; // eslint-disable-line @typescript-eslint/no-explicit-any
  };
  o.glossary = toRecord(o.glossary);
  // DEFERRED DEFINITIONS: the overview architect now emits glossary terms with an EMPTY
  // laymanDefinition (the real definitions are written during the build, in parallel). Ensure the
  // required field exists so the draft validates; writeOverviewProse fills the empties later.
  for (const k of Object.keys(o.glossary)) {
    const g = o.glossary[k];
    if (!g || typeof g !== "object") { delete o.glossary[k]; continue; }
    if (!g.id) g.id = k;
    if (!g.label) g.label = k;
    if (typeof g.laymanDefinition !== "string") g.laymanDefinition = "";
  }
  // citations: the writer (esp. Sonnet) sometimes emits bare entries missing the schema-required
  // id/kind/title — the app REFILLS these from retrieved sources right after, so don't fail the
  // whole parse over them; fill safe defaults (or drop a hopeless entry).
  o.citations = toRecord(o.citations);
  for (const k of Object.keys(o.citations)) {
    const c = o.citations[k];
    if (!c || typeof c !== "object") { delete o.citations[k]; continue; }
    if (!c.id) c.id = k;
    if (!["kb", "liveSearch", "canonical", "upload"].includes(c.kind)) c.kind = "canonical";
    if (!c.title || typeof c.title !== "string") c.title = c.label || c.url || k;
  }
  o.synthesis = o.synthesis && typeof o.synthesis === "object" ? o.synthesis : {};
  // recap: string → rich text nodes; array stays.
  if (typeof o.synthesis.recap === "string") o.synthesis.recap = o.synthesis.recap.trim() ? [{ t: "p", spans: [{ text: o.synthesis.recap }] }] : undefined;
  // buildOrder: ["step a", …] → [{step,label}]; checklist: ["…"] → [{id,label}].
  o.synthesis.buildOrder = (Array.isArray(o.synthesis.buildOrder) ? o.synthesis.buildOrder : []).map((b: any, i: number) => // eslint-disable-line @typescript-eslint/no-explicit-any
    typeof b === "string" ? { step: i + 1, label: b } : { step: typeof b?.step === "number" ? b.step : i + 1, label: b?.label ?? String(b ?? ""), detail: b?.detail });
  o.synthesis.checklist = (Array.isArray(o.synthesis.checklist) ? o.synthesis.checklist : []).map((c: any, i: number) => // eslint-disable-line @typescript-eslint/no-explicit-any
    typeof c === "string" ? { id: `c${i + 1}`, label: c } : { id: c?.id ?? `c${i + 1}`, label: c?.label ?? String(c ?? ""), fromModuleId: c?.fromModuleId });
  // capstone.prompt is REQUIRED by the schema. The model sometimes returns a capstone object
  // WITHOUT prompt (e.g. just {scopedTo}) — the old guard only defaulted a wholly-missing
  // capstone, so a present-but-promptless one slipped through and failed validation ("synthesis.
  // capstone.prompt — Required") → no blueprint → "Couldn't design an overview". Always fill it.
  const cap = (o.synthesis.capstone && typeof o.synthesis.capstone === "object" ? o.synthesis.capstone : {}) as Record<string, unknown>;
  if (typeof cap.prompt !== "string" || !(cap.prompt as string).trim()) cap.prompt = `Apply what you learned to ${profile.buildGoal || profile.topic}.`;
  o.synthesis.capstone = cap;
  const parsed = BlueprintSchema.safeParse(o);
  if (!parsed.success) throw new Error("skeleton shape invalid: " + parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".")} — ${i.message}`).join("; "));
  return parsed.data;
}

// ============================================================================
// NODE 1.7 — planner (OPUS: design the STRUCTURE only; the architect/writer adds the prose)
// ============================================================================
export async function planner(state: GraphStateType, config: RunnableConfig) {
  const p = state.profile!;
  const intent = state.intent;
  const sources = state.retrieved ?? [];
  let plan: unknown = null;
  try {
    const raw = await withOverloadRetry(() =>
      plannerLLM.invoke(
        [
          new SystemMessage(PLANNER_SYSTEM),
          new HumanMessage(
            plannerUserPrompt({
              topic: p.topic,
              level: p.level,
              depth: p.depth,
              examples: p.examples,
              industry: p.industry,
              buildGoal: p.buildGoal,
              objective: p.objective,
              levels: p.levels,
              lessonTypes: p.lessonTypes,
              userPrompt: state.userPrompt,
              learningGoal: intent?.learningGoal,
              lessonFocus: intent?.lessonFocus,
              mustCover: intent?.mustCover,
              sources: sources.map((s) => ({ sid: s.sid, title: s.title, content: s.content, origin: s.origin })),
            })
          ),
        ],
        config
      )
    );
    const text = typeof raw.content === "string" ? raw.content : Array.isArray(raw.content) ? raw.content.map((c) => (typeof c === "object" && c && "text" in c ? (c as { text: string }).text : "")).join("") : String(raw.content);
    plan = extractJsonObject(text);
  } catch (err) {
    // Graceful: if the planner fails, the architect (Sonnet) plans + writes in one call.
    console.warn("[planner] failed — architect will plan + write in one:", (err as Error).message?.slice(0, 160));
    plan = null;
  }
  return {
    plan,
    messages: [{ role: "assistant" as const, node: "Planner", content: "Mapped out the lesson structure…" }],
  };
}

// ============================================================================
// NODE 2 — architect (WRITES the SKELETON's prose, following the planner's structure)
// ============================================================================
export async function architect(state: GraphStateType, config: RunnableConfig) {
  const p = state.profile!;
  const intent = state.intent;
  const sources = state.retrieved ?? [];
  const repairErrors = state.validation && !state.validation.ok ? state.validation.errors : undefined;

  // ---- Generate the SKELETON in one small call (map + module stubs + glossary) ----
  // We call Opus RAW (not .withStructuredOutput) and parse the JSON ourselves: langchain's
  // structured-output tool-call path truncates (non-streaming) / double-encodes (streaming)
  // large Blueprints on Opus 4.8, whereas the raw text response is clean, compact JSON. The
  // SKELETON_SYSTEM prompt already demands a single DATA-ONLY Blueprint object. validateBlueprint
  // below still enforces the shape (Zod), so an off-shape parse routes through the repair edge.
  let candidate: Blueprint;
  try {
    // Ride out a transient Anthropic 529/overload on the Opus skeleton rather than failing the overview.
    const raw = await withOverloadRetry(() => skeletonLLM.invoke(
      [
        new SystemMessage(SKELETON_SYSTEM),
        new HumanMessage(
          architectUserPrompt({
            topic: p.topic,
            level: p.level,
            depth: p.depth,
            examples: p.examples,
            density: p.density,
            visualsRequested: p.visualsRequested,
            explainSyntax: p.explainSyntax,
            industry: p.industry,
            buildGoal: p.buildGoal,
            objective: p.objective,
            levels: p.levels,
            lessonTypes: p.lessonTypes,
            framework: p.framework,
            role: p.role,
            aspiringRole: p.aspiringRole,
            personalGoal: state.userProfile?.personalGoal,
            userPrompt: state.userPrompt,
            learningGoal: intent?.learningGoal,
            lessonFocus: intent?.lessonFocus,
            mustCover: intent?.mustCover,
            sources: sources.map((s) => ({ sid: s.sid, title: s.title, content: s.content, asOfDate: s.asOfDate, origin: s.origin })),
            plan: state.plan,
            repairErrors,
          })
        ),
      ],
      config
    ));
    const text = typeof raw.content === "string" ? raw.content : Array.isArray(raw.content) ? raw.content.map((c) => (typeof c === "object" && c && "text" in c ? (c as { text: string }).text : "")).join("") : String(raw.content);
    candidate = coerceSkeleton(extractJsonObject(text), p);
  } catch (err) {
    console.warn("[architect] skeleton generation failed:", (err as Error).message?.slice(0, 200));
    return {
      validation: { ok: false, errors: ["The previous outline was incomplete/invalid. Return a COMPLETE Blueprint OUTLINE with ALL fields, 4–5 modules, every module's blocks EMPTY ([]) and loadState \"stub\"; keep it tight."] },
      reviseCount: (state.reviseCount ?? 0) + 1,
      messages: [{ role: "assistant" as const, node: "Architect", content: "Outline was incomplete — retrying…" }],
    };
  }

  candidate.learnerProfile = { ...candidate.learnerProfile, ...p };
  // Merge retrieved sources into citations so any [S#]/[U#] resolves + shows in Sources,
  // tagged by origin (the learner's upload vs the shared KB).
  candidate.citations = candidate.citations ?? {};
  for (const s of sources) {
    candidate.citations[s.sid] =
      s.origin === "upload"
        ? { id: s.sid, kind: "upload", title: s.title || "Your document" }
        : { id: s.sid, kind: "kb", title: s.title || "Knowledge base note", kbChunkId: s.kbChunkId, url: s.url, asOfDate: s.asOfDate };
  }
  // Provenance → drives the lesson's "what came from where" banner.
  const uploadTitles = getUploadTitles(state.uploadIds);
  if (uploadTitles.length) {
    candidate.meta.usedUpload = true;
    candidate.meta.referOnly = !!state.referOnly;
    candidate.meta.uploadTitles = uploadTitles;
  }

  // ---- repair (deterministic) → validate → ship ----
  const repaired = repairBlueprint(candidate as Blueprint);
  // Defensively force every module to a stub — block bodies are written later
  // (seedFirstModule for Module 1, runDeepDive on demand for the rest).
  for (const m of repaired.modules) {
    m.blocks = [];
    m.loadState = "stub";
  }
  const result = validateBlueprint(repaired);
  const blueprint = result.blueprint ?? repaired;
  if (!result.ok) console.warn("[architect] gates failing after auto-repair:", result.errors);

  const note = result.ok
    ? `Outlined **${blueprint.modules.length} building blocks** + a mental map (${Object.keys(blueprint.glossary).length} terms), grounded in ${sources.length} source(s). Writing the first one…`
    : `Outline needs fixes (${result.errors.length}) — repairing…`;

  return {
    blueprint,
    validation: { ok: result.ok, errors: result.errors },
    reviseCount: (state.reviseCount ?? 0) + 1,
    messages: [{ role: "assistant" as const, node: "Architect", content: note }],
  };
}

/** Conditional edge after architect: repair once on failure, else seed Module 1. */
export function routeAfterArchitect(state: GraphStateType): "architect" | "seedFirstModule" {
  if (state.validation?.ok) return "seedFirstModule";
  if ((state.reviseCount ?? 0) < 2) return "architect"; // one repair attempt
  return "seedFirstModule"; // ship best-effort rather than fail outright
}

// ============================================================================
// runDeepDive — write ONE module's blocks (used for Module 1 up front + lazily
// for the rest via POST /api/module). Mutates `bp` in place (fills the module's
// blocks + flips loadState to "full") and returns the focused sources used.
// ============================================================================
export async function runDeepDive(
  bp: Blueprint,
  moduleId: string,
  opts: { uploadIds?: string[]; referOnly?: boolean; config?: RunnableConfig } = {}
): Promise<{ ok: boolean; sources: RetrievedSource[] }> {
  const module = bp.modules.find((m) => m.id === moduleId);
  if (!module) return { ok: false, sources: [] };
  const p = bp.learnerProfile;
  const config = opts.config;
  const referOnly = !!opts.referOnly && hasUploads(opts.uploadIds);

  // Focused retrieval — sharper than the whole-topic pass (module title + its terms).
  const termLabels = module.termIds.map((id) => bp.glossary[id]?.label).filter(Boolean).join(" ");
  const query = [bp.meta.topic, module.title, termLabels].filter(Boolean).join(" — ");

  // The learner's uploads come FIRST (prioritized); the KB is appended unless referOnly.
  let sources: RetrievedSource[] = [];
  if (hasUploads(opts.uploadIds)) {
    try {
      const hits = await retrieveFromUploads(query, opts.uploadIds, 6);
      sources = hits.map((h, i) => ({ sid: `U${i + 1}`, kbChunkId: "", title: h.title || "Your document", content: h.content, origin: "upload" as const }));
    } catch {
      /* ignore */
    }
  }
  if (!referOnly && ragEnabled()) {
    try {
      const { chunks } = await retrieve(query, 6);
      sources = sources.concat(chunks.map((c, i) => ({ sid: `S${i + 1}`, kbChunkId: c.id, title: c.title, url: c.url, content: c.content, asOfDate: c.asOfDate, origin: "kb" as const })));
    } catch {
      /* graceful: no sources → model's own knowledge */
    }
  }

  // The modules BEFORE this one (by spine order) — lets the body SPACE/INTERLEAVE
  // retrieval of an earlier concept instead of massing all recall at the end.
  const priorModules = bp.modules
    .filter((x) => x.order < module.order)
    .sort((a, b) => a.order - b.order)
    .map((x) => ({ order: x.order, title: x.title, terms: (x.termIds ?? []).map((id) => bp.glossary[id]?.label).filter((t): t is string => !!t) }));
  // PROMPT CACHING (B3): MODULE_SYSTEM (~7k tok) is byte-identical across all ~5 module calls, so
  // mark it cacheable — module 1 WRITES the cache, modules 2..N READ it (runBuildJob builds module 1
  // first, then fans out, so the cached prefix exists before the wave). The stable ModuleBlocksSchema
  // tool definition caches alongside it (tools→system prefix). Verify via the [module-cache] log.
  const messages = [
    new SystemMessage({ content: [{ type: "text", text: MODULE_SYSTEM, cache_control: { type: "ephemeral" } }] }),
    new HumanMessage(
      moduleUserPrompt({
        moduleTitle: module.title,
        moduleSummary: module.summary,
        objectives: module.objectives,
        decisionItForces: module.decisionItForces,
        level: p.level,
        depth: p.depth,
        examples: p.examples,
        density: p.density,
        visualsRequested: p.visualsRequested,
        explainSyntax: p.explainSyntax,
        industry: p.industry,
        buildGoal: p.buildGoal,
        objective: p.objective,
        levels: p.levels,
        lessonTypes: p.lessonTypes,
        framework: p.framework,
        role: p.role,
        aspiringRole: p.aspiringRole,
        lessonTopic: bp.meta.topic,
        thisOrder: module.order,
        totalModules: bp.modules.length,
        priorModules,
        glossary: Object.entries(bp.glossary).map(([id, t]) => ({ id, label: t.label })),
        sources: sources.map((s) => ({ sid: s.sid, title: s.title, content: s.content, origin: s.origin })),
      })
    ),
  ];
  // Retry transient failures with backoff. The two common causes need OPPOSITE waits:
  //  - Anthropic 529 "Overloaded" / 429 rate-limit: an API-side capacity/throttle window
  //    that typically clears in ~30-90s. A fast burn of 3 quick retries (the old ~3s total)
  //    just guarantees the WHOLE build fails during an overload — so ride it out with long,
  //    JITTERED backoff. (Jitter also de-syncs parallel module builds so they don't all
  //    re-hammer the API on the same beat.)
  //  - an occasional malformed structured-output / empty result: retry quickly.
  // Each module is its own small call, so no token-wall risk from extra attempts.
  const isOverloadOrRate = (m: string) =>
    /overloaded|529|rate.?limit|\b429\b|too many requests/i.test(m);
  const OVERLOAD_BACKOFF_MS = [2000, 5000, 12000, 25000, 40000]; // ~84s total across the waits
  const MAX_ATTEMPTS = 6;
  let blocks: Block[] = [];
  let nodeMeta: { what?: string; relevance?: string; laymanExplanation?: string } | undefined;
  let lastErr = "";
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      // includeRaw so we can read usage (cache hit telemetry) off the raw AIMessage; the parsed
      // structured object is unchanged.
      const out = await moduleLLM.withStructuredOutput(ModuleBlocksSchema, { name: "module_blocks", includeRaw: true }).invoke(messages, config ?? {});
      // B3 cache telemetry: confirm modules 2..N READ the cached MODULE_SYSTEM (+ tool) prefix.
      try {
        const u = (out.raw as { response_metadata?: { usage?: Record<string, number> } })?.response_metadata?.usage;
        if (u) console.log(`[module-cache] "${moduleId}": cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} input=${u.input_tokens ?? 0} output=${u.output_tokens ?? 0}`);
      } catch { /* telemetry only — never affect the build */ }
      const parsed = out.parsed as { blocks?: Block[]; nodeMeta?: typeof nodeMeta };
      blocks = (parsed.blocks as Block[]) ?? [];
      nodeMeta = parsed.nodeMeta;
      if (blocks.length) break;
      lastErr = "model returned no blocks";
    } catch (err) {
      lastErr = (err as Error).message?.slice(0, 200) || "error";
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      const base = isOverloadOrRate(lastErr) ? (OVERLOAD_BACKOFF_MS[attempt] ?? 40000) : 900 * (attempt + 1);
      const wait = base + Math.floor(base * 0.3 * Math.random()); // +0-30% jitter
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  if (!blocks.length) {
    console.warn(`[runDeepDive] module "${moduleId}" failed after ${MAX_ATTEMPTS} attempts:`, lastErr);
    return { ok: false, sources };
  }

  // GATE: question/quiz blocks ONLY when the learner asked for a Knowledge check.
  // The model sometimes emits a selfCheckQuiz "when useful" regardless; this is the
  // hard, deterministic guarantee that no quiz appears unless lessonType includes it.
  const wantsKnowledgeCheck = (p.lessonTypes ?? []).includes("knowledge_check");
  if (!wantsKnowledgeCheck) {
    const noQuiz = blocks.filter((b) => b.kind !== "selfCheckQuiz" && b.kind !== "knowledgeCheck");
    if (noQuiz.length) blocks = noQuiz; // keep at least one block if the model returned only a quiz
  }

  // Tier-A retention: deterministically stamp each knowledgeCheck question with its source
  // module id, so the lesson's feedback can link back to where it was taught (regardless of
  // whether the model set it). Safe no-op when there are no knowledgeCheck blocks.
  for (const b of blocks) {
    if (b.kind === "knowledgeCheck") for (const q of b.questions) q.sourceModuleId = q.sourceModuleId || moduleId;
  }

  // Merge focused sources into citations so any [S#]/[U#] in the new blocks resolves,
  // tagged by origin (upload vs KB).
  bp.citations = bp.citations ?? {};
  for (const s of sources) {
    bp.citations[s.sid] =
      s.origin === "upload"
        ? { id: s.sid, kind: "upload", title: s.title || "Your document" }
        : { id: s.sid, kind: "kb", title: s.title || "Knowledge base note", kbChunkId: s.kbChunkId, url: s.url, asOfDate: s.asOfDate };
  }
  module.blocks = blocks;
  module.loadState = "full";
  // Populate this module's overview-node detail lines (the slim skeleton omits them).
  const ovNode = bp.mentalMap.nodes.find((n) => n.moduleId === moduleId);
  if (ovNode && nodeMeta) {
    if (nodeMeta.what && !ovNode.what) ovNode.what = nodeMeta.what;
    if (nodeMeta.relevance && !ovNode.relevance) ovNode.relevance = nodeMeta.relevance;
    if (nodeMeta.laymanExplanation && !ovNode.laymanExplanation) ovNode.laymanExplanation = nodeMeta.laymanExplanation;
  }
  // Deterministic repair fixes dangling term/citation refs + matrix alignment for
  // the freshly-written module (operates on the whole bp; stub modules are no-ops).
  repairBlueprint(bp);
  // Density enforcement (RULE 2): verify the prose against the tier; repair the
  // over-ceiling sentences in one pass; log any residual (never block on it).
  // A2 — only run the (extra LLM) repair when prose is MEANINGFULLY over the tier, not on a
  // stray long sentence or two. The old `overCeiling > 0` fired on essentially every module,
  // adding a second serial Sonnet call (~7-24s) each time. Trigger now: ≥3 over-ceiling
  // sentences OR ≥25% of the module's sentences over. (Density is a verbosity knob, not
  // correctness — a slightly-long sentence isn't worth doubling the build time.)
  try {
    const dstats = measureModule(module, p.density);
    if (dstats.overCeiling >= 3 || dstats.pctOver >= 0.25) {
      const { repaired, residual } = await repairDensity(bp, moduleId, p.density, config);
      if (residual > 0) console.warn(`[density] "${moduleId}" (${p.density}): ${residual} sentence(s) over ceiling after repairing ${repaired} block(s)`);
      repairBlueprint(bp); // re-fix any refs the rewrite touched
    }
  } catch { /* never block on density */ }
  return { ok: true, sources };
}

// ============================================================================
// writeOverviewProse — fills the glossary DEFINITIONS + SYNTHESIS that the overview
// architect now DEFERS (they're never shown in the free preview). Runs during the BUILD,
// in parallel with the module bodies. Idempotent: only fills EMPTY definitions / a missing
// synthesis, so re-runs and old (full) drafts are left untouched. Mutates `bp` in place.
// ============================================================================
const OverviewProseSchema = z.object({
  glossary: z.array(z.object({ id: z.string(), definition: z.string(), acronymExpansion: z.string().optional() })).default([]),
  recap: z.string().default(""),
  buildOrder: z.array(z.object({ step: z.number(), label: z.string() })).default([]),
  checklist: z.array(z.object({ label: z.string() })).default([]),
  capstonePrompt: z.string().default(""),
  capstoneNext: z.string().optional(),
});

export async function writeOverviewProse(bp: Blueprint, opts: { config?: RunnableConfig } = {}): Promise<void> {
  const p = bp.learnerProfile;
  const config = opts.config;
  // Terms whose definition is still empty (the deferred ones).
  const needDefs = Object.entries(bp.glossary).filter(([, t]) => !((t.laymanDefinition as string) || "").trim());
  const syn = bp.synthesis as { recap?: unknown; buildOrder?: unknown[] } | undefined;
  const needSynthesis = !(syn?.buildOrder && syn.buildOrder.length) && !syn?.recap;
  if (!needDefs.length && !needSynthesis) return; // already filled (old draft / re-run)

  const out = await withOverloadRetry(() =>
    moduleLLM.withStructuredOutput(OverviewProseSchema, { name: "overview_prose" }).invoke(
      [
        new SystemMessage(OVERVIEW_PROSE_SYSTEM),
        new HumanMessage(
          overviewProseUserPrompt({
            topic: bp.meta.topic,
            level: p.level,
            density: p.density,
            buildGoal: p.buildGoal,
            objective: p.objective,
            terms: needDefs.map(([id, t]) => ({ id, label: t.label })),
            modules: bp.modules.map((m) => ({ order: m.order, title: m.title, decisionItForces: m.decisionItForces })),
            needSynthesis,
          })
        ),
      ],
      config ?? {}
    )
  ).catch((err: unknown) => {
    console.warn("[overview-prose] failed:", (err instanceof Error ? err.message : String(err)).slice(0, 160));
    return null;
  });
  if (!out) return;

  // Merge glossary definitions (only fill empties).
  for (const g of out.glossary ?? []) {
    const entry = bp.glossary[g.id];
    if (!entry) continue;
    if (!((entry.laymanDefinition as string) || "").trim() && g.definition?.trim()) entry.laymanDefinition = g.definition.trim();
    if (g.acronymExpansion && !entry.acronymExpansion) entry.acronymExpansion = g.acronymExpansion;
  }
  // Merge synthesis (only when it was empty).
  if (needSynthesis) {
    const s = (bp.synthesis = bp.synthesis ?? ({} as Blueprint["synthesis"]));
    const recap = (out.recap ?? "").trim();
    const buildOrder = out.buildOrder ?? [];
    const checklist = out.checklist ?? [];
    const capstonePrompt = (out.capstonePrompt ?? "").trim();
    if (recap) s.recap = [{ t: "p", spans: [{ text: recap }] }];
    if (buildOrder.length) s.buildOrder = buildOrder;
    if (checklist.length) s.checklist = checklist.map((c, i) => ({ id: `c${i + 1}`, label: c.label }));
    if (capstonePrompt) s.capstone = { prompt: capstonePrompt + (out.capstoneNext?.trim() ? ` Next: ${out.capstoneNext.trim()}` : "") };
  }
  repairBlueprint(bp); // re-resolve any term/citation refs the new prose touched
}

// ============================================================================
// NODE 2.5 — seedFirstModule (write Module 1's blocks so the first screen is readable)
// ============================================================================
export async function seedFirstModule(state: GraphStateType, config: RunnableConfig) {
  const bp = state.blueprint;
  if (!bp || !bp.modules.length) return {};
  const first = bp.modules[0];
  const { ok } = await runDeepDive(bp, first.id, { uploadIds: state.uploadIds, referOnly: state.referOnly, config });
  return {
    blueprint: bp,
    messages: [
      {
        role: "assistant" as const,
        node: "Builder",
        content: ok
          ? `First building block ready: **${first.title}**. The rest build in the background while you read.`
          : `Showing the overview; building blocks load as you open them.`,
      },
    ],
  };
}

// ============================================================================
// NODE 3 — composer (render + register the artifact)
// ============================================================================
export async function composer(state: GraphStateType) {
  const bp = state.blueprint;
  // Guard: if every architect attempt failed to produce a parseable Blueprint,
  // surface a friendly error instead of crashing on a null.
  if (!bp) {
    return {
      messages: [
        {
          role: "assistant" as const,
          node: "Composer",
          content: "⚠️ I couldn't assemble a complete lesson this time. Please try again, or narrow the topic a little.",
        },
      ],
    };
  }
  // Store the Blueprint with the artifact so POST /api/module can build the
  // remaining modules on demand (and /full can eagerly finish them). Persisted to
  // the DB (durable across restarts) and scoped to the owning user for the dashboard.
  const ref = await registerArtifact({
    kind: "learning-artifact",
    title: bp.meta.title,
    html: renderArtifact(bp),
    blueprint: bp,
    uploadIds: state.uploadIds,
    referOnly: state.referOnly,
    userId: state.userId || undefined,
    userEmail: state.userEmail || undefined,
    prompt: state.userPrompt,
    cards: state.cards,
    profile: bp.learnerProfile,
  });

  const caveat = state.validation && !state.validation.ok ? " (a couple of polish items remain)" : "";
  return {
    artifacts: [ref],
    messages: [
      {
        role: "assistant" as const,
        node: "Composer",
        content: `Your interactive lesson is ready on the right${caveat}. Start at the **mental map**; the first block is written and the rest fill in as you read. Every underlined term has an **(i)** definition.`,
      },
    ],
  };
}
