import { generationErrorCategory, safeGenerationError } from "./generation-errors";
/**
 * # Code gate — objective checks on generated code snippets (content-integrity pass)
 *
 * The line-count repair (density.ts) fixes SHAPE; this gate checks SUBSTANCE that code can
 * verify without running anything: YAML/JSON snippets must parse, provider/model ID strings
 * must look like real ones, dataset field references must exist in the lesson contract, and
 * commands must not reference files the lesson never defines. Philosophy (RULE 2): never
 * trust a prompt with anything code can check.
 *
 * CONSERVATIVE by design: hard ERRORS (parse failures, malformed provider ids) get ONE
 * targeted repair attempt and are re-linted — a rewrite that still fails keeps the original
 * (a broken repair is worse than a labeled flaw). Heuristics are WARN-only (logged, never
 * block a build).
 */

import YAML from "yaml";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { makeLLM, makeGptLLM, gptFallbackEnabled, structuredWithFallback, invokeResilient } from "./llm";
import type { Blueprint, Module, Block } from "../render/schema";

type CodeBlock = Extract<Block, { kind: "codeExample" }>;

export interface CodeLintResult {
  errors: { blockId: string; msg: string }[];
  warnings: { blockId: string; msg: string }[];
}

// Provider-ID shapes we accept (both bare and promptfoo-style prefixed forms — docs allow
// several; the gate only rejects strings that match NO known shape, e.g. "openai:gpt-o-…").
const PROVIDER_OK = [
  /^openai:(chat:|responses:|completion:|embedding[s]?:|assistant:)?(gpt-[45][\w.-]*|o[134][\w.-]*|text-embedding-[\w.-]+)$/i,
  /^anthropic:(messages:|completion:)?claude-[\w.-]+$/i,
];
const PROVIDER_TOKEN = /\b(openai|anthropic):[A-Za-z0-9:._-]+/g;

/** Field tokens the code READS from dataset rows: row["x"], row['x'], {{x}}. */
function fieldRefs(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/row\[["']([A-Za-z_][\w]*)["']\]/g)) out.add(m[1]);
  for (const m of code.matchAll(/\{\{\s*([A-Za-z_][\w]*)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

/** Lint every codeExample in ONE module against objective checks + the lesson contract. */
export function lintModuleCode(bp: Blueprint, m: Module): CodeLintResult {
  const errors: CodeLintResult["errors"] = [];
  const warnings: CodeLintResult["warnings"] = [];
  const contractText = (bp.meta.contract ?? []).join("\n").toLowerCase();
  // Every code+prose in the whole lesson — for "file referenced but never defined" checks.
  const lessonText = JSON.stringify(bp).toLowerCase();

  for (const b of m.blocks) {
    if (b.kind !== "codeExample") continue;
    const cb = b as CodeBlock;

    // 1. Structured snippets must PARSE (objective; error).
    const lang = (cb.language || "").toLowerCase();
    if (/^ya?ml$/.test(lang)) {
      try { YAML.parse(cb.code); } catch (e) { errors.push({ blockId: cb.id, msg: `yaml parse failed: ${(e as Error).message.slice(0, 90)}` }); }
    } else if (lang === "json" || lang === "jsonl") {
      const lines = lang === "jsonl" ? cb.code.split("\n").filter((l) => l.trim()) : [cb.code];
      for (const l of lines) { try { JSON.parse(l); } catch (e) { errors.push({ blockId: cb.id, msg: `json parse failed: ${(e as Error).message.slice(0, 90)}` }); break; } }
    }

    // 2. Provider/model ID strings must match a known shape (objective; error).
    for (const tok of cb.code.match(PROVIDER_TOKEN) ?? []) {
      if (!PROVIDER_OK.some((re) => re.test(tok))) errors.push({ blockId: cb.id, msg: `unrecognized provider/model id "${tok}"` });
    }

    // 3. Dataset field refs should exist in the contract (heuristic; warn). Word-boundary
    // match — a bare "context" must NOT pass just because "retrieval_context" is pinned.
    if (contractText.includes("field")) {
      for (const f of fieldRefs(cb.code)) {
        const word = new RegExp(`(^|[^\\w])${f.toLowerCase()}([^\\w]|$)`);
        if (!word.test(contractText)) warnings.push({ blockId: cb.id, msg: `reads dataset field "${f}" not pinned in the lesson contract` });
      }
    }

    // 4. Commands must not reference files the lesson never shows (heuristic; warn).
    for (const mt of cb.code.matchAll(/(?:python3?|pytest|node)\s+([\w./-]+\.(?:py|mjs|js))/g)) {
      const file = mt[1].toLowerCase();
      const occurrences = lessonText.split(file).length - 1;
      if (occurrences <= 1) warnings.push({ blockId: cb.id, msg: `runs "${mt[1]}" which the lesson never defines` });
    }
  }
  return { errors, warnings };
}

const CodeFixSchema = z.object({ blocks: z.array(z.object({ id: z.string(), code: z.string() })) });

/**
 * ONE targeted repair for hard lint errors. Accept a rewrite only if re-lint comes back
 * clean for that block — otherwise the original stays (never let a repair regress code).
 */
export async function repairCodeIssues(bp: Blueprint, m: Module, lint: CodeLintResult, config?: RunnableConfig): Promise<number> {
  if (!lint.errors.length) return 0;
  const byBlock = new Map<string, string[]>();
  for (const e of lint.errors) byBlock.set(e.blockId, [...(byBlock.get(e.blockId) ?? []), e.msg]);
  const offenders = m.blocks.filter((b): b is CodeBlock => b.kind === "codeExample" && byBlock.has(b.id));
  if (!offenders.length) return 0;
  try {
    const runnable = structuredWithFallback(
      makeLLM("sonnet", 0.2, { maxTokens: 4000, maxRetries: gptFallbackEnabled() ? 2 : 4 }),
      makeGptLLM("sonnet", { maxTokens: 4000 }),
      CodeFixSchema,
      { name: "repair-code-issues" }
    );
    const payload = offenders.map((b) => ({ id: b.id, language: b.language, code: b.code, problems: byBlock.get(b.id) }));
    const out = (await invokeResilient(
      runnable,
      [
        new SystemMessage(
          `You FIX specific objective problems in teaching code snippets — nothing else. For each block, correct ONLY the listed problems (a YAML/JSON syntax error, a malformed provider/model ID) with the smallest possible change: same structure, same identifiers, same teaching point, same line count where possible. Return the corrected code for every block.${bp.meta.contract?.length ? `\nLESSON CONTRACT (IDs/fields must match these exactly):\n${bp.meta.contract.map((c) => `- ${c}`).join("\n")}` : ""}`
        ),
        new HumanMessage(JSON.stringify({ blocks: payload }).slice(0, 14000)),
      ],
      config ?? {}
    )) as z.infer<typeof CodeFixSchema>;
    const byId = new Map(out.blocks.map((x) => [x.id, x.code]));
    let repaired = 0;
    for (const b of offenders) {
      const nc = byId.get(b.id);
      if (!nc || !nc.trim()) continue;
      const prev = b.code;
      b.code = nc;
      const relint = lintModuleCode(bp, m);
      if (relint.errors.some((e) => e.blockId === b.id)) b.code = prev; // rewrite didn't fix it — keep original
      else repaired++;
    }
    return repaired;
  } catch (err) {
    console.warn("[code-gate] repair failed:", generationErrorCategory(err));
    return 0;
  }
}
