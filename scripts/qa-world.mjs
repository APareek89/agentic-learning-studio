/**
 * qa-world.mjs — element-level QA for world-template lessons. NO credits.
 *
 * Catches the class of bug a full-map screenshot hides: clipped headings, children
 * colliding with corner badges, cards overflowing their fixed height, overlapping
 * cards, empty popups — asserted per element, per stage, in BOTH themes, and it
 * saves CLOSE-UP screenshots of cards so a human can eyeball what a learner sees.
 *
 * Run:  node scripts/qa-world.mjs <artifactId> [...more ids]
 *   or: node scripts/qa-world.mjs <path/to/lesson.html> [...]   (local file:// mode, no server/DB)
 * Exit: 0 = clean · 1 = failures (printed report)
 */
import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import { resolve, basename } from "node:path";

const BASE = process.env.QA_BASE_URL || "http://localhost:5070";
const ids = process.argv.slice(2);
if (!ids.length) { console.error("usage: node scripts/qa-world.mjs <artifactId|lesson.html> [...]"); process.exit(2); }
// An arg ending in .html is a local self-contained lesson → drive it via file:// (no server, no DB).
// A full http(s) URL is used verbatim (so library lessons served at /api/lesson/:slug work too).
const targetFor = (id) => /^https?:\/\//.test(id) ? id : id.endsWith(".html") ? pathToFileURL(resolve(id)).href : `${BASE}/api/artifact/${id}`;
const shortFor = (id) => /^https?:\/\//.test(id)
  ? id.replace(/^https?:\/\/[^/]+\//, "").replace(/^api\/(?:artifact|lesson|community\/lesson)\//, "").slice(0, 28)
  : id.endsWith(".html") ? basename(id).replace(/\.html$/, "").slice(0, 28) : id.slice(0, 8);

const failures = [];
const fail = (lesson, where, what) => { failures.push({ lesson, where, what }); console.log(`  ✗ [${where}] ${what}`); };

const b = await chromium.launch();
for (const id of ids) {
  const short = shortFor(id);
  const target = targetFor(id);
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  const jsErrors = [];
  p.on("pageerror", (e) => jsErrors.push(String(e)));
  await p.goto(target);
  await p.waitForTimeout(1400);
  const nStages = await p.evaluate(() => JSON.parse(document.getElementById("world-data").textContent).length);
  console.log(`\n== ${short} · ${nStages} stages`);

  for (const theme of ["dark", "light"]) {
    // no in-lesson button anymore — flip the theme the way the host app does
    if (theme === "light") { await p.evaluate(() => window.postMessage({ type: "als-theme", value: "light" }, "*")); await p.waitForTimeout(350); }
    for (let s = 0; s < nStages; s++) {
      await p.evaluate((i) => window.__wgoto(i), s);
      await p.waitForTimeout(500);
      const probs = await p.evaluate(() => {
        const out = [];
        const cards = Array.from(document.querySelectorAll("#w-world .w-card"));
        const isect = (a, c) => a.x < c.x + c.w - 6 && c.x < a.x + a.w - 6 && a.y < c.y + c.h - 6 && c.y < a.y + a.h - 6;
        const box = (el) => { const r = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }; return r; };
        cards.forEach((card, i) => {
          const name = (card.querySelector("h3")?.textContent || `card${i}`).slice(0, 40);
          // 1. content must FIT the fixed-height card (no invisible overflow)
          if (card.scrollHeight > card.clientHeight + 3) out.push(`"${name}": content overflows card by ${card.scrollHeight - card.clientHeight}px`);
          // 2. heading glyphs must not be vertically clipped
          const h3 = card.querySelector("h3");
          if (h3 && h3.scrollHeight > h3.clientHeight + 3) out.push(`"${name}": heading clipped (${h3.scrollHeight}>${h3.clientHeight})`);
          // 3. chip must not collide with the corner badge / read-mark
          const chip = card.querySelector(".w-chip");
          for (const sel of [".w-idx", ".w-seen"]) {
            const badge = card.querySelector(sel);
            if (chip && badge && badge.offsetWidth) {
              const a = box(chip), c = box(badge);
              if (isect(a, c)) out.push(`"${name}": chip collides with ${sel}`);
            }
          }
          // 4. attachment buttons must not overflow the card width
          card.querySelectorAll(".w-att").forEach((btn) => {
            if (btn.offsetLeft + btn.offsetWidth > card.clientWidth) out.push(`"${name}": att button overflows card`);
          });
        });
        // 5. no two cards overlap on the canvas
        const rects = cards.map(box);
        for (let i = 0; i < rects.length; i++)
          for (let j = i + 1; j < rects.length; j++)
            if (isect(rects[i], rects[j])) out.push(`cards ${i} and ${j} overlap`);
        return out;
      });
      for (const w of probs) fail(short, `${theme}/stage${s}`, w);
      // 6. every popup template (cards + attachments) must carry real content
      if (theme === "dark") {
        const empty = await p.evaluate((si) => {
          const bad = [];
          document.querySelectorAll(`template[id^=wpop-${si}-]`).forEach((t) => {
            const txt = (t.content?.textContent || "").replace(/\s+/g, " ").trim();
            if (txt.length < 30) bad.push(t.id);
          });
          return bad;
        }, s);
        for (const e of empty) fail(short, `stage${s}`, `empty popup ${e}`);
      }
    }
    // close-up screenshots: first two cards of stage 0 + a grouped card if any
    await p.evaluate(() => window.__wgoto(0));
    await p.waitForTimeout(500);
    const cards = await p.$$("#w-world .w-card");
    for (let i = 0; i < Math.min(2, cards.length); i++)
      await cards[i].screenshot({ path: `/tmp/als-qa-${short}-${theme}-card${i}.png` }).catch(() => {});
    const grouped = await p.$("#w-world .w-card:has(.w-att)");
    if (grouped) await grouped.screenshot({ path: `/tmp/als-qa-${short}-${theme}-grouped.png` }).catch(() => {});
  }
  // encode today's audit findings as permanent checks:
  // (a) sources parity — the card's count must equal the rendered deduped list
  {
    const nStages = await p.evaluate(() => JSON.parse(document.getElementById("world-data").textContent).length);
    const parity = await p.evaluate(async (n) => {
      const D = JSON.parse(document.getElementById("world-data").textContent);
      const src = D.find((s) => s.id === "_sources");
      if (!src) return null;
      window.__wgoto(D.indexOf(src));
      await new Promise((r) => setTimeout(r, 600));
      document.querySelector("#w-world .w-card")?.click();
      await new Promise((r) => setTimeout(r, 400));
      const listed = document.querySelectorAll(".w-pob .cites ol li").length;
      const label = parseInt((src.cards[0].orient.match(/^(\d+)/) || [])[1] || "0", 10);
      return { label, listed };
    }, nStages);
    if (parity && parity.label !== parity.listed) fail(short, "sources", `card says ${parity.label}, list shows ${parity.listed}`);
  }
  // (b) objective stem must not stutter in any lead popup
  const stutter = await p.evaluate(() => {
    const bad = [];
    document.querySelectorAll("template[id$='-0']").forEach((t) => {
      const txt = t.content?.textContent || "";
      if (/After this you.?ll be able to\s*(?:•\s*)?After this you.?ll be able to/i.test(txt.replace(/\s+/g, " "))) bad.push(t.id);
    });
    return bad;
  });
  for (const s2 of stutter) fail(short, "stutter", `doubled objective stem in ${s2}`);
  // (c) no mid-clause ellipsis in card metadata
  const ell = await p.evaluate(() => {
    const D = JSON.parse(document.getElementById("world-data").textContent);
    return D.flatMap((s) => [s.tagline, ...s.cards.flatMap((c) => [c.orient, c.capline])]).filter((x) => x && x.endsWith("…")).length;
  });
  if (ell > 2) fail(short, "metadata", `${ell} metadata strings end mid-clause with …`);
  if (jsErrors.length) fail(short, "js", jsErrors[0]);
  await p.close();
  // (d) mobile: the focused card must FIT a 390px viewport
  {
    const m = await b.newPage({ viewport: { width: 390, height: 844 } });
    await m.goto(target);
    await m.waitForTimeout(1300);
    await m.click("#w-next"); await m.waitForTimeout(400);
    await m.click("#w-next"); await m.waitForTimeout(800);
    const clip = await m.evaluate(() => {
      const c = document.querySelector("#w-world .w-card.focus");
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return r.left < -2 || r.right > window.innerWidth + 2 ? `${Math.round(r.left)}..${Math.round(r.right)} on ${window.innerWidth}` : null;
    });
    if (clip) fail(short, "mobile", `focused card clips viewport (${clip})`);
    await m.close();
  }
}
await b.close();
console.log(`\n${failures.length ? `FAIL — ${failures.length} issue(s)` : "CLEAN — all element checks passed"}; close-ups in /tmp/als-qa-*.png`);
process.exit(failures.length ? 1 : 0);
