-- ============================================================================
-- Library rebuild bookkeeping — track which prebuilt lessons have been
-- re-generated through the CURRENT pipeline, and at which content version, so
-- scripts/rebuild-library.ts is resumable/idempotent (skip already-rebuilt
-- lessons unless --force).
--
-- Idempotent (IF NOT EXISTS). `blueprint jsonb` already exists (migration 0003);
-- /api/lesson/:slug re-renders from it, mirroring /api/artifact/:id.
-- ============================================================================

alter table prebuilt_lessons add column if not exists content_version text;
alter table prebuilt_lessons add column if not exists rebuilt_at timestamptz;
