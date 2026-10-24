import { AgentSocial, SocialMoment, SocialRelationship } from "./society.js";
import { z } from "zod";
import { AgentId, BuildingId, CommunityId, DataMode, PublicKey, TaskId, WorldPos, GridPos } from "./primitives.js";
import { Resource, Task } from "./economy.js";
import { BuildingKind } from "./world.js";
import { AgentActivation, AgentIdentity, DisplayName } from "./identity.js";

export const Profession = z
  .enum(["farmer", "manufacturer", "merchant", "logistics_operator", "builder", "property_manager"])
  .meta({ id: "Profession", description: "Belongs to an individual agent; never assigned to a whole community." });
export type Profession = z.infer<typeof Profession>;
export const PROFESSIONS = Profession.options;

export const Temperament = z.enum(["cooperative", "balanced", "competitive"]).meta({ id: "Temperament" });
export const RiskLevel = z.enum(["low", "medium", "high"]).meta({ id: "RiskLevel" });
export const Objective = z.enum(["profitability", "reliability", "expansion"]).meta({ id: "Objective" });

/**
 * Bounded, owner-editable strategy. All values are clamped server-side; the planner can
 * only choose among actions allowed by `permissions` and within `budget`.
 */
export const AgentStrategy = z
  .object({
    temperament: Temperament,
    risk: RiskLevel,
    objective: Objective,
    /** Max City Credits (mCC) the agent may commit per simulated day (escrows, purchases, upkeep). */
    dailyBudget: z.number().int().min(0).max(1_000_000),
    /** Minimum margin (bps) required before accepting a trade. */
    minMarginBps: z.number().int().min(0).max(5000),
    /** Preferred resources to work with; empty = any. */
    preferredResources: z.array(Resource).max(6),
    /** Preferred home building (optional). */
    homeBuildingId: BuildingId.nullable(),
  })
  .meta({ id: "AgentStrategy" });
export type AgentStrategy = z.infer<typeof AgentStrategy>;

/**
 * Simulation-only permissions. There is deliberately NO permission for on-chain spending:
 * agents can never sign user wallet transactions (spec §2.10).
 */
export const AgentPermission = z
  .enum(["claim_tasks", "trade_market", "operate_building", "perform_maintenance"])
  .meta({ id: "AgentPermission" });
export type AgentPermission = z.infer<typeof AgentPermission>;

export const AgentState = z
  .enum(["idle", "moving", "working", "delivering", "trading", "resting", "paused"])
  .meta({ id: "AgentState" });
export type AgentState = z.infer<typeof AgentState>;

export const AgentStatus = z.enum(["active", "paused"]).meta({ id: "AgentStatus" });

/** Read-only projection of the authoritative assignment, not a client job command. */
export const AgentWork = z.object({
  tick: z.number().int().min(0),
  task: Task.nullable(),
  destination: z.object({ id: BuildingId, name: z.string(), kind: BuildingKind, entrance: GridPos }).nullable(),
  target: GridPos.nullable(),
  remainingWorkTicks: z.number().int().min(0),
  cargo: z.partialRecord(Resource, z.number().int().min(0)),
}).meta({ id: "AgentWork" });
export type AgentWork = z.infer<typeof AgentWork>;

export const AgentSummary = z
  .object({
    id: AgentId,
    /** Historical free-text name given at creation. Not unique; show `displayName` instead. */
    name: z.string(),
    displayName: DisplayName,
    identity: AgentIdentity,
    profession: Profession,
    communityId: CommunityId,
    /**
     * @deprecated since 0.3.0, removed in 0.4.0: use `identity`. The wallet with owner controls:
     * `activatingWallet` (token_linked), `legacyOwnerWallet` (legacy), null (house).
     */
    ownerWallet: PublicKey.nullable(),
    status: AgentStatus,
    state: AgentState,
    social: AgentSocial.optional(),
    work: AgentWork.optional().describe("Absent on older servers; never infer a job from walking alone."),
    pos: WorldPos,
    credits: z.number().int().describe("City Credit balance (mCC). Simulated; not withdrawable."),
    verifiedTasks: z.number().int(),
    points: z.number().int(),
  })
  .meta({ id: "AgentSummary" });
export type AgentSummary = z.infer<typeof AgentSummary>;

export const Agent = AgentSummary.extend({
  cognition: z.object({ preferences: z.array(z.string().max(80)).max(6), goal: z.object({ description: z.string().max(80), buildingId: BuildingId.nullable(), status: z.enum(['active','completed','declined']) }).nullable() }).optional(),
  socialHistory: z.array(SocialMoment).max(12).optional(),
  relationships: z.array(SocialRelationship).max(12).optional(),
  strategy: AgentStrategy,
  permissions: z.array(AgentPermission),
  createdTick: z.number().int(),
  /** Current destination cell, if moving. */
  target: GridPos.nullable(),
  /** Remaining path (cells) — useful for client interpolation. Truncated to 32 cells. */
  path: z.array(GridPos),
  currentTaskId: TaskId.nullable(),
  operatedBuildingId: BuildingId.nullable(),
  cargo: z.partialRecord(Resource, z.number().int().min(0)),
  performance: z.object({
    creditsEarned: z.number().int(),
    creditsSpent: z.number().int(),
    tasksCompleted: z.number().int(),
    tasksFailed: z.number().int(),
    reliabilityPct: z.number().min(0).max(100),
  }),
}).meta({ id: "Agent" });
export type Agent = z.infer<typeof Agent>;

export const AgentActionKind = z
  .enum(["move", "claim_task", "pickup", "deliver", "produce", "trade", "maintain", "rest", "wait", "rejected", "social"])
  .meta({ id: "AgentActionKind" });

/** A validated action and its compact decision log. `rejected` actions record the failed validation. */
export const AgentAction = z
  .object({
    id: z.string(),
    agentId: AgentId,
    tick: z.number().int(),
    kind: AgentActionKind,
    /** Planner's stated reason and utility score for transparency. */
    reason: z.string(),
    utility: z.number(),
    taskId: TaskId.nullable(),
    buildingId: BuildingId.nullable(),
    detail: z.record(z.string(), z.unknown()),
  })
  .meta({ id: "AgentAction" });
export type AgentAction = z.infer<typeof AgentAction>;

/** @deprecated since 0.3.0: `POST /agents` is retired (410 `gone`). Kept so 0.2.0 clients still compile. */
export const CreateAgentRequest = z
  .object({
    communityId: CommunityId,
    name: z.string().trim().min(2).max(32),
    profession: Profession,
    strategy: AgentStrategy.partial().optional(),
  })
  .meta({ id: "CreateAgentRequest" });
export type CreateAgentRequest = z.infer<typeof CreateAgentRequest>;

/**
 * Activate the token-linked agent for a community's token. Only the session wallet that launched the
 * token may call it. There is no name or mint field: the server resolves the mint from the confirmed
 * launch and names the agent after the activating wallet.
 */
export const ActivateAgentRequest = z
  .object({
    communityId: CommunityId,
    profession: Profession,
    strategy: AgentStrategy.partial().optional(),
  })
  .meta({ id: "ActivateAgentRequest" });
export type ActivateAgentRequest = z.infer<typeof ActivateAgentRequest>;

/** DEMO ONLY. Creates a house agent; the authenticated caller does not become its owner. */
export const CreateHouseAgentRequest = z
  .object({
    communityId: CommunityId,
    profession: Profession,
    strategy: AgentStrategy.partial().optional(),
  })
  .meta({ id: "CreateHouseAgentRequest" });
export type CreateHouseAgentRequest = z.infer<typeof CreateHouseAgentRequest>;

export const PatchAgentRequest = z
  .object({
    status: AgentStatus.optional(),
    strategy: AgentStrategy.partial().optional(),
  })
  .meta({ id: "PatchAgentRequest" });
export type PatchAgentRequest = z.infer<typeof PatchAgentRequest>;

export const HolderEligibility = z
  .object({
    wallet: PublicKey,
    communityId: CommunityId,
    mint: PublicKey,
    eligible: z.boolean(),
    balance: z.string().describe("Raw token base units observed on-chain."),
    threshold: z.string().describe("Required raw base units."),
    decimals: z.number().int(),
    source: z.enum(["solana_rpc", "mock_chain"]),
    slot: z.number().int().nullable(),
    checkedAt: z.iso.datetime({ offset: true }),
    /** Cached result valid until; afterwards the server re-reads chain state. */
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "HolderEligibility" });
export type HolderEligibility = z.infer<typeof HolderEligibility>;

export const AgentResponse = z.object({ mode: DataMode, agent: Agent }).meta({ id: "AgentResponse" });

export const ActivateAgentResponse = z
  .object({ mode: DataMode, activation: AgentActivation, agent: Agent })
  .meta({ id: "ActivateAgentResponse" });

/** The signed-in wallet's activation, looked up from the session (never from a public wallet parameter). */
export const MyActivationResponse = z
  .object({ mode: DataMode, activation: AgentActivation.nullable(), agent: Agent.nullable() })
  .meta({ id: "MyActivationResponse" });
