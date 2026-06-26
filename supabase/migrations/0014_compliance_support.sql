-- ============================================================================
-- Compliance + support: general complaint/grievance/data-request intake and a
-- consent audit trail. India-readiness (DPDP, IT Intermediary Rules, Consumer
-- Protection E-Commerce Rules) for the individual-operator beta.
--
-- This is SEPARATE from the existing community-lesson report flow
-- (community_lessons.reports / /api/community/report) — that stays as-is.
--
-- support_requests = every submission from /report-issue (the general
--   complaint/grievance/data-rights form). Data-rights requests (access,
--   correction, deletion, consent withdrawal, nomination) ride here too, keyed
--   by `category`, rather than a separate table — one intake, one queue.
-- consent_events = an append-only log of consents (e.g. the signup
--   "I agree to the Terms and acknowledge the Privacy Notice" checkbox).
--
-- Privacy by design: we store a HASHED IP (sha256), never the raw IP.
--
-- RLS: enabled with NO policies (anon/authenticated denied), same posture as
-- 0008_rls_lockdown.sql + 0013. The server connects as postgres (rolbypassrls)
-- and all access flows through /api/*. Idempotent; safe to re-run.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists support_requests (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  category         text not null,                 -- privacy_data_request | consent_withdrawal | account_deletion | correction_access | security_vuln | community_content | billing_refund | technical | grievance | other
  name             text,                          -- optional
  email            text not null,
  subject          text not null,
  message          text not null,
  related_ref      text,                          -- related URL / lesson id / community slug
  consent_text     text,                          -- the exact consent string the user accepted
  consent_version  text,
  user_agent       text,
  ip_hash          text,                          -- sha256 of the IP — NEVER the raw IP
  status           text not null default 'open'   -- open | in_progress | resolved | closed
);

create index if not exists support_requests_created_idx  on support_requests (created_at desc);
create index if not exists support_requests_email_idx    on support_requests (email);
create index if not exists support_requests_category_idx on support_requests (category);
create index if not exists support_requests_status_idx   on support_requests (status);

create table if not exists consent_events (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  user_id          text,                          -- nullable (set when signed in)
  email            text,
  consent_type     text not null,                 -- e.g. 'signup_terms_privacy'
  consent_version  text not null,
  consent_text     text,
  user_agent       text,
  ip_hash          text
);

create index if not exists consent_events_created_idx on consent_events (created_at desc);
create index if not exists consent_events_email_idx   on consent_events (email);
create index if not exists consent_events_user_idx    on consent_events (user_id);

alter table support_requests enable row level security;
alter table consent_events   enable row level security;
