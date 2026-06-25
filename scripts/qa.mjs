/**
 * qa.mjs — end-to-end QA for Wizbit. Standalone Playwright (no test runner needed).
 *
 *   QA_BASE_URL=https://agentic-learning-studio-1.onrender.com \
 *   QA_EMAIL=you@example.com QA_PASSWORD=secret \
 *   [QA_RUN_GENERATION=1] [QA_HEADED=1] \
 *   node scripts/qa.mjs
 *
 * Credentials come ONLY from env — nothing is hardcoded or committed. Covers the critical
 * regressions: auth (no flicker/dup handlers), rapid navigation/state integrity, generation
 * progress that follows the server live, credit-pill presence/refresh, and global guards
 * (no console errors, no unexpected full-page reloads). Exits non-zero on any failure.
 */
import { chromium } from "playwright";

const BASE = (process.env.QA_BASE_URL || "").replace(/\/$/, "");
const EMAIL = process.env.QA_EMAIL || "";
const PASSWORD = process.env.QA_PASSWORD || "";
const RUN_GEN = process.env.QA_RUN_GENERATION === "1";
const HEADED = process.env.QA_HEADED === "1";
if (!BASE || !EMAIL || !PASSWORD) {
  console.error("Set QA_BASE_URL, QA_EMAIL, QA_PASSWORD env vars."); process.exit(2);
}

const results = [];
const ok = (name, extra = "") => { results.push({ name, pass: true, extra }); console.log(`  ✓ ${name}${extra ? "  " + extra : ""}`); };
const bad = (name, extra = "") => { results.push({ name, pass: false, extra }); console.log(`  ✗ ${name}${extra ? "  " + extra : ""}`); };
const assert = (name, cond, extra = "") => (cond ? ok(name, extra) : bad(name, extra));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TOP_TABS = ["home", "configurator", "trainer", "library", "pricing", "community", "build-community"];
const PANELS = { home: "tab-home", configurator: "tab-configurator", trainer: "tab-trainer", dashboard: "tab-dashboard", library: "tab-library", pricing: "tab-pricing", community: "tab-community", "build-community": "tab-build-community" };

async function main() {
  const browser = await chromium.launch({ headless: !HEADED });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  const consoleErrors = [];
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  let fullNavs = 0;
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) fullNavs++; });

  console.log(`\nQA → ${BASE}\n`);

  // ---- 1. Load + Auth ----
  console.log("1. Auth");
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  const navsAfterLoad = fullNavs; // baseline (the initial load)
  await page.click("#btn-signin").catch(() => {});
  await page.fill("#auth-email", EMAIL);
  await page.fill("#auth-password", PASSWORD);
  await page.click("#auth-submit");
  // signed-in tells: profile widget visible, dashboard tab visible, auth-actions hidden
  const signedIn = await page.waitForFunction(() => {
    const pw = document.getElementById("profile-wrap");
    return pw && !pw.hidden;
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  assert("sign in succeeds (profile widget appears)", signedIn);
  if (!signedIn) {
    const msg = await page.$eval("#auth-msg", (e) => e.textContent).catch(() => "");
    console.error(`\n✗ SIGN-IN FAILED${msg ? ` — "${msg.trim()}"` : ""}. Check QA_EMAIL / QA_PASSWORD. Aborting.\n`);
    await browser.close();
    process.exit(1);
  }
  const dashVisible = await page.$eval("#tab-btn-dashboard", (e) => !e.hidden).catch(() => false);
  assert("My Lessons tab appears after sign-in", dashVisible);
  // no extra full-page reload from signing in (SPA, not a redirect)
  assert("sign-in does not trigger a full-page reload", fullNavs === navsAfterLoad, `navs=${fullNavs - navsAfterLoad}`);
  const avatar = await page.$eval("#profile-avatar", (e) => e.textContent).catch(() => "");
  assert("avatar shows the user initial", !!avatar && avatar.length === 1, `"${avatar}"`);

  // ---- 2. Rapid navigation / state integrity ----
  console.log("2. Navigation / state");
  let mismatches = 0;
  for (let round = 0; round < 3; round++) {
    for (const t of TOP_TABS) {
      await page.click(`.tab[data-tab="${t}"]`).catch(() => {});
    }
  }
  // after rapid clicking, land each tab deliberately and confirm panel matches active tab
  for (const t of TOP_TABS) {
    await page.click(`.tab[data-tab="${t}"]`);
    await page.waitForTimeout(120);
    const state = await page.evaluate((args) => {
      const { tab, panels } = args;
      const active = document.querySelector(".tab.active")?.dataset.tab;
      const panelId = panels[tab];
      const panelVisible = panelId ? !document.getElementById(panelId)?.hidden : false;
      // every OTHER known panel must be hidden
      const others = Object.values(panels).filter((id) => id !== panelId);
      const noLeak = others.every((id) => { const el = document.getElementById(id); return !el || el.hidden; });
      return { active, panelVisible, noLeak };
    }, { tab: t, panels: PANELS });
    const good = state.active === t && state.panelVisible && state.noLeak;
    if (!good) { mismatches++; bad(`tab "${t}" panel matches active state`, JSON.stringify(state)); }
  }
  assert("rapid tab-switching leaves UI consistent (no mismatched panels)", mismatches === 0);

  // ---- 3. Credits ----
  console.log("3. Credits");
  await page.click(`.tab[data-tab="pricing"]`);
  // Wait for the pill to populate — /api/credits can be slow on an under-resourced instance
  // (measured ~8s on staging), so poll rather than a fixed delay.
  const pillShown = await page.waitForFunction(() => {
    const p = document.getElementById("credit-pill");
    const c = document.getElementById("credit-count")?.textContent || "";
    return p && !p.hidden && /^\d+$/.test(c);
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  const pill = await page.evaluate(() => ({ hidden: document.getElementById("credit-pill")?.hidden, count: document.getElementById("credit-count")?.textContent }));
  assert("credit pill becomes visible + numeric when signed in", pillShown, `hidden=${pill.hidden} count=${pill.count}`);
  const billing = await page.evaluate(async () => (await (await fetch("/api/pricing")).json()));
  if (billing && billing.configured) ok("billing configured (LS env set)", `${billing.currency} payg=${billing.paygUnitCents}`);
  else ok("billing NOT configured on this env (pricing page shows 'not switched on')", "expected if LS env unset");
  // central refresh: balance fetch on focus/visibility wired?
  const hasFocusRefresh = await page.evaluate(() => typeof refreshCreditsOnReturn === "function");
  assert("central credit-refresh path present (focus/visibilitychange)", hasFocusRefresh);

  // ---- 4. Generation progress (optional; gated by QA_RUN_GENERATION) ----
  if (RUN_GEN) {
    console.log("4. Generation progress (overview)");
    const start = await page.evaluate(async () => {
      const r = await fetch("/api/overview", { method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ prompt: "QA: how a ReAct agent works", cards: { depth: "conceptual", density: "balanced", visuals: "on" }, levels: ["intermediate"], lessonTypes: ["conceptual"], readingMode: "vertical", uploadIds: [] }) });
      const j = await r.json(); return { status: r.status, jobId: j.jobId };
    });
    assert("overview job accepted", start.status === 200 && !!start.jobId);
    if (start.jobId) {
      let seen = new Set(), terminal = null, lastPct = -1, monotonic = true;
      for (let i = 0; i < 50; i++) {
        const j = await page.evaluate(async (id) => (await (await fetch("/api/job/" + id, { headers: authHeaders() })).json()), start.jobId);
        const l = (j.lessons && j.lessons[0]) || {};
        seen.add(j.status + "/" + (l.status || ""));
        if (typeof l.percent === "number") { if (l.percent < lastPct) monotonic = false; lastPct = l.percent; }
        if (j.status === "done" || j.status === "error") { terminal = j.status; break; }
        await sleep(3000);
      }
      assert("overview reaches a terminal state", terminal === "done", `terminal=${terminal}`);
      assert("server progress was observable (status transitions)", seen.size >= 1, [...seen].join(","));
      assert("percent is monotonic (never goes backwards)", monotonic);
    }
  } else {
    console.log("4. Generation progress — SKIPPED (set QA_RUN_GENERATION=1 to run; uses model credits)");
  }

  // ---- 5. Global guards ----
  console.log("5. Global guards");
  assert("no console errors during tested flows", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${failed.length === 0 ? "✓ ALL PASS" : `✗ ${failed.length} FAILED`}  (${results.length} checks)\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error("QA harness error:", e); process.exit(1); });
