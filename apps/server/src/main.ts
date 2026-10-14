import { existsSync } from "node:fs";
import { loadConfig } from "./config.js";
import { createContext } from "./context.js";
import { seedDemo } from "./demo-seed.js";
import { buildApp } from "./http/app.js";
import { TreasuryIndexer } from "./services/indexer.js";

// Real environment variables take precedence over .env (loadEnvFile does not override existing keys).
if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
const ctx = await createContext(config);
if (await seedDemo(ctx)) console.log(JSON.stringify({ level: "info", msg: "seeded demo communities and agents (DEMO MODE)" }));

const app = await buildApp(ctx);
let indexer: TreasuryIndexer | null = null;
if (config.mode !== "demo") {
  indexer = new TreasuryIndexer(ctx.chain, ctx.store, ctx.treasury, ctx.runtime, [config.treasuries.agentRewards, config.treasuries.platform], app.log);
  indexer.start(30_000);
}
if (config.simAutostart) ctx.runtime.start();
await app.listen({ host: config.host, port: config.port });
app.log.info({ mode: config.mode, store: ctx.store.kind, chain: ctx.chain.source, financialFeaturesEnabled: config.financialFeaturesEnabled }, "Agentic Economy server listening");

let closing = false;
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.on(sig, async () => {
    if (closing) return;
    closing = true;
    app.log.info({ sig }, "shutting down: final snapshot");
    indexer?.stop();
    await app.close();
    await ctx.close();
    process.exit(0);
  });
