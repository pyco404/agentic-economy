import { z } from "zod";
import { CommunityId, DataMode, LaunchId, PublicKey, TxSignature, AmountString } from "./primitives.js";
import { PUMP_NAME_MAX, PUMP_SYMBOL_MAX, PUMP_URI_MAX } from "./constants.js";

/** Token metadata supplied by the launcher. Limits mirror Pump.fun create_v2. */
export const LaunchDraft = z
  .object({
    name: z.string().trim().min(1).max(PUMP_NAME_MAX),
    symbol: z
      .string()
      .trim()
      .min(1)
      .max(PUMP_SYMBOL_MAX)
      .regex(/^[A-Za-z0-9$_.-]+$/, "symbol may contain letters, digits and $ _ . -"),
    description: z.string().max(1000).default(""),
    /** Metadata JSON URI (IPFS/Arweave/https) produced by Pump.fun's supported metadata upload. */
    metadataUri: z.string().url().max(PUMP_URI_MAX),
    imageUri: z.string().url().max(500).nullable().default(null),
    website: z.string().url().max(200).nullable().default(null),
    twitter: z.string().url().max(200).nullable().default(null),
    telegram: z.string().url().max(200).nullable().default(null),
  })
  .meta({ id: "LaunchDraft" });
export type LaunchDraft = z.infer<typeof LaunchDraft>;

/**
 * draft → awaiting_signature → submitted → confirmed | failed | recovery_needed
 * - failed: transaction failed or never landed. Because the 0.05 SOL charge and the Pump.fun
 *   create are in ONE atomic transaction, a failed launch charges nothing (only network fees).
 * - recovery_needed: transaction landed but creator-fee routing could not be verified
 *   (e.g. fee-sharing config missing/incorrect). No community is registered until resolved.
 * - expired: prepared transaction blockhash expired before submission (nothing charged).
 */
export const LaunchStatus = z
  .enum(["draft", "awaiting_signature", "submitted", "confirmed", "failed", "recovery_needed", "expired"])
  .meta({ id: "LaunchStatus" });
export type LaunchStatus = z.infer<typeof LaunchStatus>;

export const FeeBreakdown = z
  .object({
    platformLaunchFeeLamports: AmountString.describe("Always 50000000 (0.05 SOL), 100% to platform treasury."),
    platformTreasury: PublicKey,
    estimatedNetworkFeesLamports: AmountString.describe("Signature + priority fees (estimate)."),
    estimatedAccountRentLamports: AmountString.describe("Rent for mint/bonding-curve/fee-config accounts (estimate)."),
    launcherCreatorFeeBps: z.literal(0),
    creatorFeeSplit: z.object({
      agentRewardsTreasury: PublicKey,
      agentRewardsBps: z.literal(6000),
      platformTreasury: PublicKey,
      platformBps: z.literal(4000),
    }),
    notes: z.array(z.string()),
  })
  .meta({ id: "FeeBreakdown" });
export type FeeBreakdown = z.infer<typeof FeeBreakdown>;

export const LaunchError = z
  .object({ code: z.string(), message: z.string(), at: z.iso.datetime({ offset: true }) })
  .meta({ id: "LaunchError" });

export const TokenLaunch = z
  .object({
    id: LaunchId,
    mode: DataMode,
    status: LaunchStatus,
    launcherWallet: PublicKey,
    draft: LaunchDraft,
    mint: PublicKey,
    feeSharingConfig: PublicKey,
    fees: FeeBreakdown,
    /** Server-owned safe-network preparation; absent on legacy/demo records. No private key. */
    execution: z.object({
      draftId:z.string().uuid(),draftVersion:z.number().int().nonnegative(),
      transaction:z.string().max(1644),lastValidBlockHeight:z.number().int().nonnegative(),genesisHash:PublicKey,
      network:z.enum(["devnet","localnet"]),quoteAsset:z.literal("SOL"),
      platformOrigin:z.literal("PLATFORM"),initiator:z.literal("HUMAN"),
    }).optional(),
    signature: TxSignature.nullable(),
    slot: z.number().int().nullable(),
    communityId: CommunityId.nullable(),
    errors: z.array(LaunchError),
    history: z.array(z.object({ status: LaunchStatus, at: z.iso.datetime({ offset: true }) })),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "TokenLaunch" });
export type TokenLaunch = z.infer<typeof TokenLaunch>;

export const PrepareLaunchRequest = z.object({ draft: LaunchDraft }).meta({ id: "PrepareLaunchRequest" });
export type PrepareLaunchRequest = z.infer<typeof PrepareLaunchRequest>;

export const PrepareLaunchResponse = z
  .object({
    launch: TokenLaunch,
    /**
     * Base64 serialized versioned transaction, already partially signed by the new mint keypair.
     * The launcher wallet signs as fee payer + creator and submits. Contains, atomically:
     * SystemProgram.transfer(0.05 SOL → platform treasury), Pump create_v2, create_fee_sharing_config,
     * update_fee_shares_v2([agent 6000, platform 4000]) which revokes the config admin.
     */
    transaction: z.string(),
    /** True when the transaction is a demo placeholder that must not be sent to any cluster. */
    demoTransaction: z.boolean(),
    lastValidBlockHeight: z.number().int().nullable(),
  })
  .meta({ id: "PrepareLaunchResponse" });
export type PrepareLaunchResponse = z.infer<typeof PrepareLaunchResponse>;

export const ConfirmLaunchRequest = z
  .object({ launchId: LaunchId, signature: TxSignature })
  .meta({ id: "ConfirmLaunchRequest" });
export type ConfirmLaunchRequest = z.infer<typeof ConfirmLaunchRequest>;

export const LaunchResponse = z.object({ launch: TokenLaunch }).meta({ id: "LaunchResponse" });
export type LaunchResponse = z.infer<typeof LaunchResponse>;

export const LaunchModeInfo = z.object({ mode: DataMode }).meta({ id: "LaunchModeInfo" });
