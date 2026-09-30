/**
 * # Support / complaint / data-rights intake + consent log
 *
 * Backs /report-issue (the general complaint/grievance/data-request form) and the
 * signup consent checkbox. SEPARATE from the community-lesson report flow.
 *
 * Privacy by design: we store a HASHED IP (sha256), never the raw IP. Degrades to
 * a no-op when the DB is off (graceful-optional) like the rest of src/lib.
 */

import { randomUUID } from "node:crypto";
import { dbEnabled, query, currentUserId } from "./db";
import { sha256 } from "./hash";

/** Bump when the consent wording changes (stored with each consent/support row). */
export const CONSENT_VERSION = "2026-06-25";

/** The 10 intake categories the /report-issue form offers. */
export const SUPPORT_CATEGORIES = [
  "privacy_data_request",
  "consent_withdrawal",
  "account_deletion",
  "correction_access",
  "security_vuln",
  "community_content",
  "billing_refund",
  "technical",
  "grievance",
  "other",
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

/** Hash an IP for storage — privacy by design, never store the raw IP. */
function ipHash(ip?: string): string | null {
  return ip ? sha256(ip) : null;
}

export interface SupportInput {
  category: string;
  name?: string;
  email: string;
  subject: string;
  message: string;
  relatedRef?: string;
  consentText?: string;
  consentVersion?: string;
  userAgent?: string;
  ip?: string;
}

export interface SavedSupport { id: string; createdAt: string; }

/** Persist a support/complaint/data-rights request. Returns the generated id, or null if the DB is off. */
export async function saveSupportRequest(input: SupportInput): Promise<SavedSupport | null> {
  if (!dbEnabled()) return null;
  const id = randomUUID();
  const rows = await query<{ created_at: Date }>(
    `insert into support_requests
       (id, category, name, email, subject, message, related_ref, consent_text, consent_version, user_agent, ip_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     returning created_at`,
    [id, input.category, input.name ?? null, input.email, input.subject, input.message,
     input.relatedRef ?? null, input.consentText ?? null, input.consentVersion ?? null,
     input.userAgent ?? null, ipHash(input.ip)]
  );
  return { id, createdAt: new Date(rows[0]?.created_at ?? Date.now()).toISOString() };
}

export interface ConsentInput {
  userId?: string;
  email?: string;
  consentType: string;
  consentVersion: string;
  consentText?: string;
  userAgent?: string;
  ip?: string;
}

/** Append a consent event to the audit log (best-effort — never blocks signup). */
export async function saveConsent(input: ConsentInput): Promise<boolean> {
  if (!dbEnabled()) return false;
  try {
    await query(
      `insert into consent_events (user_id, email, consent_type, consent_version, consent_text, user_agent, ip_hash)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [currentUserId() ?? null, input.email ?? null, input.consentType, input.consentVersion,
       input.consentText ?? null, input.userAgent ?? null, ipHash(input.ip)]
    );
    return true;
  } catch (e) {
    console.warn("[consent] log failed:", (e as Error).message);
    return false;
  }
}
