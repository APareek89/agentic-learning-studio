/**
 * # The LLM factory — explicit primary provider, shared task tiers
 *
 * Every node that "thinks" needs a chat model. We build them here so the model
 * ids, temperature, and the `top_p` workaround live in one spot.
 *
 * Task tiers retain their names across Anthropic and OpenAI primary modes:
 *   - "sonnet" — the default workhorse (Profiler-infer, Architect, Critic, modules).
 *   - "opus"   — a quality escalation, used only when the Critic fails twice on hard
 *                (Advanced / Technical+Code) topics.
 *   - "haiku"  — cheap one-shots (e.g. defining a single glossary term on a miss).
 * Each tier's exact model id comes from an env var. OpenAI primary maps the two
 * larger tiers to OPENAI_MODEL_SONNET and the small tier to OPENAI_MODEL_HAIKU.
 *
 * Recurring terms (defined once):
 *   - "the language model" / "Claude": the AI text model we call over the internet.
 *   - "a factory": a function whose job is to build and return a ready-made object.
 *   - "env var": a setting from outside the code, read via `process.env`.
 *   - "temperature": 0 = deterministic/repeatable; higher = more varied.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableLambda } from "@langchain/core/runnables";
import type { Runnable, RunnableConfig } from "@langchain/core/runnables";
import { SystemMessage, HumanMessage, coerceMessageLikeToMessage, type BaseMessage } from "@langchain/core/messages";
import type { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import type { ZodType } from "zod";
import { safeProviderError } from "./provider-audit";

/** The three quality/cost tiers. A plain union type pins the allowed values. */
export type ModelTier = "sonnet" | "opus" | "haiku";
export type ModelProvider = "anthropic" | "openai";
export type StudioChatModel = ChatAnthropic | ChatOpenAI;
type LLMOptions = { maxTokens?: number; streaming?: boolean; maxRetries?: number; auditRequest?: boolean; reasoningEffort?: "none" | "low" | "medium" };

export function primaryProvider(): ModelProvider {
  const configured = process.env.ALS_PRIMARY_PROVIDER || "anthropic";
  if (configured !== "anthropic" && configured !== "openai") throw new Error("ALS_PRIMARY_PROVIDER must be anthropic or openai");
  return configured;
}

export function configuredModelId(tier: ModelTier): string {
  return primaryProvider() === "openai" ? gptModelIdFor(tier) : modelIdFor(tier);
}

// Default model ids per tier. `??` ("nullish coalescing") uses the env var if set,
// otherwise the baked-in default — so the app works with zero model config.
function modelIdFor(tier: ModelTier): string {
  if (tier === "opus") return process.env.ANTHROPIC_MODEL_OPUS ?? "claude-opus-4-8";
  if (tier === "haiku") return process.env.ANTHROPIC_MODEL_HAIKU ?? "claude-haiku-4-5-20251001";
  return process.env.ANTHROPIC_MODEL_SONNET ?? "claude-sonnet-4-6";
}

/**
 * `makeLLM` — construct the explicitly selected provider for a given tier.
 *
 * @param tier        which model tier to use (default "sonnet").
 * @param temperature 0 = deterministic (default). Some authoring steps use a touch higher.
 * @param opts        optional overrides — currently just `maxTokens` (cap on reply length).
 */
export function makeLLM(
  tier: ModelTier = "sonnet",
  temperature = 0,
  opts: LLMOptions = {}
): StudioChatModel {
  if (primaryProvider() === "openai") return createGptLLM(tier, opts);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const disabled = process.env.ALS_MOCK_MODE === "1" || !apiKey;
  const model = modelIdFor(tier);
  const chat = new ChatAnthropic({
    apiKey: apiKey || "provider-disabled",
    ...(disabled ? { clientOptions: { fetch: async () => { throw new Error("Live model generation is disabled. Try the cached example."); } } } : opts.auditRequest ? { clientOptions: { fetch: async (input, init) => {
      const response = await fetch(input, init);
      const failure = response.ok ? {} : safeProviderError(response.status, await response.clone().json().catch(() => null));
      console.info("[provider-request]", JSON.stringify({ provider: "anthropic", model, status: response.status, requestId: response.headers.get("request-id"), ...failure }));
      return response;
    } } } : {}),
    model,
    temperature,
    // Blueprints/modules are large, so default the cap generously (callers override).
    maxTokens: opts.maxTokens ?? 4096,
    // Auto-retry with exponential backoff on Anthropic 429 (rate limit) / 529 (overloaded)
    // / transient 5xx, so a busy API retries instead of failing the lesson.
    maxRetries: opts.maxRetries ?? 4,
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

  // This SDK version also serializes its topK=-1 sentinel. The API requires a
  // nonnegative value on older models and rejects top_k on newer models. Omit it.
  (chat as { topK?: number }).topK = undefined;

  // ---- The Opus-4.8 `temperature` gotcha (same class of bug as top_p above) ----
  // Opus 4.8 (and the Opus-4.7+/Fable family) REJECT an explicit `temperature` with a
  // 400. The constructor always sets one, so — exactly like topP — we drop it from the
  // request body by setting the field to `undefined` on the instance. This covers the
  // architect-skeleton call (tier "opus") so it doesn't 400 on a temperature it can't send.
  const dropsTemperature = tier === "opus" || /(opus-4-[789]|opus-[5-9]|fable)/i.test(model);
  if (dropsTemperature) (chat as { temperature?: number }).temperature = undefined;

  return chat;
}

/**
 * `withOverloadRetry` — wrap a model call so a transient Anthropic OVERLOAD (529) or rate-limit
 * (429) doesn't fail it outright. These clear in ~30-90s, so we RIDE THEM OUT with long, JITTERED
 * backoff instead of the SDK's fast give-up. Non-overload errors (e.g. a malformed response) keep
 * a short retry. This is the same resilience used inside the module build (`runDeepDive`), shared
 * so profiler / architect / module calls all behave identically.
 *
 * @param fn   the async call to run (e.g. `() => llm.invoke(msgs, config)`).
 * Re-throws the last error only after exhausting all attempts.
 */
export async function withOverloadRetry<T>(fn: () => Promise<T>): Promise<T> {
  const isOverloadOrRate = (m: string) =>
    /overloaded|529|rate.?limit|\b429\b|too many requests/i.test(m);
  const OVERLOAD_BACKOFF_MS = [2000, 5000, 12000, 25000, 40000]; // ~84s total across the waits
  const MAX_ATTEMPTS = 6;
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_ATTEMPTS - 1) break;
      const msg = (err instanceof Error ? err.message : String(err)) || "";
      const base = isOverloadOrRate(msg) ? (OVERLOAD_BACKOFF_MS[attempt] ?? 40000) : 800 * (attempt + 1);
      const wait = base + Math.floor(base * 0.3 * Math.random()); // +0-30% jitter de-syncs parallel calls
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// ============================================================================
// BATCH B — OpenAI GPT failover (additive + env-gated)
//
// After a Claude tier call fails (529 overload / 429 rate / 400 usage-limit / timeout / error),
// LangChain `.withFallbacks([...])` retries the SAME request on OpenAI GPT: Claude SONNET nodes →
// GPT-5.5, Claude HAIKU nodes → GPT-5.4-mini. The Claude attempt budget is cut to ~2 quick SDK
// retries (see `makeLLM`'s maxRetries at the call sites) so a bad Anthropic day fails over to GPT
// FAST instead of riding the ~84s overload backoff. When OPENAI_API_KEY is unset, every helper is
// a no-op: the runnable is Claude-only and the caller keeps `withOverloadRetry` — i.e. ZERO change
// to current prod behavior until the key is added.
// ============================================================================

/** True when an OpenAI key is configured → GPT failover is wired. Else: Claude-only (current behavior). */
export function gptFallbackEnabled(): boolean {
  return primaryProvider() === "anthropic" && process.env.ALS_MOCK_MODE !== "1" && !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
}

/** GPT failover model id per Claude tier. Claude Sonnet/Opus nodes → GPT-5.5; Haiku nodes →
 *  GPT-5.4-mini. Env-overridable (confirm the EXACT ids against the account before shipping). */
function gptModelIdFor(tier: ModelTier): string {
  if (tier === "haiku") return process.env.OPENAI_MODEL_HAIKU ?? "gpt-5.4-mini";
  return process.env.OPENAI_MODEL_SONNET ?? "gpt-5.5"; // sonnet + opus tiers
}

/**
 * Build the GPT failover client for a tier, or `null` when no OPENAI_API_KEY (failover disabled).
 * IMPORTANT: we deliberately do NOT apply the Anthropic-only workarounds here — `topP=-1` and the
 * Opus temperature-drop are Claude bugs, not OpenAI's. We also OMIT `temperature` (GPT-5.x reasoning
 * models reject a non-default temperature with a 400), letting the model use its own default.
 */
export function makeGptLLM(
  tier: ModelTier = "sonnet",
  opts: LLMOptions = {}
): ChatOpenAI | null {
  if (!gptFallbackEnabled()) return null;
  return createGptLLM(tier, opts);
}

function createGptLLM(tier: ModelTier, opts: LLMOptions): ChatOpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  const disabled = process.env.ALS_MOCK_MODE === "1" || !apiKey;
  const model = gptModelIdFor(tier);
  return new ChatOpenAI({
    apiKey: apiKey || "provider-disabled",
    model,
    maxTokens: opts.maxTokens ?? 4096,
    streaming: opts.streaming ?? false,
    maxRetries: opts.maxRetries ?? 2,
    // Installed SDK typings predate "none"; its typed extension bag passes the
    // documented Chat Completions parameter without narrowing it to old values.
    modelKwargs: opts.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : undefined,
    configuration: disabled ? { fetch: async () => { throw new Error("Live model generation is disabled. Try the cached example."); } } : opts.auditRequest ? { fetch: async (input, init) => {
      const response = await fetch(input, init);
      const failure = response.ok ? {} : safeProviderError(response.status, await response.clone().json().catch(() => null));
      console.info("[provider-request]", JSON.stringify({ provider: "openai", model, status: response.status, requestId: response.headers.get("x-request-id"), ...failure }));
      return response;
    } } : undefined,
  });
}

/** Strip Anthropic-only `cache_control` blocks before a GPT fallback runs. A SystemMessage whose
 *  content is a `[{type:"text", text, cache_control}]` array becomes a plain-string SystemMessage;
 *  every other message passes through unchanged. (Only the module-body call uses cache_control.) */
export const stripCacheControl = new RunnableLambda<BaseLanguageModelInput, BaseMessage[]>({
  func: (input: BaseLanguageModelInput) => {
    const messages = typeof input === "string" ? [new HumanMessage(input)] : Array.isArray(input) ? input.map(coerceMessageLikeToMessage) : input.toChatMessages();
    return messages.map((m: BaseMessage) => {
      const content = (m as { content: unknown }).content;
      if (m instanceof SystemMessage && Array.isArray(content)) {
        const text = content
          .map((b) => (b && typeof b === "object" && "text" in b ? String((b as { text: unknown }).text ?? "") : ""))
          .join("");
        return new SystemMessage(text);
      }
      return m;
    });
  },
});

/** Typed structured output for direct notebook/skill/community consumers. */
export function structuredOutput<T extends Record<string, unknown>>(
  model: StudioChatModel,
  schema: ZodType<T>,
  opts: { name?: string } = {},
): Runnable<BaseLanguageModelInput, T> {
  if (model instanceof ChatOpenAI) return stripCacheControl.pipe(model.withStructuredOutput<T>(schema, { ...opts, method: "functionCalling" }));
  return model.withStructuredOutput<T>(schema, opts);
}

/**
 * Wrap a Claude STRUCTURED-OUTPUT runnable with a GPT structured-output fallback. The GPT branch
 * strips cache_control first. When `gpt` is null (no key), returns the Claude runnable unchanged.
 * Output shape (parsed object, or `{raw, parsed}` when `includeRaw`) matches across both providers.
 */
export function structuredWithFallback(
  claude: StudioChatModel,
  gpt: ChatOpenAI | null,
  schema: Parameters<ChatAnthropic["withStructuredOutput"]>[0],
  opts?: Parameters<ChatAnthropic["withStructuredOutput"]>[1]
): Runnable<BaseLanguageModelInput, unknown> {
  if (claude instanceof ChatOpenAI) {
    const common = { name: opts?.name, method: "functionCalling" as const };
    return opts?.includeRaw
      ? stripCacheControl.pipe(claude.withStructuredOutput(schema, { ...common, includeRaw: true }))
      : stripCacheControl.pipe(claude.withStructuredOutput(schema, { ...common, includeRaw: false }));
  }
  const claudeR: Runnable<BaseLanguageModelInput, unknown> = opts?.includeRaw
    ? claude.withStructuredOutput(schema, { name: opts.name, includeRaw: true })
    : claude.withStructuredOutput(schema, { name: opts?.name, includeRaw: false });
  if (!gpt) return claudeR;
  // IMPORTANT: force OpenAI's "functionCalling" (tool-calling) structured-output method. OpenAI's
  // default strict json_schema mode rejects any `.optional()` Zod field that isn't also `.nullable()`
  // ("all fields must be required") — and our schemas (InferenceSchema, ModuleBlocks, OverviewProse…)
  // use `.optional()` heavily. Tool-calling mode has no all-required constraint, so the same schemas
  // work on GPT without a rewrite. (Claude's withStructuredOutput already uses tool-calling natively.)
  const gptR = structuredWithFallback(gpt, null, schema, opts);
  return claudeR.withFallbacks([gptR]);
}

/** Wrap a Claude RAW chat runnable (planner/skeleton — text out, parsed by extractJsonObject) with a
 *  GPT raw fallback. No cache_control on these calls, so no strip needed. No key → Claude unchanged. */
export function rawWithFallback(claude: StudioChatModel, gpt: ChatOpenAI | null): Runnable<BaseLanguageModelInput, unknown> {
  if (claude instanceof ChatOpenAI) return stripCacheControl.pipe(claude);
  const claudeR: Runnable<BaseLanguageModelInput, unknown> = claude;
  if (!gpt) return claudeR;
  return claudeR.withFallbacks([gpt]);
}

/**
 * Invoke a runnable with the right resilience for the configured mode:
 *  - GPT failover wired → invoke directly; `.withFallbacks` already switches to GPT after the
 *    Claude client's short (≈2) SDK retries, so we do NOT also ride the long overload backoff.
 *  - No failover → wrap in `withOverloadRetry` exactly as before (ride out a transient 529).
 */
export async function invokeResilient<T>(
  runnable: Runnable<BaseLanguageModelInput, T>,
  input: BaseLanguageModelInput,
  config?: RunnableConfig
): Promise<T> {
  if (primaryProvider() === "openai" || gptFallbackEnabled()) return runnable.invoke(input, config);
  return withOverloadRetry(() => runnable.invoke(input, config));
}
