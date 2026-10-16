import { z } from "zod";
import { AgentId, CommunityId, Id, LaunchId, PublicKey } from "./primitives.js";

/**
 * Agent identity (contract 0.3.0). Three classifications that are never inferred from each other:
 *
 * - `house`: created by the city (demo house creation). No wallet, ever — authenticating a request does
 *   not make the caller an owner. Named `<Word>_<NNN>` (e.g. `Fern_108`).
 * - `token_linked`: activated by the verified wallet that launched an eligible token through Agentic
 *   Economy. Exactly one per token mint and one per activating wallet, enforced by database uniqueness.
 *   Holding or buying a token never creates one. Consequence: a wallet may launch several tokens, but can
 *   activate an agent for only one of them.
 * - `legacy`: every agent created before 0.3.0. Keeps its ID, history and owner controls; it is not an
 *   activation and is never converted into one.
 */

export const ActivationId = Id("act").meta({ id: "ActivationId" });

/** House-generated name: a capitalised word, underscore, 3–6 digits. Never a wallet or `0x` value. */
export const SyntheticName = z
  .string()
  .regex(/^[A-Z][a-z]{1,15}_[0-9]{3,6}$/, "must look like Fern_108")
  .meta({ id: "SyntheticName", description: "Persisted, globally unique, house-generated agent name (e.g. Fern_108)." });

export const AgentKind = z.enum(["house", "token_linked", "legacy"]).meta({ id: "AgentKind" });
export type AgentKind = z.infer<typeof AgentKind>;

export const HouseIdentity = z
  .object({ kind: z.literal("house"), syntheticName: SyntheticName })
  .meta({ id: "HouseIdentity" });

export const TokenLinkedIdentity = z
  .object({
    kind: z.literal("token_linked"),
    activationId: ActivationId,
    /** Resolved by the server from the confirmed platform launch; never supplied by a client. */
    tokenMint: PublicKey,
    /** Full verified activating wallet (the token's launcher). `displayName` holds the shortened form. */
    activatingWallet: PublicKey,
    launchId: LaunchId,
    communityId: CommunityId,
  })
  .meta({ id: "TokenLinkedIdentity" });

export const LegacyIdentity = z
  .object({
    kind: z.literal("legacy"),
    syntheticName: SyntheticName,
    /** The wallet recorded as owner before 0.3.0 (historical; not an activation). Keeps owner controls. */
    legacyOwnerWallet: PublicKey,
  })
  .meta({ id: "LegacyIdentity" });

export const AgentIdentity = z
  .discriminatedUnion("kind", [HouseIdentity, TokenLinkedIdentity, LegacyIdentity])
  .meta({ id: "AgentIdentity" });
export type AgentIdentity = z.infer<typeof AgentIdentity>;

/**
 * Persisted name to show everywhere (world labels, profiles, feeds). House and legacy agents use their
 * synthetic name. Token-linked agents use the shortened activating wallet (`CMYx...6Wec`), extended
 * (`CMYxQ...h6Wec`) only when shorter forms collide; fixed at activation and stable across restarts.
 */
export const DisplayName = z.string().min(3).max(64).meta({ id: "DisplayName" });

export const ActivationStatus = z
  .enum(["pending", "active"])
  .meta({ id: "ActivationStatus", description: "pending = reserved and queued for the simulation; active = agent exists." });

/** Immutable record of a token-linked activation. Never transferred, freed or deleted. */
export const AgentActivation = z
  .object({
    id: ActivationId,
    agentId: AgentId,
    communityId: CommunityId,
    launchId: LaunchId,
    tokenMint: PublicKey,
    activatingWallet: PublicKey,
    displayName: DisplayName,
    status: ActivationStatus,
    requestedAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "AgentActivation" });
export type AgentActivation = z.infer<typeof AgentActivation>;
