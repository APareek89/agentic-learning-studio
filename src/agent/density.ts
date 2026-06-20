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
import { makeLLM } from "./llm";
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

const RepairSchema = z.object({ blocks: z.array(z.object({ id: z.string(), body: RichTextSchema })) });

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
    const llm = makeLLM("sonnet", 0.2, { maxTokens: 4000 }).withStructuredOutput(RepairSchema, { name: "repair" });
    const out = await llm.invoke(
      [
        new SystemMessage(
          `You TIGHTEN prose to a density target without losing meaning. Rewrite each block's rich-text "body" so EVERY sentence is under ${D.hardCeilingWords} words (aim for a ~${D.medianSentenceWords}-word median) by splitting long sentences into short declarative ones. Keep the SAME node structure ({t:"p"|"h"|"ul"|"ol"|"callout", spans/items}), keep every span that has a "term" field intact, keep lists as lists. Do NOT add new claims or drop information — only shorten.`
        ),
        new HumanMessage(JSON.stringify({ blocks: payload }).slice(0, 14000)),
      ],
      config ?? {}
    );
    const byId = new Map(out.blocks.map((x) => [x.id, x.body]));
    let repaired = 0;
    for (const b of m.blocks) {
      const nb = byId.get(b.id);
      if (nb && "body" in b) { (b as { body: unknown }).body = nb; repaired++; }
    }
    return { repaired, residual: measureModule(m, density).overCeiling };
  } catch (err) {
    console.warn("[repairDensity] failed:", (err as Error).message?.slice(0, 120));
    return { repaired: 0, residual: measureModule(m, density).overCeiling };
  }
}
