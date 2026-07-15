/**
 * # World-template render proof (NO credits) — pushes a REAL library blueprint through
 * renderArtifact with readingMode="world" so the V2 template can be eyeballed + audited.
 * Run: npx tsx scripts/test-world.ts  → /tmp/als-world.html
 */
import { readFileSync, writeFileSync } from "node:fs";
import { renderArtifact } from "../src/render/index";
import type { Blueprint } from "../src/render/schema";

const bp = JSON.parse(readFileSync("/tmp/crewai-bp.json", "utf8")) as Blueprint;
bp.learnerProfile.readingMode = "world";
writeFileSync("/tmp/als-world.html", renderArtifact(bp));
console.log("wrote /tmp/als-world.html —", bp.modules.length, "modules,",
  bp.modules.reduce((n, m) => n + m.blocks.length, 0), "blocks, finalCheck:", bp.finalCheck ? "yes" : "no");
