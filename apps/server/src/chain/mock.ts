import { randomBytes } from "node:crypto";
import bs58 from "bs58";
import {
  AGENT_TREASURY_CREATOR_FEE_BPS,
  LAUNCH_FEE_LAMPORTS,
  PLATFORM_TREASURY_CREATOR_FEE_BPS,
  PUMP_FEES_PROGRAM_ID,
  PUMP_PROGRAM_ID,
  PUMP_TOKEN_DECIMALS,
  SYSTEM_PROGRAM_ID,
} from "@agentic-economy/shared";
import { PUMP_FEES_IX, PUMP_IX, bondingCurvePda, decodeBondingCurveCreator, decodeSharingConfig, encodeBondingCurve, encodeSharingConfig, sharingConfigPda } from "./pump.js";
import type { BuildLaunchInput, BuiltLaunchTransaction, ChainGateway, FeeRoutingState, ObservedTransaction, TokenBalance } from "./types.js";

export type MockLaunchOutcome = "success" | "tx_failed" | "missing_fee_sharing" | "wrong_fee" | "launcher_share";

/**
 * In-memory stand-in for Solana used in demo mode and tests. It stores the same normalized data the
 * RPC adapter produces and encodes Pump accounts with the real layouts, so verification code paths
 * are identical. It never touches a real cluster and is always labelled as mock data.
 */
export class MockChain implements ChainGateway {
  readonly source = "mock_chain" as const;
  private slot = 1_000;
  private readonly txs = new Map<string, ObservedTransaction>();
  private readonly accounts = new Map<string, Buffer>();
  private readonly balances = new Map<string, bigint>();

  static randomSignature(): string {
    return bs58.encode(randomBytes(64));
  }

  async getTransaction(signature: string): Promise<ObservedTransaction | null> {
    return this.txs.get(signature) ?? null;
  }

  async getFeeRoutingState(mint: string): Promise<FeeRoutingState> {
    const scAddr = sharingConfigPda(mint);
    const sc = this.accounts.get(scAddr);
    const bc = this.accounts.get(bondingCurvePda(mint));
    const curve = bc ? decodeBondingCurveCreator(bc) : null;
    return {
      sharingConfig: sc ? decodeSharingConfig(scAddr, sc) : null,
      bondingCurveCreator: curve?.creator ?? null,
      bondingCurveComplete: curve?.complete ?? null,
    };
  }

  async getTokenBalance(owner: string, mint: string): Promise<TokenBalance> {
    return { amount: this.balances.get(`${owner}:${mint}`) ?? 0n, decimals: PUMP_TOKEN_DECIMALS, slot: this.slot };
  }

  async buildLaunchTransaction(input: BuildLaunchInput): Promise<BuiltLaunchTransaction> {
    // A self-describing placeholder — NOT a Solana transaction. Clients must not send it anywhere.
    const intent = {
      demo: true,
      warning: "Demo Mode placeholder transaction. Not signable, not sendable.",
      feePayer: input.launcherWallet,
      instructions: [
        { program: "system", op: "transfer", to: input.platformTreasury, lamports: LAUNCH_FEE_LAMPORTS.toString() },
        { program: "pump", op: "create_v2", mint: input.mint, name: input.name, symbol: input.symbol, uri: input.uri, creator: input.launcherWallet },
        { program: "pump_fees", op: "create_fee_sharing_config", mint: input.mint },
        {
          program: "pump_fees",
          op: "update_fee_shares_v2",
          shareholders: [
            { address: input.agentRewardsTreasury, shareBps: AGENT_TREASURY_CREATOR_FEE_BPS },
            { address: input.platformTreasury, shareBps: PLATFORM_TREASURY_CREATOR_FEE_BPS },
          ],
        },
      ],
    };
    return { transaction: Buffer.from(JSON.stringify(intent)).toString("base64"), lastValidBlockHeight: null, demo: true };
  }

  async listSignaturesForAddress(address: string, until: string | null, limit: number, before?:string): Promise<string[]> {
    const all = [...this.txs.values()].filter((t) => t.lamportDeltas[address] !== undefined).sort((a, b) => b.slot - a.slot).map((t) => t.signature);
    const stop = until ? all.indexOf(until) : -1;
    const start=before?all.indexOf(before)+1:0;
    return (stop >= 0 ? all.slice(start, stop) : all.slice(start)).slice(0, limit);
  }

  /* -------------------------------------------------- mock-only controls */

  setTokenBalance(owner: string, mint: string, amount: bigint) {
    this.balances.set(`${owner}:${mint}`, amount);
  }

  /** Simulate the launcher signing and the transaction landing with a given outcome. */
  simulateLaunch(p: { launcherWallet: string; mint: string; platformTreasury: string; agentRewardsTreasury: string }, outcome: MockLaunchOutcome = "success", commitment: "confirmed" | "finalized" = "finalized"): string {
    const signature = MockChain.randomSignature();
    const sc = sharingConfigPda(p.mint);
    this.slot += 3;
    const failed = outcome === "tx_failed";
    const fee = outcome === "wrong_fee" ? LAUNCH_FEE_LAMPORTS / 10n : LAUNCH_FEE_LAMPORTS;
    const tx: ObservedTransaction = {
      signature,
      slot: this.slot,
      commitment,
      err: failed ? { InstructionError: [1, { Custom: 6000 }] } : null,
      feePayer: p.launcherWallet,
      signers: [p.launcherWallet, p.mint],
      systemTransfers: [{ ixIndex: 0, from: p.launcherWallet, to: p.platformTreasury, lamports: fee }],
      instructions: [
        { ixIndex: 0, programId: SYSTEM_PROGRAM_ID, discriminatorHex: null, accounts: [p.launcherWallet, p.platformTreasury] },
        { ixIndex: 1, programId: PUMP_PROGRAM_ID, discriminatorHex: PUMP_IX.createV2, accounts: [p.mint] },
        ...(outcome === "missing_fee_sharing"
          ? []
          : [
              { ixIndex: 2, programId: PUMP_FEES_PROGRAM_ID, discriminatorHex: PUMP_FEES_IX.createFeeSharingConfig, accounts: [p.launcherWallet, sc] },
              { ixIndex: 3, programId: PUMP_FEES_PROGRAM_ID, discriminatorHex: PUMP_FEES_IX.updateFeeSharesV2, accounts: [p.launcherWallet, p.mint, sc] },
            ]),
      ],
      lamportDeltas: failed ? {} : { [p.platformTreasury]: fee, [p.launcherWallet]: -fee },
    };
    this.txs.set(signature, tx);
    if (failed) return signature;

    if (outcome === "missing_fee_sharing") {
      this.accounts.set(bondingCurvePda(p.mint), encodeBondingCurve(p.launcherWallet));
    } else {
      const shareholders =
        outcome === "launcher_share"
          ? [
              { address: p.agentRewardsTreasury, shareBps: 5000 },
              { address: p.platformTreasury, shareBps: 4000 },
              { address: p.launcherWallet, shareBps: 1000 },
            ]
          : [
              { address: p.agentRewardsTreasury, shareBps: AGENT_TREASURY_CREATOR_FEE_BPS },
              { address: p.platformTreasury, shareBps: PLATFORM_TREASURY_CREATOR_FEE_BPS },
            ];
      this.accounts.set(sc, encodeSharingConfig({ version: 2, status: "Active", mint: p.mint, admin: p.launcherWallet, adminRevoked: true, shareholders }));
      this.accounts.set(bondingCurvePda(p.mint), encodeBondingCurve(sc));
    }
    // The launcher typically holds the initial buy; give them a balance so holder eligibility can be exercised.
    this.balances.set(`${p.launcherWallet}:${p.mint}`, 5_000_000_000n);
    return signature;
  }

  /** Simulate a permissionless distribute_creator_fees_v2 paying our two treasuries. */
  simulateCreatorFeeDistribution(p: { mint: string; payouts: Array<{ address: string; lamports: bigint }> }): string {
    const signature = MockChain.randomSignature();
    this.slot += 2;
    const lamportDeltas: Record<string, bigint> = {};
    for (const o of p.payouts) lamportDeltas[o.address] = o.lamports;
    this.txs.set(signature, {
      signature,
      slot: this.slot,
      commitment: "finalized",
      err: null,
      feePayer: p.payouts[0]?.address ?? sharingConfigPda(p.mint),
      signers: [],
      systemTransfers: [],
      instructions: [{ ixIndex: 0, programId: PUMP_PROGRAM_ID, discriminatorHex: PUMP_IX.distributeCreatorFeesV2, accounts: [sharingConfigPda(p.mint), p.mint] }],
      lamportDeltas,
    });
    return signature;
  }

  async isTransactionOrphaned(signature:string){return !this.txs.has(signature);}

  /** Promote a landed transaction to finalized commitment. */
  finalize(signature: string) {
    const tx = this.txs.get(signature);
    if (tx) this.txs.set(signature, { ...tx, commitment: "finalized" });
  }

  /** Drop a transaction (simulates a fork/reorg at `confirmed` commitment). */
  dropTransaction(signature: string) {
    this.txs.delete(signature);
  }
}
