import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { seedDemo } from "./demo-seed.js";
import { buildApp } from "./http/app.js";

// Real environment variables take precedence over .env (loadEnvFile does not override existing keys).
if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const ctx = await createContext(config);
const app = await buildApp(ctx);

// Every role serves HTTP (sim/indexer: only /healthz, /readyz, /metrics) so Railway health checks work everywhere.
await app.listen({ host: config.host, port: config.port });
if (config.simAutostart) ctx.runtime.start();
ctx.indexer?.start(config.indexerIntervalMs);
ctx.authPruner?.start();
ctx.commonAgentIndexer?.start(config.aecoCommonAgents.intervalMs);
app.log.info(
  { mode: config.mode, role: config.role, store: ctx.store.kind, chain: ctx.chain.source, simLeader: ctx.runtime.sim?.isLeader ?? null, financialFeaturesEnabled: config.financialFeaturesEnabled },
  "Agentic Economy process started",
);

// Demo data is seeded by an API-serving process through the normal command path (needs a running simulation).
if (config.role === "api" || config.role === "all")
  void seedDemo(ctx)
    .then((seeded) => seeded && app.log.info("seeded demo communities and agents (DEMO MODE)"))
    .catch((err) => app.log.error({ err: String(err) }, "demo seeding failed"));

let closing = false;
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    app.log.info({ sig }, "shutting down: final snapshot and releasing leadership");
    await app.close();
    await ctx.close();
    process.exit(0);
  });
