/**
 * # Artifact registry — the generated learning documents the viewer renders
 *
 * Each generation produces a self-contained interactive HTML "artifact". The chat
 * gets a link/reference; the viewer (right 70%) fetches the full HTML by id, and a
 * Download button streams it. We keep the HTML in an in-memory `Map` (lost on
 * restart — fine for v1; durable storage in the `generations` table is post-v1).
 *
 * Recurring terms (defined once):
 *   - "HTML": HyperText Markup Language, the code web pages are written in.
 *   - "artifact": here, one generated interactive learning page.
 *   - "id": a short unique label so we can find one artifact again later.
 *   - "Map": a built-in key→value container (like a dictionary).
 *   - "UUID": a Universally Unique Identifier — a long, random, unguessable id.
 */

// `randomUUID` is Node's built-in unguessable-id generator (the `node:` prefix
// marks a built-in module, not a downloaded package).
import { randomUUID } from "node:crypto";
import type { Blueprint } from "../render/schema";

/** The shape of one stored artifact. `kind` is a free string so new kinds (e.g. a
 *  future Tab-2 output) don't need a code change. We also stash the `blueprint` so
 *  POST /api/module can write the remaining modules on demand (and /full finish them). */
export interface StoredArtifact {
  id: string;
  kind: string; // e.g. "learning-artifact"
  title: string;
  html: string;
  blueprint?: Blueprint;
  // The learner's upload context for this lesson, so on-demand module builds
  // (POST /api/module, /full) ground the same way the initial generation did.
  uploadIds?: string[];
  referOnly?: boolean;
}

// The registry: one shared module-level Map (a singleton) for the whole process.
const store = new Map<string, StoredArtifact>();

/**
 * `registerArtifact` — save the HTML (+ Blueprint) and return a lightweight reference
 * (`{ id, kind, title }`) for the chat/state. The heavy fields stay in the store.
 */
export function registerArtifact(input: {
  kind: string;
  title: string;
  html: string;
  blueprint?: Blueprint;
  uploadIds?: string[];
  referOnly?: boolean;
}): { id: string; kind: string; title: string } {
  const id = randomUUID();
  store.set(id, { id, ...input });
  return { id, kind: input.kind, title: input.title };
}

/** Look one artifact up by id (returns `undefined` if not found). */
export function getArtifact(id: string): StoredArtifact | undefined {
  return store.get(id);
}

/** Merge a patch into a stored artifact (e.g. refreshed html after building modules). */
export function updateArtifact(id: string, patch: Partial<Omit<StoredArtifact, "id">>): void {
  const a = store.get(id);
  if (a) store.set(id, { ...a, ...patch });
}
