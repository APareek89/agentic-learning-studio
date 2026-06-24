/**
 * # Hashing helpers — stable ids for dedupe + caching
 *
 * A "hash" turns any text into a fixed-length fingerprint. Same input → same
 * fingerprint, always; different input → (effectively) different fingerprint. We
 * use that for two jobs:
 *   - `contentHash` — fingerprint a chunk's text so re-ingesting an unchanged
 *     document skips it (idempotent ingestion).
 *   - `cacheKey`    — a deterministic key for a generated module, including the
 *     learner's level/depth/examples/industry, so the 27 learner variants never
 *     collide in the module cache (a wrong-depth fragment would be served otherwise).
 *
 * `createHash("sha256")` is Node's built-in SHA-256 algorithm. `.update(text)`
 * feeds it the bytes; `.digest("hex")` returns the fingerprint as a hex string.
 */

import { createHash } from "node:crypto";

/** SHA-256 hex fingerprint of any string. */
export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Fingerprint of a chunk's content (used for idempotent upserts). */
export function contentHash(text: string): string {
  return sha256(text);
}

/** Fingerprint of a learning topic (normalized) — groups all generations for it. */
export function topicHash(topic: string): string {
  return sha256(topic.trim().toLowerCase());
}

/**
 * Build the combo-safe cache key for one generated module. The FULL set of
 * variant fields is included so two learners on the same module but different
 * level/depth/examples/industry get different cache entries.
 */
export function moduleCacheKey(parts: {
  topic: string;
  moduleId: string;
  level: string;
  depth: string;
  examples: string;
  industry?: string;
  density?: string;
  visuals?: boolean;
  syntax?: boolean;
  // These ALSO change a module's CONTENT, so they belong in the key — else two
  // lessons that differ only in objective/buildGoal/framework/lessonTypes collide
  // and a cache hit serves the wrong fragment (silently dropping those inputs).
  objective?: string;
  buildGoal?: string;
  framework?: string;
  lessonTypes?: string[];
}): string {
  const industry = (parts.industry ?? "general").trim().toLowerCase();
  const objective = (parts.objective ?? "").trim().toLowerCase();
  const buildGoal = (parts.buildGoal ?? "").trim().toLowerCase();
  const framework = (parts.framework ?? "").trim().toLowerCase();
  const lessonTypes = [...(parts.lessonTypes ?? [])].sort().join(",");
  // density/visuals/syntax change the module's CONTENT, so they MUST be in the key —
  // else a reader gets a wrong-density or wrong-feature fragment served from cache.
  return sha256(
    [
      topicHash(parts.topic),
      parts.moduleId,
      parts.level,
      parts.depth,
      parts.examples,
      industry,
      parts.density ?? "medium",
      parts.visuals ? "v1" : "v0",
      parts.syntax ? "s1" : "s0",
      objective,
      buildGoal,
      framework,
      lessonTypes,
    ].join("|")
  );
}
