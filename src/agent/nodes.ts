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
import { makeLLM } from "./llm";
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
import { PROFILER_SYSTEM, SKELETON_SYSTEM, MODULE_SYSTEM, architectUserPrompt, moduleUserPrompt } from "./prompts";
import { retrieve } from "../rag/retrieve";
import { ragEnabled } from "../lib/db";
import { hasUploads, getUploadTitles, retrieveFromUploads } from "../lib/uploads";
import type { Intent, RetrievedSource } from "./state";

const profilerLLM = makeLLM("sonnet", 0);
// PROGRESSIVE GENERATION (the latency fix):
//   architect → SKELETON ONLY (mental map w/ what+relevance + module STUBS + a
//   12–18 term glossary + synthesis). No block bodies, so far smaller than the old
//   monolithic call — but the glossary + synthesis + per-node what/relevance still
//   need real headroom; 8000 truncated. 16000 is the SDK's non-streaming-safe ceiling.
const skeletonLLM = makeLLM("sonnet", 0.2, { maxTokens: 16000 });
// Each module's blocks are written by a SEPARATE small call (Module 1 up front in
// seedFirstModule; the rest on demand via runDeepDive / POST /api/module). streaming
// keeps us safe if a visuals+syntax+high-density module runs long.
const moduleLLM = makeLLM("sonnet", 0.3, { maxTokens: 8000, streaming: true });

/** Structured-output shape for one module's body: just the blocks array. */
const ModuleBlocksSchema = z.object({ blocks: z.array(BlockSchema) });

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
  const inf = await profilerLLM
    .withStructuredOutput(InferenceSchema, { name: "infer" })
    .invoke([new SystemMessage(PROFILER_SYSTEM), new HumanMessage(state.userPrompt)], config);

  // Starter cards win; otherwise the model's inference; otherwise the MOST detailed default.
  const level = (cards.level as LearnerProfile["level"]) || inf.level || "beginner";
  const depth = (cards.depth as LearnerProfile["depth"]) || inf.depth || "conceptual_technical";
  const examples = (cards.examples as LearnerProfile["examples"]) || inf.examples || "functional_code";
  const noCards = !(cards.level && cards.depth && cards.examples);

  // New landing controls (all optional; sensible defaults preserve old behaviour).
  const density = (["low", "medium", "high"].includes(cards.density as string) ? cards.density : "medium") as LearnerProfile["density"];
  const visualsRequested = cards.visuals === "on";
  const explainSyntax = cards.syntax === "on";

  const profile: LearnerProfile = {
    level,
    depth,
    examples,
    topic: inf.topic,
    industry: inf.industry,
    buildGoal: inf.buildGoal,
    inferred: noCards,
    // Beginner + intermediate must never see an unexpanded acronym (validation enforces it).
    expandAcronymsOnFirstUse: level !== "advanced",
    showTermPopovers: true,
    density,
    visualsRequested,
    explainSyntax,
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

// ============================================================================
// NODE 2 — architect (produce + validate the SKELETON: stubs only, no block bodies)
// ============================================================================
export async function architect(state: GraphStateType, config: RunnableConfig) {
  const p = state.profile!;
  const intent = state.intent;
  const sources = state.retrieved ?? [];
  const repairErrors = state.validation && !state.validation.ok ? state.validation.errors : undefined;

  // ---- Generate the SKELETON in one small call (map + module stubs + glossary) ----
  let candidate;
  try {
    candidate = await skeletonLLM.withStructuredOutput(BlueprintSchema, { name: "blueprint" }).invoke(
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
            userPrompt: state.userPrompt,
            learningGoal: intent?.learningGoal,
            lessonFocus: intent?.lessonFocus,
            mustCover: intent?.mustCover,
            sources: sources.map((s) => ({ sid: s.sid, title: s.title, content: s.content, asOfDate: s.asOfDate, origin: s.origin })),
            repairErrors,
          })
        ),
      ],
      config
    );
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

  let blocks: Block[] = [];
  try {
    const out = await moduleLLM.withStructuredOutput(ModuleBlocksSchema, { name: "module_blocks" }).invoke(
      [
        new SystemMessage(MODULE_SYSTEM),
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
            glossary: Object.entries(bp.glossary).map(([id, t]) => ({ id, label: t.label })),
            sources: sources.map((s) => ({ sid: s.sid, title: s.title, content: s.content, origin: s.origin })),
          })
        ),
      ],
      config ?? {}
    );
    blocks = out.blocks as Block[];
  } catch (err) {
    console.warn(`[runDeepDive] module "${moduleId}" compose failed:`, (err as Error).message?.slice(0, 160));
    return { ok: false, sources };
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
  // Deterministic repair fixes dangling term/citation refs + matrix alignment for
  // the freshly-written module (operates on the whole bp; stub modules are no-ops).
  repairBlueprint(bp);
  return { ok: true, sources };
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
  // remaining modules on demand (and /full can eagerly finish them).
  const ref = registerArtifact({ kind: "learning-artifact", title: bp.meta.title, html: renderArtifact(bp), blueprint: bp, uploadIds: state.uploadIds, referOnly: state.referOnly });

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
