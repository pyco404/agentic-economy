import { z } from "zod";
import { AmountString, DataMode, LaunchId, PublicKey, TxSignature } from "./primitives.js";

/** Owner-supplied future Mainnet identities. Public keys only; ownership is not proven by an RPC balance. */
export const OFFICIAL_TREASURIES = Object.freeze({
  platform: "HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2",
  agentRewards: "GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi",
  aecoDeployer: "3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR",
});

export const OfficialTreasuryWallet = z.object({
  account: z.enum(["platform", "agent_rewards"]),
  address: PublicKey,
  network: z.literal("mainnet-beta"),
  identity: z.literal("owner_supplied"),
  source: z.literal("solana_rpc"),
  status: z.enum(["available", "unavailable"]),
  balanceLamports: AmountString.nullable(),
  slot: z.number().int().nonnegative().nullable(),
  updatedAt: z.iso.datetime({ offset: true }).nullable(),
  checkedAt: z.iso.datetime({ offset: true }),
  message: z.string(),
  accounting: z.object({
    coverage: z.literal("deployment_ledger_only"),
    creatorFeesLamports: AmountString,
    launchChargesLamports: AmountString,
    lifetimeCreatorFeesLamports: AmountString.nullable(),
    pendingDistributionsLamports: AmountString.nullable(),
  }),
  recentTransactions: z.array(z.object({
    signature: TxSignature,
    slot: z.number().int().nonnegative(),
    blockTime: z.number().int().nullable(),
    failed: z.boolean(),
    netChangeLamports: z.string().regex(/^-?\d+$/).nullable().optional(),
    direction: z.enum(["incoming", "outgoing", "neutral"]).nullable().optional(),
    classification: z.enum(["verified_creator_fee", "verified_launch_charge", "unclassified"]),
  })),
});
export type OfficialTreasuryWallet = z.infer<typeof OfficialTreasuryWallet>;

/** Revenue streams are NEVER mixed: launch fees are platform-only; only creator fees are split 60/40. */
export const TreasuryStream = z.enum(["launch_fee", "creator_fee"]).meta({ id: "TreasuryStream" });
export type TreasuryStream = z.infer<typeof TreasuryStream>;

export const TreasuryAccount = z.enum(["platform", "agent_rewards"]).meta({ id: "TreasuryAccount" });
export type TreasuryAccount = z.infer<typeof TreasuryAccount>;

/** pending = seen at `confirmed` commitment; finalized = rooted; reversed = dropped/reorged (compensating entry). */
export const Finality = z.enum(["pending", "finalized", "reversed"]).meta({ id: "Finality" });
export type Finality = z.infer<typeof Finality>;

export const ReconciliationStatus = z
  .enum(["unreconciled", "reconciled", "mismatch"])
  .meta({ id: "ReconciliationStatus" });
export type ReconciliationStatus = z.infer<typeof ReconciliationStatus>;

/**
 * Append-only ledger entry for a REAL on-chain receipt. Unique on (signature, instructionIndex, account, stream).
 * Status changes are new entries referencing `supersedes`; nothing is updated in place.
 */
export const TreasuryEntry = z
  .object({
    id: z.string(),
    seq: z.number().int().min(0),
    stream: TreasuryStream,
    account: TreasuryAccount,
    accountAddress: PublicKey,
    /** Quote asset mint; wrapped SOL mint for native SOL. Assets are never summed together. */
    assetMint: PublicKey,
    assetSymbol: z.string(),
    decimals: z.number().int().min(0).max(18),
    amount: AmountString,
    direction: z.enum(["credit", "debit"]),
    signature: TxSignature,
    instructionIndex: z.number().int().min(0),
    slot: z.number().int().min(0),
    finality: Finality,
    tokenMint: PublicKey.nullable().describe("Community token whose launch/creator fees produced this receipt."),
    launchId: LaunchId.nullable(),
    supersedes: z.string().nullable(),
    evidence:z.object({source:z.enum(['solana_rpc','mock_chain']),version:z.literal(1),network:z.enum(['mainnet-beta','devnet','localnet','demo']),distributed:AmountString,distributedDust:AmountString.nullable().describe('Retained rounding units only when uniquely proven; null when the event and balances do not determine the gross amount.')}).optional(),
    recordedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "TreasuryEntry" });
export type TreasuryEntry = z.infer<typeof TreasuryEntry>;

export const AssetTotals = z
  .object({
    assetMint: PublicKey,
    assetSymbol: z.string(),
    decimals: z.number().int(),
    finalized: AmountString,
    pending: AmountString,
  })
  .meta({ id: "AssetTotals" });

export const FeeRoutingStatus = z
  .object({
    mechanism: z.literal("pump_fees_sharing_config"),
    verified: z.boolean().describe("True only after the full launch → trade → graduation path was tested on devnet/mainnet."),
    verifiedPaths: z.array(z.enum(["bonding_curve", "pumpswap_graduated"])),
    notes: z.array(z.string()),
  })
  .meta({ id: "FeeRoutingStatus" });

export const TreasurySummary = z
  .object({
    mode: DataMode,
    platformTreasury: PublicKey,
    agentRewardsTreasury: PublicKey,
    launchFees: z.object({
      description: z.string(),
      launches: z.number().int(),
      totals: z.array(AssetTotals),
    }),
    creatorFees: z.object({
      description: z.string(),
      agentRewards: z.array(AssetTotals),
      platform: z.array(AssetTotals),
      expectedSplitBps: z.object({ agentRewards: z.literal(6000), platform: z.literal(4000), launcher: z.literal(0) }),
      reconciliation: ReconciliationStatus,
      reconciliationNotes: z.array(z.string()),
    }),
    feeRouting: FeeRoutingStatus,
    payouts: z.object({
      mode: z.literal("disabled_dry_run"),
      description: z.string(),
    }),
    officialWallets: z.array(OfficialTreasuryWallet).optional(),
    recentEntries: z.array(TreasuryEntry),
    asOf: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "TreasurySummary" });
export type TreasurySummary = z.infer<typeof TreasurySummary>;
