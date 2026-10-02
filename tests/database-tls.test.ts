import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { rawPool, closePool } from "../src/lib/db";

test("connection-string SSL switches cannot override verified PostgreSQL TLS", async () => {
 const prior = {...process.env};
 try {
  for (const suffix of ["ssl=no-verify", "ssl=false", "sslmode=no-verify", "SSL=no-verify&sslrootcert=untrusted"]) {
   process.env.DATABASE_URL = "postgresql://fixture:synthetic@database.invalid/fixture?" + suffix;
   delete process.env.DATABASE_SSL; delete process.env.DATABASE_SSL_CA_FILE;
   const pool = rawPool()!;
   const client = new pg.Client(pool.options);
   assert.equal(client.connectionParameters.ssl && client.connectionParameters.ssl.rejectUnauthorized, true);
   await closePool();
  }
 } finally { await closePool(); for(const k of Object.keys(process.env))if(!(k in prior))delete process.env[k]; Object.assign(process.env,prior); }
});
