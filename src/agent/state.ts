/**
 * # Graph state — the shared object that flows through the generation pipeline
 *
 * Same pattern as the SEO agent: `Annotation.Root` declares named "channels".
 * Each node returns only the fields it changes; LangGraph merges them with each
 * channel's reducer (replace, or append for the lists).
 */

import { Annotation } from "@langchain/langgraph";
import type { Blueprint } from "../render/schema";
import type { z } from "zod";
import type { LearnerProfileSchema } from "../render/schema";

/** The resolved learner profile (level/depth/examples/industry/…). */
export type LearnerProfile = z.infer<typeof LearnerProfileSchema>;

/** One chat bubble shown in the left column. */
export interface ChatMessage {
  role: "assistant" | "user";
  node: string;
  content: string;
}

/** A reference to the generated artifact (the chat links to it; viewer loads it). */
export interface ArtifactRef {
  id: string;
  kind: string;
  title: string;
}

/** Result of running the deterministic validation gates over a Blueprint. */
export interface ValidationState {
  ok: boolean;
  errors: string[];
}

/** The learner's PRECISE ask — what shapes the lesson so it answers the question. */
export interface Intent {
  /** One sentence: what they want to be able to do / decide afterward. */
  learningGoal: string;
  /** How the lesson should be shaped, e.g. "compare_and_choose", "understand_mechanism", "how_to_build", "survey". */
  lessonFocus: string;
  /** The specific things the lesson MUST center on (e.g. the named frameworks to compare). */
  mustCover: string[];
}

/** A source retrieved for this generation. `origin` distinguishes the learner's own
 *  upload ("U1", "U2", …) from the shared knowledge base ("S1", "S2", …). */
export interface RetrievedSource {
  sid: string; // "S1" (kb) or "U1" (upload)
  kbChunkId: string;
  title?: string;
  url?: string;
  content: string;
  asOfDate?: string;
  origin?: "kb" | "upload";
}

/** Append (don't replace) — for the message + artifact lists. */
function appendReducer<T>(existing: T[] | undefined, incoming: T[] | undefined): T[] {
  return [...(existing ?? []), ...(incoming ?? [])];
}

export const GraphState = Annotation.Root({
  // ---- inputs ----
  userPrompt: Annotation<string>(),
  cards: Annotation<Partial<{ level: string; depth: string; examples: string; density: string; visuals: string; syntax: string }>>({
    reducer: (_o, n) => n ?? _o,
    default: () => ({}),
  }),
  // The learner's uploaded documents for this generation + whether to use ONLY them.
  uploadIds: Annotation<string[]>({ reducer: (_o, n) => n ?? _o, default: () => [] }),
  referOnly: Annotation<boolean>({ reducer: (_o, n) => n ?? _o ?? false, default: () => false }),

  // Explicit landing-form context (Phase 1). Open-text fields + multi-selects that
  // override / augment what the Profiler infers.
  industry: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),
  buildGoal: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),
  // Landing "Objective" — the learner's PURPOSE (learning / learn_and_apply / build /
  // exam_prep / interview_prep / other). Curates emphasis; the Profiler validates it.
  objective: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),
  levels: Annotation<string[]>({ reducer: (_o, n) => n ?? _o, default: () => [] }),
  lessonTypes: Annotation<string[]>({ reducer: (_o, n) => n ?? _o, default: () => [] }),
  // Landing "Reading" preference: "vertical" (default) or "horizontal". Renderer-only.
  readingMode: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),
  // Phase 2: code-example framework + the learner's saved sign-up profile (role/aspiring
  // role/personal goal/industry) so every lesson is personalized to who they are.
  framework: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),
  userProfile: Annotation<{ role?: string; aspiringRole?: string; personalGoal?: string; industry?: string }>({
    reducer: (_o, n) => n ?? _o,
    default: () => ({}),
  }),

  // Ownership — so the composer persists the lesson against the right user.
  userId: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),
  userEmail: Annotation<string>({ reducer: (_o, n) => n ?? _o, default: () => "" }),

  // ---- produced by the nodes ----
  profile: Annotation<LearnerProfile | null>({ reducer: (_o, n) => n ?? _o, default: () => null }),
  intent: Annotation<Intent | null>({ reducer: (_o, n) => n ?? _o, default: () => null }),
  retrieved: Annotation<RetrievedSource[]>({ reducer: (_o, n) => n ?? _o, default: () => [] }),
  coverage: Annotation<number>({ reducer: (_o, n) => n ?? _o ?? 0, default: () => 0 }),
  blueprint: Annotation<Blueprint | null>({ reducer: (_o, n) => n ?? _o, default: () => null }),
  validation: Annotation<ValidationState | null>({ reducer: (_o, n) => n ?? _o, default: () => null }),
  reviseCount: Annotation<number>({ reducer: (_o, n) => n ?? _o ?? 0, default: () => 0 }),

  // ---- accumulated for the UI ----
  messages: Annotation<ChatMessage[]>({ reducer: appendReducer, default: () => [] }),
  artifacts: Annotation<ArtifactRef[]>({ reducer: appendReducer, default: () => [] }),
});

export type GraphStateType = typeof GraphState.State;
