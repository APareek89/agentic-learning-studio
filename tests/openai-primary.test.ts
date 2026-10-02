import { test } from "node:test";
import assert from "node:assert/strict";
import { ChatOpenAI, BaseChatOpenAI } from "@langchain/openai";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { makeLLM, makeGptLLM, primaryProvider, gptFallbackEnabled, structuredOutput, structuredWithFallback, rawWithFallback, invokeResilient } from "../src/agent/llm";
import { safeProviderError } from "../src/agent/provider-audit";
import { NotebookSchema } from "../src/lib/handson";
import { SkillPackageSchema } from "../src/lib/skillgen";


test("OpenAI primary uses one provider for raw, notebook, streamed skill and includeRaw paths", async (t) => {
  const settings = { ALS_PRIMARY_PROVIDER: "openai", ALS_MOCK_MODE: "0", OPENAI_API_KEY: "offline-only", ANTHROPIC_API_KEY: "never-use", OPENAI_MODEL_SONNET: "gpt-5.5", OPENAI_MODEL_HAIKU: "gpt-5.4-mini" };
  const previous = Object.fromEntries(Object.keys(settings).map((key) => [key, process.env[key]]));
  Object.assign(process.env, settings);
  t.after(() => { for (const [key,value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
  const notebook = { title: "Memory", cells: [{ type: "markdown", source: "Example" }, { type: "code", source: "print(1)" }] };
  const skill = { meta: { name: "Memory", slug: "memory", llmInterface: "Codex", task: "Learn", summary: "Practice" }, overview: { whatItDoes: "Practice", sampleIO: [] }, howToUse: { install: "Install", invoke: "Run", connectDataSources: "None" }, files: [{ path: "SKILL.md", language: "markdown", content: "Example" }], sources: [{ title: "Example" }] };
  const requests: Record<string, any>[] = [], logs: string[] = [];
  let reject = false;
  t.mock.method(console, "info", (...args: unknown[]) => { logs.push(args.join(" ")); });
  // The SDK estimates streaming tokens with a tokenizer; mock that unrelated
  // estimate to ensure this wire test cannot download tokenizer data.
  t.mock.method(BaseChatOpenAI.prototype, "getNumTokens", async () => 1);
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init?.body)); requests.push(body);
    if (reject) return new Response(JSON.stringify({ error: { type: "insufficient_quota", code: "insufficient_quota", message: "secret-marker private-prompt" } }), { status: 429, headers: { "content-type": "application/json", "x-request-id": "req_rejected" } });
    const name = body.tools?.[0]?.function.name;
    const value = name === "skill_package" ? skill : notebook;
    const args = JSON.stringify(value);
    const tool = { id: "call_offline", type: "function", function: { name, arguments: args } };
    const usage = { prompt_tokens: 30, completion_tokens: 20, total_tokens: 50, prompt_tokens_details: { cached_tokens: 10 }, completion_tokens_details: { reasoning_tokens: 0 } };
    if (body.stream) {
      const base = { id: "chatcmpl_offline", object: "chat.completion.chunk", created: 1, model: body.model };
      const chunks = [
        { ...base, choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ ...tool, index: 0, function: { name, arguments: args.slice(0, 12) } }] }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(12) } }] }, finish_reason: null }] },
        { ...base, choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] },
        { ...base, choices: [], usage },
      ];
      return new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream", "x-request-id": "req_offline" } });
    }
    return new Response(JSON.stringify({ id: "chatcmpl_offline", object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message: name ? { role: "assistant", content: null, tool_calls: [tool] } : { role: "assistant", content: "An offline answer." }, finish_reason: name ? "tool_calls" : "stop" }], usage }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "req_offline" } });
  });
  assert.equal(primaryProvider(), "openai");
  assert.equal(gptFallbackEnabled(), false);
  assert.equal(makeGptLLM(), null);
  const opts = { maxTokens: 500, maxRetries: 0, auditRequest: true, reasoningEffort: "none" as const };
  const ask = makeLLM("sonnet", 0.2, opts);
  assert.ok(ask instanceof ChatOpenAI);
  const answer = await ask.invoke("Offline question");
  assert.equal(answer.content, "An offline answer.");
  assert.equal(answer.usage_metadata?.input_tokens, 30);
  assert.equal(answer.usage_metadata?.output_tokens, 20);
  assert.equal(answer.usage_metadata?.input_token_details?.cache_read, 10);
  assert.equal(answer.usage_metadata?.output_token_details?.reasoning, 0);
  const cachedPrompt = [new SystemMessage({ content: [{ type: "text", text: "Offline system", cache_control: { type: "ephemeral" } }] }), new HumanMessage("Offline request")];
  assert.deepEqual(await structuredOutput(makeLLM("haiku", 0, opts), NotebookSchema, { name: "hands_on_notebook" }).invoke(cachedPrompt), notebook);
  assert.deepEqual(await structuredOutput(makeLLM("sonnet", 0, { ...opts, streaming: true }), SkillPackageSchema, { name: "skill_package" }).invoke(cachedPrompt), skill);
  const included = await structuredWithFallback(makeLLM("sonnet", 0, { ...opts, streaming: true }), null, NotebookSchema, { name: "module_blocks", includeRaw: true }).invoke(cachedPrompt);
  assert.ok(included && typeof included === "object" && "raw" in included && "parsed" in included);
  assert.deepEqual(included.parsed, notebook);
  await rawWithFallback(makeLLM("sonnet", 0, opts), null).invoke(cachedPrompt);
  for (const body of requests) {
    assert.equal(body.max_completion_tokens, 500);
    assert.equal(body.reasoning_effort, "none");
    for (const field of ["max_tokens", "temperature", "top_p", "top_k", "response_format"]) assert.equal(field in body, false, field);
    assert.equal(JSON.stringify(body).includes("cache_control"), false);
    if (body.tools) assert.equal(body.tool_choice.function.name, body.tools[0].function.name);
  }
  assert.equal(requests.length, 5);
  reject = true;
  await assert.rejects(invokeResilient(makeLLM("sonnet", 0, opts), "Rejected once"));
  assert.equal(requests.length, 6, "no SDK, helper, or cross-provider retry");
  assert.match(logs.filter(l => l.startsWith("[provider-request]")).at(-1)!, /"errorCategory":"insufficient_credits"/);
  assert.equal(logs.join(" ").includes("secret-marker"), false);
  assert.equal(logs.join(" ").includes("private-prompt"), false);
  process.env.ALS_MOCK_MODE = "1";
  await assert.rejects(makeLLM("sonnet", 0, opts).invoke("Blocked"));
  assert.equal(requests.length, 6, "mock mode must never call fetch");
  process.env.ALS_MOCK_MODE = "0";
  delete process.env.OPENAI_API_KEY;
  await assert.rejects(makeLLM("sonnet", 0, opts).invoke("Missing key"));
  assert.equal(requests.length, 6, "missing primary key must not fall through to Anthropic");
});

test("OpenAI funding error is distinct from transient throttling", () => {
  assert.equal(safeProviderError(429, { error: { code: "insufficient_quota", type: "insufficient_quota" } }).errorCategory, "insufficient_credits");
  assert.equal(safeProviderError(429, { error: { code: "rate_limit_exceeded" } }).errorCategory, "rate_limit");
});
