import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLLM } from "../src/agent/llm";
import { safeProviderError } from "../src/agent/provider-audit";

test("real SDK serialization omits invalid sampling fields for all configured tiers", async (t) => {
  const previous = { key: process.env.ANTHROPIC_API_KEY, mock: process.env.ALS_MOCK_MODE };
  process.env.ANTHROPIC_API_KEY = "offline-test-only";
  process.env.ALS_MOCK_MODE = "0";
  t.after(() => {
    if (previous.key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous.key;
    if (previous.mock === undefined) delete process.env.ALS_MOCK_MODE; else process.env.ALS_MOCK_MODE = previous.mock;
  });
  const requests: Record<string, unknown>[] = [];
  const logs: string[] = [];
  let reject = false;
  t.mock.method(console, "info", (...args: unknown[]) => { logs.push(args.join(" ")); });
  t.mock.method(globalThis, "fetch", async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    return new Response(JSON.stringify(reject
      ? { type: "error", error: { type: "invalid_request_error", message: "top_k is invalid; sk-ant-private-marker user-private-prompt" } }
      : { id: "msg_offline", type: "message", role: "assistant", model: body.model, content: [{ type: "text", text: "Offline response" }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: reject ? 400 : 200, headers: { "content-type": "application/json", "request-id": "req_offline" } });
  });
  for (const tier of ["sonnet", "opus", "haiku"] as const) {
    const output = await makeLLM(tier, 0.2, { maxTokens: 500, maxRetries: 0, auditRequest: true }).invoke("Offline test only");
    assert.equal(output.content, "Offline response");
    const body = requests.at(-1)!;
    assert.equal("top_k" in body, false);
    assert.equal("top_p" in body, false);
    assert.equal(body.max_tokens, 500);
    assert.equal(body.stream, false);
    if (tier === "opus") assert.equal("temperature" in body, false);
    else assert.equal(body.temperature, 0.2);
  }
  reject = true;
  await assert.rejects(makeLLM("sonnet", 0.2, { maxTokens: 500, maxRetries: 0, auditRequest: true }).invoke("Offline failure only"));
  assert.equal(requests.length, 4, "failed proof request must not retry");
  assert.equal(logs.length, 4);
  assert.match(logs.at(-1)!, /"status":400/);
  assert.match(logs.at(-1)!, /"errorCategory":"top_k_validation"/);
  assert.ok(!logs.join(" ").includes("private-marker"));
  assert.ok(!logs.join(" ").includes("private-prompt"));
});

test("error audit emits only fixed categories, never credential-like response content", () => {
  const cases: [number, string, string, string][] = [
    [400, "invalid_request_error", "top_k is deprecated", "top_k_validation"],
    [400, "invalid_request_error", "top_p must be omitted", "top_p_validation"],
    [400, "invalid_request_error", "temperature unsupported", "temperature_validation"],
    [400, "invalid_request_error", "Your credit balance is too low", "insufficient_credits"],
    [401, "authentication_error", "key rejected", "authentication"],
    [429, "rate_limit_error", "slow down", "rate_limit"],
    [500, "untrusted-private-marker", "unknown", "other"],
  ];
  for (const [status, type, message, expected] of cases) {
    const safe = safeProviderError(status, { error: { type, message: message + " sk-ant-private-marker user@example.test prompt" } });
    assert.equal(safe.errorCategory, expected);
    assert.ok(!JSON.stringify(safe).includes("private-marker"));
    assert.ok(!JSON.stringify(safe).includes("user@example.test"));
  }
  assert.deepEqual(safeProviderError(502, null), { errorType: "unknown_error", errorCategory: "other" });
});
