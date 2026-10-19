import { z } from "zod";
import { BuildingId, CommunityId, DataMode, LaunchId, PublicKey, TxSignature } from "./primitives.js";

/**
 * A token community. Exists ONLY for tokens launched through the Agentic Economy launch flow
 * and verified on-chain (no external imports). Registration is immutable.
 */
export const Community = z
  .object({
    id: CommunityId,
    name: z.string(),
    symbol: z.string(),
    description: z.string(),
    imageUri: z.string().nullable(),
    metadataUri: z.string(),
    mint: PublicKey,
    launchId: LaunchId,
    launchSignature: TxSignature,
    creatorWallet: PublicKey.describe("Wallet that launched the token. Receives 0% of creator fees."),
    feeSharingConfig: PublicKey.nullable().describe("Pump.fun fee sharing config PDA routing creator fees 60/40."),
    links: z.object({
      pumpFun: z.string().url(),
      explorer: z.string().url(),
      website: z.string().url().nullable(),
      twitter: z.string().url().nullable(),
      telegram: z.string().url().nullable(),
    }),
    headquartersBuildingId: BuildingId.nullable(),
    stats: z.object({
      agents: z.number().int(),
      activeAgents: z.number().int(),
      verifiedTasks: z.number().int(),
      /** Prominence = sustained useful services, NOT trading volume (spec §3.4). */
      prominence: z.number().int(),
    }),
    registeredAt: z.iso.datetime({ offset: true }),
    provenance:z.object({platformOrigin:z.literal("PLATFORM"),initiator:z.literal("HUMAN"),network:z.enum(["devnet","localnet"]),quoteAsset:z.enum(["SOL","USDC"])}).optional(),
  })
  .meta({ id: "Community" });
export type Community = z.infer<typeof Community>;

export const CommunityResponse = z.object({ mode: DataMode, community: Community }).meta({ id: "CommunityResponse" });
