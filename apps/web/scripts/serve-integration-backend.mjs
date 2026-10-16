import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
// Start only the authoritative server; no backend source files or environment files are changed.
const child = spawn("pnpm", ["--filter", "@agentic-economy/server", "dev"], {
  cwd: fileURLToPath(new URL("../../../", import.meta.url)),
  stdio: "inherit",
  env: {
    ...process.env,
    MODE: "demo",
    ROLE: "all",
    HOST: "127.0.0.1",
    PORT: "8787",
    FEE_ROUTING_VERIFIED: "false",
    LOG_LEVEL: "warn",
    DATABASE_URL:
      process.env.TEST_DATABASE_URL ??
      "postgres:///agentic_economy_frontend_integration_20261014?host=/var/run/postgresql",
  },
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    // Keep children in Playwright's process group so its teardown reaches tsx too.
    child.kill(signal);
  });
child.on("exit", (code) => process.exit(code ?? 0));
