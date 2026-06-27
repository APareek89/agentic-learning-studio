/**
 * # Community Courses — learner-shared lessons (public, browse-anywhere)
 *
 * When a learner shares one of their lessons, we SNAPSHOT it here (their own
 * lessons expire in 30 days; community shares must persist) and reward them with
 * 1 free lesson credit (idempotent per shared lesson + a per-user cap, so it can't
 * be farmed). Served like the Library: public, instant, re-rendered from the stored
 * Blueprint.
 *
 * Degrades to empty/no-op when the DB is off (graceful-optional), like lessons.ts.
 */

import { randomUUID, randomBytes } from "node:crypto";
import { dbEnabled, query } from "./db";
import { getArtifact } from "./artifacts";
import { renderArtifact } from "../render/index";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { makeLLM } from "../agent/llm";

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

// The 10 canonical categories that have a thumbnail template (see CATEGORY_STYLE in app.js).
const THUMB_CATS = ["Agents", "RAG", "LLMs", "Frameworks", "Generative", "Evaluation", "Infrastructure", "Safety", "Foundations", "Build Projects"] as const;

/**
 * Pick one of the 10 thumbnail categories for a newly-shared lesson, so the Community card
 * gets a background image. Keyword match first (free, instant); only on a miss does a cheap
 * model (Haiku) classify; the final fallback is a real category so a shared lesson NEVER
 * lands as the image-less "Community". This is the "simple agent tags the thumbnail" step.
 */
async function classifyThumbCategory(title: string, topic: string, description: string): Promise<string> {
  const kw = deriveCategory(`${topic} ${title} ${description}`);
  if ((THUMB_CATS as readonly string[]).includes(kw)) return kw;
  try {
    const llm = makeLLM("haiku", 0).withStructuredOutput(z.object({ category: z.enum(THUMB_CATS) }), { name: "thumb_category" });
    const out = await llm.invoke([
      new SystemMessage(`Classify this AI/ML lesson into EXACTLY one of these 10 categories for its thumbnail image: ${THUMB_CATS.join(", ")}. Pick the single closest. Return only the category.`),
      new HumanMessage(`Title: ${title}\nTopic: ${topic}\nDescription: ${description}`.slice(0, 1500)),
    ]);
    if (out?.category && (THUMB_CATS as readonly string[]).includes(out.category)) return out.category;
  } catch { /* model unavailable → fall through to the default */ }
  return "Foundations";
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "lesson";
}

/** All community lessons (newest first). The front-end derives "featured" = top 10 by likes. */
export async function listCommunity(): Promise<CommunityCard[]> {
  if (!dbEnabled()) return [];
  const rows = await query<CommunityRow>(
    `select slug, title, description, category, level, est_minutes, submitter_name, likes
       from community_lessons where hidden = false order by created_at desc limit 300`
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

/** Anonymous report (+1) on a community lesson. Auto-hides it past a threshold (pending review). */
export async function reportCommunity(slug: string): Promise<{ ok: boolean; hidden: boolean }> {
  if (!dbEnabled()) return { ok: false, hidden: false };
  const rows = await query<{ reports: number }>(
    `update community_lessons set reports = reports + 1 where slug = $1 returning reports`, [slug]
  ).catch(() => []);
  if (!rows.length) return { ok: false, hidden: false };
  const REPORTS_TO_HIDE = 3;
  if ((rows[0].reports ?? 0) >= REPORTS_TO_HIDE) {
    await query(`update community_lessons set hidden = true where slug = $1`, [slug]).catch(() => {});
    return { ok: true, hidden: true };
  }
  return { ok: true, hidden: false };
}

/** Anonymous like (+1). Per-browser dedupe is done client-side. Returns the new count. */
export async function likeCommunity(slug: string): Promise<number | null> {
  if (!dbEnabled()) return null;
  const rows = await query<{ likes: number }>(
    `update community_lessons set likes = likes + 1 where slug = $1 returning likes`, [slug]
  ).catch(() => []);
  return rows.length ? rows[0].likes : null;
}

export interface ShareResult { ok: boolean; slug?: string; rewarded?: boolean; error?: string; already?: boolean }

/**
 * Snapshot a learner's lesson into the community pool. Sharing grants NO credit reward — it's
 * simply "Share with Community". (`opts.contributor` only changes the displayed submitter name.)
 */
export async function shareLesson(
  lessonId: string, user: { id: string; email: string }, displayName?: string, opts: { contributor?: boolean } = {}
): Promise<ShareResult> {
  if (!dbEnabled()) return { ok: false, error: "Sharing is unavailable right now." };
  const art = await getArtifact(lessonId);
  if (!art || !art.blueprint) return { ok: false, error: "Lesson not found." };
  // Ownership: only the owner can share their lesson.
  const owns = (art.userId && art.userId === user.id) || (art.userEmail && art.userEmail === user.email);
  if (!owns) return { ok: false, error: "You can only share your own lessons." };

  // Don't double-publish the same source lesson.
  const existing = await query<{ slug: string }>(
    `select slug from community_lessons where source_lesson_id = $1 limit 1`, [lessonId]
  ).catch(() => []);
  if (existing.length) return { ok: true, slug: existing[0].slug, already: true };

  const bp = art.blueprint;
  const title = bp.meta.title || art.title || "Untitled lesson";
  const description = bp.meta.thesis ?? null;
  const level = bp.learnerProfile?.level ?? null;
  const estMinutes = bp.meta.estTotalMinutes ?? null;
  const category = await classifyThumbCategory(title, bp.meta.topic ?? "", description ?? "");
  // Contributor publish credits their registered name; regular share uses the given name / email handle.
  let name = (displayName || "").trim().slice(0, 60);
  if (opts.contributor) {
    const c = await getContributor(user.id);
    name = (c?.full_name || name || "").trim() || (user.email ? user.email.split("@")[0] : "A contributor");
  } else if (!name) {
    name = user.email ? user.email.split("@")[0] : "A learner";
  }
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

  // Sharing to the Community is now its own reward — no free-lesson credit is granted (the beta
  // doesn't charge anyway). Both regular and contributor shares simply publish the snapshot.
  return { ok: true, slug };
}

// ============================================================================
// Contributors — one-time registration + the Community Drivers directory.
// ============================================================================

export interface Contributor {
  user_id: string; full_name: string; bio: string | null; expertise: string | null;
  motivation: string | null; motivation_other: string | null; link: string | null;
}
export interface ContributorInput {
  fullName: string; bio?: string; expertise?: string; motivation?: string; motivationOther?: string; link?: string; agreed?: boolean;
}

/** Read a contributor profile (null if not registered). */
export async function getContributor(userId: string): Promise<Contributor | null> {
  if (!dbEnabled() || !userId) return null;
  const rows = await query<Contributor>(
    `select user_id, full_name, bio, expertise, motivation, motivation_other, link from contributors where user_id = $1`, [userId]
  ).catch(() => []);
  return rows[0] ?? null;
}

/** Register (or update) a contributor. fullName + agreed are required. */
export async function registerContributor(user: { id: string; email: string }, input: ContributorInput): Promise<{ ok: boolean; error?: string }> {
  if (!dbEnabled()) return { ok: false, error: "Registration is unavailable right now." };
  const fullName = (input.fullName || "").trim().slice(0, 80);
  if (!fullName) return { ok: false, error: "Please enter your full name." };
  if (!input.agreed) return { ok: false, error: "Please accept the contributor guidelines." };
  await query(
    `insert into contributors (user_id, user_email, full_name, bio, expertise, motivation, motivation_other, link, agreed_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8, now(), now())
     on conflict (user_id) do update set
       user_email = excluded.user_email, full_name = excluded.full_name, bio = excluded.bio,
       expertise = excluded.expertise, motivation = excluded.motivation, motivation_other = excluded.motivation_other,
       link = excluded.link, agreed_at = now(), updated_at = now()`,
    [user.id, user.email, fullName, (input.bio || "").trim() || null, (input.expertise || "").trim() || null,
     input.motivation || null, (input.motivationOther || "").trim() || null, (input.link || "").trim() || null]
  ).catch((e) => { throw e; });
  return { ok: true };
}

export interface DriverCard { userId: string; name: string; headline: string | null; expertise: string | null; courses: number; likes: number; }

/** Community Drivers directory: every contributor + their published-course count & total likes. */
export async function listDrivers(): Promise<DriverCard[]> {
  if (!dbEnabled()) return [];
  const rows = await query<{ user_id: string; full_name: string; bio: string | null; expertise: string | null; courses: string; likes: string }>(
    `select c.user_id, c.full_name, c.bio, c.expertise,
            count(cl.id)::text as courses, coalesce(sum(cl.likes),0)::text as likes
       from contributors c
       left join community_lessons cl on cl.submitter_user_id = c.user_id and cl.hidden = false
      group by c.user_id, c.full_name, c.bio, c.expertise
      order by count(cl.id) desc, coalesce(sum(cl.likes),0) desc, c.created_at desc
      limit 300`
  ).catch(() => []);
  return rows.map((r) => ({ userId: r.user_id, name: r.full_name, headline: r.bio, expertise: r.expertise, courses: Number(r.courses) || 0, likes: Number(r.likes) || 0 }));
}

/** One contributor's profile + the courses they've published. */
export async function getDriver(userId: string): Promise<{ profile: Contributor; courses: CommunityCard[] } | null> {
  if (!dbEnabled() || !userId) return null;
  const profile = await getContributor(userId);
  if (!profile) return null;
  const rows = await query<CommunityRow>(
    `select slug, title, description, category, level, est_minutes, submitter_name, likes
       from community_lessons where submitter_user_id = $1 and hidden = false order by created_at desc`, [userId]
  ).catch(() => []);
  const courses = rows.map((r) => ({
    slug: r.slug, title: r.title, description: r.description, category: r.category,
    level: r.level, estMinutes: r.est_minutes, submitter: r.submitter_name, likes: r.likes ?? 0,
  }));
  return { profile, courses };
}
