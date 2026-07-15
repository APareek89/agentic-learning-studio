/**
 * shot.mjs — full-viewport screenshot of a lesson (URL or local .html), per theme. NO credits.
 * For world lessons it lets the runtime settle + fits the map; for classic it just loads.
 *
 * Run: node scripts/shot.mjs <url|file.html> <out.png> [dark|light] [WxH]
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const [target, out, theme = "dark", size = "1440x900"] = process.argv.slice(2);
if (!target || !out) { console.error("usage: node scripts/shot.mjs <url|file.html> <out.png> [dark|light] [WxH]"); process.exit(2); }
const [w, h] = size.split("x").map(Number);
const url = /^https?:\/\//.test(target) ? target : pathToFileURL(resolve(target)).href;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w || 1440, height: h || 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
await p.goto(url, { waitUntil: "networkidle" }).catch(() => p.goto(url));
await p.waitForTimeout(1200);
// world lessons: flip theme like the host, then re-fit the map
if (theme === "light") { await p.evaluate(() => window.postMessage({ type: "als-theme", value: "light" }, "*")); await p.waitForTimeout(400); }
await p.evaluate(() => { try { window.__wfit && window.__wfit(); } catch {} }).catch(() => {});
await p.waitForTimeout(500);
await p.screenshot({ path: out });
console.log(`shot → ${out} (${theme})${errs.length ? ` · ${errs.length} jsErr: ${errs[0].slice(0, 80)}` : ""}`);
await b.close();
