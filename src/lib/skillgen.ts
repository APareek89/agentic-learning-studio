/**
 * # Skill generation — turn a free-text brief into an installable Agent Skill
 *
 * The "LLM Skills" tab posts a short brief (which LLM interface, the task, the
 * data sources, how to reach them, plus optional examples/constraints) and gets
 * back a ready-to-install Skill: a `SKILL.md` (with correct frontmatter) plus any
 * supporting scripts, a how-to-use guide, and cited sources.
 *
 * Design mirrors the lesson pipeline's infra WITHOUT forking it:
 *   - RETRIEVE grounds the generation in the "Agent Skills" KB category so the
 *     SKILL.md format / install steps / invocation are correct. If that category
 *     isn't ingested yet, retrieval just returns nothing and we generate ungrounded
 *     (logged, never fails).
 *   - The model emits ONLY a STRUCTURED `SkillPackage` (Zod-validated via
 *     withStructuredOutput) — never HTML/JS. The app renders + escapes it.
 *   - Jobs run DETACHED (like runOverviewJob) so the browser polls for progress.
 *
 * We never EXECUTE the generated scripts — they're for the user to download and
 * run elsewhere. We only sanity-check the SKILL.md frontmatter.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { makeLLM, structuredOutput, invokeResilient } from "../agent/llm";
import { retrieve } from "../rag/retrieve";
import { ragEnabled, dbEnabled, query, requireUserId } from "./db";
import { spend } from "./credits";
import { retrieveFromUploads } from "./uploads";
import { releaseGenSlot } from "./jobs";
import { sha256 } from "./hash";

/** The KB category the generator grounds itself in (matches kb/manifest.yaml). */
export const AGENT_SKILLS_CATEGORY = "Agent Skills";

// ---------------------------------------------------------------------------
// Structured output the model must return (and nothing else).
// ---------------------------------------------------------------------------
const SampleIOSchema = z.object({
  input: z.string().describe("An example user request the skill would handle"),
  output: z.string().describe("What the skill would produce / do in response"),
});
const SkillFileSchema = z.object({
  path: z.string().describe('Relative path, e.g. "SKILL.md" or "scripts/run.py"'),
  language: z.string().describe('Highlight language id, e.g. "markdown", "python", "bash", "javascript"'),
  content: z.string().describe("The full file contents"),
});
const SkillSourceSchema = z.object({
  title: z.string(),
  url: z.string().optional(),
});
export const SkillPackageSchema = z.object({
  meta: z.object({
    name: z.string().describe("Human-readable skill name"),
    slug: z.string().describe("kebab-case identifier for the skill folder + SKILL.md name"),
    llmInterface: z.string().describe("The LLM interface this targets, e.g. Claude Code, Codex, Cursor"),
    task: z.string().describe("One-line statement of what the skill is for"),
    summary: z.string().describe("2-3 sentence summary of the skill"),
  }),
  overview: z.object({
    whatItDoes: z.string().describe("A clear paragraph (markdown ok) on what the skill does and when it triggers"),
    sampleIO: z.array(SampleIOSchema).describe("2-4 concrete input -> output examples"),
  }),
  howToUse: z.object({
    install: z.string().describe("Markdown: how to install/place the skill for the specified LLM interface"),
    invoke: z.string().describe("Markdown: how to invoke/trigger the skill in that interface"),
    connectDataSources: z.string().describe("Markdown: how to connect the named data sources (env vars, auth, API/MCP/CLI setup)"),
  }),
  files: z.array(SkillFileSchema).min(1).describe('The skill files. files[0] MUST be the SKILL.md.'),
  sources: z.array(SkillSourceSchema).describe("Reference sources used"),
});
export type SkillPackage = z.infer<typeof SkillPackageSchema>;

// ---------------------------------------------------------------------------
// Inputs + job tracking (in-memory, like jobs.ts; v1 is ephemeral by decision).
// ---------------------------------------------------------------------------
export interface SkillInput {
  llmInterface: string;
  task: string;
  dataSources: string;
  accessMethod: string;
  exampleRequest?: string;
  tools?: string;
  constraints?: string;
  skillName?: string;
  refDocIds?: string[];
  /** Who to persist the result under (My Skills). Empty for open-mode/anon. */
  userId?: string;
  userEmail?: string;
}

export interface SkillJob {
  id: string;
  userId: string;
  status: "running" | "done" | "error";
  percent: number;
  error?: string;
  /** Set once generation finishes. */
  skill?: SkillPackage;
  /** True when the "Agent Skills" KB grounded this generation. */
  grounded?: boolean;
  /** True once persisted to the user's My Skills. */
  saved?: boolean;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Persistence — "My Skills" (durable history; mirrors My Lessons). Graceful-
// optional: every fn is a safe no-op when there's no DB / no user.
// ---------------------------------------------------------------------------
export interface SavedSkillRow {
  id: string;
  slug: string;
  name: string;
  task: string;
  llmInterface: string;
  grounded: boolean;
  createdAt: string;
}

/** Upsert a generated skill into the user's history (keyed by user+slug). */
export async function persistSkill(userId: string, email: string, pkg: SkillPackage, grounded: boolean): Promise<string | null> {
  requireUserId(userId);
  if (!dbEnabled() || !userId) return null;
  try {
    const rows = await query<{ id: string }>(
      `insert into generated_skills (user_id, user_email, slug, name, task, llm_interface, grounded, skill)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       on conflict (user_id, slug) do update set
         user_email = excluded.user_email, name = excluded.name, task = excluded.task,
         llm_interface = excluded.llm_interface, grounded = excluded.grounded,
         skill = excluded.skill, created_at = now()
       returning id::text`,
      [userId || null, email || null, pkg.meta.slug, pkg.meta.name, pkg.meta.task, pkg.meta.llmInterface, grounded, JSON.stringify(pkg)]
    );
    return rows[0]?.id ?? null;
  } catch (e) {
    console.warn("[persistSkill]", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** A user's saved skills, newest first (matched by id OR email, like lessons). */
export async function listSavedSkills(userId: string, email = ""): Promise<SavedSkillRow[]> {
  requireUserId(userId);
  if (!dbEnabled() || !userId) return [];
  const rows = await query<{ id: string; slug: string; name: string; task: string | null; llm_interface: string | null; grounded: boolean; created_at: Date }>(
    `select id::text, slug, name, task, llm_interface, grounded, created_at
       from generated_skills
      where user_id = $1
      order by created_at desc
      limit 200`,
    [userId]
  ).catch(() => []);
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, task: r.task ?? "", llmInterface: r.llm_interface ?? "",
    grounded: !!r.grounded, createdAt: r.created_at ? new Date(r.created_at).toISOString() : "",
  }));
}

/** Fetch one saved skill's full package (scoped to the requesting user). */
export async function getSavedSkill(id: string, userId: string, email = ""): Promise<{ skill: SkillPackage; grounded: boolean } | null> {
  requireUserId(userId);
  if (!dbEnabled() || !id || !userId) return null;
  const rows = await query<{ skill: SkillPackage; grounded: boolean }>(
    `select skill, grounded from generated_skills
      where id = $1 and user_id = $2 limit 1`,
    [id, userId]
  ).catch(() => []);
  if (!rows[0]) return null;
  return { skill: rows[0].skill, grounded: !!rows[0].grounded };
}

/** Delete a saved skill (scoped to the requesting user). Returns true if removed. */
export async function deleteSavedSkill(id: string, userId: string, email = ""): Promise<boolean> {
  requireUserId(userId);
  if (!dbEnabled() || !id || !userId) return false;
  const rows = await query<{ id: string }>(
    `delete from generated_skills
      where id = $1 and user_id = $2 returning id::text`,
    [id, userId]
  ).catch(() => []);
  return rows.length > 0;
}

const skillJobs = new Map<string, SkillJob>();
/** Cache by a hash of the brief so an identical brief returns instantly. */
const skillCache = new Map<string, SkillPackage>();

export function createSkillJob(userId: string): SkillJob {
  requireUserId(userId);
  const job: SkillJob = { id: randomUUID(), userId, status: "running", percent: 4, createdAt: Date.now() };
  skillJobs.set(job.id, job);
  // Drop jobs older than 30 min so the map can't grow unbounded.
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, j] of skillJobs) if (j.createdAt < cutoff) skillJobs.delete(id);
  return job;
}

export function getSkillJob(id: string): SkillJob | undefined {
  const userId = requireUserId();
  const job = skillJobs.get(id);
  return job?.userId === userId ? job : undefined;
}

/** Stable cache key for a brief (so re-submitting the same brief is instant). */
export function skillCacheKey(input: SkillInput): string {
  const owner = requireUserId(input.userId);
  return sha256(
    JSON.stringify({
      owner,
      i: input.llmInterface?.trim().toLowerCase() ?? "",
      t: input.task?.trim().toLowerCase() ?? "",
      d: input.dataSources?.trim().toLowerCase() ?? "",
      a: input.accessMethod?.trim().toLowerCase() ?? "",
      e: input.exampleRequest?.trim().toLowerCase() ?? "",
      o: input.tools?.trim().toLowerCase() ?? "",
      c: input.constraints?.trim().toLowerCase() ?? "",
      n: input.skillName?.trim().toLowerCase() ?? "",
      r: [...(input.refDocIds ?? [])].sort(),
    })
  );
}

export function getCachedSkill(input: SkillInput): SkillPackage | undefined {
  return skillCache.get(skillCacheKey(input));
}

// ---------------------------------------------------------------------------
// Helpers — deterministic, no LLM.
// ---------------------------------------------------------------------------
/** kebab-case a name into a valid skill slug. */
export function slugify(s: string): string {
  const out = (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return out || "my-skill";
}

const SYSTEM_PROMPT = `You are an expert author of Agent Skills (Claude/Codex/Cursor/Gemini "skills").
You turn a short brief into a single, installable Skill package.

Return ONLY the structured SkillPackage. Do NOT return HTML, app code, or prose outside the schema.

Hard rules:
- files[0] MUST be the SKILL.md. Its path is exactly "SKILL.md".
- SKILL.md MUST begin with YAML frontmatter delimited by --- on its own lines, containing:
    name: a kebab-case identifier (matches meta.slug)
    description: a TRIGGER description that starts with "Use when ..." and names the task + the LLM interface, so the host model knows when to load the skill.
- After the frontmatter, SKILL.md body explains: what the skill does, how to use it, the exact data sources + how to access them, and any constraints. Reference the supporting script files by path.
- Put runnable helpers under scripts/ (e.g. scripts/run.py, scripts/fetch.sh). Keep them minimal, correct, and self-contained; read secrets from environment variables, never hard-code credentials.
- Tailor install + invocation to the SPECIFIED LLM interface (e.g. Claude Code uses ~/.claude/skills/<slug>/ or a plugin; Codex/Cursor have their own conventions — say which).
- Respect the stated constraints (the "must NOT do" list) in both SKILL.md and the scripts.
- howToUse.install / invoke / connectDataSources are MARKDOWN (use fenced code blocks for commands).
- overview.sampleIO gives 2-4 realistic input -> output pairs grounded in the example request.
- Ground format + install/packaging details in the provided "Agent Skills" reference excerpts when present.`;

function buildUserPrompt(input: SkillInput, kbContext: string, uploadContext: string): string {
  const lines: string[] = [];
  lines.push("Generate an installable Agent Skill from this brief.\n");
  lines.push(`LLM interface: ${input.llmInterface || "(infer a sensible default, e.g. Claude Code)"}`);
  lines.push(`Task the skill is for: ${input.task}`);
  lines.push(`Data sources: ${input.dataSources || "(none specified)"}`);
  lines.push(`Method to access data: ${input.accessMethod || "(infer)"}`);
  if (input.exampleRequest?.trim()) lines.push(`Example request a user would give the skill: ${input.exampleRequest.trim()}`);
  if (input.tools?.trim()) lines.push(`Tools/commands it should use: ${input.tools.trim()}`);
  if (input.constraints?.trim()) lines.push(`Constraints — what it must NOT do: ${input.constraints.trim()}`);
  if (input.skillName?.trim()) lines.push(`Preferred skill name: ${input.skillName.trim()}`);
  else lines.push("Skill name: (none given — generate a clear name + kebab-case slug)");
  if (uploadContext) {
    lines.push("\n--- Reference material the user attached (use it to ground the skill) ---");
    lines.push(uploadContext);
  }
  if (kbContext) {
    lines.push("\n--- Agent Skills reference excerpts (authoritative on SKILL.md format, install, invocation) ---");
    lines.push(kbContext);
  } else {
    lines.push("\n(No Agent Skills KB excerpts available — rely on your own knowledge of the SKILL.md format.)");
  }
  return lines.join("\n");
}

/** Parse + validate SKILL.md frontmatter; returns the parsed name/description or null. */
function parseFrontmatter(content: string): { name?: string; description?: string; body: string } | null {
  if (!content.startsWith("---")) return null;
  // Find the closing --- on its own line.
  const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return null;
  const block = m[1];
  const body = m[2] ?? "";
  const nameM = block.match(/^\s*name\s*:\s*(.+?)\s*$/m);
  const descM = block.match(/^\s*description\s*:\s*(.+?)\s*$/m);
  return {
    name: nameM ? nameM[1].replace(/^["']|["']$/g, "").trim() : undefined,
    description: descM ? descM[1].replace(/^["']|["']$/g, "").trim() : undefined,
    body,
  };
}

/** Build a valid SKILL.md from parts (used when the model's is missing/broken). */
function buildSkillMd(slug: string, description: string, body: string): string {
  const safeDesc = description.replace(/\n+/g, " ").trim() || `Use when you need to ${slug.replace(/-/g, " ")}.`;
  return `---\nname: ${slug}\ndescription: ${safeDesc}\n---\n\n${body.trim()}\n`;
}

/**
 * Guarantee a well-formed package: a valid SKILL.md as files[0] with kebab-case
 * `name` + a trigger `description`, plus a deduped source list. Deterministic.
 */
export function sanitizeSkillPackage(pkg: SkillPackage, input: SkillInput): SkillPackage {
  const slug = slugify(pkg.meta?.slug || pkg.meta?.name || input.skillName || input.task);
  pkg.meta = { ...pkg.meta, slug };

  // Locate the SKILL.md (case-insensitive); move it to index 0 or synthesize one.
  const files = Array.isArray(pkg.files) ? [...pkg.files] : [];
  const isSkillMd = (p: string) => /(^|\/)skill\.md$/i.test((p || "").trim());
  let idx = files.findIndex((f) => isSkillMd(f.path));
  const fallbackDesc =
    pkg.overview?.whatItDoes?.split("\n")[0] ||
    pkg.meta?.summary ||
    `Use when you want to ${input.task || "run this skill"} in ${input.llmInterface || "your LLM interface"}.`;

  if (idx === -1) {
    // No SKILL.md at all — synthesize one from the package contents.
    const body = [
      `# ${pkg.meta.name || slug}`,
      "",
      pkg.overview?.whatItDoes || pkg.meta?.summary || "",
      "",
      "## How to use",
      pkg.howToUse?.invoke || "",
      "",
      "## Data sources",
      pkg.howToUse?.connectDataSources || input.dataSources || "",
    ].join("\n");
    files.unshift({ path: "SKILL.md", language: "markdown", content: buildSkillMd(slug, fallbackDesc, body) });
  } else {
    const f = files[idx];
    f.path = "SKILL.md";
    f.language = f.language || "markdown";
    const fm = parseFrontmatter(f.content);
    if (!fm || !fm.name || !fm.description) {
      // Repair: rebuild frontmatter, keep the body (stripped of any broken block).
      const body = fm?.body ?? f.content.replace(/^---[\s\S]*?---\s*\n?/, "");
      f.content = buildSkillMd(slug, fm?.description || fallbackDesc, body);
    } else if (slugify(fm.name) !== slug) {
      // Keep frontmatter but normalize the name to the canonical slug.
      f.content = f.content.replace(/^(\s*name\s*:\s*).+$/m, `$1${slug}`);
    }
    // Move SKILL.md to the front.
    if (idx !== 0) {
      const [skillFile] = files.splice(idx, 1);
      files.unshift(skillFile);
    }
  }
  pkg.files = files;

  // Dedupe sources by url||title.
  const seen = new Set<string>();
  pkg.sources = (pkg.sources ?? []).filter((s) => {
    const key = (s.url || s.title || "").trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return pkg;
}

// ---------------------------------------------------------------------------
// The job runner — detached; the route fires it and polls /api/skill/job/:id.
// ---------------------------------------------------------------------------
export async function runSkillJob(job: SkillJob, input: SkillInput): Promise<void> {
  requireUserId(job.userId);
  try {
    // 1) Cache hit → instant.
    const cached = skillCache.get(skillCacheKey(input));
    if (cached) {
      job.skill = cached;
      job.grounded = (cached.sources ?? []).some((s) => !!s.url);
      job.percent = 100;
      job.status = "done";
      const id = await persistSkill(input.userId ?? "", input.userEmail ?? "", cached, !!job.grounded);
      job.saved = !!id;
      return;
    }

    // 2) Ground in the "Agent Skills" KB (best-effort; never fails the job).
    job.percent = 18;
    const retrievalQuery = [
      "Agent Skill SKILL.md format frontmatter install invoke",
      input.task,
      input.llmInterface,
      input.dataSources,
    ]
      .filter(Boolean)
      .join(" ");
    let kbContext = "";
    const kbSources: { title: string; url?: string }[] = [];
    let grounded = false;
    if (ragEnabled()) {
      try {
        const { chunks } = await retrieve(retrievalQuery, 6, { category: AGENT_SKILLS_CATEGORY });
        if (chunks.length) {
          grounded = true;
          kbContext = chunks
            .map((c, i) => `[${i + 1}] ${c.title ?? "Agent Skills"}\n${c.content}`)
            .join("\n\n")
            .slice(0, 12000);
          for (const c of chunks) {
            if (c.title) kbSources.push({ title: c.title, url: c.url || undefined });
          }
        } else {
          console.warn("[runSkillJob] 'Agent Skills' KB returned no chunks — generating UNGROUNDED.");
        }
      } catch (e) {
        console.warn("[runSkillJob] KB retrieval failed — generating UNGROUNDED:", e instanceof Error ? e.message : String(e));
      }
    } else {
      console.warn("[runSkillJob] RAG disabled — generating UNGROUNDED.");
    }
    job.grounded = grounded;

    // 3) Pull any attached reference material.
    job.percent = 32;
    let uploadContext = "";
    if (input.refDocIds?.length) {
      try {
        const hits = await retrieveFromUploads(`${input.task} ${input.dataSources} ${input.accessMethod}`, input.refDocIds, 6);
        uploadContext = hits.map((h) => `- ${h.title ? `(${h.title}) ` : ""}${h.content}`).join("\n").slice(0, 8000);
      } catch (e) {
        console.warn("[runSkillJob] upload retrieval failed:", e instanceof Error ? e.message : String(e));
      }
    }

    // 4) Generate the structured package (Sonnet — better SKILL.md + scripts).
    job.percent = 46;
    const llm = makeLLM("sonnet", 0.3, { maxTokens: 12000, streaming: true });
    const userPrompt = buildUserPrompt(input, kbContext, uploadContext);
    const raw = await invokeResilient(
      structuredOutput(llm, SkillPackageSchema, { name: "skill_package" }),
      [new SystemMessage(SYSTEM_PROMPT), new HumanMessage(userPrompt)]
    );
    job.percent = 88;

    // 5) Deterministic sanitize + merge KB sources.
    const pkg = sanitizeSkillPackage(raw as SkillPackage, input);
    // Prepend KB-derived sources the model didn't already cite.
    const have = new Set(pkg.sources.map((s) => (s.url || s.title || "").trim().toLowerCase()));
    const merged = [...pkg.sources];
    for (const s of kbSources) {
      const key = (s.url || s.title || "").trim().toLowerCase();
      if (key && !have.has(key)) {
        have.add(key);
        merged.push(s);
      }
    }
    pkg.sources = merged.slice(0, 10);

    job.skill = pkg;
    job.percent = 100;
    job.status = "done";
    skillCache.set(skillCacheKey(input), pkg);
    const savedId = await persistSkill(input.userId ?? "", input.userEmail ?? "", pkg, grounded);
    job.saved = !!savedId;
    // Charge 0.5 credits on SUCCESSFUL delivery only (batch-1). The catch below skips this, so a
    // mid-way failure never deducts — mirrors the lesson charge-on-success rule.
    if (input.userId && dbEnabled()) {
      try { await spend(input.userId, 0.5, "skill"); }
      catch (e) { console.error("[runSkillJob] credit deduct failed", e); }
    }
  } catch (e) {
    job.status = "error";
    job.error = e instanceof Error ? e.message : String(e);
    console.error("[runSkillJob]", e);
  } finally {
    releaseGenSlot();
  }
}
