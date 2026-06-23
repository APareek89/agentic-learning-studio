-- 0012: KB-curator daily RUN LOG — one row per (non-dry) curator run so you can see,
-- day to day, WHETHER the job ran and WHAT it brought. Richer than the per-run
-- kb_updates audit row (which stays as-is). Written by services/kb-curator (writeRunLog).
create table if not exists kb_curator_runs (
  id             bigint generated always as identity primary key,
  started_at     timestamptz not null,
  finished_at    timestamptz not null default now(),
  ok             boolean     not null default true,        -- false if a red-IP item or DB error occurred
  since_window   text,                                     -- the --since lookback (e.g. '24h')
  only_filter    text,                                     -- the --only source filter, if any
  sources_polled int         not null default 0,
  added          int         not null default 0,           -- new docs embedded
  updated        int         not null default 0,           -- existing docs updated
  skipped        int         not null default 0,           -- unchanged / no-op
  dropped        int         not null default 0,           -- 🔴 IP-gated, never embedded
  chunks         int         not null default 0,           -- total chunks (re)embedded
  items          jsonb       not null default '[]'::jsonb,  -- WHAT it brought: [{outcome, path, chunks}]
  errors         jsonb       not null default '[]'::jsonb,
  dry_run        boolean     not null default false,
  created_at     timestamptz not null default now()
);
-- newest-first daily view: select started_at, ok, sources_polled, added, updated, dropped, chunks, items
--   from kb_curator_runs order by started_at desc;
create index if not exists kb_curator_runs_started_idx on kb_curator_runs (started_at desc);
-- RLS on (server role bypasses; matches 0008). No public policy.
alter table kb_curator_runs enable row level security;
