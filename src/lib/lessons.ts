/**
 * # Lessons + preferences — the user's durable learning context (30-day window)
 *
 * Backs the dashboard ("your previous lessons") and the per-user preference
 * record the agent reads as standing context. All keyed by the Supabase auth user
 * id (or "local-dev" when auth is off, so the dashboard works locally too).
 *
 * Everything degrades to empty/no-op when the DB is off (graceful-optional).
 */

import { dbEnabled, query } from "./db";

export interface LessonCard {
  id: string;
  title: string;
  prompt: string | null;
  createdAt: string;
  expiresAt: string;
  daysRemaining: number;
  rating: number | null;
  industry: string | null;
  courseId: string | null;
  courseTotal: number | null;
  /** % of the lesson's modules the user has opened (server-persisted; 0 when none). */
  percent: number;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * List a user's non-expired lessons, newest first. A multi-lesson COURSE is shown
 * as ONE card (its kick-off lesson, course_index = 1); standalone lessons show as-is.
 */
export async function listLessons(userId: string, email = ""): Promise<LessonCard[]> {
  if (!dbEnabled() || !userId) return [];
  const rows = await query<{
    id: string; title: string | null; prompt: string | null;
    created_at: Date; expires_at: Date; rating: number | null; profile: { industry?: string } | null;
    course_id: string | null; course_total: number | null; percent: number | null;
  }>(
    // Match by user id OR email, so a learner's lessons follow their email across
    // sign-ins / a project migration (their auth user id can change; email is stable).
    // Left-join lesson_progress for the % completed bar (0 when never opened).
    `select l.id, l.title, l.prompt, l.created_at, l.expires_at, l.rating, l.profile,
            l.course_id, l.course_total, p.percent
       from lessons l
       left join lesson_progress p on p.lesson_id = l.id and p.user_id = $1
      where (l.user_id = $1 or ($2 <> '' and l.user_email = $2)) and l.expires_at > now()
        and l.kind = 'learning-artifact'
        and (l.course_id is null or l.course_index = 1)
      order by l.created_at desc
      limit 100`,
    [userId, email]
  ).catch(() => []);
  const now = Date.now();
  return rows.map((r) => ({
    id: r.id,
    title: r.title || "Untitled lesson",
    prompt: r.prompt,
    createdAt: new Date(r.created_at).toISOString(),
    expiresAt: new Date(r.expires_at).toISOString(),
    daysRemaining: Math.max(0, Math.ceil((new Date(r.expires_at).getTime() - now) / MS_PER_DAY)),
    rating: r.rating,
    industry: r.profile?.industry ?? null,
    courseId: r.course_id,
    courseTotal: r.course_total,
    percent: Math.max(0, Math.min(100, r.percent ?? 0)),
  }));
}

/** Upsert a user's % completed for a lesson (relayed by the host from the artifact iframe). */
export async function saveProgress(
  userId: string, email: string | undefined, lessonId: string, percent: number, visited: number, total: number
): Promise<void> {
  if (!dbEnabled() || !userId || !lessonId) return;
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  await query(
    `insert into lesson_progress (lesson_id, user_id, user_email, percent, visited, total, updated_at)
     values ($1,$2,$3,$4,$5,$6, now())
     on conflict (lesson_id, user_id) do update set
       percent = greatest(lesson_progress.percent, excluded.percent),
       visited = greatest(lesson_progress.visited, excluded.visited),
       total = excluded.total, user_email = excluded.user_email, updated_at = now()`,
    [lessonId, userId, email ?? null, pct, Math.max(0, visited || 0), Math.max(0, total || 0)]
  ).catch((e) => console.warn("[progress] save failed:", (e as Error).message));
}

/** The lessons of one course, ordered — drives the lesson-tab strip when reopened. */
export async function getCourse(courseId: string): Promise<{ id: string; index: number; title: string }[]> {
  if (!dbEnabled() || !courseId) return [];
  const rows = await query<{ id: string; course_index: number; title: string | null }>(
    `select id, course_index, title from lessons where course_id = $1 order by course_index`,
    [courseId]
  ).catch(() => []);
  return rows.map((r) => ({ id: r.id, index: r.course_index, title: r.title || `Lesson ${r.course_index}` }));
}

/** Save a 1..5 rating (+ optional comment) for a lesson the user owns. */
export async function rateLesson(userId: string, lessonId: string, rating: number, comment?: string, email = ""): Promise<boolean> {
  if (!dbEnabled() || !userId) return false;
  const clamped = Math.max(1, Math.min(5, Math.round(rating)));
  const res = await query(
    `update lessons set rating = $3, rating_comment = $4, updated_at = now()
      where id = $1 and (user_id = $2 or ($5 <> '' and user_email = $5))`,
    [lessonId, userId, clamped, comment ?? null, email]
  ).catch(() => []);
  return Array.isArray(res);
}

export type UserPrefs = Record<string, unknown>;

/** Read a user's stored landing preferences (empty object if none). */
export async function getPreferences(userId: string): Promise<UserPrefs> {
  if (!dbEnabled() || !userId) return {};
  const rows = await query<{ prefs: UserPrefs }>(`select prefs from user_preferences where user_id = $1`, [userId]).catch(() => []);
  return rows[0]?.prefs ?? {};
}

/** Upsert a user's landing preferences (called on each generation). */
export async function savePreferences(userId: string, email: string | undefined, prefs: UserPrefs): Promise<void> {
  if (!dbEnabled() || !userId) return;
  await query(
    `insert into user_preferences (user_id, user_email, prefs, updated_at)
     values ($1, $2, $3, now())
     on conflict (user_id) do update set prefs = excluded.prefs, user_email = excluded.user_email, updated_at = now()`,
    [userId, email ?? null, JSON.stringify(prefs ?? {})]
  ).catch((e) => console.warn("[prefs] save failed:", (e as Error).message));
}
