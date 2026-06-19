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

// Import the one named class from the installed `langfuse-langchain` package.
// A "class" is a template for making objects; we build one with `new` below.
import { CallbackHandler } from "langfuse-langchain";

/**
 * `makeLangfuseHandler` — return a configured handler, or `null` when keys absent.
 * `: CallbackHandler | null` is the return-type: the `|` means "one or the other".
 */
export function makeLangfuseHandler(): CallbackHandler | null {
  // Read the two secret keys from the environment (undefined if never set).
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  // `A || B` ("logical OR") uses A if it's truthy, else B — a default base address.
  const baseUrl = process.env.LANGFUSE_BASEURL || "https://cloud.langfuse.com";

  // If either key is missing, disable tracing (warn once, return null).
  if (!publicKey || !secretKey) {
    console.warn(
      "[langfuse] LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set — tracing disabled."
    );
    return null;
  }

  // Both keys present → construct and return the handler (object-shorthand fields).
  return new CallbackHandler({ publicKey, secretKey, baseUrl });
}
