import { z } from "zod";
import { CommunityId, DataMode, LaunchId, PublicKey, TxSignature, AmountString } from "./primitives.js";
import { DEV_BUY_MAX_BPS, PUMP_NAME_MAX, PUMP_SYMBOL_MAX, PUMP_URI_MAX } from "./constants.js";
import { utf8Length, tokenFieldIssues } from "./tokenRules.js";

/** Token metadata supplied by the launcher. Limits mirror Pump.fun create_v2. */
export const LaunchDraft = z
  .object({
    name: z.string().min(1).refine((v) => utf8Length(v) <= PUMP_NAME_MAX, `name may be at most ${PUMP_NAME_MAX} UTF-8 bytes`),
    symbol: z
      .string()
      .min(1)
      .refine((v) => utf8Length(v) <= PUMP_SYMBOL_MAX, `symbol may be at most ${PUMP_SYMBOL_MAX} UTF-8 bytes`)
      .regex(/^[A-Za-z0-9$_.-]+$/, "symbol may contain letters, digits and $ _ . -"),
    description: z.string().max(1000).default(""),
    /** Metadata JSON URI (IPFS/Arweave/https) produced by Pump.fun's supported metadata upload. */
    metadataUri: z.string().url().refine(v => {
      const uri=new URL(v);
      // eslint-disable-next-line no-control-regex
      return ['https:', 'ipfs:', 'ar:'].includes(uri.protocol)&&!!uri.hostname&&!uri.username&&!uri.password&&!/[\u0000-\u001F\u007F-\u009F\uD800-\uDFFF]/u.test(v);
    }, 'Use a valid HTTPS, IPFS or Arweave metadata URI').refine((v) => utf8Length(v) <= PUMP_URI_MAX, `metadata URI may be at most ${PUMP_URI_MAX} UTF-8 bytes`),
    imageUri: z.string().url().max(500).nullable().default(null),
    website: z.string().url().max(200).nullable().default(null),
    twitter: z.string().url().max(200).nullable().default(null),
    telegram: z.string().url().max(200).nullable().default(null),
  })
  .superRefine((fields, ctx) => {
    for (const issue of tokenFieldIssues(fields, true)) ctx.addIssue({code:'custom',path:[issue.field],message:issue.message});
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
    /** Optional Developer Buy in the same atomic transaction; amounts in token base units and lamports. */
    developerBuy: z.object({
      bps: z.number().int().min(1).max(DEV_BUY_MAX_BPS), quoteAsset: z.literal("SOL"), totalSupply: AmountString, tokenAmount: AmountString,
      estimatedQuoteCost: AmountString, pumpFees: AmountString, maxQuoteCost: AmountString, priceImpactBps: z.number().int().nonnegative(),
    }).nullable().optional(),
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
      network:z.enum(["devnet","localnet","mainnet-beta"]),quoteAsset:z.enum(["SOL","USDC"]),
      /** USDC only: the quote mint the server verified against the live Pump Global allowlist. Never client-supplied. */
      quoteMint:PublicKey.optional(),
      platformOrigin:z.literal("PLATFORM"),initiator:z.literal("HUMAN"),
      /** Requested Developer Buy: exact token amount (never above 3.5% of supply) and the maximum lamports it may cost. */
      devBuy:z.object({bps:z.number().int().min(1).max(DEV_BUY_MAX_BPS),tokenAmount:AmountString,maxQuoteCost:AmountString}).optional(),
    }).optional(),
    /** Developer Buy as executed, from the confirmed transaction (not the request). */
    devBuyResult: z.object({tokenAmount:AmountString,quoteSpent:AmountString,allocationBps:z.string().describe("Exact share of total supply in basis points, as a decimal string"),signature:TxSignature}).nullable().optional(),
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

export const PrepareLaunchRequest = z.object({ draft: LaunchDraft.strict() }).strict().meta({ id: "PrepareLaunchRequest" });
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

export const LaunchResponse = z.object({ launch: TokenLaunch, recovery:z.object({signature:TxSignature,canResume:z.boolean()}).optional() }).meta({ id: "LaunchResponse" });
export type LaunchResponse = z.infer<typeof LaunchResponse>;

export const LaunchModeInfo = z.object({ mode: DataMode }).meta({ id: "LaunchModeInfo" });
