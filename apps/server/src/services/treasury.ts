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
 * Integer floor for the agent share; the rounding residue (< 1 base unit per 10_000) goes to the platform.
 * Used for reconciliation against what Pump's distribute_creator_fees_v2 actually paid.
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
  }): TreasuryEntry {
    return {
      id: newId("tre"),
      seq: 0,
      stream: p.stream,
      account: p.account,
      accountAddress: p.accountAddress??(p.account === "platform" ? this.config.treasuries.platform : this.config.treasuries.agentRewards),
      assetMint: WRAPPED_SOL_MINT,
      assetSymbol: "SOL",
      decimals: 9,
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
   * actual lamport balance changes in that transaction (realized fees), never volume estimates.
   * Idempotent: re-ingesting the same signature inserts nothing.
   */
  async ingestCreatorFeeDistribution(tx: ObservedTransaction, communities: Community[]): Promise<CreatorFeeIngestResult> {
    if (tx.err !== null) return { accepted: false, reason: "transaction failed", inserted: [] };
    const ix = tx.instructions.find((i) => i.programId === PUMP_PROGRAM_ID && i.discriminatorHex === PUMP_IX.distributeCreatorFeesV2);
    if (!ix) return { accepted: false, reason: "not a distribute_creator_fees_v2 transaction", inserted: [] };
    const community = communities.find((c) => ix.accounts.includes(sharingConfigPda(c.mint)));
    if (!community) return { accepted: false, reason: "sharing config does not belong to a registered community", inserted: [] };

    const finality = tx.commitment === "finalized" ? "finalized" : "pending";
    const entries: TreasuryEntry[] = [];
    for (const [account, address] of [
      ["agent_rewards", this.config.treasuries.agentRewards],
      ["platform", this.config.treasuries.platform],
    ] as const) {
      const delta = tx.lamportDeltas[address] ?? 0n;
      if (delta > 0n)
        entries.push(this.entry({ stream: "creator_fee", account, amount: delta, signature: tx.signature, instructionIndex: ix.ixIndex, slot: tx.slot, finality, tokenMint: community.mint, launchId: community.launchId, supersedes: null }));
    }
    if (entries.length === 0) return { accepted: false, reason: "no payout to our treasuries in this transaction", inserted: [] };
    return { accepted: true, inserted: await this.store.appendTreasuryEntries(entries) };
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
      const d = bySig.get(e.signature) ?? { agent: 0n, platform: 0n };
      if (e.account === "agent_rewards") d.agent += BigInt(e.amount);
      else d.platform += BigInt(e.amount);
      bySig.set(e.signature, d);
    }
    for (const [sig, d] of bySig) {
      const expected = splitCreatorFee(d.agent + d.platform);
      const diff = expected.agentRewards > d.agent ? expected.agentRewards - d.agent : d.agent - expected.agentRewards;
      if (diff > RECONCILE_TOLERANCE) {
        mismatch = true;
        notes.push(`distribution ${sig.slice(0, 12)}…: agent treasury received ${d.agent}, expected ${expected.agentRewards} (60% of ${d.agent + d.platform})`);
      }
    }
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
        reconciliation: mismatch ? "mismatch" : pending ? "unreconciled" : "reconciled",
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
