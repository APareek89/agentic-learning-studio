-- ============================================================================
-- Multi-lesson courses — group several generated lessons into one course.
--
-- Idempotent. A broad ask ("teach me everything about X") becomes a COURSE of
-- 2–5 lessons; each lesson is a normal row in `lessons` tagged with its course.
-- The kick-off lesson (course_index = 1) is generated first; the rest build in
-- the background. The dashboard groups a course under its kick-off lesson.
-- ============================================================================

alter table lessons add column if not exists course_id    text;
alter table lessons add column if not exists course_index int;
alter table lessons add column if not exists course_total int;
alter table lessons add column if not exists course_title text;
create index if not exists lessons_course_idx on lessons (course_id, course_index);
