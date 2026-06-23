-- 0011: KB-curator change flag — identify content the curator ADDED vs MODIFIED.
-- Set by services/kb-curator/apply.ts on each embed:
--   'added'    = the documents row did NOT exist before this run (new content)
--   'modified' = an existing documents row was updated (current content changed)
--   null       = not curator-touched (manual ingest / older rows)
-- Additive + idempotent + nullable, so existing rows, the app's retrieval, and the
-- app's own `ingest` are all unaffected.
alter table documents add column if not exists curator_change text;
alter table documents add column if not exists curator_changed_at timestamptz;
comment on column documents.curator_change is
  'KB curator: added (new documents row) | modified (existing row updated); null = not curator-touched';
