-- Apply to the fresh PostgreSQL application database before deploying this release.
-- Historical directory name retained; this migration does not use Supabase.
-- Existing JWT-only sessions deliberately require sign-in again.
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_sessions_user ON public.auth_sessions(user_id);
