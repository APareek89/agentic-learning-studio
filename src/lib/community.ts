/**
 * # Community Courses — learner-shared lessons (public, browse-anywhere)
 *
 * When a learner shares one of their lessons, we SNAPSHOT it here (their own
 * lessons expire in 30 days; community shares must persist) and mint a discount
 * code for their next purchase (functionality only — checkout redemption is wired
 * to billing later; see checklist.MD). Served like the Library: public, instant,
 * re-rendered from the stored Blueprint.
 *
 * Degrades to empty/no-op when the DB is off (graceful-optional), like lessons.ts.
 */

import { randomUUID, randomBytes } from "node:crypto";
import { dbEnabled, query } from "./db";
import { getArtifact } from "./artifacts";
import { renderArtifact } from "../render/index";

export interface CommunityCard {
  slug: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string | null;
  estMinutes: number | null;
  submitter: string | null;
  likes: number;
}

interface CommunityRow {
  slug: string; title: string; description: string | null; category: string | null;
  level: string | null; est_minutes: number | null; submitter_name: string | null; likes: number | null;
}

/** Map a user lesson's topic/title to the closest Library category (drives the tile color). */
const CATEGORY_KEYWORDS: [string, RegExp][] = [
  ["RAG", /\brag\b|retrieval|embedding|vector|chunk|rerank/i],
  ["Agents", /\bagent|tool use|multi-agent|orchestrat|planning|mcp\b|memory/i],
  ["LLMs", /\bllm|language model|prompt|token|fine-?tun|transformer|attention/i],
  ["Frameworks", /langchain|langgraph|crewai|autogen|llamaindex|framework|sdk/i],
  ["Generative", /image|video|diffusion|generat|stable diffusion|gan\b/i],
  ["Evaluation", /eval|benchmark|metric|faithful|hallucinat|test harness/i],
  ["Infrastructure", /deploy|kubernetes|server|infra|scal|gpu|latency|cost/i],
  ["Safety", /safety|guardrail|jailbreak|prompt inject|moderation|sandbox|red team/i],
  ["Build Projects", /\bbuild\b|chatbot|app\b|project|ship|end-to-end/i],
  ["Foundations", /supervised|unsupervised|neural net|gradient|overfit|fundamental|basics/i],
];
function deriveCategory(text: string): string {
  for (const [cat, re] of CATEGORY_KEYWORDS) if (re.test(text)) return cat;
  return "Community";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson";
}
function discountCode(): string {
  return "SHARE30-" + randomBytes(5).toString("hex").toUpperCase().slice(0, 8);
}

/** All community lessons (newest first). The front-end derives "featured" = top 10 by likes. */
export async function listCommunity(): Promise<CommunityCard[]> {
  if (!dbEnabled()) return [];
  const rows = await query<CommunityRow>(
    `select slug, title, description, category, level, est_minutes, submitter_name, likes
       from community_lessons order by created_at desc limit 300`
  ).catch(() => []);
  return rows.map((r) => ({
    slug: r.slug, title: r.title, description: r.description, category: r.category,
    level: r.level, estMinutes: r.est_minutes, submitter: r.submitter_name, likes: r.likes ?? 0,
  }));
}

/** Serve one community lesson — re-render from its stored Blueprint, fallback to html. */
export async function getCommunityHtml(slug: string): Promise<string | null> {
  if (!dbEnabled()) return null;
  const rows = await query<{ html: string; blueprint: unknown }>(
    `select html, blueprint from community_lessons where slug = $1`, [slug]
  ).catch(() => []);
  if (!rows.length) return null;
  const bp = rows[0].blueprint;
  const parsed = typeof bp === "string" ? safeParse(bp) : bp;
  if (parsed) { try { return renderArtifact(parsed as never); } catch { /* fall through */ } }
  return rows[0].html;
}
function safeParse(s: string): unknown { try { return JSON.parse(s); } catch { return null; } }

/** Anonymous like (+1). Per-browser dedupe is done client-side. Returns the new count. */
export async function likeCommunity(slug: string): Promise<number | null> {
  if (!dbEnabled()) return null;
  const rows = await query<{ likes: number }>(
    `update community_lessons set likes = likes + 1 where slug = $1 returning likes`, [slug]
  ).catch(() => []);
  return rows.length ? rows[0].likes : null;
}

export interface ShareResult { ok: boolean; slug?: string; code?: string; error?: string }

/** Snapshot a learner's lesson into the community pool + mint a discount code. */
export async function shareLesson(
  lessonId: string, user: { id: string; email: string }, displayName?: string
): Promise<ShareResult> {
  if (!dbEnabled()) return { ok: false, error: "Sharing is unavailable right now." };
  const art = await getArtifact(lessonId);
  if (!art || !art.blueprint) return { ok: false, error: "Lesson not found." };
  // Ownership: only the owner can share their lesson.
  const owns = (art.userId && art.userId === user.id) || (art.userEmail && art.userEmail === user.email);
  if (!owns) return { ok: false, error: "You can only share your own lessons." };

  const bp = art.blueprint;
  const title = bp.meta.title || art.title || "Untitled lesson";
  const description = bp.meta.thesis ?? null;
  const level = bp.learnerProfile?.level ?? null;
  const estMinutes = bp.meta.estTotalMinutes ?? null;
  const category = deriveCategory(`${bp.meta.topic ?? ""} ${title}`);
  const name = (displayName || "").trim().slice(0, 60) || (user.email ? user.email.split("@")[0] : "A learner");
  const slug = `${slugify(title)}-${randomBytes(3).toString("hex")}`;
  const html = renderArtifact(bp); // fully-built (an approved lesson) → safe to browse statically

  try {
    await query(
      `insert into community_lessons
         (id, slug, source_lesson_id, title, description, category, level, est_minutes, blueprint, html,
          submitter_name, submitter_user_id, submitter_email)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [randomUUID(), slug, lessonId, title, description, category, level, estMinutes,
       JSON.stringify(bp), html, name, user.id, user.email]
    );
  } catch (e) {
    return { ok: false, error: "Couldn't share this lesson. " + ((e as Error).message?.slice(0, 80) ?? "") };
  }

  const code = discountCode();
  await query(
    `insert into discount_codes (code, user_id, user_email, lesson_id, percent, source)
     values ($1,$2,$3,$4,30,'community_share')`,
    [code, user.id, user.email, lessonId]
  ).catch(() => { /* code is best-effort; the share already succeeded */ });

  return { ok: true, slug, code };
}
