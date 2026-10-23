import type { HeliusHolderObservation, IndexedMetadata } from './helius.js';
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
  /** Immutable creation supply recorded on the actual Pump bonding curve, not the pre-launch quote. */
  tokenTotalSupply?: bigint | null;
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
  /** Optional Developer Buy (SOL only): exact token base units bought in the same transaction, at most `maxQuoteCost` lamports. */
  devBuy?: { tokenAmount: bigint; maxQuoteCost: bigint };
}

/** A Developer Buy quote computed from Pump's live Global and fee configuration for a brand-new curve. */
export interface DevBuyChainQuote {
  slot: number;
  totalSupply: bigint;
  tokenAmount: bigint;
  capTokenAmount: bigint;
  maxAllowedQuoteCost?: bigint;
  /** Lamports the buy costs, including Pump protocol fee (buyback is part of it) and creator fee. */
  estimatedQuoteCost: bigint;
  pumpFees: bigint;
  maxQuoteCost: bigint;
  priceImpactBps: number;
}

export interface BuiltLaunchTransaction {
  /** Public context returned only for the owner-local mint signing handoff. */
  mintSigningContext?: {lookupTables:Array<{key:string;addresses:string[]}>;globalAccountBase64?:string;protocolFeeRecipients?:{feeRecipient:string;buybackFeeRecipient:string}};
  /** Base64 serialized transaction (partially signed by the mint, or unsigned for a local mint). */
  transaction: string;
  lastValidBlockHeight: number | null;
  demo: boolean;
  genesisHash?: string;
  estimatedNetworkFeesLamports?:string;
  /** Rent the launcher's wallet pays, measured from this exact transaction's simulation on the target network. */
  estimatedAccountRentLamports?:string;
  /** Developer Buy as simulated: tokens received (must equal the request) and lamports spent including Pump fees. */
  devBuy?: { tokenAmount: string; quoteSpent: string };
}

export interface ChainGateway {
  readonly source: "mock_chain" | "solana_rpc";
  getGenesisHash?():Promise<string>;
  /** Optional operator gate, checked before recording a new submission. Never broadcasts. */
  assertLaunchSubmissionAllowed?():Promise<void>;
  /** History-aware signature observation; a non-null status must block unseen-transaction expiry. */
  getSignatureStatus?(signature:string):Promise<{slot:number;confirmationStatus:'processed'|'confirmed'|'finalized'|null;err:unknown}|null>;
  verifyMarketPool?(pool:string,mint:string,quoteMint:string):Promise<boolean>;
  isTransactionOrphaned?(signature:string,slot:number):Promise<boolean>;
  getTransaction(signature: string): Promise<ObservedTransaction | null>;
  getFeeRoutingState(mint: string): Promise<FeeRoutingState>;
  getTokenBalance(owner: string, mint: string): Promise<TokenBalance>;
  buildLaunchTransaction(input: BuildLaunchInput): Promise<BuiltLaunchTransaction>;
  /** Same guarded/simulated construction, without receiving or generating a mint secret. */
  buildUnsignedLaunchTransaction?(input: Omit<BuildLaunchInput,"mintSecretKey">): Promise<BuiltLaunchTransaction>;
  /** Throws ChainFeatureUnavailable unless `mint` is an initialized six-decimal SPL mint in Pump's live Global quote allowlist. */
  verifyQuoteMint?(mint: string): Promise<void>;
  /** Developer Buy support on this network (lookup-table coverage and packet capacity); reason when unavailable. */
  devBuySupport?(preparationOnly?:boolean): Promise<{ available: boolean; reason: string | null }>;
  /** Quote an exact Developer Buy of `bps` basis points of total supply for a new SOL curve. */
  quoteDevBuy?(bps: number, budgetLamports?: bigint): Promise<DevBuyChainQuote>;
  /** Authoritative bonding-curve state read at `slot`; null when the curve account does not exist. */
  getCurveProgress?(mint: string): Promise<CurveProgress | null>;
  /** Distinct owners holding a positive balance of `mint` (excluding the curve's own vault); null holders when too many to count safely. */
  getHolderCount?(mint: string): Promise<{ slot: number; holders: number | null; exact: boolean; index?: HeliusHolderObservation["index"] }>;
  getIndexedMetadata?(mint: string): Promise<IndexedMetadata | null>;
  /** Most recent bonding-curve trades, newest first, from Pump's own events. */
  getRecentTrades?(mint: string, limit: number): Promise<{ slot: number; complete: boolean; trades: ChainTrade[] }>;
  getBlockTime?(slot: number): Promise<number | null>;
  submitLaunchTransaction?(transaction:string):Promise<string>;
  getFinalizedBlockHeight?():Promise<number>;
  /** Finalized mint existence check; expiry requires authoritative absence, not just elapsed height. */
  mintAccountExists?(mint:string):Promise<boolean>;
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
