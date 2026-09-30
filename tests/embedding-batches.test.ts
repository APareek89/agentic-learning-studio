import { test } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createBatchedEmbedder, EMBEDDING_BATCH_SIZE } from "../src/rag/embedding-batches";

test("passages retain their exact text, vector values, and order across batch boundaries", async () => {
  const calls: string[][] = [];
  const embed = createBatchedEmbedder(async (texts) => {
    calls.push(texts);
    return texts.map((text) => [Number(text.split(":")[0]), text.length, -0.25]);
  });
  for (const count of [0, 1, EMBEDDING_BATCH_SIZE, EMBEDDING_BATCH_SIZE + 1, 19]) {
    calls.length = 0;
    const texts = Array.from({ length: count }, (_, i) => `${i}: untouched passage ${"x".repeat(i * 11)}`);
    const result = await embed(texts);
    assert.deepEqual(calls.flat(), texts);
    assert.ok(calls.every((batch) => batch.length <= EMBEDDING_BATCH_SIZE));
    assert.deepEqual(result, texts.map((text, i) => [i, text.length, -0.25]));
  }
});

test("concurrent uploads and queries share one inference slot without mixing results", async () => {
  let active = 0;
  let peak = 0;
  const calls: string[][] = [];
  const embed = createBatchedEmbedder(async (texts) => {
    calls.push(texts);
    peak = Math.max(peak, ++active);
    await new Promise<void>((resolve) => setImmediate(resolve));
    active--;
    return texts.map((text) => [Number(text)]);
  });
  const [first, query, second] = await Promise.all([
    embed(Array.from({ length: 21 }, (_, i) => String(i))),
    embed(["900"]),
    embed(Array.from({ length: 13 }, (_, i) => String(100 + i))),
  ]);
  assert.equal(peak, 1);
  assert.deepEqual(first, Array.from({ length: 21 }, (_, i) => [i]));
  assert.deepEqual(query, [[900]]);
  assert.deepEqual(second, Array.from({ length: 13 }, (_, i) => [100 + i]));
  assert.ok(calls.findIndex((batch) => batch.includes("900")) < calls.findIndex((batch) => batch.includes("20")));
});

test("inference failure stops that upload and does not block queued requests", async () => {
  const calls: string[][] = [];
  const embed = createBatchedEmbedder(async (texts) => {
    calls.push(texts);
    if (texts.includes("fail")) throw new Error("test inference failure");
    return texts.map(() => [1]);
  });
  const failing = embed(["fail", "b", "c", "d", "must-not-run"]);
  const waiting = embed(["queued"]);
  await assert.rejects(failing, /test inference failure/);
  assert.deepEqual(await waiting, [[1]]);
  assert.deepEqual(await embed(["later"]), [[1]]);
  assert.equal(calls.flat().includes("must-not-run"), false);
});

test("a missing model result rejects instead of shifting passage-to-vector alignment", async () => {
  const embed = createBatchedEmbedder(async () => []);
  await assert.rejects(embed(["passage"]), /unexpected vector count/);
});

test("queued batches and the caller's continuation retain their own actor context", async () => {
  const actors = new AsyncLocalStorage<string>();
  const observed: string[] = [];
  const embed = createBatchedEmbedder(async (texts) => {
    await new Promise<void>((resolve) => setImmediate(resolve));
    observed.push(actors.getStore() || "missing");
    assert.ok(texts.every((text) => text === actors.getStore()));
    return texts.map(() => [1]);
  });
  await Promise.all(["user-a", "user-b"].map((actor) => actors.run(actor, async () => {
    await embed(Array(EMBEDDING_BATCH_SIZE + 1).fill(actor));
    assert.equal(actors.getStore(), actor);
  })));
  assert.deepEqual(observed.sort(), ["user-a", "user-a", "user-b", "user-b"]);
});
