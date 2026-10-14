import type { SharingConfigState } from "./pump.js";

/** Chain-agnostic, normalized view of a landed transaction (top-level instructions only). */
export interface ObservedTransaction {
  signature: string;
  slot: number;
  commitment: "confirmed" | "finalized";
  /** null on success; otherwise the runtime error (JSON). */
  err: unknown;
  feePayer: string;
  signers: string[];
  systemTransfers: Array<{ ixIndex: number; from: string; to: string; lamports: bigint }>;
  instructions: Array<{ ixIndex: number; programId: string; discriminatorHex: string | null; accounts: string[] }>;
  /** Lamport balance changes per account (post - pre), used for fee-distribution indexing. */
  lamportDeltas: Record<string, bigint>;
}

export interface FeeRoutingState {
  sharingConfig: SharingConfigState | null;
  bondingCurveCreator: string | null;
  bondingCurveComplete: boolean | null;
}

export interface TokenBalance {
  amount: bigint;
  decimals: number;
  slot: number | null;
}

export interface BuildLaunchInput {
  launcherWallet: string;
  mint: string;
  /** Secret key of the fresh mint keypair (64 bytes); used only to partially sign, never persisted. */
  mintSecretKey: Uint8Array;
  name: string;
  symbol: string;
  uri: string;
  platformTreasury: string;
  agentRewardsTreasury: string;
}

export interface BuiltLaunchTransaction {
  /** Base64 serialized transaction (partially signed by the mint). */
  transaction: string;
  lastValidBlockHeight: number | null;
  demo: boolean;
}

export interface ChainGateway {
  readonly source: "mock_chain" | "solana_rpc";
  getTransaction(signature: string): Promise<ObservedTransaction | null>;
  getFeeRoutingState(mint: string): Promise<FeeRoutingState>;
  getTokenBalance(owner: string, mint: string): Promise<TokenBalance>;
  buildLaunchTransaction(input: BuildLaunchInput): Promise<BuiltLaunchTransaction>;
  /** Newest-first signatures touching `address`, stopping at `until` (exclusive). */
  listSignaturesForAddress(address: string, until: string | null, limit: number): Promise<string[]>;
}

export class ChainFeatureUnavailable extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
