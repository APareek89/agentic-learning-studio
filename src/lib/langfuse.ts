/**
 * # Langfuse tracing wire-up  (copied verbatim from the SEO agent — it's generic)
 *
 * Langfuse records a "trace" of each run (every node, every model call with its
 * prompt/tokens/latency/cost) so we can inspect why the agent did what it did.
 * Tracing is OPTIONAL: if the keys aren't set, `makeLangfuseHandler()` returns
 * `null` and the app simply runs untraced.
 *
 * Recurring terms (defined once):
 *   - "environment variable" (env var): a setting from OUTSIDE the code (a `.env`
 *     file), read via `process.env`, so secrets aren't written into the source.
 *   - "null": a value meaning "deliberately nothing here".
 *   - "callback": code we hand to a library so it can call us back on each event.
 */

// Import the langchain callback handler + the base Langfuse client.
import { CallbackHandler } from "langfuse-langchain";
import { Langfuse } from "langfuse";

function langfuseKeys(): { publicKey: string; secretKey: string; baseUrl: string } | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const baseUrl = process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com";
  if (!publicKey || !secretKey) {
    console.warn("[langfuse] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set — tracing disabled.");
    return null;
  }
  return { publicKey, secretKey, baseUrl };
}

/**
 * `makeLangfuseHandler` — a plain handler. WITHOUT a root, langfuse-langchain starts a NEW
 * top-level trace per `.invoke()`, so a multi-call generation shows as N flat traces. Kept for
 * the legacy `/api/learn` path. For the live two-stage flow, prefer `makeRootedLangfuseHandler`.
 */
export function makeLangfuseHandler(): CallbackHandler | null {
  const k = langfuseKeys();
  if (!k) return null;
  return new CallbackHandler(k);
}

/**
 * `makeRootedLangfuseHandler` — a handler bound to ONE root trace, so every model call in a
 * generation (profiler → planner → architect → each module body → density → overview-prose)
 * nests as a CHILD of a single "lesson:<title>" trace — i.e. an expandable TREE in Langfuse,
 * not N flat top-level rows. `flushAsync()` on the returned handler flushes the trace's client.
 */
export function makeRootedLangfuseHandler(
  name: string,
  metadata?: Record<string, unknown>
): CallbackHandler | null {
  const k = langfuseKeys();
  if (!k) return null;
  const langfuse = new Langfuse(k);
  const trace = langfuse.trace({ name, metadata });
  // `root` makes ALL langchain runs attach UNDER this trace instead of spawning new traces.
  return new CallbackHandler({ root: trace });
}
