// Privileged operator tool. Tokens are written only to a new private file outside the repo.
import { randomBytes, createHash } from "node:crypto";
import { writeFile, realpath, unlink } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { query, rawPool } from "../src/lib/db";

const [userId, outputArg] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/i.test(userId || "") || !outputArg || !isAbsolute(outputArg)) throw new Error("Usage: npm run auth:claim -- USER_UUID /private/absolute/output-file");
const root = await realpath(process.cwd());
const output = resolve(await realpath(dirname(outputArg)), outputArg.split("/").at(-1)!);
if (!relative(root, output).startsWith("../")) throw new Error("The private output file must be outside the repository.");
const appUrl = new URL(process.env.APP_URL || "");
if (appUrl.protocol !== "https:" && !["127.0.0.1", "localhost"].includes(appUrl.hostname)) throw new Error("APP_URL must use HTTPS.");
const token = randomBytes(32).toString("hex");
const digest = createHash("sha256").update(token).digest("hex");
await writeFile(output, `${appUrl.origin}/set-password#${token}\nExpires in 24 hours; use once. Send only to the verified account owner through a private channel.\n`, { mode: 0o600, flag: "wx" });
try {
  const changed = await query(`update public.users set password_claim_token_hash=$2,password_claim_expires_at=now()+interval '24 hours',password_claim_used_at=null where id=$1 and password_hash is null returning id`, [userId, digest]);
  if (changed.length !== 1) throw new Error("No eligible passwordless user. Existing passwords cannot be replaced by this tool.");
  console.log("Private one-time setup file created; token is not printed or logged.");
} catch (error) { await unlink(output); throw error; }
finally { await rawPool()?.end(); }
