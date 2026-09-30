/**
 * # Beta traction: feedback + lightweight product events
 *
 * Backs the "Help us improve before full launch" feedback popup and the key-event capture
 * (signups, lessons generated/completed, library opens, skills) for the one-week beta.
 *
 * Graceful-optional like the rest of src/lib: every function degrades to a no-op when the DB
 * is off, and swallows errors — capturing analytics must NEVER break a user flow.
 */

import { randomUUID } from "node:crypto";
import { dbEnabled, query, currentUserId } from "./db";
import { sha256 } from "./hash";

export interface FeedbackInput {
  message: string;
  userId?: string;
  userEmail?: string;
  userAgent?: string;
  ip?: string;
}

/** Persist a free-text feedback message. Returns the id, or null if the DB is off / on error. */
export async function saveFeedback(input: FeedbackInput): Promise<{ id: string } | null> {
  if (!dbEnabled()) return null;
  const msg = (input.message || "").trim().slice(0, 4000);
  if (!msg) return null;
  const id = randomUUID();
  try {
    await query(
      `insert into feedback (id, user_id, user_email, message, user_agent, ip_hash)
       values ($1,$2,$3,$4,$5,$6)`,
      [id, currentUserId() ?? null, input.userEmail ?? null, msg,
       (input.userAgent ?? "").slice(0, 400) || null, input.ip ? sha256(input.ip) : null],
    );
    return { id };
  } catch (err) {
    console.warn("[beta] saveFeedback failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** A small allow-list of event names we capture during the beta (keeps the table tidy). */
export const EVENT_NAMES = [
  "signup",
  "lesson_generated",
  "library_lesson_opened",
  "lesson_completed",
  "skill_generated",
  "overview_generated",
] as const;

/** Record a product event. No-op when the DB is off; never throws. */
export async function logEvent(name: string, opts: { userId?: string; userEmail?: string; ref?: string; props?: Record<string, unknown> } = {}): Promise<void> {
  if (!dbEnabled()) return;
  const n = (name || "").trim().slice(0, 64);
  if (!n) return;
  try {
    await query(
      `insert into events (name, user_id, user_email, ref, props)
       values ($1,$2,$3,$4,$5)`,
      [n, currentUserId() ?? null, opts.userEmail ?? null, (opts.ref ?? "").slice(0, 200) || null,
       JSON.stringify(opts.props ?? {}).slice(0, 4000)],
    );
  } catch (err) {
    console.warn("[beta] logEvent failed:", err instanceof Error ? err.message : err);
  }
}
