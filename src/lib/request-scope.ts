import { createHash, randomUUID } from "node:crypto";

/** A caller's conversation label must never select another user's checkpoint. */
export function privateThreadId(userId: string, clientThreadId?: string): string {
  if (!userId) throw new Error("Authenticated user required");
  const label = clientThreadId || randomUUID();
  return `${userId}:learn:${createHash("sha256").update(label).digest("hex")}`;
}

/** Return the public label to the browser; only the private ID goes to MemorySaver. */
export function conversationScope(userId: string, suppliedLabel?: unknown): { publicThreadId: string; checkpointId: string } {
  const publicThreadId = typeof suppliedLabel === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(suppliedLabel)
    ? suppliedLabel : randomUUID();
  return { publicThreadId, checkpointId: privateThreadId(userId, publicThreadId) };
}

/** Used by both background writes and foreground reads of private module fragments. */
export function privateModuleCacheKey(userId: string, artifactId: string, contentKey: string): string {
  if (!userId || !artifactId) throw new Error("Authenticated artifact owner required");
  return `${userId}:${artifactId}:${contentKey}`;
}
