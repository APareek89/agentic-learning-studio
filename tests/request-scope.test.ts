import { test } from "node:test";
import assert from "node:assert/strict";
import { privateThreadId, privateModuleCacheKey, conversationScope } from "../src/lib/request-scope";

test("identical client conversation IDs remain isolated between two accounts", () => {
  const first = privateThreadId("user-a", "attacker-chosen-label");
  const second = privateThreadId("user-b", "attacker-chosen-label");
  assert.notEqual(first, second);
  assert.equal(first, privateThreadId("user-a", "attacker-chosen-label"));
  assert.notEqual(privateThreadId("user-a"), privateThreadId("user-a"));
  assert.throws(() => privateThreadId("", "thread"));
});

test("a returned public conversation label resumes only its owner's checkpoint", () => {
  const firstTurn = conversationScope("user-a");
  const nextTurn = conversationScope("user-a", firstTurn.publicThreadId);
  assert.deepEqual(nextTurn, firstTurn);
  const anotherUser = conversationScope("user-b", firstTurn.publicThreadId);
  assert.notEqual(anotherUser.checkpointId, firstTurn.checkpointId);
  assert.notEqual(firstTurn.publicThreadId, firstTurn.checkpointId);
  const injectedPrivateId = conversationScope("user-b", firstTurn.checkpointId);
  assert.notEqual(injectedPrivateId.publicThreadId, firstTurn.checkpointId);
  assert.notEqual(injectedPrivateId.checkpointId, firstTurn.checkpointId);
});

test("private fragment cache separates both account and artifact", () => {
  const key = privateModuleCacheKey("user-a", "lesson-a", "same-content");
  assert.notEqual(key, privateModuleCacheKey("user-b", "lesson-a", "same-content"));
  assert.notEqual(key, privateModuleCacheKey("user-a", "lesson-b", "same-content"));
  assert.throws(() => privateModuleCacheKey("", "lesson-a", "same-content"));
});
