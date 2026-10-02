// Integration smoke against a disposable loopback PostgreSQL database. No provider credentials.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import pg from "pg";
import { hash } from "bcryptjs";

const dbUrl = process.env.TEST_DATABASE_URL || "postgresql://macbook@127.0.0.1:55443/agentic_auth_test";
const target = new URL(dbUrl);
assert(["127.0.0.1", "localhost"].includes(target.hostname) && target.pathname.endsWith("_test"), "Use a disposable loopback *_test database.");
const db = new pg.Client({ connectionString: dbUrl, ssl: false });
await db.connect();
await db.query(`create table if not exists public.users(id uuid primary key,email text not null,password_hash text,name text,email_verified_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',password_claim_token_hash text,password_claim_expires_at timestamptz,password_claim_used_at timestamptz); create unique index if not exists users_email_lower_unique on users(lower(email));`);
for (const migration of ["0002_users_phase1", "0003_prebuilt", "0004_courses", "0005_library_rebuild", "0006_community", "0007_contributors", "0013_credits_billing", "0015_handson", "0017_generated_skills", "0019_fractional_credits", "0020_beta_feedback_events", "0021_persist_jobs_uploads", "0022_revocable_sessions"]) {
  await db.query(await readFile(`supabase/migrations/${migration}.sql`, "utf8"));
}
await db.query(`create table if not exists module_cache(cache_key text primary key,fragment_html text not null,sources jsonb,created_at timestamptz default now()); alter table hands_on_notebooks add column if not exists user_id text; alter table community_lessons add column if not exists hidden boolean default false;`);
const fixture = JSON.parse(await readFile("prebuilt/lessons/agent-memory.json", "utf8"));
// A deterministic quiz exercises real server-side grading (the production fixture has no final quiz).
fixture.finalCheck = { kind: "knowledgeCheck", id: "_final_check", title: "Quick memory check", questions: [{ id: "memory-kind", kind: "mcq", prompt: "Which memory persists between sessions?", options: [{ text: "Long-term memory", correct: true }, { text: "Only the current prompt", correct: false }], explanation: "Long-term memory persists between sessions." }] };
await db.query(`insert into prebuilt_lessons(slug,title,blueprint,html,category,level,est_minutes) values('agent-memory',$1,$2,'','Agents','Intermediate',15) on conflict(slug) do update set blueprint=excluded.blueprint`, [fixture.meta.title, fixture]);
const port = Number(process.env.TEST_PORT || 5072), base = `http://127.0.0.1:${port}`;
const authSecret = randomBytes(48).toString("hex");
const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { env: { PATH: process.env.PATH, PORT: String(port), NODE_ENV: "test", DATABASE_URL: dbUrl, DATABASE_SSL: "disable", AUTH_SECRET: authSecret, APP_URL: base, ALS_MOCK_MODE: "1", DOTENV_CONFIG_PATH: "/dev/null" }, stdio: ["ignore", "pipe", "pipe"] });
let logs = ""; child.stdout.on("data", (v) => { logs += v; }); child.stderr.on("data", (v) => { logs += v; });
function client() {
  const cookies = new Map();
  const request = async (path, body, options = {}) => {
    const headers = { cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), ...(body !== undefined ? { origin: base, "content-type": "application/json" } : {}), ...options.headers };
    const r = await fetch(base + path, { method: body === undefined ? "GET" : "POST", ...options, headers, body: body === undefined ? undefined : options.form ? new URLSearchParams(body) : JSON.stringify(body), redirect: "manual" });
    for (const value of r.headers.getSetCookie()) { const [pair] = value.split(";"); const eq = pair.indexOf("="); cookies.set(pair.slice(0,eq), pair.slice(eq+1)); }
    return r;
  };
  request.cookieHeader=()=>[...cookies].map(([k,v])=>`${k}=${v}`).join("; ");
  return request;
}
async function signin(c, email, password) {
  const csrf = await (await c("/auth/csrf")).json();
  const response = await c("/auth/callback/credentials", { email, password, csrfToken: csrf.csrfToken, callbackUrl: base }, { form: true, headers: { "content-type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" } });
  assert.equal(response.status, 200);
  if(response.headers.getSetCookie().some(v=>v.includes("session-token"))) assert(response.headers.getSetCookie().filter(v=>v.includes("session-token")).every(v=>/HttpOnly/i.test(v)));
  return response.json();
}
try {
  let ready = false;
  for (let i=0;i<100;i++) { try { if ((await fetch(base+"/healthz")).ok) { ready=true;break; } } catch {} await new Promise(r=>setTimeout(r,100)); }
  assert(ready, "Main app must boot with no provider keys");
  const anon = client(), a = client(), b = client();
  const suffix = randomUUID().slice(0,8), password = "Local-only-demo-password-1!";
  const emailA = `qa-one-${suffix}@example.test`, emailB = `qa-two-${suffix}@example.test`;
  assert.equal((await anon("/api/lessons")).status, 401);
  assert.equal((await anon("/api/auth/signup", {email: emailA,password}, {headers:{origin:"https://untrusted.example"}})).status, 403);
  for (const email of [emailA,emailB]) assert.equal((await anon("/api/auth/signup", {email,password})).status, 201);
  assert.equal((await anon("/api/auth/signup", {email:emailA.toUpperCase(),password})).status, 409);
  assert(!(await signin(a,emailA,password)).url.includes("error="));
  assert(!(await signin(b,emailB,password)).url.includes("error="));
  const userA = (await (await a("/auth/session")).json()).user;
  const userB = (await (await b("/auth/session")).json()).user;
  assert(userA.id && userB.id && userA.id !== userB.id);
  const example = await a("/api/examples/start", {slug:"agent-memory"}); assert.equal(example.status,200);
  const {artifact} = await example.json();
  assert.deepEqual(await (await a(`/api/artifact/${artifact.id}/metadata`)).json(),{prepared:true});
  assert.equal((await b(`/api/artifact/${artifact.id}/metadata`)).status,404);
  assert.equal((await a('/api/community/share',{lessonId:artifact.id,displayName:'Synthetic learner'})).status,400);
  assert.equal(Number((await db.query('select count(*) n from community_lessons where source_lesson_id=$1',[artifact.id])).rows[0].n),0);
  // A restart-era cached example predates the explicit marker: conservative legacy
  // provenance must still block publication before classification/model work.
  const legacyExampleId=randomUUID();
  await db.query(`insert into lessons(id,user_id,kind,title,prompt,blueprint,html,cards) select $1,user_id,kind,title,prompt,blueprint,html,'{}'::jsonb from lessons where id=$2`,[legacyExampleId,artifact.id]);
  assert.equal((await a('/api/community/share',{lessonId:legacyExampleId})).status,400);
  assert.equal((await (await a('/api/lessons')).json()).lessons.find(l=>l.id===artifact.id).prepared,true);
  assert.equal((await (await a('/api/lessons')).json()).lessons.find(l=>l.id===legacyExampleId).prepared,true);
  const viewerHtml=await (await a(`/api/artifact/${legacyExampleId}`)).text();
  assert(viewerHtml.includes('Mobile module navigation overlays'));
  assert(viewerHtml.includes('aria-controls="wrail" aria-expanded="false"'));

  for (const tail of ["", "/download", "/full"]) {
    assert.equal((await anon(`/api/artifact/${artifact.id}${tail}`)).status,401);
    assert.equal((await b(`/api/artifact/${artifact.id}${tail}`)).status,404);
    const own = await a(`/api/artifact/${artifact.id}${tail}`); assert.equal(own.status,200); assert((await own.text()).includes("lovable-ui"));
  }
  const notebook = await a("/api/hands-on/start",{lessonId:artifact.id});
  assert.equal(notebook.status,200);
  const notebookResult = await notebook.json(); assert.equal(notebookResult.status,"done"); assert.equal(notebookResult.source,"template");
  assert(notebookResult.notebook.cells.some(cell=>cell.type==="code"));
  assert.equal((await b("/api/hands-on/start",{lessonId:artifact.id})).status,404);
  const moduleId = fixture.modules[0].id;
  const stubId=randomUUID(),stubBlueprint=structuredClone(fixture);stubBlueprint.modules[0].blocks=[];stubBlueprint.modules[0].loadState='stub';
  await db.query(`insert into lessons(id,user_id,kind,title,prompt,blueprint,html,cards) select $1,user_id,kind,title,'Ordinary unfinished fixture',$3,html,'{}'::jsonb from lessons where id=$2`,[stubId,artifact.id,JSON.stringify(stubBlueprint)]);
  for(let i=0;i<3;i++){const poll=await a('/api/module',{artifactId:stubId,moduleId});assert.equal(poll.status,409);assert.equal((await poll.json()).retryRequired,true);}

  assert.equal((await a("/api/module",{artifactId:artifact.id,moduleId})).status,200);
  assert.equal((await b("/api/module",{artifactId:artifact.id,moduleId})).status,404);
  const quiz = {artifactId:artifact.id,blockId:"_final_check",questionId:"memory-kind",choiceIndex:0};
  assert.equal((await (await a("/api/check",quiz)).json()).correct,true);
  assert.equal((await b("/api/check",quiz)).status,404);
  assert.equal((await (await anon("/api/check",{...quiz,artifactId:undefined,slug:"agent-memory",source:"library"})).json()).correct,true);
  await db.query("insert into community_lessons(slug,title,blueprint,html,hidden) values($1,'Hidden test lesson',$2,'',true)",[`hidden-${suffix}`,fixture]);
  assert.equal((await anon("/api/check",{...quiz,artifactId:undefined,slug:`hidden-${suffix}`,source:"community"})).status,404);
  assert.equal((await a("/api/ask",{artifactId:artifact.id,question:"Explain memory"})).status,409);
  assert.equal((await b("/api/ask",{artifactId:artifact.id,question:"Explain memory"})).status,404);
  assert.equal((await a("/api/progress",{lessonId:artifact.id,percent:50,visited:2,total:4})).status,200);
  assert.equal((await (await a("/api/lessons")).json()).lessons.find(l=>l.id===artifact.id).percent,50);
  assert(!(await (await b("/api/lessons")).json()).lessons.some(l=>l.id===artifact.id));
  assert.equal((await a("/api/progress",{lessonId:artifact.id,percent:100},{headers:{origin:"null"}})).status,403);
  // Preserved bcrypt login and passwordless account setup are distinct paths.
  const legacyId=randomUUID(), legacyEmail=`legacy-${suffix}@example.test`, claimId=randomUUID(), claimEmail=`claim-${suffix}@example.test`, token=randomBytes(32).toString("hex");
  const legacyHash=await hash("Legacy-short!",10);
  await db.query("insert into users(id,email,password_hash) values($1,$2,$3)",[legacyId,legacyEmail,legacyHash]);
  assert(!(await signin(client(),legacyEmail,"Legacy-short!")).url.includes("error="));
  assert.equal((await db.query("select password_hash from users where id=$1",[legacyId])).rows[0].password_hash,legacyHash);
  await db.query("insert into users(id,email,password_claim_token_hash,password_claim_expires_at) values($1,$2,$3,now()+interval '1 hour')",[claimId,claimEmail,createHash("sha256").update(token).digest("hex")]);
  assert.equal((await anon("/api/auth/signup",{email:claimEmail,password})).status,409);
  assert.equal((await anon("/api/auth/claim",{email:claimEmail,password})).status,400);
  assert.equal((await anon("/api/auth/claim",{token,password})).status,200);
  assert.equal((await anon("/api/auth/claim",{token,password})).status,400);
  const expiredToken=randomBytes(32).toString("hex");
  await db.query("insert into users(id,email,password_claim_token_hash,password_claim_expires_at) values($1,$2,$3,now()-interval '1 minute')",[randomUUID(),`expired-${suffix}@example.test`,createHash("sha256").update(expiredToken).digest("hex")]);
  assert.equal((await anon("/api/auth/claim",{token:expiredToken,password})).status,400);
  const cookieSnapshot = a.cookieHeader();
  const csrf=await (await a("/auth/csrf")).json();
  await a("/auth/signout",{csrfToken:csrf.csrfToken,callbackUrl:base},{form:true,headers:{"content-type":"application/x-www-form-urlencoded","X-Auth-Return-Redirect":"1"}});
  assert.equal((await a("/api/lessons")).status,401);
  assert.equal((await fetch(base+"/api/lessons", {headers:{cookie:cookieSnapshot}})).status,401,"Signout must revoke a copied session cookie, not only clear this browser");
  assert(!logs.includes("[paid-call]"));
  if(process.env.TEST_RATE_LIMIT==="1") {
    let throttled=false;
    for(let i=0;i<17;i++) { const result=await anon("/api/auth/signup",{}); if(result.status===429) { throttled=true; break; } }
    assert(throttled,"Authentication mutations must be throttled");
  }
  if(process.env.KEEP_AUTH_PREVIEW==="1") await writeFile("/tmp/agentic-local-preview.json",JSON.stringify({email:emailB,password,base,artifactId:artifact.id}),{mode:0o600});
  console.log("PASS: credentials signup/signin/signout, legacy bcrypt, one-time claims, CSRF, two-user lesson isolation, cached module/MCQ/notebook/progress/download, mock paid guard; zero paid calls.");
  if(process.env.KEEP_AUTH_PREVIEW==="1") { console.log(`Preview remains at ${base}; local fixture login in private /tmp/agentic-local-preview.json.`); await new Promise(()=>{}); }
} catch(error) { console.error(error); process.exitCode=1; }
finally { child.kill("SIGTERM"); await db.end(); }
