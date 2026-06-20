/**
 * # The LLM factory — one place that builds our Claude clients
 *
 * Every node that "thinks" needs a chat model. We build them here so the model
 * ids, temperature, and the `top_p` workaround live in one spot.
 *
 * This app uses THREE model tiers (chosen per task to control cost/quality):
 *   - "sonnet" — the default workhorse (Profiler-infer, Architect, Critic, modules).
 *   - "opus"   — a quality escalation, used only when the Critic fails twice on hard
 *                (Advanced / Technical+Code) topics.
 *   - "haiku"  — cheap one-shots (e.g. defining a single glossary term on a miss).
 * Each tier's exact model id comes from an env var so you can swap without code edits.
 *
 * Recurring terms (defined once):
 *   - "the language model" / "Claude": the AI text model we call over the internet.
 *   - "a factory": a function whose job is to build and return a ready-made object.
 *   - "env var": a setting from outside the code, read via `process.env`.
 *   - "temperature": 0 = deterministic/repeatable; higher = more varied.
 */

import { ChatAnthropic } from "@langchain/anthropic";

/** The three quality/cost tiers. A plain union type pins the allowed values. */
export type ModelTier = "sonnet" | "opus" | "haiku";

// Default model ids per tier. `??` ("nullish coalescing") uses the env var if set,
// otherwise the baked-in default — so the app works with zero model config.
function modelIdFor(tier: ModelTier): string {
  if (tier === "opus") return process.env.ANTHROPIC_MODEL_OPUS ?? "claude-opus-4-8";
  if (tier === "haiku") return process.env.ANTHROPIC_MODEL_HAIKU ?? "claude-haiku-4-5-20251001";
  return process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-6";
}

/**
 * `makeLLM` — construct a configured Claude client for a given tier.
 *
 * @param tier        which model tier to use (default "sonnet").
 * @param temperature 0 = deterministic (default). Some authoring steps use a touch higher.
 * @param opts        optional overrides — currently just `maxTokens` (cap on reply length).
 */
export function makeLLM(
  tier: ModelTier = "sonnet",
  temperature = 0,
  opts: { maxTokens?: number; streaming?: boolean } = {}
): ChatAnthropic {
  // Fail fast with a clear message if the one required key is missing.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key."
    );
  }

  const model = modelIdFor(tier);
  const chat = new ChatAnthropic({
    apiKey,
    model,
    temperature,
    // Blueprints/modules are large, so default the cap generously (callers override).
    maxTokens: opts.maxTokens ?? 4096,
    // Streaming is REQUIRED by the Anthropic SDK once max_tokens is large enough that
    // a request could exceed 10 minutes (otherwise it throws "Streaming is required…").
    // The big Architect call streams the tool-call under the hood; withStructuredOutput
    // still aggregates it into one parsed object, so callers see no difference.
    streaming: opts.streaming ?? false,
  });

  // ---- The `top_p` gotcha (carried over from the SEO agent — a real bug) ----
  // `@langchain/anthropic` initializes `topP` to a sentinel of -1 and sends it for
  // models not on its allowlist; Claude 4.x rejects `top_p: -1` with a 400. We can't
  // fix it via the constructor (undefined → coerced back to -1; a valid topP clashes
  // with temperature). The clean fix: set the field to `undefined` on the instance so
  // it's dropped from the request body entirely. (`as { topP?: number }` is a type
  // assertion letting us touch this non-public field; it changes nothing at runtime.)
  (chat as { topP?: number }).topP = undefined;

  // ---- The Opus-4.8 `temperature` gotcha (same class of bug as top_p above) ----
  // Opus 4.8 (and the Opus-4.7+/Fable family) REJECT an explicit `temperature` with a
  // 400. The constructor always sets one, so — exactly like topP — we drop it from the
  // request body by setting the field to `undefined` on the instance. This covers the
  // architect-skeleton call (tier "opus") so it doesn't 400 on a temperature it can't send.
  const dropsTemperature = tier === "opus" || /(opus-4-[789]|opus-[5-9]|fable)/i.test(model);
  if (dropsTemperature) (chat as { temperature?: number }).temperature = undefined;

  return chat;
}
