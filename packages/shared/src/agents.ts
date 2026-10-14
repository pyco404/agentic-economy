import { z } from "zod";
import { AgentId, BuildingId, CommunityId, DataMode, PublicKey, TaskId, WorldPos, GridPos } from "./primitives.js";
import { Resource } from "./economy.js";

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

export const AgentSummary = z
  .object({
    id: AgentId,
    name: z.string(),
    profession: Profession,
    communityId: CommunityId,
    ownerWallet: PublicKey,
    status: AgentStatus,
    state: AgentState,
    pos: WorldPos,
    credits: z.number().int().describe("City Credit balance (mCC). Simulated; not withdrawable."),
    verifiedTasks: z.number().int(),
    points: z.number().int(),
  })
  .meta({ id: "AgentSummary" });
export type AgentSummary = z.infer<typeof AgentSummary>;

export const Agent = AgentSummary.extend({
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
  .enum(["move", "claim_task", "pickup", "deliver", "produce", "trade", "maintain", "rest", "wait", "rejected"])
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

export const CreateAgentRequest = z
  .object({
    communityId: CommunityId,
    name: z.string().trim().min(2).max(32),
    profession: Profession,
    strategy: AgentStrategy.partial().optional(),
  })
  .meta({ id: "CreateAgentRequest" });
export type CreateAgentRequest = z.infer<typeof CreateAgentRequest>;

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
