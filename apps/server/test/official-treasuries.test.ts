import { describe, expect, it, vi } from 'vitest';
import { Keypair, PublicKey, SystemInstruction } from '@solana/web3.js';
import { OFFICIAL_TREASURIES, TreasurySummary, WRAPPED_SOL_MINT, type TreasuryEntry } from '@agentic-economy/shared';
import { loadConfig } from '../src/config.js';
import { OfficialTreasuryMonitor } from '../src/services/official-treasuries.js';
import { TreasuryService } from '../src/services/treasury.js';
import { MemoryStore } from '../src/store/memory.js';
import { pumpLaunchInstructions } from '../src/chain/pump-builder.js';
import { PUMP_FEES_IX } from '../src/chain/pump.js';

const genesis = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const key = () => Keypair.generate().publicKey.toBase58();
const now = () => new Date('2026-10-20T18:00:00Z');
const production = { MODE: 'production', DATABASE_URL: 'postgres://unused', SOLANA_RPC_URL: 'https://unused.invalid', PLATFORM_TREASURY: OFFICIAL_TREASURIES.platform, AGENT_REWARDS_TREASURY: OFFICIAL_TREASURIES.agentRewards };
const rpc = (method: string) => method === 'getGenesisHash' ? genesis : method === 'getBalance' ? { context: { slot: 100 }, value: 123456789 } : [{ signature: '1'.repeat(88), slot: 99, blockTime: 1, err: null }];
const reader = (response: (method: string) => unknown = rpc) => vi.fn(async (_url: unknown, init?: RequestInit) => Response.json({ result: response(JSON.parse(String(init?.body)).method) })) as unknown as typeof fetch;
const entry = (changes: Partial<TreasuryEntry> = {}): TreasuryEntry => ({ id: 'tre_real', seq: 1, stream: 'creator_fee', account: 'agent_rewards', accountAddress: OFFICIAL_TREASURIES.agentRewards, assetMint: WRAPPED_SOL_MINT, assetSymbol: 'SOL', decimals: 9, amount: '600', direction: 'credit', signature: '1'.repeat(88), instructionIndex: 0, slot: 1, finality: 'finalized', tokenMint: null, launchId: null, supersedes: null, evidence: { source: 'solana_rpc', version: 1, network: 'mainnet-beta', distributed: '1000', distributedDust: '0' }, recordedAt: now().toISOString(), ...changes });

describe('official treasury recipient policy', () => {
  it('validates public addresses and keeps the AECO deployer distinct and excluded', () => {
    const keys = Object.values(OFFICIAL_TREASURIES);
    expect(new Set(keys).size).toBe(3);
    for (const value of keys) expect(new PublicKey(value).toBase58()).toBe(value);
    expect(() => loadConfig({ PLATFORM_TREASURY: OFFICIAL_TREASURIES.aecoDeployer })).toThrow(/deployer/);
    expect(() => loadConfig({ AGENT_REWARDS_TREASURY: OFFICIAL_TREASURIES.aecoDeployer })).toThrow(/deployer/);
  });
  it('fails closed on incorrect Mainnet recipients; preserves arbitrary isolated Devnet recipients', () => {
    expect(() => loadConfig({ ...production, PLATFORM_TREASURY: key() })).toThrow(/official/);
    expect(() => loadConfig({ ...production, PLATFORM_TREASURY: OFFICIAL_TREASURIES.agentRewards, AGENT_REWARDS_TREASURY: OFFICIAL_TREASURIES.platform })).toThrow(/official/);
    const dev = { ...production, MODE: 'devnet', PLATFORM_TREASURY: key(), AGENT_REWARDS_TREASURY: key() };
    expect(loadConfig(dev).treasuries.platform).toBe(dev.PLATFORM_TREASURY);
    expect(() => loadConfig({ ...dev, PLATFORM_TREASURY: OFFICIAL_TREASURIES.platform })).toThrow(/Devnet/);
    const safe = loadConfig({ ...production, PUMP_LAUNCH_ENABLED: 'true', FEE_ROUTING_VERIFIED: 'true' });
    expect(safe.financialFeaturesEnabled).toBe(false); expect(safe.pumpLaunch.enabled).toBe(false);
    expect(loadConfig({ MODE: 'production', ROLE: 'sim', DATABASE_URL: 'postgres://unused' }).financialFeaturesEnabled).toBe(false);
  });
  it('constructs the exact irreversible human split and one separate platform charge without broadcasting', async () => {
    const mint = Keypair.generate();
    const input = { launcherWallet: key(), mint: mint.publicKey.toBase58(), mintSecretKey: mint.secretKey, name: 'Unit test', symbol: 'TEST', uri: 'ipfs://test', platformTreasury: OFFICIAL_TREASURIES.platform, agentRewardsTreasury: OFFICIAL_TREASURIES.agentRewards };
    const instructions = await pumpLaunchInstructions(input);
    const transfers = instructions.filter(ix => ix.programId.toBase58() === '11111111111111111111111111111111').map(ix => SystemInstruction.decodeTransfer(ix));
    expect(transfers).toHaveLength(1); expect(transfers[0]!.lamports).toBe(50_000_000n); expect(transfers[0]!.toPubkey.toBase58()).toBe(OFFICIAL_TREASURIES.platform);
    const shares = instructions.find(ix => ix.data.subarray(0, 8).toString('hex') === PUMP_FEES_IX.updateFeeSharesV2)!.data;
    expect(shares.readUInt32LE(8)).toBe(2);
    expect(new PublicKey(shares.subarray(12, 44)).toBase58()).toBe(OFFICIAL_TREASURIES.agentRewards); expect(shares.readUInt16LE(44)).toBe(6000);
    expect(new PublicKey(shares.subarray(46, 78)).toBase58()).toBe(OFFICIAL_TREASURIES.platform); expect(shares.readUInt16LE(78)).toBe(4000);
    await expect(pumpLaunchInstructions({ ...input, platformTreasury: OFFICIAL_TREASURIES.aecoDeployer })).rejects.toThrow(/deployer/);
  });
});

describe('read-only official wallet monitoring', () => {
  it('returns unavailable instead of a fabricated zero when not configured, and stays separate from demo', async () => {
    const request = reader(); const wallets = await new OfficialTreasuryMonitor(null, request, now).read([]);
    expect(request).not.toHaveBeenCalled(); expect(wallets.every(w => w.balanceLamports === null && w.status === 'unavailable')).toBe(true);
    const s = await new TreasuryService(new MemoryStore(), loadConfig({ MODE: 'demo' })).summary(0);
    expect(TreasurySummary.parse(s).officialWallets).toHaveLength(2);
    expect(s.platformTreasury).not.toBe(OFFICIAL_TREASURIES.platform);
  });
  it('verifies genesis, reads finalized balances and history, caches concurrent calls, and never writes', async () => {
    const request = reader(), monitor = new OfficialTreasuryMonitor('https://rpc.invalid', request, now);
    const [a, b] = await Promise.all([monitor.read([]), monitor.read([])]);
    expect(a).toEqual(b); expect(a[0]).toMatchObject({ balanceLamports: '123456789', status: 'available', network: 'mainnet-beta', slot: 100, updatedAt: now().toISOString() });
    expect(request).toHaveBeenCalledTimes(7);
    const calls = vi.mocked(request).mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(new Set(calls.map(c => c.method))).toEqual(new Set(['getGenesisHash', 'getBalance', 'getSignaturesForAddress', 'getTransaction']));
    for (const call of calls.filter(c => c.method !== 'getGenesisHash')) expect(call.params[1].commitment).toBe('finalized');
    expect(a[0]!.recentTransactions[0]!.classification).toBe('unclassified');
  });
  it('fails closed on wrong genesis, HTTP errors and unsafe numeric balances without leaking provider details', async () => {
    const request = reader(() => 'devnet');
    const wrong = await new OfficialTreasuryMonitor('https://secret.invalid/token', request, now).read([]);
    expect(request).toHaveBeenCalledTimes(1); expect(wrong.every(w => w.balanceLamports === null)).toBe(true);
    const failed = await new OfficialTreasuryMonitor('https://secret.invalid/token', vi.fn(async () => new Response('private provider secret', { status: 403 })) as typeof fetch, now).read([]);
    expect(JSON.stringify(failed)).not.toMatch(/secret|403|private provider/);
    const unsafe = await new OfficialTreasuryMonitor('https://rpc.invalid', reader(m => m === 'getBalance' ? { context: { slot: 1 }, value: 2 ** 60 } : rpc(m)), now).read([]);
    expect(unsafe.every(w => w.balanceLamports === null)).toBe(true);
  });
  it('isolates balances from revenue, filters networks/mock/pending/reversed/wrong addresses, and deduplicates evidence', async () => {
    const monitor = new OfficialTreasuryMonitor('https://rpc.invalid', reader(), now);
    const result = await monitor.read([entry(), entry({ id: 'duplicate' }), entry({ id: 'pending', finality: 'pending' }), entry({ id: 'reversed', finality: 'reversed' }), entry({ id: 'other', accountAddress: key() }), entry({ id: 'demo', evidence: { ...entry().evidence!, source: 'mock_chain', network: 'demo' } }), entry({ id: 'devnet', evidence: { ...entry().evidence!, network: 'devnet' } }), entry({ id: 'legacy', evidence: undefined }), entry({ id: 'launch', stream: 'launch_fee', account: 'platform', accountAddress: OFFICIAL_TREASURIES.platform, amount: '50000000' })]);
    expect(result[1]!.accounting.creatorFeesLamports).toBe('600'); expect(result[0]!.accounting.launchChargesLamports).toBe('50000000'); expect(result[0]!.accounting.creatorFeesLamports).toBe('0');
    expect(result[1]!.balanceLamports).toBe('123456789'); expect(result[1]!.accounting.lifetimeCreatorFeesLamports).toBeNull(); expect(result[1]!.accounting.pendingDistributionsLamports).toBeNull();
    expect((await monitor.read([entry(), entry({ id: 'reversal', supersedes: 'tre_real', finality: 'reversed' })]))[1]!.accounting.creatorFeesLamports).toBe('0');
  });
});

 it('verifies incoming finalized balance changes without labeling arbitrary funds creator-fee income', async()=>{
  const address=OFFICIAL_TREASURIES.agentRewards;
  const request=reader(method=>method==='getTransaction'?{slot:99,transaction:{message:{accountKeys:[address]}},meta:{err:null,preBalances:[100],postBalances:[200]}}:rpc(method));
  const wallets=await new OfficialTreasuryMonitor('https://rpc.invalid',request,now).read([]);
  expect(wallets[1]!.recentTransactions[0]).toMatchObject({direction:'incoming',netChangeLamports:'100',classification:'unclassified'});
  expect(wallets[1]!.accounting.creatorFeesLamports).toBe('0');
 });
