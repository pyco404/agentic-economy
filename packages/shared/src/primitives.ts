import { z } from "zod";

/** Base58 Solana public key (32 bytes → 32–44 chars). Syntactic check only; the server verifies on-curve where needed. */
export const PublicKey = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "must be a base58 Solana public key")
  .meta({ id: "PublicKey", description: "Base58-encoded Solana public key." });
export type PublicKey = z.infer<typeof PublicKey>;

/** Base58 Solana transaction signature (64 bytes → 86–88 chars). */
export const TxSignature = z
  .string()
  .regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/, "must be a base58 transaction signature")
  .meta({ id: "TxSignature", description: "Base58-encoded Solana transaction signature." });
export type TxSignature = z.infer<typeof TxSignature>;

/**
 * Unsigned integer amount in an asset's smallest unit, as a decimal string.
 * Strings avoid JS number precision loss for lamports / token base units.
 */
export const AmountString = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/, "must be a non-negative integer string")
  .meta({ id: "AmountString", description: "Non-negative integer in the asset's base units, encoded as a decimal string." });
export type AmountString = z.infer<typeof AmountString>;

export const IsoTimestamp = z.iso.datetime({ offset: true }).meta({ id: "IsoTimestamp" });
export type IsoTimestamp = z.infer<typeof IsoTimestamp>;

/** Opaque, prefixed identifiers (e.g. `agt_…`, `com_…`). */
export const Id = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9]{6,40}$`), `must be a ${prefix}_ id`);

export const AgentId = Id("agt").meta({ id: "AgentId" });
export const BuildingId = Id("bld").meta({ id: "BuildingId" });
export const CommunityId = Id("com").meta({ id: "CommunityId" });
export const LaunchId = Id("lch").meta({ id: "LaunchId" });
export const TaskId = Id("tsk").meta({ id: "TaskId" });
export const EventId = Id("evt").meta({ id: "EventId" });

/** Integer grid coordinate in logical terrain cells. */
export const GridPos = z
  .object({ x: z.number().int(), y: z.number().int() })
  .meta({ id: "GridPos", description: "Logical terrain cell coordinate. +x east, +y south." });
export type GridPos = z.infer<typeof GridPos>;

/** Continuous position (cells, fractional) used for moving agents. */
export const WorldPos = z
  .object({ x: z.number(), y: z.number() })
  .meta({ id: "WorldPos", description: "Continuous position in terrain-cell units." });
export type WorldPos = z.infer<typeof WorldPos>;

export const ChunkCoord = z
  .object({ cx: z.number().int(), cy: z.number().int() })
  .meta({ id: "ChunkCoord" });
export type ChunkCoord = z.infer<typeof ChunkCoord>;

/** Data-source honesty flag carried on every response (spec §9: visible demo/real-data indicators). */
export const DataMode = z
  .enum(["demo", "devnet", "production"])
  .meta({ id: "DataMode", description: "demo = fixtures/mock chain; devnet = Solana devnet; production = mainnet." });
export type DataMode = z.infer<typeof DataMode>;

export const ApiError = z
  .object({
    error: z.object({
      code: z.enum([
        "bad_request",
        "unauthorized",
        "forbidden",
        "not_found",
        "conflict",
        "idempotency_conflict",
        "not_eligible",
        "chain_verification_failed",
        "feature_disabled",
        "unavailable",
        "internal",
      ]),
      message: z.string(),
      details: z.unknown().optional(),
    }),
    requestId: z.string(),
  })
  .meta({ id: "ApiError" });
export type ApiError = z.infer<typeof ApiError>;
export type ApiErrorCode = ApiError["error"]["code"];

/** Cursor-paginated list. `nextCursor` is null at the end. Cursors are opaque. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
  });

export const PageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
