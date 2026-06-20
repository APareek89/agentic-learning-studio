/**
 * # renderArtifact — Blueprint → one self-contained interactive HTML string
 *
 * Pure and deterministic: same Blueprint ⇒ byte-identical HTML. Everything is
 * inlined (CSS + JS + the glossary data) so the file works offline and downloads
 * cleanly. Only external resource: Google Fonts (with a system-font fallback).
 *
 * The `body[data-*]` attributes carry the learner's 27-combo selection; the CSS
 * gates in tokens.ts then show/hide content accordingly — no per-combo files.
 */

import type { Blueprint } from "./schema";
import { ARTIFACT_CSS } from "./tokens";
import { RUNTIME_JS } from "./runtime";
import { renderBody } from "./components";

function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
}

export function renderArtifact(bp: Blueprint): string {
  const p = bp.learnerProfile;
  // The glossary is embedded as inert JSON; the runtime parses it for popovers.
  // We escape `<` so a stray "</script>" inside a definition can't break out.
  const glossaryJson = JSON.stringify(bp.glossary).replace(/</g, "\\u003c");
  // Lesson config drives the runtime's background build queue: which modules are
  // still stubs. The runtime reads the artifactId from its own iframe URL
  // (/api/artifact/<id>). Empty stub list = nothing to fetch (the /full download).
  const stubModuleIds = bp.modules.filter((m) => !(m.loadState === "full" && m.blocks.length > 0)).map((m) => m.id);
  const configJson = JSON.stringify({ stubModuleIds }).replace(/</g, "\\u003c");
  // Optional per-industry accent override (only the accent token changes).
  const accentStyle = bp.meta.accent ? `<style>:root{--accent:${escAttr(bp.meta.accent)}}</style>` : "";

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escAttr(bp.meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Lexend:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>${ARTIFACT_CSS}</style>${accentStyle}
</head>
<body data-level="${escAttr(p.level)}" data-depth="${escAttr(p.depth)}" data-examples="${escAttr(p.examples)}" data-reading="${escAttr(p.readingMode || "vertical")}" data-theme="light">
${renderBody(bp)}
<div id="popover" role="dialog" aria-label="Definition"></div>
<script type="application/json" id="glossary-data">${glossaryJson}</script>
<script type="application/json" id="lesson-config">${configJson}</script>
<script>${RUNTIME_JS}</script>
</body>
</html>`;
}
