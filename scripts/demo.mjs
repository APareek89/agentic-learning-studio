// The demo gets a fresh environment: no .env loading, API keys, DB URL or tracing.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const child = spawn(process.execPath, ["--import", "tsx", "src/demo/server.ts"], {
  cwd: root,
  env: { PATH: process.env.PATH || "", PORT: process.env.PORT || "5070", NODE_ENV: "development" },
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Could not start the local demo."); process.exitCode = 1; });
child.on("exit", (code) => { process.exitCode = code ?? 0; });
