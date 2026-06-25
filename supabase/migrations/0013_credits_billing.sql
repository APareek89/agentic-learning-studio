-- ============================================================================
-- Lesson credits + billing (phase 1: the money path).
--
-- One generated lesson (a completed /api/build) costs ONE credit. The free
-- overview/preview stays free. This closes the #1 cost-abuse risk: generation
-- previously had no per-user spend gate.
--
-- Model = CREDIT LOTS (not a single mutable balance int) so 12-month expiry works
-- without a sweep job: each purchase/grant is a lot with its own expires_at and a
-- lessons_remaining counter. Effective balance = SUM(lessons_remaining) over lots
-- that still have credits AND haven't expired. A spend decrements the OLDEST
-- non-expired lot (FIFO). When a lot's expires_at passes it simply stops counting
-- in the balance query — nothing to clean up.
--
-- Idempotency: credit_lots.ls_order_id is UNIQUE. Lemon Squeezy retries webhooks,
-- so addCredits inserts the lot ON CONFLICT (ls_order_id) DO NOTHING. The one-time
-- free grant reuses this with ls_order_id = 'grant:<user_id>'.
--
-- credit_ledger = append-only audit trail (+N purchase/grant rows, -1 generation
-- rows) for support + reconciliation. The lots table is the source of truth for
-- the balance; the ledger never gates anything.
--
-- RLS: enabled with NO policies (anon/authenticated denied). The server connects
-- as postgres (rolbypassrls) and all access flows through /api/* — same posture as
-- migration 0008. Idempotent; safe to re-run.  (promo_codes + admin = phase 2.)
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists credit_lots (
  id                uuid primary key default gen_random_uuid(),
  user_id           text not null,
  lessons_remaining int  not null check (lessons_remaining >= 0),
  lessons_total     int  not null,
  reason            text not null,                 -- 'purchase' | 'grant' | 'admin'
  plan_id           text,                          -- 'lessons-payg' | 'trial-launch' | 'free-grant'
  amount_usd        numeric,
  code              text,                          -- discount code applied (phase 2), if any
  ls_order_id       text unique,                   -- webhook idempotency; 'grant:<user_id>' for the free grant
  expires_at        timestamptz,                   -- now() + 12 months (NULL = never expires)
  created_at        timestamptz default now()
);

-- Balance sum: lots for a user that still have credits and haven't expired.
create index if not exists credit_lots_balance_idx
  on credit_lots (user_id, expires_at)
  where lessons_remaining > 0;
-- FIFO spend: oldest lot first.
create index if not exists credit_lots_fifo_idx
  on credit_lots (user_id, created_at);

create table if not exists credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  delta       int  not null,                       -- +N purchase/grant, -1 generation
  reason      text not null,                       -- 'purchase' | 'generation' | 'grant' | 'admin'
  plan_id     text,
  amount_usd  numeric,
  ls_order_id text,
  created_at  timestamptz default now()
);
create index if not exists credit_ledger_user_idx on credit_ledger (user_id, created_at);

alter table credit_lots   enable row level security;
alter table credit_ledger enable row level security;
