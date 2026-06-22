-- ============================================================================
-- Contributors — learners who register (one-time) to BUILD courses for the
-- Community. Their published courses live in community_lessons (credited via
-- submitter_user_id); this table holds their profile (shown in Community Drivers).
--
-- Idempotent (IF NOT EXISTS). One simple query over the Session pooler.
-- ============================================================================

create table if not exists contributors (
  user_id          text primary key,
  user_email       text,
  full_name        text not null,
  bio              text,            -- relevant background/expertise (the "what qualifies you" answer)
  expertise        text,            -- areas they can teach (short text / tags)
  motivation       text,            -- 'money' | 'knowledge' | 'recognition' | 'other'
  motivation_other text,            -- free text when motivation = 'other'
  link             text,            -- optional LinkedIn / GitHub / site (a trust signal)
  agreed_at        timestamptz,     -- accepted the originality + AI-disclosure guidelines
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);
