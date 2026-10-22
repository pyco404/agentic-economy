/** Loopback-only, in-memory fixture world. No database, provider keys or chain transactions.
 * Used exclusively by the Common Agent browser acceptance config, never by main.ts. */
import { createHash } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import { loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { buildApp } from '../src/http/app.js';
const wallet = (n: number) => Keypair.fromSeed(createHash('sha256').update(`common-browser-fixture:${n}`).digest()).publicKey.toBase58();
const mint = wallet(100_001);
const count = Number(process.env.AECO_COMMON_AGENTS_FIXTURE_COUNT ?? 400);
if (!Number.isSafeInteger(count) || count < 1 || count > 10000) throw new Error('Fixture count must be 1–10000');
const config = loadConfig({ MODE: 'demo', LOG_LEVEL: 'silent', HOST: '127.0.0.1', PORT: '5198', CORS_ORIGINS: 'http://127.0.0.1:5197', SIM_AUTOSTART: 'false' });
// Fixture-only observation injection, not an environment-variable bypass in the deployed application.
config.aecoCommonAgents = { enabled: true, mint, intervalMs: 1_800_000, excludedWallets: [] };
const ctx = await createContext(config);
await ctx.coord.enqueueCommand({ type: 'aeco.reconcile', mint, network: 'devnet', decimals: 6, slot: 100, checkedAt: new Date().toISOString(), holders: Array.from({ length: count }, (_, i) => ({ wallet: wallet(i), balanceRaw: '1000000' })) }, 'common:browser:fixture');
await ctx.runtime.tickOnce(); ctx.runtime.start();
const app = await buildApp(ctx);
await app.listen({ host: '127.0.0.1', port: 5198 });
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => { void app.close().then(() => ctx.close()).then(() => process.exit(0)); });
