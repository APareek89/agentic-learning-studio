// Run after npm run demo. Strictly local; refuses production/non-demo targets.
import assert from "node:assert/strict";

const base = process.env.DEMO_BASE_URL || "http://127.0.0.1:5070";
const target = new URL(base);
assert(["127.0.0.1", "localhost", "[::1]"].includes(target.hostname), "Demo smoke tests are local-only.");
const request = (path, body) => fetch(`${base}${path}`, body === undefined ? {} : {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});
async function json(path, body) {
  const response = await request(path, body);
  assert.equal(response.status, 200, path);
  return response.json();
}
const health = await json("/healthz");
assert.equal(health.mode, "demo");
assert.equal(health.db, false);
assert.equal(health.auth, false);
const shell = await (await request("/")).text();
assert(shell.includes("/demo-ui.js"));
assert(!shell.includes('src="https://app.lemonsqueezy.com'));
assert(!shell.includes('src="https://cdn.jsdelivr.net/npm/@supabase'));
const { lessons } = await json("/api/library");
assert.equal(lessons.length, health.fixtures);
assert(lessons.length > 0);
for (const lesson of lessons) {
  const response = await request(`/api/lesson/${lesson.slug}`);
  assert.equal(response.status, 200, lesson.slug);
  assert((await response.text()).startsWith("<!doctype html>"), lesson.slug);
}
assert.equal((await request("/api/lesson/not-a-fixture")).status, 404);
assert.equal((await request("/api/overview", { prompt: "" })).status, 400);
const overview = await json("/api/overview", { prompt: "Agent Memory" });
assert.equal(overview.demo, true);
const overviewJob = await json(`/api/job/${overview.jobId}`);
const artifactId = overviewJob.lessons[0].artifactId;
assert.equal(overviewJob.stage, "overview");
assert.equal(overviewJob.status, "done");
assert((await (await request(`/api/artifact/${artifactId}`)).text()).includes('"previewOnly":true'));
const build = await json("/api/build", { artifactId });
const buildJob = await json(`/api/job/${build.jobId}`);
assert.equal(buildJob.stage, "build");
assert(buildJob.lessons[0].builtModules > 0);
const rendered = await (await request(`/api/artifact/${artifactId}`)).text();
assert(rendered.includes('data-reading="world"'));
assert(rendered.includes('"stubModuleIds":[]'));
assert((await json("/api/lessons")).lessons.some((lesson) => lesson.id === artifactId && lesson.buildPct === 100));
await json("/api/progress", { lessonId: artifactId, percent: 50 });
assert.equal((await json("/api/lessons")).lessons.find((lesson) => lesson.id === artifactId).percent, 50);
const download = await request(`/api/artifact/${artifactId}/download`);
assert.equal(download.status, 200);
assert(download.headers.get("content-disposition").includes("attachment"));
for (const path of ["/api/ask", "/api/skill/generate", "/api/upload", "/api/checkout"]) {
  const blocked = await request(path, {});
  assert.equal(blocked.status, 409, path);
  assert.equal((await blocked.json()).demo, true);
}
console.log(`PASS: ${lessons.length} fixture renders; overview → build → read → progress → download; paid/mutation paths fail closed.`);
