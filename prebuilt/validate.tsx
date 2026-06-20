import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { validateBlueprint } from "../src/render/schema";

const lessonsDir = join(process.cwd(), "prebuilt", "lessons");
const files = readdirSync(lessonsDir)
  .filter((file) => file.endsWith(".json"))
  .sort();

let passed = 0;
const failures: string[] = [];

for (const file of files) {
  const fullPath = join(lessonsDir, file);
  const raw = JSON.parse(readFileSync(fullPath, "utf8"));
  const result = validateBlueprint(raw);
  if (result.ok) {
    passed += 1;
  } else {
    failures.push(`${file}\n${result.errors.map((err) => `  - ${err}`).join("\n")}`);
  }
}

if (failures.length) {
  console.error(`Blueprint validation failed: ${failures.length}/${files.length}`);
  console.error(failures.join("\n\n"));
  process.exit(1);
}

console.log(`Blueprint validation passed: ${passed}/${files.length}`);
