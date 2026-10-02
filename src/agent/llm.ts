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
import { usageAuditCallbacks } from "./provider-usage";
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
    // Transport uncertainty is terminal; caller-supplied historical retry options
    // cannot enable automatic repurchase.
    maxRetries: 0,
    callbacks: usageAuditCallbacks("anthropic", model),
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

/** Compatibility helpers retained for callers. Provider attempts never retry or
 * cross providers automatically; a user starts a new operation explicitly. */
export async function withOverloadRetry<T>(fn: () => Promise<T>): Promise<T> { return fn(); }
export function gptFallbackEnabled(): boolean { return false; }

/** OpenAI primary model id per task tier. Sonnet/Opus tier → GPT-5.5; Haiku tier →
 *  GPT-5.4-mini. Env-overridable (confirm the EXACT ids against the account before shipping). */
function gptModelIdFor(tier: ModelTier): string {
  if (tier === "haiku") return process.env.OPENAI_MODEL_HAIKU ?? "gpt-5.4-mini";
  return process.env.OPENAI_MODEL_SONNET ?? "gpt-5.5"; // sonnet + opus tiers
}

/**
 * Legacy fallback constructor. Always returns null: select OpenAI as the primary explicitly.
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
    maxRetries: 0,
    callbacks: usageAuditCallbacks("openai", model),
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
 * Keep historical call signatures while invoking only the selected provider.
 * OpenAI primary strips Anthropic cache metadata before serialization.
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
  void gpt;
  return claudeR;
}

/** Raw selected-provider call; the historical fallback argument is deliberately ignored. */
export function rawWithFallback(claude: StudioChatModel, gpt: ChatOpenAI | null): Runnable<BaseLanguageModelInput, unknown> {
  if (claude instanceof ChatOpenAI) return stripCacheControl.pipe(claude);
  const claudeR: Runnable<BaseLanguageModelInput, unknown> = claude;
  void gpt;
  return claudeR;
}

/** Invoke exactly once. SDK and helper retries are disabled. */
export async function invokeResilient<T>(
  runnable: Runnable<BaseLanguageModelInput, T>,
  input: BaseLanguageModelInput,
  config?: RunnableConfig
): Promise<T> { return runnable.invoke(input, config); }
