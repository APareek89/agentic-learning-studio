/**
 * # Calibration — the TUNABLE knobs for LEVEL (scaffolding) and DENSITY (prose shape)
 *
 * Two governing rules drive this file:
 *
 *  RULE 1 — LEVEL IS SCAFFOLDING, NOT DEPTH. Tiers differ by how much cognitive
 *  support is given, never by raw depth or word count. "Advanced" means LESS
 *  hand-holding + higher-order focus (edge cases, failure modes, tradeoffs) — NOT
 *  more/denser content (explaining what an expert already knows degrades the lesson
 *  — the expertise-reversal effect). Each tier encodes operational, checkable
 *  differences (prior knowledge, vocabulary, example type, what to OMIT, question type).
 *
 *  RULE 2 — DENSITY IS ENFORCED IN CODE, NOT TRUSTED TO THE PROMPT. An autoregressive
 *  model can't count its own tokens mid-generation, so a prompt-only density rule
 *  drifts. We define each tier by COUNTABLE STRUCTURE (sentences/concept, per-sentence
 *  word median + hard ceiling, paragraph shape) and VERIFY it post-generation
 *  (see density.ts), repairing only the offending blocks. Density is PER-CONCEPT;
 *  total length scales with concept count — we never fix a global word total.
 *
 * Everything here is config, not prose buried in a prompt — tune freely.
 */

export type Level = "beginner" | "intermediate" | "advanced";
export type Density = "low" | "medium" | "high";

export interface DensitySpec {
  label: string;
  /** soft guidance: sentences per distinct concept */
  sentencesPerConcept: number;
  /** target MEDIAN words per sentence (not a per-sentence rule) */
  medianSentenceWords: number;
  /** hard per-sentence ceiling — sentences above this are violations to repair */
  hardCeilingWords: number;
  /** paragraph shape: max sentences before a break */
  maxParagraphSentences: number;
  /** prose-style instruction handed to the model */
  style: string;
  /** a GOLD example paragraph — the model matches a shown target far better than a number */
  gold: string;
}

// Anchored on the brief's "low" starting point; medium/high derived from it.
export const DENSITY: Record<Density, DensitySpec> = {
  low: {
    label: "Low — sharp & direct",
    sentencesPerConcept: 2,
    medianSentenceWords: 12,
    hardCeilingWords: 18,
    maxParagraphSentences: 3,
    style: "Lead with the point. Declarative, active voice. Prefer short bullets over paragraphs. No filler, no hedging, no restating the question. Roughly half the words you'd normally write.",
    gold: "An agent is an LLM that can act. It picks a tool, runs it, reads the result, then decides the next step. The loop repeats until the goal is met. Use one when a task needs several steps you can't script up front.",
  },
  medium: {
    label: "Medium — balanced",
    sentencesPerConcept: 4,
    medianSentenceWords: 18,
    hardCeilingWords: 26,
    maxParagraphSentences: 4,
    style: "A clear sentence or two per point, then move on. Give the what and a brief why. Mix short paragraphs with the occasional list. Concrete over abstract.",
    gold: "An agent is a language model wired into a loop so it can take actions, not just answer. On each turn it reasons about the goal, calls a tool such as a search or a database query, and reads what comes back. That observation shapes the next decision, and the cycle repeats until the task is done. Reach for an agent when the steps can't be fully scripted in advance and the model itself must decide what to do next.",
  },
  high: {
    label: "High — read in depth",
    sentencesPerConcept: 6,
    medianSentenceWords: 22,
    hardCeilingWords: 32,
    maxParagraphSentences: 6,
    style: "Fuller explanations: the what, the why, an analogy, and the tradeoff. Develop each idea before moving on. Stay concrete — depth means more reasoning, not padding or abstraction.",
    gold: "An agent is a language model placed inside a control loop so that it can act on the world rather than merely describe it. On each turn it inspects the goal and the history so far, decides on an action, calls a tool — a web search, a code run, a database query — and then reads the result back into its context. Crucially, that result is not the end: it becomes evidence the model uses to choose its next move, so the behaviour is closed-loop rather than a single shot. This is also where agents get risky, because an early wrong turn compounds over many steps. The practical rule of thumb is to reach for an agent only when a task genuinely needs several interdependent steps that you cannot enumerate in advance; if you can script the steps, a plain pipeline will be cheaper and far easier to debug.",
  },
};

export interface LevelSpec {
  label: string;
  priorKnowledge: string;
  vocabulary: string;
  exampleType: string;
  explanationDepth: string;
  omit: string;
  questionType: string;
  scaffolding: string;
  /** what one CONCEPT unit must contain at this level (content-flow pass) — the
   *  shape of the explanation itself, not its length (length is DENSITY's job). */
  conceptShape: string;
}

export const LEVEL: Record<Level, LevelSpec> = {
  beginner: {
    label: "Beginner",
    priorKnowledge: "Assume NO background. Define every concept before you rely on it.",
    vocabulary: "Pre-teach jargon; expand every acronym on first use; prefer plain words and a concrete analogy.",
    exampleType: "Fully WORKED examples — show every step and the reasoning behind it.",
    explanationDepth: "Explain the why behind each step; connect to an everyday analogy.",
    omit: "Omit nothing essential; skip only deep edge cases and performance tuning.",
    questionType: "Supported recall — questions that point back to what was just shown.",
    scaffolding: "MAXIMUM support",
    conceptShape: "Mental model FIRST in ≤4 SHORT plain-English sentences (everyday words, one clause each) + the bridge analogy, paired with ONE visual or described picture. No internals — the picture in their head is the deliverable.",
  },
  intermediate: {
    label: "Intermediate",
    priorKnowledge: "Assume the fundamentals are known; build on them, don't re-teach them.",
    vocabulary: "Use standard terms freely; briefly gloss only the non-obvious ones.",
    exampleType: "COMPLETION examples — show most of the solution and leave a step for the learner to finish.",
    explanationDepth: "Explain mechanisms and the main tradeoffs; go light on basics.",
    omit: "Omit beginner re-explanations of fundamentals and obvious definitions.",
    questionType: "Applied — use the idea in a new but similar situation.",
    scaffolding: "MODERATE support",
    conceptShape: "Mental model in ≤4 plain sentences plus ONE annotated code pattern (≤10 lines) showing the idea in real syntax — the pattern, not a toy.",
  },
  advanced: {
    label: "Advanced",
    priorKnowledge: "Assume fluency with the fundamentals and the common patterns.",
    vocabulary: "Use precise technical vocabulary WITHOUT defining it.",
    exampleType: "SOLO problems — pose the situation and expect the learner to reason it through.",
    explanationDepth: "Focus on edge cases, failure modes, tradeoffs, and non-obvious interactions — NOT a re-explanation of what a practitioner already knows (expertise reversal degrades the lesson).",
    omit: "OMIT basics, definitions, and step-by-step hand-holding. Do not spend words on what they already know.",
    questionType: "Transfer — apply to a novel, harder context and surface a tradeoff.",
    scaffolding: "MINIMAL support, higher-order focus",
    conceptShape: "Skip the mental model they already have — internals, costs, and tradeoffs in ≤5 tight sentences; code only where it shows a non-obvious interaction.",
  },
};

/**
 * RULE 3 — LEVEL and DENSITY are COUPLED, not independent. "More text" buys different
 * things at different levels: for an advanced learner it must buy SUBSTANCE (edge cases,
 * failure modes, tradeoffs), never re-explanation of fundamentals (the redundancy /
 * expertise-reversal effect); for a beginner it buys SCAFFOLDING. "Less text" cuts
 * different things: for advanced it strips the why down to signal; for a beginner it cuts
 * SCOPE (fewer concepts), never the support on the concepts that stay. This function names,
 * for the resolved (level × density) cell, exactly what the chosen amount of text BUYS — so
 * the model spends words on the right thing instead of padding explanations.
 */
export function densityBuys(level: Level, density: Density): string {
  const M: Record<Level, Record<Density, string>> = {
    advanced: {
      high: "Spend the extra words on SUBSTANCE — additional edge cases, failure modes, corner cases, tradeoffs, performance notes, and non-obvious interactions. Do NOT re-explain fundamentals a practitioner already knows (redundancy/expertise reversal degrades the lesson). Depth, never hand-holding.",
      medium: "Spend words on tradeoffs, failure modes, and when-NOT-to-use judgment. Assume the basics; do not restate them.",
      low: "Terse, reference-style. Assume the why; signal only the non-obvious — bullet fragments over prose. No definitions.",
    },
    intermediate: {
      high: "Spend the extra words on mechanisms, the main tradeoffs, edge cases, and when-to-use judgment — light on basics, no beginner re-explanations.",
      medium: "Balanced: the what, a brief why, and the key tradeoff per point. Gloss only non-obvious terms.",
      low: "Concise: keep the mechanism and the key tradeoff, drop the basics and the obvious definitions.",
    },
    beginner: {
      high: "Spend the extra words on SCAFFOLDING — worked steps shown in full, a concrete analogy, pre-teaching of vocabulary, and the why behind each step. More support broken into smaller steps, NOT more concepts crammed in.",
      medium: "Worked examples with the why; one concept per step; a plain analogy where it helps.",
      low: "Stay short, but KEEP full scaffolding on every concept you teach — cut SCOPE (teach fewer concepts), never the support per concept. A beginner with less text still needs the worked steps.",
    },
  };
  return (M[level] ?? M.beginner)[density] ?? (M[level] ?? M.beginner).medium;
}

/** The exact LEVEL+DENSITY directive injected into the generation prompts. */
export function calibrationDirective(level: Level, density: Density): string {
  const L = LEVEL[level] ?? LEVEL.beginner;
  const D = DENSITY[density] ?? DENSITY.medium;
  return [
    `WRITING LEVEL = ${L.label} (this controls SCAFFOLDING, not depth or length):`,
    `- Prior knowledge: ${L.priorKnowledge}`,
    `- Vocabulary: ${L.vocabulary}`,
    `- Examples: ${L.exampleType}`,
    `- Concept shape: ${L.conceptShape}`,
    `- Explanation: ${L.explanationDepth}`,
    `- OMIT: ${L.omit}`,
    `- Self-check questions: ${L.questionType}`,
    `  (${L.scaffolding}. Higher levels FADE support, they don't deepen difficulty for its own sake.)`,
    ``,
    `TEXT DENSITY = ${D.label} (per CONCEPT — total length scales with how many concepts there are):`,
    `- Aim for a MEDIAN of ~${D.medianSentenceWords} words/sentence; keep EVERY sentence under ${D.hardCeilingWords} words (hard ceiling).`,
    `- ~${D.sentencesPerConcept} sentences per concept; paragraphs ≤ ${D.maxParagraphSentences} sentences.`,
    `- Style: ${D.style}`,
    `- Match the SHAPE and rhythm of this GOLD example for "${D.label}":`,
    `  «${D.gold}»`,
    ``,
    `RESOLVED ${L.label} × ${D.label} — what this amount of text BUYS (the coupling that matters most):`,
    `- ${densityBuys(level, density)}`,
  ].join("\n");
}
