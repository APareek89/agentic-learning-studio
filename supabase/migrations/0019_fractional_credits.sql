-- ============================================================================
-- 0019 — fractional credits (batch-1, 27 Jun): a LESSON costs 1 credit, a SKILL 0.5.
-- credit_lots.lessons_remaining / lessons_total and credit_ledger.delta were INT;
-- widen them to numeric(10,2) so half-credit spends (and balances like 1.5) work.
-- Idempotent: only alters columns that are still 'integer', so re-running migrate
-- (which re-applies every file) is a safe no-op once converted. The existing
-- `check (lessons_remaining >= 0)` constraint stays valid for numeric.
-- ============================================================================
do $$
begin
  if (select data_type from information_schema.columns
        where table_name = 'credit_lots' and column_name = 'lessons_remaining') = 'integer' then
    alter table credit_lots  alter column lessons_remaining type numeric(10,2);
    alter table credit_lots  alter column lessons_total     type numeric(10,2);
  end if;
  if (select data_type from information_schema.columns
        where table_name = 'credit_ledger' and column_name = 'delta') = 'integer' then
    alter table credit_ledger alter column delta type numeric(10,2);
  end if;
end $$;
