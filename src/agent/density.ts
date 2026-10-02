import { generationErrorCategory, safeGenerationError } from "./generation-errors";
/**
 * # Density enforcement — verify prose against the tier spec, repair the offenders
 *
 * RULE 2: a prompt-only density rule drifts because the model can't count its own
 * tokens. So after a module's blocks are written we MEASURE the prose (sentence
 * lengths, paragraph shape) and, if sentences breach the per-tier hard ceiling, run
 * ONE repair pass that rewrites only the offending blocks shorter — same meaning,
 * same terms — then log any residual violations. Thresholds come from calibration.ts.
 */

import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { makeLLM, makeGptLLM, gptFallbackEnabled, structuredWithFallback, invokeResilient } from "./llm";
import { RichTextSchema } from "../render/schema";
import type { Blueprint, Module, Block } from "../render/schema";
import { DENSITY, type Density } from "./calibration";

// ---- text measurement ----
function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}
function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}
/** Pull plain prose strings out of a block's rich-text (each paragraph/list item). */
function blockProse(b: Block): string[] {
  const out: string[] = [];
  const walk = (rt: unknown) => {
    if (!Array.isArray(rt)) return;
    for (const n of rt as { t: string; spans?: { text: string }[]; items?: { text: string }[][] }[]) {
      if ((n.t === "ul" || n.t === "ol") && n.items) for (const it of n.items) out.push(it.map((s) => s.text).join(""));
      else if (n.spans) out.push(n.spans.map((s) => s.text).join(""));
    }
  };
  if ("body" in b) walk((b as { body?: unknown }).body);
  if (b.kind === "codeExample") walk(b.explain);
  if (b.kind === "walkthrough") for (const st of b.steps) walk(st.detail);
  return out;
}

export interface DensityStats {
  sentences: number;
  words: number;
  medianWords: number;
  longest: number;
  overCeiling: number;
  pctOver: number; // 0..1
}

/** Measure a module's prose against a density tier. */
export function measureModule(m: Module, density: Density): DensityStats {
  const D = DENSITY[density] ?? DENSITY.medium;
  const lens: number[] = [];
  let words = 0;
  for (const b of m.blocks) for (const p of blockProse(b)) for (const s of splitSentences(p)) { const w = wordCount(s); lens.push(w); words += w; }
  lens.sort((a, b) => a - b);
  const n = lens.length;
  const median = n ? lens[Math.floor(n / 2)] : 0;
  const over = lens.filter((w) => w > D.hardCeilingWords).length;
  return { sentences: n, words, medianWords: median, longest: n ? lens[n - 1] : 0, overCeiling: over, pctOver: n ? over / n : 0 };
}

function blockViolates(b: Block, ceiling: number): boolean {
  for (const p of blockProse(b)) for (const s of splitSentences(p)) if (wordCount(s) > ceiling) return true;
  return false;
}

// ---- snippet length (content-flow pass): tiered line caps on codeExample code ----
// The prompt aims teaching stages at ≤10 lines; a FINAL assembly / guided-practice stage
// may legitimately run longer (observed: every Stage 1 lands ≤10, only integration stages
// overflow). So the deterministic repair fires only above the assembly ceiling — squeezing
// a wiring snippet below it mechanically wrecks readability for no pedagogic gain.
export const CODE_LINE_LIMIT = 10;      // the prompt's aim for teaching stages
export const CODE_LINE_REPAIR_AT = 14;  // hard ceiling — above this we compress
function codeLines(code: string): number {
  return code.split("\n").filter((l) => l.trim().length > 0).length;
}
/** codeExample blocks whose snippet exceeds a line cap (default: the repair ceiling). */
export function codeOffenders(m: Module, limit: number = CODE_LINE_REPAIR_AT): Extract<Block, { kind: "codeExample" }>[] {
  return m.blocks.filter((b): b is Extract<Block, { kind: "codeExample" }> => b.kind === "codeExample" && codeLines(b.code) > limit);
}

const RepairSchema = z.object({ blocks: z.array(z.object({ id: z.string(), body: RichTextSchema })) });
const CodeRepairSchema = z.object({ blocks: z.array(z.object({ id: z.string(), code: z.string() })) });

/**
 * Repair over-long code snippets: one constrained Haiku pass that compresses each
 * offending codeExample to ≤CODE_LINE_LIMIT lines. CONSERVATIVE by instruction: the
 * block's explain/predict text may reference specific line numbers ("the check on
 * line 4"), so the model must keep referenced lines at their numbers — and return
 * the code UNCHANGED when it can't compress without breaking a reference. Never throws.
 */
export async function repairCodeLength(bp: Blueprint, moduleId: string, config?: RunnableConfig): Promise<{ repaired: number; residual: number }> {
  const m = bp.modules.find((x) => x.id === moduleId);
  if (!m) return { repaired: 0, residual: 0 };
  const offenders = codeOffenders(m);
  if (!offenders.length) return { repaired: 0, residual: 0 };
  // Ship the surrounding text too, so the model can see which line numbers are load-bearing.
  const payload = offenders.map((b) => ({
    id: b.id,
    code: b.code,
    referencedBy: [
      ...blockProse(b),
      b.predictThenReveal ? `${b.predictThenReveal.prompt} ${b.predictThenReveal.answer}` : "",
    ].join(" ").slice(0, 800),
  }));
  try {
    // SONNET (not Haiku): eliding boilerplate while preserving taught lines is surgical
    // editing Haiku reliably refuses; this fires only on >CODE_LINE_REPAIR_AT snippets
    // (rare — one per few lessons), so the cost difference is negligible.
    const runnable = structuredWithFallback(
      makeLLM("sonnet", 0.2, { maxTokens: 4000, maxRetries: gptFallbackEnabled() ? 2 : 4 }),
      makeGptLLM("sonnet", { maxTokens: 4000 }),
      CodeRepairSchema,
      { name: "repair-code" }
    );
    const out = (await invokeResilient(
      runnable,
      [
        new SystemMessage(
          `You COMPRESS teaching code snippets. Return EVERY block at ${CODE_LINE_REPAIR_AT} non-empty lines or fewer — this is mandatory, not optional. Moves, in order of preference: drop blank lines; compact dict/JSON/object literals onto fewer lines; merge trivial statements; shorten comments; finally, ELIDE non-teaching boilerplate (auth checks, logging, imports the lesson isn't about) with a single "# …" comment line in its place. FORBIDDEN: dropping a step the snippet TEACHES, removing TODO placeholders, removing "changed line" markers (★ / CHANGED / <--), renaming identifiers. The "referencedBy" text tells you what the snippet teaches — keep those lines' CONTENT intact.`
        ),
        new HumanMessage(JSON.stringify({ blocks: payload }).slice(0, 14000)),
      ],
      config ?? {}
    )) as z.infer<typeof CodeRepairSchema>;
    const byId = new Map(out.blocks.map((x) => [x.id, x.code]));
    let repaired = 0;
    for (const b of offenders) {
      const nc = byId.get(b.id);
      // Accept a rewrite only if it fits the ceiling AND actually shrank — else keep the original.
      if (nc && nc.trim() && codeLines(nc) <= CODE_LINE_REPAIR_AT && codeLines(nc) < codeLines(b.code)) { b.code = nc; repaired++; }
    }
    return { repaired, residual: codeOffenders(m).length };
  } catch (err) {
    console.warn("[repairCodeLength] failed:", generationErrorCategory(err));
    return { repaired: 0, residual: codeOffenders(m).length };
  }
}

/**
 * Repair density: rewrite ONLY the blocks with over-ceiling sentences (one LLM pass).
 * Returns how many blocks were rewritten and the residual over-ceiling count.
 */
export async function repairDensity(bp: Blueprint, moduleId: string, density: Density, config?: RunnableConfig): Promise<{ repaired: number; residual: number }> {
  const m = bp.modules.find((x) => x.id === moduleId);
  if (!m) return { repaired: 0, residual: 0 };
  const D = DENSITY[density] ?? DENSITY.medium;
  const offenders = m.blocks.filter((b) => "body" in b && blockViolates(b, D.hardCeilingWords));
  if (!offenders.length) return { repaired: 0, residual: measureModule(m, density).overCeiling };

  const payload = offenders.map((b) => ({ id: b.id, body: (b as { body?: unknown }).body }));
  try {
    // HAIKU: density repair is a constrained, mechanical sentence-shortening rewrite (bounded by
    // RepairSchema) — Haiku does it well, ~3x cheaper + faster than Sonnet, and it only fires when a
    // module's prose is meaningfully over the tier ceiling (deterministic measureModule gate upstream).
    // BATCH B — Haiku Claude node fails over to GPT-5.4-mini when wired (env-gated; no-op otherwise).
    const runnable = structuredWithFallback(
      makeLLM("haiku", 0.2, { maxTokens: 4000, maxRetries: gptFallbackEnabled() ? 2 : 4 }),
      makeGptLLM("haiku", { maxTokens: 4000 }),
      RepairSchema,
      { name: "repair" }
    );
    const out = (await invokeResilient(
      runnable,
      [
        new SystemMessage(
          `You TIGHTEN prose to a density target without losing meaning. Rewrite each block's rich-text "body" so EVERY sentence is under ${D.hardCeilingWords} words (aim for a ~${D.medianSentenceWords}-word median) by splitting long sentences into short declarative ones. Keep the SAME node structure ({t:"p"|"h"|"ul"|"ol"|"callout", spans/items}), keep every span that has a "term" field intact, keep lists as lists. Do NOT add new claims or drop information — only shorten.`
        ),
        new HumanMessage(JSON.stringify({ blocks: payload }).slice(0, 14000)),
      ],
      config ?? {}
    )) as z.infer<typeof RepairSchema>;
    const byId = new Map(out.blocks.map((x) => [x.id, x.body]));
    let repaired = 0;
    for (const b of m.blocks) {
      const nb = byId.get(b.id);
      if (nb && "body" in b) { (b as { body: unknown }).body = nb; repaired++; }
    }
    return { repaired, residual: measureModule(m, density).overCeiling };
  } catch (err) {
    console.warn("[repairDensity] failed:", generationErrorCategory(err));
    return { repaired: 0, residual: measureModule(m, density).overCeiling };
  }
}
