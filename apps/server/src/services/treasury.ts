import {distributionMint,verifiedCreatorDistribution} from '../chain/creator-fees.js';
import {
  AGENT_TREASURY_CREATOR_FEE_BPS,
  BPS_DENOMINATOR,
  LAUNCH_FEE_LAMPORTS,
  PUMP_PROGRAM_ID,
  WRAPPED_SOL_MINT,
  type Community,
  type TokenLaunch,
  type TreasuryAccount,
  type TreasuryEntry,
  type TreasurySummary,
} from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import { PUMP_IX, sharingConfigPda } from "../chain/pump.js";
import type { ChainGateway, ObservedTransaction } from "../chain/types.js";
import type { Store } from "../store/types.js";
import { newId } from "../util/ids.js";

/**
 * Deterministic 60/40 split of an amount of creator fees ACTUALLY RECEIVED.
 * Planning/reconciliation helper: floor the agent share and retain the residue in the platform estimate.
 * Actual receipts NEVER use this helper to invent payouts: Pump floors each shareholder separately,
 * and verified distributions record any retained vault dust from the authenticated source event.
 */
export function splitCreatorFee(total: bigint): { agentRewards: bigint; platform: bigint } {
  if (total < 0n) throw new Error("negative creator fee");
  const agentRewards = (total * BigInt(AGENT_TREASURY_CREATOR_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
  return { agentRewards, platform: total - agentRewards };
}

/** Allowed per-distribution rounding difference vs. our split (Pump rounds per shareholder on-chain). */
const RECONCILE_TOLERANCE = 2n;

export interface CreatorFeeIngestResult {
  accepted: boolean;
  reason?: string;
  inserted: TreasuryEntry[];
}

export class TreasuryService {
  constructor(
    private readonly store: Store,
    private readonly config: AppConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private entry(p: {
    stream: TreasuryEntry["stream"];
    account: TreasuryAccount;
    amount: bigint;
    signature: string;
    instructionIndex: number;
    slot: number;
    finality: TreasuryEntry["finality"];
    tokenMint: string | null;
    launchId: string | null;
    supersedes: string | null;
    direction?: TreasuryEntry["direction"];
    accountAddress?:string;
    asset?:{mint:string;symbol:string;decimals:number};
    evidence?:TreasuryEntry['evidence'];
  }): TreasuryEntry {
    return {
      id: newId("tre"),
      seq: 0,
      stream: p.stream,
      account: p.account,
      accountAddress: p.accountAddress??(p.account === "platform" ? this.config.treasuries.platform : this.config.treasuries.agentRewards),
      assetMint: p.asset?.mint??WRAPPED_SOL_MINT,
      assetSymbol: p.asset?.symbol??"SOL",
      decimals: p.asset?.decimals??9,
      ...(p.evidence?{evidence:p.evidence}:{}),
      amount: p.amount.toString(),
      direction: p.direction ?? "credit",
      signature: p.signature,
      instructionIndex: p.instructionIndex,
      slot: p.slot,
      finality: p.finality,
      tokenMint: p.tokenMint,
      launchId: p.launchId,
      supersedes: p.supersedes,
      recordedAt: this.now().toISOString(),
    };
  }

  /** The 0.05 SOL launch charge: one platform-only entry. Never part of the 60/40 split. */
  launchFeeEntry(launch: TokenLaunch, signature: string, feeIxIndex: number, slot: number, commitment: "confirmed" | "finalized"): TreasuryEntry {
    return this.entry({
      stream: "launch_fee",
      accountAddress:launch.fees.platformTreasury,
      account: "platform",
      amount: LAUNCH_FEE_LAMPORTS,
      signature,
      instructionIndex: feeIxIndex,
      slot,
      finality: commitment === "finalized" ? "finalized" : "pending",
      tokenMint: launch.mint,
      launchId: launch.id,
      supersedes: null,
    });
  }

  /**
   * Ingest an observed Pump `distribute_creator_fees_v2` transaction. Amounts are the treasuries'
   * verified instruction-scoped SOL/USDC credits (realized fees), never volume estimates.
   * Idempotent: re-ingesting the same signature inserts nothing.
   */
  async ingestCreatorFeeDistribution(tx: ObservedTransaction, communities: Community[]): Promise<CreatorFeeIngestResult> {
    if (tx.err !== null) return { accepted: false, reason: "transaction failed", inserted: [] };
    if(this.config.mode==='demo'&&tx.source==='solana_rpc')return {accepted:false,reason:'Real RPC receipts are disabled in demo accounting',inserted:[]};
    if(this.config.mode!=='demo'){
      try{
        const expected=this.config.mode==='production'?'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d':this.config.solana.cluster==='localnet'?this.config.pumpLaunch.localGenesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
        if(!expected||tx.genesisHash!==expected)throw new Error('Receipt RPC genesis does not match this accounting network');
        // Either distribution ABI; the verifier below re-derives every account and reconciles every lamport.
        const mint=distributionMint(tx);
        const c=communities.find(c=>c.mint===mint&&c.feeSharingConfig===sharingConfigPda(c.mint));
        const launch=c?await this.store.getLaunch(c.launchId):null;
        if(!c||!launch||launch.launch.mode==='demo'||launch.launch.status!=='confirmed'||launch.launch.mint!==c.mint||launch.launch.signature!==c.launchSignature||launch.launch.communityId!==c.id)throw new Error('Distribution has no matching verified platform launch');
        const d=verifiedCreatorDistribution(tx,launch.launch.fees.platformTreasury,launch.launch.fees.creatorFeeSplit.agentRewardsTreasury);
        const entries=d.payouts.map(p=>this.entry({stream:'creator_fee',account:p.address===launch.launch.fees.platformTreasury?'platform':'agent_rewards',accountAddress:p.address,amount:p.amount,signature:tx.signature,instructionIndex:d.ixIndex,slot:tx.slot,finality:tx.commitment==='finalized'?'finalized':'pending',tokenMint:c.mint,launchId:c.launchId,supersedes:null,asset:{mint:d.quote,symbol:d.symbol,decimals:d.decimals},evidence:{source:'solana_rpc',version:1,network:this.config.mode==='production'?'mainnet-beta':this.config.solana.cluster,distributed:d.total.toString(),distributedDust:d.dust.toString()}}));
        return {accepted:true,inserted:await this.store.appendTreasuryEntries(entries)};
      }catch(e){return {accepted:false,reason:e instanceof Error?e.message:'Invalid creator-fee evidence',inserted:[]};}
    }
    // Legacy fixtures are accepted only in explicit demo mode and tagged simulated.
    const ix=tx.instructions.find(i=>i.programId===PUMP_PROGRAM_ID&&i.discriminatorHex===PUMP_IX.distributeCreatorFeesV2);
    const c=communities.find(c=>ix?.accounts.includes(sharingConfigPda(c.mint)));
    if(!ix||!c)return {accepted:false,reason:'No registered demo distribution',inserted:[]};
    const total=(tx.lamportDeltas[this.config.treasuries.agentRewards]??0n)+(tx.lamportDeltas[this.config.treasuries.platform]??0n);
    const entries=([['agent_rewards',this.config.treasuries.agentRewards],['platform',this.config.treasuries.platform]] as const).flatMap(([account,address])=>{const amount=tx.lamportDeltas[address]??0n;return amount>0n?[this.entry({stream:'creator_fee',account,amount,signature:tx.signature,instructionIndex:ix.ixIndex,slot:tx.slot,finality:tx.commitment==='finalized'?'finalized':'pending',tokenMint:c.mint,launchId:c.launchId,supersedes:null,evidence:{source:'mock_chain',version:1,network:'demo',distributed:total.toString(),distributedDust:'0'}})]:[];});
    return {accepted:entries.length>0,inserted:await this.store.appendTreasuryEntries(entries)};
  }

  /** Effective entries: those not superseded by a later status entry. */
  private effective(all: TreasuryEntry[]): TreasuryEntry[] {
    const superseded = new Set(all.map((e) => e.supersedes).filter((x): x is string => x !== null));
    return all.filter((e) => !superseded.has(e.id));
  }

  /**
   * Re-check pending entries against the chain: finalized ⇒ append a finalized entry; transaction
   * gone (dropped fork) ⇒ append a reversed entry. Append-only and replay-safe.
   */
  async reconcilePending(chain: ChainGateway): Promise<TreasuryEntry[]> {
    const pending = this.effective(await this.store.allTreasuryEntries()).filter((e) => e.finality === "pending");
    const out: TreasuryEntry[] = [];
    for (const e of pending) {
      const tx = await chain.getTransaction(e.signature);
      if (tx && tx.commitment !== "finalized") continue;
      if(!tx&&!await chain.isTransactionOrphaned?.(e.signature,e.slot))continue;
      const finality = tx && tx.err === null ? "finalized" : "reversed";
      const next: TreasuryEntry = { ...e, id: newId("tre"), finality, supersedes: e.id, slot: tx?.slot ?? e.slot, recordedAt: this.now().toISOString() };
      out.push(...(await this.store.appendTreasuryEntries([next])));
    }
    return out;
  }

  async summary(launchCount: number): Promise<TreasurySummary> {
    const all = await this.store.allTreasuryEntries();
    const eff = this.effective(all);
    const totals = (stream: TreasuryEntry["stream"], account: TreasuryAccount) => {
      const byAsset = new Map<string, { assetMint: string; assetSymbol: string; decimals: number; finalized: bigint; pending: bigint }>();
      for (const e of eff) {
        if (e.stream !== stream || e.account !== account || e.finality === "reversed") continue;
        if(stream==='creator_fee'&&this.config.mode!=='demo'&&e.evidence?.source!=='solana_rpc')continue;
        const t = byAsset.get(e.assetMint) ?? { assetMint: e.assetMint, assetSymbol: e.assetSymbol, decimals: e.decimals, finalized: 0n, pending: 0n };
        const signed = e.direction === "credit" ? BigInt(e.amount) : -BigInt(e.amount);
        if (e.finality === "finalized") t.finalized += signed;
        else t.pending += signed;
        byAsset.set(e.assetMint, t);
      }
      return [...byAsset.values()].map((t) => ({ ...t, finalized: t.finalized.toString(), pending: t.pending.toString() }));
    };

    // Reconcile each creator-fee distribution against the deterministic 60/40 split.
    const notes: string[] = [];
    let mismatch = false;
    let pending = false;
    const bySig = new Map<string, { agent: bigint; platform: bigint }>();
    for (const e of eff) {
      if (e.stream !== "creator_fee" || e.finality === "reversed") continue;
      if (e.finality === "pending") pending = true;
      const d = bySig.get(`${e.signature}:${e.instructionIndex}:${e.assetMint}`) ?? { agent: 0n, platform: 0n };
      if (e.account === "agent_rewards") d.agent += BigInt(e.amount);
      else d.platform += BigInt(e.amount);
      bySig.set(`${e.signature}:${e.instructionIndex}:${e.assetMint}`, d);
    }
    for (const [sig, d] of bySig) {
      const expected = splitCreatorFee(d.agent + d.platform);
      const diff = expected.agentRewards > d.agent ? expected.agentRewards - d.agent : d.agent - expected.agentRewards;
      if (diff > RECONCILE_TOLERANCE) {
        mismatch = true;
        notes.push(`distribution ${sig.slice(0, 12)}…: agent treasury received ${d.agent}, expected ${expected.agentRewards} (60% of ${d.agent + d.platform})`);
      }
    }
    if(this.config.mode!=='demo'&&eff.some(e=>e.stream==='creator_fee'&&!e.evidence&&e.finality!=='reversed')){mismatch=true;notes.push('Legacy creator-fee entries lack instruction-scoped verification evidence and require audit.');}
    if(this.config.mode==='demo')notes.push('Simulated demo receipts only. No cryptocurrency was received or paid.');
    if (bySig.size === 0) notes.push("No creator-fee distributions recorded yet.");
    if (pending) notes.push("Some receipts are not yet finalized on-chain.");

    const recentPage = await this.store.listTreasuryEntries(null, 20);
    const verifiedPaths: Array<"bonding_curve" | "pumpswap_graduated"> = this.config.feeRoutingVerified ? ["bonding_curve", "pumpswap_graduated"] : [];
    return {
      mode: this.config.mode,
      platformTreasury: this.config.treasuries.platform,
      agentRewardsTreasury: this.config.treasuries.agentRewards,
      launchFees: {
        description: "Fixed 0.05 SOL charged per successful launch, 100% to the platform treasury. Separate from creator fees and never split.",
        launches: launchCount,
        totals: totals("launch_fee", "platform"),
      },
      creatorFees: {
        description:
          "Pump.fun creator fees actually distributed to our treasuries via each coin's fee-sharing config (60% agent rewards / 40% platform, launcher 0%). Pump.fun protocol and LP fees are not ours and are not included.",
        agentRewards: totals("creator_fee", "agent_rewards"),
        platform: totals("creator_fee", "platform"),
        expectedSplitBps: { agentRewards: 6000, platform: 4000, launcher: 0 },
        reconciliation: mismatch ? "mismatch" : pending||bySig.size===0 ? "unreconciled" : "reconciled",
        reconciliationNotes: notes,
      },
      feeRouting: {
        mechanism: "pump_fees_sharing_config",
        verified: this.config.feeRoutingVerified,
        verifiedPaths,
        notes: this.config.feeRoutingVerified
          ? ["Fee-sharing path verified by the devnet test plan."]
          : [
              "Native Pump.fun fee sharing (create_fee_sharing_config + update_fee_shares_v2) is the intended route; it has NOT yet been verified end-to-end on devnet/mainnet by this deployment.",
              "Until verified, real launches and any fee-routing claims are disabled.",
            ],
      },
      payouts: {
        mode: "disabled_dry_run",
        description: "No agent reward payouts are made. Verified service contributions are recorded as points and share estimates only.",
      },
      recentEntries: recentPage.items,
      asOf: this.now().toISOString(),
    };
  }
}
