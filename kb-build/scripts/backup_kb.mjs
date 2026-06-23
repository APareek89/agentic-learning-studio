#!/usr/bin/env node
import "dotenv/config";
import { mkdir } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import pg from "pg";

const repoRoot = path.resolve(new URL("../../", import.meta.url).pathname);
const backupsDir = path.join(repoRoot, "kb-build", "backups");
const envName = process.env.KB_ENV_NAME;
const databaseUrl = process.env.DATABASE_URL;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

async function main() {
  if (!envName) throw new Error("Set KB_ENV_NAME=staging or KB_ENV_NAME=prod.");
  if (!databaseUrl) throw new Error("Set DATABASE_URL to the target database.");
  await mkdir(backupsDir, { recursive: true });
  const out = path.join(backupsDir, `${envName}-${stamp()}.sql`);
  if (existsSync("/opt/homebrew/bin/pg_dump") || existsSync("/usr/local/bin/pg_dump") || existsSync("/usr/bin/pg_dump")) {
    await run(
      "pg_dump",
      [
        "--no-owner",
        "--no-privileges",
        "--data-only",
        "--table=public.documents",
        "--table=public.chunks",
        "--file",
        out,
        databaseUrl,
      ],
      process.env
    );
  } else {
    await writeFile(out, await buildSqlBackup(), "utf8");
  }
  console.log(JSON.stringify({ backup: out }, null, 2));
}

function lit(value) {
  if (value === null || value === undefined) return "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function typed(value, cast) {
  if (value === null || value === undefined) return "null";
  return `${lit(value)}::${cast}`;
}

async function buildSqlBackup() {
  const pool = new pg.Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 2 });
  try {
    const documents = await pool.query(
      `select id::text, source_id, title, source_type, category, content_hash, mtime, meta::text, created_at from documents order by created_at, id`
    );
    const chunks = await pool.query(
      `select id, document_id::text, source_id, chunk_index, content_kind, title, category, url, content, token_count,
              license, verdict, as_of_date, embedding::text, content_hash, created_at
         from chunks order by id`
    );
    const lines = [
      "-- Agentic Learning Studio KB backup",
      `-- env=${envName}`,
      `-- created_at=${new Date().toISOString()}`,
      "begin;",
      "set session_replication_role = replica;",
    ];

    for (const r of documents.rows) {
      lines.push(
        `insert into documents (id, source_id, title, source_type, category, content_hash, mtime, meta, created_at) values (` +
          [
            typed(r.id, "uuid"),
            lit(r.source_id),
            lit(r.title),
            lit(r.source_type),
            lit(r.category),
            lit(r.content_hash),
            typed(r.mtime?.toISOString?.() ?? r.mtime, "timestamptz"),
            typed(r.meta, "jsonb"),
            typed(r.created_at?.toISOString?.() ?? r.created_at, "timestamptz"),
          ].join(", ") +
          `) on conflict (source_id) do nothing;`
      );
    }

    for (const r of chunks.rows) {
      lines.push(
        `insert into chunks (id, document_id, source_id, chunk_index, content_kind, title, category, url, content, token_count, license, verdict, as_of_date, embedding, content_hash, created_at) values (` +
          [
            r.id,
            typed(r.document_id, "uuid"),
            lit(r.source_id),
            r.chunk_index ?? "null",
            lit(r.content_kind),
            lit(r.title),
            lit(r.category),
            lit(r.url),
            lit(r.content),
            r.token_count ?? "null",
            lit(r.license),
            lit(r.verdict),
            typed(r.as_of_date?.toISOString?.().slice(0, 10) ?? r.as_of_date, "date"),
            typed(r.embedding, "vector"),
            lit(r.content_hash),
            typed(r.created_at?.toISOString?.() ?? r.created_at, "timestamptz"),
          ].join(", ") +
          `) on conflict (content_hash) do nothing;`
      );
    }

    lines.push("select setval(pg_get_serial_sequence('chunks','id'), coalesce((select max(id) from chunks), 1), true);");
    lines.push("set session_replication_role = origin;");
    lines.push("commit;");
    return lines.join("\n") + "\n";
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
