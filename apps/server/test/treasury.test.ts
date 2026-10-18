import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import type { Community } from "@agentic-economy/shared";
import { loadConfig } from "../src/config.js";
import { MockChain } from "../src/chain/mock.js";
import { decodeSharingConfig, encodeSharingConfig, sharingConfigPda, decodeBondingCurveCreator, encodeBondingCurve } from "../src/chain/pump.js";
import { verifyLaunch } from "../src/chain/verify.js";
import { MemoryStore } from "../src/store/memory.js";
import { TreasuryService, splitCreatorFee } from "../src/services/treasury.js";

const config = loadConfig({ MODE: "demo" });
const { platform, agentRewards } = config.treasuries;
const key = () => Keypair.generate().publicKey.toBase58();

function community(mint: string): Community {
  return {
    id: "com_test0001",
    name: "T",
    symbol: "T",
    description: "",
    imageUri: null,
    metadataUri: "https://example.invalid/x.json",
    mint,
    launchId: "lch_test0001",
    launchSignature: "1".repeat(88),
    creatorWallet: key(),
    feeSharingConfig: sharingConfigPda(mint),
    links: { pumpFun: "https://pump.fun", explorer: "https://solscan.io", website: null, twitter: null, telegram: null },
    headquartersBuildingId: null,
    stats: { agents: 0, activeAgents: 0, verifiedTasks: 0, prominence: 0 },
    registeredAt: new Date().toISOString(),
  };
}

describe("60/40 creator-fee arithmetic", () => {
  it("is exact and deterministic, residue to platform", () => {
    expect(splitCreatorFee(10_000n)).toEqual({ agentRewards: 6_000n, platform: 4_000n });
    expect(splitCreatorFee(1n)).toEqual({ agentRewards: 0n, platform: 1n });
    expect(splitCreatorFee(12_345_679n)).toEqual({ agentRewards: 7_407_407n, platform: 4_938_272n });
    for (const n of [0n, 3n, 999_999_999_999n, 2n ** 63n]) {
      const s = splitCreatorFee(n);
      expect(s.agentRewards + s.platform).toBe(n);
      expect(s.platform - (n * 4000n) / 10000n).toBeLessThan(2n);
    }
  });
});

describe("treasury ledger", () => {
  it("ingests realized creator-fee distributions idempotently and reconciles 60/40", async () => {
    const store = new MemoryStore();
    const chain = new MockChain();
    const t = new TreasuryService(store, config);
    const mint = key();
    const sig = chain.simulateCreatorFeeDistribution({ mint, payouts: [{ address: agentRewards, lamports: 600n }, { address: platform, lamports: 400n }] });
    const tx = (await chain.getTransaction(sig))!;
    const first = await t.ingestCreatorFeeDistribution(tx, [community(mint)]);
    expect(first.inserted).toHaveLength(2);
    const second = await t.ingestCreatorFeeDistribution(tx, [community(mint)]);
    expect(second.inserted).toHaveLength(0); // webhook retry / re-index: no double counting
    const s = await t.summary(0);
    expect(s.creatorFees.agentRewards[0]!.finalized).toBe("600");
    expect(s.creatorFees.platform[0]!.finalized).toBe("400");
    expect(s.creatorFees.reconciliation).toBe("reconciled");
    expect(s.launchFees.totals).toEqual([]); // creator fees never appear in the launch-fee stream
  });

  it("ignores distributions for tokens not launched through the platform", async () => {
    const store = new MemoryStore();
    const chain = new MockChain();
    const t = new TreasuryService(store, config);
    const sig = chain.simulateCreatorFeeDistribution({ mint: key(), payouts: [{ address: agentRewards, lamports: 600n }] });
    const r = await t.ingestCreatorFeeDistribution((await chain.getTransaction(sig))!, [community(key())]);
    expect(r.accepted).toBe(false);
    expect(await store.allTreasuryEntries()).toHaveLength(0);
  });

  it("flags a mismatch when received amounts are not 60/40", async () => {
    const store = new MemoryStore();
    const chain = new MockChain();
    const t = new TreasuryService(store, config);
    const mint = key();
    const sig = chain.simulateCreatorFeeDistribution({ mint, payouts: [{ address: agentRewards, lamports: 500n }, { address: platform, lamports: 500n }] });
    await t.ingestCreatorFeeDistribution((await chain.getTransaction(sig))!, [community(mint)]);
    const s = await t.summary(0);
    expect(s.creatorFees.reconciliation).toBe("mismatch");
    expect(s.creatorFees.reconciliationNotes.join(" ")).toMatch(/expected 600/);
  });

  it("finalizes pending receipts and reverses dropped ones without mutating history", async () => {
    const store = new MemoryStore();
    const chain = new MockChain();
    const t = new TreasuryService(store, config);
    const mint = key();
    const keep = chain.simulateCreatorFeeDistribution({ mint, payouts: [{ address: agentRewards, lamports: 60n }, { address: platform, lamports: 40n }] });
    const drop = chain.simulateCreatorFeeDistribution({ mint, payouts: [{ address: agentRewards, lamports: 6n }, { address: platform, lamports: 4n }] });
    for (const sig of [keep, drop]) {
      const tx = (await chain.getTransaction(sig))!;
      await t.ingestCreatorFeeDistribution({ ...tx, commitment: "confirmed" }, [community(mint)]);
    }
    expect((await t.summary(0)).creatorFees.reconciliation).toBe("unreconciled");
    chain.dropTransaction(drop);
    const appended = await t.reconcilePending(chain);
    expect(appended.map((e) => e.finality).sort()).toEqual(["finalized", "finalized", "reversed", "reversed"]);
    const s = await t.summary(0);
    expect(s.creatorFees.agentRewards[0]).toMatchObject({ finalized: "60", pending: "0" });
    expect(s.creatorFees.reconciliation).toBe("reconciled");
    expect(await store.allTreasuryEntries()).toHaveLength(8); // 4 original + 4 status entries; nothing mutated
    expect(await t.reconcilePending(chain)).toHaveLength(0); // replay-safe
  });

  it("refuses to credit launch fees to the agent rewards account", async () => {
    const store = new MemoryStore();
    await expect(
      store.appendTreasuryEntries([
        { id: "tre_x", seq: 0, stream: "launch_fee", account: "agent_rewards", accountAddress: agentRewards, assetMint: "So11111111111111111111111111111111111111112", assetSymbol: "SOL", decimals: 9, amount: "50000000", direction: "credit", signature: "1".repeat(88), instructionIndex: 0, slot: 1, finality: "finalized", tokenMint: null, launchId: null, supersedes: null, recordedAt: new Date().toISOString() },
      ]),
    ).rejects.toThrow(/platform/);
  });
});

describe("Pump account layouts and launch verification", () => {
  it("round-trips SharingConfig and BondingCurve encodings", () => {
    const mint = key();
    const sc = { version: 2, status: "Active" as const, mint, admin: key(), adminRevoked: true, shareholders: [{ address: agentRewards, shareBps: 6000 }, { address: platform, shareBps: 4000 }] };
    expect(decodeSharingConfig("addr", encodeSharingConfig(sc))).toEqual({ address: "addr", ...sc });
    expect(decodeBondingCurveCreator(encodeBondingCurve(sharingConfigPda(mint)))).toEqual({ complete: false, creator: sharingConfigPda(mint) });
    expect(() => decodeSharingConfig("addr", Buffer.alloc(200))).toThrow(/discriminator/);
  });

  it("treats an admin that can still change shares as unverified routing", async () => {
    const chain = new MockChain();
    const launcher = key();
    const mint = key();
    const sig = chain.simulateLaunch({ launcherWallet: launcher, mint, platformTreasury: platform, agentRewardsTreasury: agentRewards });
    const routing = await chain.getFeeRoutingState(mint);
    const exp = { launcherWallet: launcher, mint, platformTreasury: platform, agentRewardsTreasury: agentRewards, sharingConfig: sharingConfigPda(mint) };
    expect(verifyLaunch(exp, (await chain.getTransaction(sig))!, routing).outcome).toBe("confirmed");
    const unlocked = { ...routing, sharingConfig: { ...routing.sharingConfig!, adminRevoked: false } };
    const v = verifyLaunch(exp, (await chain.getTransaction(sig))!, unlocked);
    expect(v.outcome).toBe("recovery_needed");
    expect(verifyLaunch(exp, null, routing).outcome).toBe("pending");
    expect(verifyLaunch({ ...exp, mint: key() }, (await chain.getTransaction(sig))!, routing).outcome).toBe("failed");
  });
});

describe("treasury indexer", () => {
  it("ingests distributions once and flags fee-routing drift", async () => {
    const { TreasuryIndexer } = await import("../src/services/indexer.js");
    const { makeEnv, login, launch } = await import("./helpers.js");
    const env = await makeEnv();
    try {
      const user = await login(env.app);
      const ok = await launch(env.app, user);
      const mint = ok.confirm.json().launch.mint as string;
      const log = { info() {}, warn() {}, error() {} };
      const idx = new TreasuryIndexer(env.chain, env.ctx.store, env.ctx.treasury, env.ctx.coord, [agentRewards, platform], log);
      env.chain.simulateCreatorFeeDistribution({ mint, payouts: [{ address: agentRewards, lamports: 6_000n }, { address: platform, lamports: 4_000n }] });
      expect(await idx.runOnce()).toBe(2);
      expect(await new TreasuryIndexer(env.chain, env.ctx.store, env.ctx.treasury, env.ctx.coord, [agentRewards, platform], log).runOnce()).toBe(0); // fresh cursor, no double count
      expect(await idx.checkRoutingDrift()).toEqual([]);
      // Simulate a takeover rewriting the coin's sharing config.
      env.chain.simulateLaunch({ launcherWallet: user.wallet, mint, platformTreasury: platform, agentRewardsTreasury: agentRewards }, "launcher_share");
      expect(await idx.checkRoutingDrift()).toEqual([ok.confirm.json().launch.communityId]);
    } finally {
      await env.close();
    }
  });
});

describe('receipt lifecycle safety',()=>{
 it('does not double count when indexing upgrades confirmed to finalized',async()=>{
  const store=new MemoryStore(),chain=new MockChain(),t=new TreasuryService(store,config),mint=key(),c=community(mint);
  const sig=chain.simulateCreatorFeeDistribution({mint,payouts:[{address:agentRewards,lamports:60n},{address:platform,lamports:40n}]}),tx=(await chain.getTransaction(sig))!;
  await t.ingestCreatorFeeDistribution({...tx,commitment:'confirmed'},[c]);await t.ingestCreatorFeeDistribution(tx,[c]);
  expect((await t.summary(0)).creatorFees.agentRewards[0]).toMatchObject({finalized:'60',pending:'0'});
  expect(await t.reconcilePending(chain)).toEqual([]);
 });
 it('keeps unavailable history pending unless canonical orphan evidence exists',async()=>{
  const store=new MemoryStore(),chain=new MockChain(),t=new TreasuryService(store,config),mint=key();const sig=chain.simulateCreatorFeeDistribution({mint,payouts:[{address:agentRewards,lamports:60n},{address:platform,lamports:40n}]});
  await t.ingestCreatorFeeDistribution({...((await chain.getTransaction(sig))!),commitment:'confirmed'},[community(mint)]);
  chain.getTransaction=async()=>null;chain.isTransactionOrphaned=async()=>false;
  expect(await t.reconcilePending(chain)).toEqual([]);expect((await t.summary(0)).creatorFees.agentRewards[0]!.pending).toBe('60');
 });
});

describe('atomic receipt finality ingestion',()=>{
 it('concurrent observations finalize once and cannot change receipt amounts',async()=>{
  const store=new MemoryStore(),chain=new MockChain(),t=new TreasuryService(store,config),mint=key(),c=community(mint),sig=chain.simulateCreatorFeeDistribution({mint,payouts:[{address:agentRewards,lamports:60n},{address:platform,lamports:40n}]}),tx=(await chain.getTransaction(sig))!;
  await Promise.all([t.ingestCreatorFeeDistribution({...tx,commitment:'confirmed'},[c]),t.ingestCreatorFeeDistribution(tx,[c]),t.ingestCreatorFeeDistribution(tx,[c])]);
  expect((await t.summary(0)).creatorFees.agentRewards[0]).toMatchObject({finalized:'60',pending:'0'});
  const entry=(await store.allTreasuryEntries())[0]!;await expect(store.appendTreasuryEntries([{...entry,id:'tre_changed',amount:'999',finality:'reversed'}])).rejects.toThrow(/immutable/);
 });
});

describe('indexer history paging',()=>{
 it('drains more than one page and retries unavailable receipts without advancing',async()=>{
  const {TreasuryIndexer}=await import('../src/services/indexer.js');const {makeEnv}=await import('./helpers.js');const env=await makeEnv();
  try{const signatures=Array.from({length:250},(_,i)=>`receipt-${250-i}`),seen:string[]=[],pages:(string|undefined)[]=[];let missing=true;
   env.chain.listSignaturesForAddress=async(_address,until,limit,before)=>{pages.push(before);const start=before?signatures.indexOf(before)+1:0,end=until?signatures.indexOf(until):signatures.length;return signatures.slice(start,end<0?undefined:end).slice(0,limit);};
   env.chain.getTransaction=async signature=>{if(missing&&signature===signatures[20])return null;seen.push(signature);return {signature,slot:1,commitment:'finalized',err:null,feePayer:platform,signers:[],instructions:[],systemTransfers:[],lamportDeltas:{}};};
   const indexer=new TreasuryIndexer(env.chain,env.ctx.store,env.ctx.treasury,env.ctx.coord,[platform],{info(){},warn(){},error(){}});
   await expect(indexer.runOnce()).rejects.toThrow(/cursor retained/);missing=false;await indexer.runOnce();expect(new Set(seen).size).toBe(250);expect(pages).toContain(signatures[99]);expect(pages).toContain(signatures[199]);const before=seen.length;await indexer.runOnce();expect(seen.length).toBe(before);
  }finally{await env.close();}
 });
});

it('treats JSONB-reordered evidence as identical without losing receipt immutability',async()=>{
 const {nextTreasuryEntry}=await import('../src/store/treasury-entry.js');const store=new MemoryStore(),chain=new MockChain(),t=new TreasuryService(store,config),mint=key(),sig=chain.simulateCreatorFeeDistribution({mint,payouts:[{address:agentRewards,lamports:60n},{address:platform,lamports:40n}]});
 await t.ingestCreatorFeeDistribution((await chain.getTransaction(sig))!,[community(mint)]);const e=(await store.allTreasuryEntries())[0]!;
 const reordered={...e,evidence:{network:'demo' as const,distributedDust:e.evidence!.distributedDust,distributed:e.evidence!.distributed,version:1 as const,source:'mock_chain' as const}};
 expect(nextTreasuryEntry(e,[reordered])).toBe(null);
});
