-- ============================================================================
-- Row-Level Security lockdown — close the Supabase anon-key data hole.
--
-- Supabase auto-exposes a PostgREST data API on the PUBLIC anon key (shipped to
-- every browser). Without RLS, anyone with that key can read/modify every row.
-- Enabling RLS with NO policies = the anon/authenticated roles are DENIED all
-- rows on these tables. The app is UNAFFECTED: the server connects as `postgres`
-- (rolbypassrls = true) and all app data flows through /api/* (the browser uses
-- Supabase only for AUTH, never direct table reads).
--
-- `enable` (not `force`) so table owners stay exempt; idempotent (safe to re-run).
-- ============================================================================

alter table chunks            enable row level security;
alter table community_lessons enable row level security;
alter table contributors      enable row level security;
alter table discount_codes    enable row level security;
alter table documents         enable row level security;
alter table generations       enable row level security;
alter table glossary          enable row level security;
alter table kb_updates        enable row level security;
alter table lesson_progress   enable row level security;
alter table lessons           enable row level security;
alter table module_cache      enable row level security;
alter table prebuilt_lessons  enable row level security;
alter table user_preferences  enable row level security;
