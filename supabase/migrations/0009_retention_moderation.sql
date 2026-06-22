-- ============================================================================
-- Lesson retention + community moderation.
--
-- B7: user lessons used to auto-expire after 30 days (looked like "your course got
-- deleted"). Extend the window to 1 year for NEW lessons and bump existing
-- not-yet-expired ones, so nothing silently vanishes. (Tie expiry to plan once
-- billing lands — see CHECKLIST §1.)
--
-- B5: community moderation — `hidden` (auto-pulled or admin-hidden, filtered out of
-- listings) + `reports` (count; auto-hide past a threshold).
--
-- Idempotent; one simple query over the Session pooler.
-- ============================================================================

alter table lessons alter column expires_at set default (now() + interval '365 days');
update lessons set expires_at = now() + interval '365 days' where expires_at > now();

alter table community_lessons add column if not exists hidden  boolean default false;
alter table community_lessons add column if not exists reports int default 0;
