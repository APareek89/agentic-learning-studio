#!/usr/bin/env node
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { AS_OF_DATE, topics } from "./sources.mjs";

const repoRoot = path.resolve(new URL("../../", import.meta.url).pathname);
const kbRoot = path.join(repoRoot, "kb");
const force = process.argv.includes("--force");

function dirName(category) {
  return category
    .replace(/&/g, "")
    .replace(/\//g, " ")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function yamlString(value) {
  if (!value) return '""';
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function renderSources(sources) {
  return sources
    .map((source) => `  - {url: ${yamlString(source.url)}, license: ${yamlString(source.license)}, kind: ${yamlString(source.kind)}}`)
    .join("\n");
}

function renderLinks(topic) {
  const all = [...(topic.links ?? []), ...topic.sources.map((s) => s.url)];
  return [...new Set(all)].map((link) => `- ${link}`).join("\n");
}

function renderDoc(topic) {
  const primary = topic.primary;
  const sources = renderSources(topic.sources);
  const verdict = topic.verdict ? `verdict: ${yamlString(topic.verdict)}\n` : "";
  const parts = (topic.parts ?? []).map((part) => `- ${part}`).join("\n");
  const gotchas = (topic.gotchas ?? []).map((item) => `- ${item}`).join("\n");
  return `---\ntitle: ${yamlString(topic.title)}\ncategory: ${yamlString(topic.category)}\nurl: ${yamlString(primary)}\nlicense: ${yamlString(topic.license)}\n${verdict}as_of_date: ${AS_OF_DATE}\nsources:\n${sources}\n---\n\n## What it is\n\n${topic.summary}\n\n## Why it exists / when to reach for it\n\n${topic.why}\n\n## The moving parts\n\n${parts || "- Source-specific concepts and APIs.\n- Runtime behavior and integration boundaries.\n- Provenance, evaluation, and operational policy."}\n\n## How it works\n\n${topic.how}\n\n## When to use vs alternatives\n\n${topic.alternatives}\n\n## Failure modes & gotchas\n\n${gotchas || "- Validate behavior with representative examples.\n- Keep source provenance attached to each claim.\n- Re-check official docs before shipping version-sensitive guidance."}\n\n## Minimal code shape\n\n\`\`\`text\n${topic.code ?? "input -> validate -> retrieve/contextualize -> call model/tool -> verify -> store provenance"}\n\`\`\`\n\n## Key links\n\n${renderLinks(topic)}\n`;
}

async function main() {
  let written = 0;
  let skipped = 0;
  for (const topic of topics) {
    const outDir = path.join(kbRoot, dirName(topic.category));
    await mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `${topic.slug}.md`);
    if (existsSync(outPath) && !force) {
      skipped++;
      continue;
    }
    await writeFile(outPath, renderDoc(topic), "utf8");
    written++;
  }

  // Keep a machine-readable copy of the registry next to the build artifacts for review.
  const catalogPath = path.join(repoRoot, "kb-build", "topic-registry.json");
  await writeFile(
    catalogPath,
    JSON.stringify(
      {
        as_of_date: AS_OF_DATE,
        count: topics.length,
        topics: topics.map((t) => ({
          slug: t.slug,
          title: t.title,
          category: t.category,
          primary_source_url: t.primary,
          repo_url: t.repoUrl,
          license: t.license,
          watch: t.watch ?? [],
          sources: t.sources,
        })),
      },
      null,
      2
    ) + "\n",
    "utf8"
  );

  // Touch existing files to ensure they are readable; catches permission issues early.
  for (const topic of topics) {
    const outPath = path.join(kbRoot, dirName(topic.category), `${topic.slug}.md`);
    if (existsSync(outPath)) await readFile(outPath, "utf8");
  }

  console.log(JSON.stringify({ written, skipped, total: topics.length, catalogPath }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
