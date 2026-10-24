import { loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { alignmentCommands } from '../src/ops/world-alignment.js';
import { buildApp } from '../src/http/app.js';

// Isolated in-memory rehearsal of the existing nine residents and work planner.
// No .env, database, RPC, inference, social switch or financial execution.
const config = loadConfig({ MODE:'demo', ROLE:'all', HOST:'127.0.0.1', PORT:'8832',
  SOLANA_CLUSTER:'localnet', SOCIAL_SIMULATION_ENABLED:'false', SIM_AUTOSTART:'false',
  WORLD_SEED:'agentic-economy-genesis', LOG_LEVEL:'warn',
  CORS_ORIGINS:'http://127.0.0.1:5187', AUTH_DOMAIN:'127.0.0.1:5187', AUTH_URI:'http://127.0.0.1:5187' });
const ctx = await createContext(config);
for (const [index, command] of alignmentCommands().entries())
  await ctx.coord.enqueueCommand(command, `local-work:${index}`);
await ctx.runtime.tickOnce();
const app = await buildApp(ctx); await app.listen({ host:config.host, port:config.port });
console.log('Local work rehearsal: http://127.0.0.1:8832; nine existing residents; no external calls');
let stopping = false, timer: ReturnType<typeof setTimeout> | undefined;
let pending: Promise<void> | undefined;
const tick = () => { if (stopping) return;
  pending = ctx.runtime.tickOnce().then(() => { if (!stopping) timer = setTimeout(tick, 500); })
    .catch(() => { console.error('Local work rehearsal stopped after a tick error'); void close(); });
};
async function close() { if (stopping) return; stopping = true; if (timer) clearTimeout(timer); await app.close(); await ctx.close(); }
for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal, () => {
  stopping = true; if (timer) clearTimeout(timer);
  void (async () => { await pending; await app.close(); await ctx.close(); process.exit(0); })();
});
tick();
