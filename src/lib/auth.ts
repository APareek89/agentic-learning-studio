/**
 * # Auth — Supabase Auth gating (graceful-optional, like everything else here)
 *
 * When `SUPABASE_URL` + `SUPABASE_ANON_KEY` are set, the generation endpoints
 * require a valid Supabase session (a signed-in user). When they're NOT set, auth is
 * OFF and the app runs open — so local dev needs zero auth config, and you flip auth
 * on in production just by setting those two env vars.
 *
 * Verification calls Supabase's own `/auth/v1/user` endpoint with the caller's access
 * token. That needs no extra npm dependency and works regardless of how the project
 * signs its JWTs (HS256 legacy or asymmetric). One small network hop per gated call —
 * negligible next to a multi-minute generation.
 *
 * The ANON key is a PUBLIC key (safe to ship to the browser); it only identifies the
 * project and lets the client talk to the Auth API. Never put the service-role key here.
 */

export function authEnabled(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
}

export interface AuthUser {
  id: string;
  email?: string;
}

/** Pull the token out of an `Authorization: Bearer <token>` header. */
export function bearerFrom(header?: string): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1] : null;
}

/** Validate an access token with Supabase; returns the user or null. */
export async function verifyToken(token: string): Promise<AuthUser | null> {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return null;
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const u = (await res.json()) as { id?: string; email?: string };
    return u?.id ? { id: u.id, email: u.email } : null;
  } catch {
    return null;
  }
}
