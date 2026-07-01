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

/** Optional SEO / site-chrome injection for public crawlable pages (see render/seo.ts). Off by default. */
export interface SeoInject {
  title?: string;      // overrides <title>
  headHtml?: string;   // injected just before </head> (meta / canonical / OG / JSON-LD / <style>)
  bodyTop?: string;    // injected right after <body> (site header)
  bodyEnd?: string;    // injected right before </body> (footer / related links)
  slug?: string;       // library/community slug → knowledge-check grading on non-/api URLs
  source?: string;     // "library" | "community"
}

export function renderArtifact(bp: Blueprint, opts: { previewOnly?: boolean; currentModuleId?: string; seo?: SeoInject } = {}): string {
  const p = bp.learnerProfile;
  // The glossary is embedded as inert JSON; the runtime parses it for popovers.
  // We escape `<` so a stray "</script>" inside a definition can't break out.
  const glossaryJson = JSON.stringify(bp.glossary).replace(/</g, "\\u003c");
  // Lesson config drives the runtime's background build queue: which modules are
  // still stubs. The runtime reads the artifactId from its own iframe URL
  // (/api/artifact/<id>). Empty stub list = nothing to fetch (the /full download).
  //
  // PREVIEW mode (the human-in-the-loop overview gate): the artifact shows the
  // OVERVIEW only — no module body is built (none auto-queued, and clicking a node
  // is intercepted with a "generate the full lesson" note) so it stays free until
  // the learner approves. Driven by `previewOnly` in the config.
  const previewOnly = !!opts.previewOnly;
  const stubModuleIds = previewOnly ? [] : bp.modules.filter((m) => !(m.loadState === "full" && m.blocks.length > 0)).map((m) => m.id);
  // currentModuleId: when the host reloads this iframe mid-read (a background module finished
  // building), it passes the module the reader was on so the runtime restores it (no overview bounce).
  const currentModuleId = opts.currentModuleId && bp.modules.some((m) => m.id === opts.currentModuleId) ? opts.currentModuleId : undefined;
  const seo = opts.seo;
  const config: Record<string, unknown> = { stubModuleIds, previewOnly, currentModuleId };
  if (seo?.slug) { config.slug = seo.slug; config.source = seo.source || "library"; }
  const configJson = JSON.stringify(config).replace(/</g, "\\u003c");
  // Optional per-industry accent override (only the accent token changes).
  const accentStyle = bp.meta.accent ? `<style>:root{--accent:${escAttr(bp.meta.accent)}}</style>` : "";

  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escAttr(seo?.title ?? bp.meta.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
<style>${ARTIFACT_CSS}</style>${accentStyle}${seo?.headHtml ?? ""}
</head>
<body data-level="${escAttr(p.level)}" data-depth="${escAttr(p.depth)}" data-examples="${escAttr(p.examples)}" data-reading="${escAttr(p.readingMode || "vertical")}" data-theme="light">${seo?.bodyTop ?? ""}
${renderBody(bp, { previewOnly })}
<div id="popover" role="dialog" aria-label="Definition"></div>
<script type="application/json" id="glossary-data">${glossaryJson}</script>
<script type="application/json" id="lesson-config">${configJson}</script>
<script>${RUNTIME_JS}</script>
${seo?.bodyEnd ?? ""}
</body>
</html>`;
}
