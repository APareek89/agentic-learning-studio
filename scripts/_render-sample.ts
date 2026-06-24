// throwaway: render an enhanced prebuilt lesson file to public/ for a quick visual.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { validateBlueprint } from "../src/render/schema";
import { renderArtifact } from "../src/render/index";

const slug = process.argv[2] || "prompt-engineering-foundations";
const root = fileURLToPath(new URL("../", import.meta.url));
const raw = JSON.parse(await readFile(`${root}prebuilt/lessons/${slug}.json`, "utf8"));
const res = validateBlueprint(raw);
if (!res.ok) { console.error("INVALID:", res.errors.slice(0, 5)); process.exit(1); }
const html = renderArtifact(res.blueprint!);
await writeFile(`${root}public/_enhanced-sample.html`, html);
console.log(`rendered ${slug} → public/_enhanced-sample.html (${html.length} bytes)`);
