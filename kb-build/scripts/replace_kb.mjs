#!/usr/bin/env node
import "dotenv/config";
import { spawn } from "node:child_process";
import pg from "pg";
import path from "node:path";

const repoRoot = path.resolve(new URL("../../", import.meta.url).pathname);
const kbPath = path.join(repoRoot, "kb");
const caBundle = "/Users/anandpareek/Documents/SEO content Skill/scripts/system-ca-bundle.pem";
const envName = process.env.KB_ENV_NAME;
const databaseUrl = process.env.DATABASE_URL;

function assertTarget() {
  if (!envName || !["staging", "prod"].includes(envName)) {
    throw new Error("Set KB_ENV_NAME=staging or KB_ENV_NAME=prod.");
  }
  if (!databaseUrl) throw new Error("Set DATABASE_URL to the target database.");
  if (envName === "prod" && process.env.KB_STAGING_VERIFIED !== "1") {
    throw new Error("Refusing prod replace until KB_STAGING_VERIFIED=1 is set after staging smoke tests pass.");
  }
  if (process.env.KB_ALLOW_DB_MUTATION !== "1") {
    throw new Error("Refusing destructive replace unless KB_ALLOW_DB_MUTATION=1 is set.");
  }
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: repoRoot, stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function truncateKb() {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    await pool.query("truncate table chunks, documents restart identity;");
  } finally {
    await pool.end();
  }
}

async function main() {
  assertTarget();
  console.warn(`Replacing KB in ${envName}. Existing kbChunkId provenance in old generated lessons may become stale.`);
  await truncateKb();
  await run("npm", ["run", "ingest", "--", kbPath], {
    ...process.env,
    NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS || caBundle,
    DATABASE_URL: databaseUrl,
  });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
