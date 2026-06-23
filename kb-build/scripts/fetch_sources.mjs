#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AS_OF_DATE, topics } from "./sources.mjs";

const repoRoot = path.resolve(new URL("../../", import.meta.url).pathname);
const rawRoot = path.join(repoRoot, "kb-build", "raw", "registry");
const userAgent = "AgenticLearningStudioKB/1.0 (+local allowlist; contact: owner)";
const delayMs = Number(process.env.KB_FETCH_DELAY_MS ?? 1200);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeName(value) {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-|-$/g, "").slice(0, 160) || "source";
}

async function robotsAllowed(url) {
  const u = new URL(url);
  const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
  try {
    const response = await fetch(robotsUrl, { headers: { "user-agent": userAgent } });
    if (response.status === 404) return { allowed: true, reason: "robots not found" };
    if (!response.ok) return { allowed: false, reason: `robots HTTP ${response.status}` };
    const text = await response.text();
    const lines = text.split(/\r?\n/);
    let applies = false;
    const disallow = [];
    for (const raw of lines) {
      const line = raw.replace(/#.*/, "").trim();
      if (!line) continue;
      const [keyRaw, ...rest] = line.split(":");
      const key = keyRaw.toLowerCase().trim();
      const value = rest.join(":").trim();
      if (key === "user-agent") applies = value === "*" || value.toLowerCase() === userAgent.toLowerCase();
      if (applies && key === "disallow" && value) disallow.push(value);
    }
    const blocked = disallow.some((prefix) => u.pathname.startsWith(prefix));
    return { allowed: !blocked, reason: blocked ? "robots disallow" : "robots allow" };
  } catch (err) {
    return { allowed: false, reason: `robots fetch failed: ${err.message}` };
  }
}

async function fetchOne(url, outDir) {
  const robot = await robotsAllowed(url);
  const record = { url, fetched_at: new Date().toISOString(), as_of_date: AS_OF_DATE, robot };
  if (!robot.allowed) return { ...record, stored: false };
  await sleep(delayMs);
  const response = await fetch(url, { headers: { "user-agent": userAgent, accept: "text/html,text/plain,application/json,*/*" } });
  record.status = response.status;
  record.content_type = response.headers.get("content-type");
  record.last_modified = response.headers.get("last-modified");
  record.etag = response.headers.get("etag");
  if (!response.ok) return { ...record, stored: false };
  const text = await response.text();
  const file = path.join(outDir, `${safeName(new URL(url).host + new URL(url).pathname)}.txt`);
  await writeFile(file, text, "utf8");
  return { ...record, stored: true, file: path.relative(repoRoot, file) };
}

function githubLicenseUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    return `https://api.github.com/repos/${owner}/${repo}/license`;
  } catch {
    return null;
  }
}

async function main() {
  await mkdir(rawRoot, { recursive: true });
  const results = [];
  for (const topic of topics) {
    const outDir = path.join(rawRoot, topic.slug);
    await mkdir(outDir, { recursive: true });
    const baseUrls = [topic.primary, topic.repoUrl, ...topic.sources.map((s) => s.url)].filter(Boolean);
    const licenseUrls = baseUrls.map(githubLicenseUrl).filter(Boolean);
    const urls = [...new Set([...baseUrls, ...licenseUrls])];
    for (const url of urls) {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) continue;
      const result = await fetchOne(url, outDir).catch((err) => ({ url, stored: false, error: err.message }));
      results.push({ topic: topic.slug, ...result });
    }
  }
  const indexPath = path.join(rawRoot, "_fetch_index.json");
  await writeFile(indexPath, JSON.stringify(results, null, 2) + "\n", "utf8");
  const stored = results.filter((r) => r.stored).length;
  console.log(JSON.stringify({ attempted: results.length, stored, index: path.relative(repoRoot, indexPath) }, null, 2));
}

if (!process.env.NODE_EXTRA_CA_CERTS) {
  console.error("Refusing network fetch: NODE_EXTRA_CA_CERTS must be set for this project.");
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
