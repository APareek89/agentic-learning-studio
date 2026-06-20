/**
 * One-off: copy real-user lessons + preferences from the OLD Supabase project to
 * the NEW one (read-only on OLD). Skips local-dev + expired rows. Idempotent.
 *
 * Usage: OLD_DATABASE_URL="<old session-pooler URI>" node scripts/copy-user-data.mjs
 *        (NEW DATABASE_URL comes from .env)
 */
import "dotenv/config";
import pg from "pg";

const OLD = process.env.OLD_DATABASE_URL;
const NEW = process.env.DATABASE_URL;
if (!OLD || !NEW) { console.error("Need OLD_DATABASE_URL and DATABASE_URL"); process.exit(1); }

const old = new pg.Client({ connectionString: OLD, ssl: { rejectUnauthorized: false } });
const neu = new pg.Client({ connectionString: NEW, ssl: { rejectUnauthorized: false } });
await old.connect();
await neu.connect();

const L = await old.query("select * from lessons where user_email is not null and user_email <> 'local@dev' and expires_at > now()");
let n = 0;
for (const r of L.rows) {
  await neu.query(
    `insert into lessons (id,user_id,user_email,kind,title,prompt,cards,profile,blueprint,html,upload_ids,refer_only,rating,rating_comment,created_at,updated_at,expires_at,course_id,course_index,course_total,course_title)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     on conflict (id) do nothing`,
    [r.id, r.user_id, r.user_email, r.kind, r.title, r.prompt, r.cards, r.profile, r.blueprint, r.html, r.upload_ids, r.refer_only, r.rating, r.rating_comment, r.created_at, r.updated_at, r.expires_at, r.course_id, r.course_index, r.course_total, r.course_title]
  );
  n++;
}
console.log("copied lessons:", n);

const P = await old.query("select * from user_preferences where user_email is not null and user_email <> 'local@dev'");
let m = 0;
for (const r of P.rows) {
  await neu.query(
    `insert into user_preferences (user_id,user_email,prefs,updated_at) values ($1,$2,$3,$4) on conflict (user_id) do nothing`,
    [r.user_id, r.user_email, r.prefs, r.updated_at]
  );
  m++;
}
console.log("copied preferences:", m);

const chk = await neu.query("select count(*) n from lessons where user_email <> 'local@dev'");
console.log("new DB real-user lessons now:", chk.rows[0].n);
await old.end();
await neu.end();
process.exit(0);
