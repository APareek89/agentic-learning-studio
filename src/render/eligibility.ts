/**
 * # Hands-On eligibility — deterministic, render-time, $0
 *
 * Decides whether a lesson (or a specific module) is suitable for a TINY,
 * browser-runnable Python demo notebook. SHARED by the renderer (components.ts,
 * to gate the launch button) and the server (lib/handson.ts, to re-check before
 * generating). Pure + side-effect-free + no model call.
 *
 * Eligible = tiny pure-Python demos (agent loop, prompt templating, tokenization,
 * cosine-similarity retrieval, eval metrics, chunking, tool-schema/dataclass
 * validation, JSON, simple algorithms). BLOCKED = anything that would need paid
 * model APIs, keys/auth, training/tuning, GPU/heavy frameworks, or external
 * services — none of which run in Pyodide (so we never offer a notebook that can't run).
 *
 * We scan only SHORT, signal-heavy fields (topic, title, the single decision a
 * module forces, and code-example source) — NOT full prose — so a prose mention of
 * "requests"/"cloud" can't false-block an otherwise-eligible lesson.
 */
import type { Blueprint, Module } from "./schema";

// Case-insensitive blockers. A match in topic / module title / decisionItForces /
// codeExample source marks the lesson (or module) ineligible.
const BLOCK_PATTERNS: RegExp[] = [
  /openai|anthropic|google\.genai|vertex|bedrock|cohere|mistral|\bgemini\b/i, // paid model APIs
  /api[_ ]?key|bearer|OPENAI_|ANTHROPIC_/i, // keys / auth
  /fine[- ]?tun|RLHF|DPO|LoRA|QLoRA|pre[- ]?train/i, // training / tuning
  /\bcuda\b|\bgpu\b|tensorflow|deploy(ment)?|kubernetes|docker/i, // GPU / heavy / deploy
  /\brequests\b|webhook|database connection|\bs3\b|\bcloud\b/i, // external services
];

function eligibilityText(bp: Blueprint, module?: Module): string {
  const parts: string[] = [bp.meta.topic, bp.meta.title];
  const mods = module ? [module] : bp.modules;
  for (const m of mods) {
    parts.push(m.title, m.decisionItForces ?? "");
    for (const b of m.blocks) {
      if (b.kind === "codeExample") parts.push((b as { code?: string }).code ?? "");
    }
  }
  return parts.filter(Boolean).join(" \n ");
}

/**
 * True when a tiny, safe, browser-runnable Python demo makes sense here.
 * Deterministic, $0. Pass a `module` to check that module specifically (the server
 * re-checks the clicked module); omit it for the whole-lesson gate (the button).
 */
export function handsOnEligible(bp: Blueprint, module?: Module): boolean {
  const text = eligibilityText(bp, module);
  return !BLOCK_PATTERNS.some((re) => re.test(text));
}
