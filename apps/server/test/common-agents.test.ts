import { createHash } from 'node:crypto';
import { Keypair, PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { generateWorld } from '@agentic-economy/world-spec';
import { AgentIdentity, AgentSummary, OFFICIAL_TREASURIES } from '@agentic-economy/shared';
import { createInitialState, SimEngine, hashState } from '../src/sim/engine.js';
import { commonAgentId } from '../src/sim/common-agents.js';
import { toAgentSummary } from '../src/sim/view.js';
import { ownerOf } from '../src/sim/identity.js';
import { readAecoHolders } from '../src/chain/aeco-holders.js';
import { CommonAgentIndexer, commonPopulation, isOfficialAecoLaunch } from '../src/services/common-agents.js';
import { LOCK_KEYS } from '../src/store/postgres.js';
import { MemoryStore } from '../src/store/memory.js';
import { MemoryCoordinator } from '../src/coord/memory.js';
import { loadConfig } from '../src/config.js';
import { makeEnv } from './helpers.js';
import type { AecoSnapshot } from '../src/sim/types.js';
const wallet = (n: number) => Keypair.fromSeed(createHash('sha256').update(`fixture-common:${n}`).digest()).publicKey.toBase58();
const mint = wallet(100001);
const layout = generateWorld('test-world');
const snapshot = (n: number, slot = 100): AecoSnapshot => ({ mint, network: 'devnet', slot, decimals: 6, checkedAt: new Date().toISOString(), holders: Array.from({ length: n }, (_, i) => ({ wallet: wallet(i), balanceRaw: '1000000' })) });
const silent = { info() {}, warn() {}, error() {} };
const apply = (engine: SimEngine, snap: AecoSnapshot) => { engine.enqueue({ type: 'aeco.reconcile', ...snap }, snap.slot); return engine.step(); };

describe('automatic Common Agent identity and simulation', () => {
  it('400 wallets create 400 persistent Common Agents without authenticated control, credits or task permissions', () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    const obs = snapshot(400); apply(engine, obs);
    expect(engine.state.agentOrder).toHaveLength(400);
    for (const a of Object.values(engine.state.agents)) {
      expect(a.status).toBe('active'); expect(a.ownerWallet).toBeNull(); expect(a.permissions).toEqual([]);
      expect(ownerOf(a.identity)).toBeNull(); expect(a.totalPoints).toBe(0);
      expect(AgentIdentity.safeParse(a.identity).success).toBe(true);
      expect(AgentSummary.safeParse(toAgentSummary(engine.state, a)).success).toBe(true);
      expect(toAgentSummary(engine.state, a).credits).toBe(0);
    }
    const positions = engine.state.agentOrder.map(id => JSON.stringify(engine.state.agents[id]!.cell));
    for (let i = 0; i < 250; i++) engine.step();
    expect(engine.state.agentOrder.some((id, i) => JSON.stringify(engine.state.agents[id]!.cell) !== positions[i])).toBe(true);
    for (const a of Object.values(engine.state.agents)) { expect(engine.nav.isWalkable(a.cell)).toBe(true); expect(a.taskId).toBeNull(); expect(a.verifiedTasks).toBe(0); }
    apply(engine, { ...obs, slot: 101 });
    expect(engine.state.agentOrder).toHaveLength(400);
  });
  it('partial sales, transfers, full exits, out-of-order events and reentry preserve deterministic IDs', () => {
    const e = new SimEngine(createInitialState(layout), layout); const obs = snapshot(2);
    apply(e, obs); const original = obs.holders.map(h => commonAgentId(obs.network, mint, h.wallet));
    apply(e, { ...obs, slot: 101, holders: [{ ...obs.holders[0]!, balanceRaw: '2' }, { wallet: wallet(3), balanceRaw: '999998' }] });
    expect(e.state.agents[original[1]!]!.status).toBe('paused');
    expect(e.state.agents[original[0]!]!.identity).toMatchObject({ balanceRaw: '2' });
    apply(e, obs); expect(e.state.agents[original[1]!]!.status).toBe('paused');
    const restored = new SimEngine(JSON.parse(JSON.stringify(e.state)), layout);
    apply(restored, { ...obs, slot: 102 });
    expect(restored.state.agents[original[1]!]!.status).toBe('active');
    expect(restored.state.agentOrder).toHaveLength(3);
    expect(commonAgentId('devnet', mint, obs.holders[0]!.wallet)).toBe(original[0]);
    expect(commonAgentId('mainnet-beta', mint, obs.holders[0]!.wallet)).not.toBe(original[0]);
  });
  it('rejects a malformed observation atomically and exposes syncing/stale instead of fabricated equality', () => {
    const e = new SimEngine(createInitialState(layout), layout); const config = loadConfig({ LOG_LEVEL: 'silent' });
    config.aecoCommonAgents = { enabled: true, mint, intervalMs: 60_000, excludedWallets: [] };
    expect(commonPopulation(config, e.state).status).toBe('syncing');
    const obs = snapshot(1); apply(e, obs);
    expect(commonPopulation(config, e.state)).toMatchObject({ status: 'current', holders: 1, commonAgents: 1 });
    expect(commonPopulation(config, e.state, Date.parse(obs.checkedAt) + 120_001).status).toBe('stale');
    const before = hashState(e.state);
    expect(() => apply(e, { ...obs, slot: 101, holders: [...obs.holders, ...obs.holders] })).toThrow();
    expect(hashState(e.state)).toBe(before);
  });
  it('recovers indexed identities from the existing command journal after leadership loss and public API access needs no login', async () => {
    const store = new MemoryStore(); const coord = new MemoryCoordinator(store);
    const env = await makeEnv({}, { store, coord });
    try {
      const obs = snapshot(4);
      const indexer = new CommonAgentIndexer(coord, async () => obs, silent, 'fixture');
      await indexer.runOnce(); await indexer.runOnce(); await env.ctx.runtime.tickOnce();
      expect(env.ctx.runtime.state.agentOrder).toHaveLength(4);
      const observedId = commonAgentId(obs.network, obs.mint, obs.holders[0]!.wallet);
      await expect(env.ctx.agents.update(obs.holders[0]!.wallet, observedId, { status: 'paused' })).rejects.toThrow('owner');
      coord.killLeader(); await env.ctx.runtime.tickOnce();
      expect(env.ctx.runtime.state.agentOrder).toHaveLength(4);
      const publicResponse = await env.app.inject({ method: 'GET', url: '/api/v1/world/agents' });
      expect(publicResponse.statusCode).toBe(200); expect(publicResponse.json().agents).toHaveLength(4);
      const failed = new CommonAgentIndexer(coord, async () => { throw new Error('private provider error'); }, silent, 'fixture');
      await failed.runOnce(); await env.ctx.runtime.tickOnce();
      expect(env.ctx.runtime.state.agentOrder).toHaveLength(4);
      await indexer.stop(); await failed.stop();
    } finally { await env.close(); }
  });
  it('keeps 10,000 persistent identities and bounded basic simulation work', () => {
    const e = new SimEngine(createInitialState(layout), layout);
    const obs = snapshot(10_000); const start = performance.now(); apply(e, obs);
    const createdMs = performance.now() - start; const run = performance.now();
    for (let tick = 0; tick < 40; tick++) e.step();
    const tickMs = (performance.now() - run) / 40;
    console.info(JSON.stringify({ fixture: 'common-agents-10000', createdMs: Math.round(createdMs), averageTickMs: Math.round(tickMs) }));
    expect(e.state.agentOrder).toHaveLength(10_000); expect(new Set(e.state.agentOrder).size).toBe(10_000);
    expect(tickMs).toBeLessThan(500);
    expect(e.state.agentOrder.filter(id => e.state.agents[id]!.activity === 'moving').length).toBeGreaterThan(1000);
  }, 60_000);
});

const PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
function rawAccount(owner: string, amount: bigint, id: number) {
  const data = Buffer.alloc(165); Buffer.from(Keypair.fromSeed(createHash('sha256').update('fixture-common:100001').digest()).publicKey.toBytes()).copy(data);
  const ownerKey = Keypair.fromSeed(createHash('sha256').update(`fixture-common:${id}`).digest()).publicKey;
  ownerKey.toBuffer().copy(data, 32); data.writeBigUInt64LE(amount, 64); data[108] = 1;
  return { pubkey: owner, account: { owner: PROGRAM, executable: false, data: [data.toString('base64'), 'base64'] } };
}
function reader(rows: ReturnType<typeof rawAccount>[], supply: bigint, malformed = false) {
  const data = Buffer.alloc(82); data.writeBigUInt64LE(supply, 36); data[44] = 6; data[45] = 1;
  return { network: 'devnet' as const, async rpc(method: string) {
    if (method === 'getAccountInfo') return { context: { slot: 100 }, value: { owner: PROGRAM, executable: false, data: [data.toString('base64'), 'base64'] } };
    if (method === 'getProgramAccounts') return { context: { slot: 100 }, value: rows };
    return { context: { slot: 100 }, value: malformed ? [] : Array.from(new Set(rows.map(r => r.account.data[0]))).map(() => null).slice(0, 1) };
  } };
}
describe('authoritative owner aggregation', () => {
  it('aggregates two token accounts belonging to one owner with bigint precision', async () => {
    const rows = [rawAccount(wallet(90), 9007199254740993n, 0), rawAccount(wallet(91), 7n, 0)];
    const result = await readAecoHolders(reader(rows, 9007199254741000n), mint, new Set());
    expect(result.holders).toEqual([{ wallet: wallet(0), balanceRaw: '9007199254741000' }]);
  });
  it('does not accept incomplete, duplicate or malformed owner reads as zero balances', async () => {
    const row = rawAccount(wallet(90), 7n, 0);
    await expect(readAecoHolders(reader([row], 8n), mint, new Set())).rejects.toThrow('coverage');
    await expect(readAecoHolders(reader([row, row], 14n), mint, new Set())).rejects.toThrow('Duplicate');
    await expect(readAecoHolders(reader([row], 7n, true), mint, new Set())).rejects.toThrow('owner');
  });
  it('excludes configured non-user recipients without losing supply coverage', async () => {
    const row = rawAccount(wallet(90), 7n, 0);
    const result = await readAecoHolders(reader([row], 7n), mint, new Set([wallet(0)]));
    expect(result.holders).toEqual([]);
  });
  it('is off by default and cannot use an unverified or mismatched mint', () => {
    expect(loadConfig({}).aecoCommonAgents.enabled).toBe(false);
    expect(() => loadConfig({ AECO_COMMON_AGENTS_ENABLED: 'true', AECO_MINT: mint })).toThrow();
  });
});

it('registers a distinct PostgreSQL advisory-lock key for holder reconciliation', () => {
  expect(LOCK_KEYS['aeco-common-agents']).toBeDefined();
  expect(new Set(Object.values(LOCK_KEYS)).size).toBe(Object.keys(LOCK_KEYS).length);
});

it('excludes off-curve, executable and program-owned authorities while retaining supply coverage', async () => {
  const row = rawAccount(wallet(90), 7n, 0);
  const pda = PublicKey.findProgramAddressSync([Buffer.from('common-fixture')], new PublicKey(PROGRAM))[0];
  const data = Buffer.from(row.account.data[0]!, 'base64'); pda.toBuffer().copy(data, 32);
  const offCurve = { ...row, account: { ...row.account, data: [data.toString('base64'), 'base64'] } };
  expect((await readAecoHolders(reader([offCurve], 7n), mint, new Set())).holders).toEqual([]);
  for (const owner of [{ owner: PROGRAM, executable: false }, { owner: '11111111111111111111111111111111', executable: true }]) {
    const base = reader([row], 7n);
    const source = { ...base, async rpc(method: string) { return method === 'getMultipleAccounts' ? { context: { slot: 100 }, value: [owner] } : base.rpc(method); } };
    expect((await readAecoHolders(source, mint, new Set())).holders).toEqual([]);
  }
});

it('refuses production indexing before the official deployer platform launch is confirmed', () => {
  const community = { id: 'com_native001', mint, creatorWallet: OFFICIAL_TREASURIES.aecoDeployer, provenance: { platformOrigin: 'PLATFORM' as const, initiator: 'HUMAN' as const, network: 'mainnet-beta' as const, quoteAsset: 'SOL' as const } };
  const launch = { status: 'confirmed' as const, mode: 'production' as const, communityId: community.id, mint, launcherWallet: OFFICIAL_TREASURIES.aecoDeployer };
  expect(isOfficialAecoLaunch(community, launch)).toBe(true);
  expect(isOfficialAecoLaunch(null, launch)).toBe(false);
  expect(isOfficialAecoLaunch(community, { ...launch, status: 'submitted' })).toBe(false);
  expect(isOfficialAecoLaunch(community, { ...launch, mode: 'devnet' })).toBe(false);
  expect(isOfficialAecoLaunch({ ...community, creatorWallet: OFFICIAL_TREASURIES.platform }, launch)).toBe(false);
  expect(isOfficialAecoLaunch(community, { ...launch, launcherWallet: OFFICIAL_TREASURIES.platform })).toBe(false);
  expect(isOfficialAecoLaunch(community, { ...launch, mint: wallet(9) })).toBe(false);
});
