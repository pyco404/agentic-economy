import type { PumpTrade } from "./pump-events.js";
import type { SharingConfigState } from "./pump.js";

/** Chain-agnostic, normalized view of a landed transaction (top-level instructions only). */
export interface ObservedTransaction {
  signature: string;
  source?:'mock_chain'|'solana_rpc';
  genesisHash?:string;
  feeLamports?:bigint;
  innerInstructions?:Array<{parentIndex:number;programId:string;accounts:string[];dataBase64:string;stackHeight:number|null}>;
  tokenAccounts?:Record<string,{mint:string;owner:string;decimals:number;pre:bigint;post:bigint}>;
  /** Original compiled message, preserving quote accounts and lookup indexes. */
  messageBase64?:string;
  slot: number;
  commitment: "confirmed" | "finalized";
  /** null on success; otherwise the runtime error (JSON). */
  err: unknown;
  feePayer: string;
  signers: string[];
  systemTransfers: Array<{ ixIndex: number; from: string; to: string; lamports: bigint }>;
  instructions: Array<{ ixIndex: number; programId: string; discriminatorHex: string | null; accounts: string[]; dataBase64?: string }>;
  /** Lamport balance changes per account (post - pre), used for fee-distribution indexing. */
  lamportDeltas: Record<string, bigint>;
}

export interface FeeRoutingState {
  sharingConfig: SharingConfigState | null;
  bondingCurveCreator: string | null;
  bondingCurveComplete: boolean | null;
  /** Quote mint recorded on the bonding curve (native mint for SOL); null when unavailable. */
  bondingCurveQuoteMint?: string | null;
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
  /** Default SOL. USDC requires the server-configured, allowlist-verified quote mint. */
  quoteAsset?: "SOL" | "USDC";
  quoteMint?: string;
}

export interface BuiltLaunchTransaction {
  /** Base64 serialized transaction (partially signed by the mint). */
  transaction: string;
  lastValidBlockHeight: number | null;
  demo: boolean;
  genesisHash?: string;
  estimatedNetworkFeesLamports?:string;
}

export interface ChainGateway {
  readonly source: "mock_chain" | "solana_rpc";
  getGenesisHash?():Promise<string>;
  verifyMarketPool?(pool:string,mint:string,quoteMint:string):Promise<boolean>;
  isTransactionOrphaned?(signature:string,slot:number):Promise<boolean>;
  getTransaction(signature: string): Promise<ObservedTransaction | null>;
  getFeeRoutingState(mint: string): Promise<FeeRoutingState>;
  getTokenBalance(owner: string, mint: string): Promise<TokenBalance>;
  buildLaunchTransaction(input: BuildLaunchInput): Promise<BuiltLaunchTransaction>;
  /** Throws ChainFeatureUnavailable unless `mint` is an initialized six-decimal SPL mint in Pump's live Global quote allowlist. */
  verifyQuoteMint?(mint: string): Promise<void>;
  /** Authoritative bonding-curve state read at `slot`; null when the curve account does not exist. */
  getCurveProgress?(mint: string): Promise<CurveProgress | null>;
  /** Distinct owners holding a positive balance of `mint` (excluding the curve's own vault); null holders when too many to count safely. */
  getHolderCount?(mint: string): Promise<{ slot: number; holders: number | null; exact: boolean }>;
  /** Most recent bonding-curve trades, newest first, from Pump's own events. */
  getRecentTrades?(mint: string, limit: number): Promise<{ slot: number; complete: boolean; trades: ChainTrade[] }>;
  getBlockTime?(slot: number): Promise<number | null>;
  submitLaunchTransaction?(transaction:string):Promise<string>;
  getFinalizedBlockHeight?():Promise<number>;
  /** Newest-first signatures touching `address`, stopping at `until` (exclusive). */
  listSignaturesForAddress(address: string, until: string | null, limit: number, before?:string): Promise<string[]>;
}

export interface CurveProgress {
  slot: number;
  complete: boolean;
  /** Share of the curve's initial real token reserves already sold, 0–100 (100 once complete). */
  progressPct: number;
  quoteMint: string | null;
}

export interface ChainTrade extends PumpTrade {
  signature: string;
  slot: number;
  blockTime: number | null;
}

export class ChainFeatureUnavailable extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
