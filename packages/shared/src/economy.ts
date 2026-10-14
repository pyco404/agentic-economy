import { z } from "zod";
import { AgentId, BuildingId, CommunityId, DataMode, EventId, GridPos, PublicKey, TaskId } from "./primitives.js";

export const Resource = z
  .enum(["wheat", "flour", "bread", "timber", "stone", "energy"])
  .meta({ id: "Resource" });
export type Resource = z.infer<typeof Resource>;
export const RESOURCES = Resource.options;

/** Simulated market quote. Prices are City Credits in milli-credits (mCC) per unit. Never convertible to SOL/tokens. */
export const MarketQuote = z
  .object({
    resource: Resource,
    price: z.number().int().min(0).describe("mCC per unit (last clearing price)."),
    bid: z.number().int().min(0),
    ask: z.number().int().min(0),
    /** Total units in stock across all buildings. */
    supply: z.number().int().min(0),
    /** Units requested by open tasks / resident demand. */
    demand: z.number().int().min(0),
    changePct24h: z.number().describe("Change vs. one simulated day ago, percent."),
  })
  .meta({ id: "MarketQuote" });
export type MarketQuote = z.infer<typeof MarketQuote>;

export const MarketListing = z
  .object({
    buildingId: BuildingId,
    resource: Resource,
    side: z.enum(["sell", "buy"]),
    quantity: z.number().int().positive(),
    price: z.number().int().min(0),
  })
  .meta({ id: "MarketListing" });

export const MarketsResponse = z
  .object({
    mode: DataMode,
    tick: z.number().int(),
    currency: z.literal("CITY_CREDIT_MILLI").describe("Simulated, non-withdrawable City Credits (milli units)."),
    quotes: z.array(MarketQuote),
    listings: z.array(MarketListing),
  })
  .meta({ id: "MarketsResponse" });
export type MarketsResponse = z.infer<typeof MarketsResponse>;

export const TaskKind = z
  .enum(["delivery", "demand_fulfillment", "maintenance", "production_shift"])
  .meta({ id: "TaskKind", description: "System-generated service tasks. Agents cannot create tasks." });
export type TaskKind = z.infer<typeof TaskKind>;

export const TaskStatus = z
  .enum(["open", "claimed", "in_progress", "verified", "expired", "rejected"])
  .meta({ id: "TaskStatus" });
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Task = z
  .object({
    id: TaskId,
    kind: TaskKind,
    status: TaskStatus,
    createdTick: z.number().int(),
    expiresTick: z.number().int(),
    /** Source building (pickup) for deliveries; target building for maintenance/shift. */
    fromBuildingId: BuildingId.nullable(),
    toBuildingId: BuildingId,
    resource: Resource.nullable(),
    quantity: z.number().int().min(0),
    /** Escrowed City Credit payment (mCC) — funded up front by the requester, never minted on completion. */
    rewardCredits: z.number().int().min(0),
    /** Contribution points recorded on verification (dry-run reward basis). */
    points: z.number().int().min(0),
    claimedBy: AgentId.nullable(),
    receiptId: z.string().nullable(),
  })
  .meta({ id: "Task" });
export type Task = z.infer<typeof Task>;

/**
 * Verification receipt for a completed service task. Each step is checked by the
 * authoritative simulation; `hash` chains receipts (prevHash) so the log is tamper-evident.
 */
export const TaskReceipt = z
  .object({
    id: z.string(),
    taskId: TaskId,
    agentId: AgentId,
    ownerWallet: PublicKey,
    kind: TaskKind,
    claimedTick: z.number().int(),
    pickupTick: z.number().int().nullable(),
    completedTick: z.number().int(),
    from: GridPos.nullable(),
    to: GridPos,
    resource: Resource.nullable(),
    quantity: z.number().int().min(0),
    /** Lot identifiers of goods moved (provenance). */
    lots: z.array(z.string()),
    creditsPaid: z.number().int().min(0),
    pointsAwarded: z.number().int().min(0),
    /** Why points were reduced/zeroed (self-dealing, cap reached, circular movement...). */
    pointAdjustments: z.array(z.object({ reason: z.string(), delta: z.number().int() })),
    checks: z.array(z.object({ check: z.string(), passed: z.boolean() })),
    prevHash: z.string(),
    hash: z.string(),
  })
  .meta({ id: "TaskReceipt" });
export type TaskReceipt = z.infer<typeof TaskReceipt>;

/**
 * Dry-run reward record. MVP: points and share estimates ONLY — no SOL amounts,
 * no claims, no payouts (spec §4.3, §8.7).
 */
export const RewardRecord = z
  .object({
    id: z.string(),
    epoch: z.number().int().min(0),
    agentId: AgentId,
    ownerWallet: PublicKey,
    points: z.number().int().min(0),
    /** Share of the epoch's total verified points, in bps. An estimate, not an entitlement. */
    estimatedShareBps: z.number().int().min(0).max(10_000),
    status: z.enum(["dry_run", "disputed", "voided"]),
    receiptIds: z.array(z.string()),
  })
  .meta({ id: "RewardRecord" });
export type RewardRecord = z.infer<typeof RewardRecord>;

export const EconomicEventType = z
  .enum([
    "production.completed",
    "task.created",
    "task.claimed",
    "task.verified",
    "task.expired",
    "trade.executed",
    "consumption",
    "maintenance.completed",
    "agent.activated",
    "agent.paused",
    "agent.resumed",
    "agent.strategy_updated",
    "community.registered",
    "building.placed",
    "launch.confirmed",
  ])
  .meta({ id: "EconomicEventType" });
export type EconomicEventType = z.infer<typeof EconomicEventType>;

/** Public activity-feed entry. `seq` is a global monotonically increasing sequence. */
export const EconomicEvent = z
  .object({
    id: EventId,
    seq: z.number().int().min(0),
    tick: z.number().int().min(0),
    at: z.iso.datetime({ offset: true }),
    type: EconomicEventType,
    summary: z.string().describe("Human-readable one-liner for feeds."),
    agentId: AgentId.nullable(),
    buildingId: BuildingId.nullable(),
    communityId: CommunityId.nullable(),
    data: z.record(z.string(), z.unknown()),
  })
  .meta({ id: "EconomicEvent" });
export type EconomicEvent = z.infer<typeof EconomicEvent>;

export const EconomySummary = z
  .object({
    mode: DataMode,
    tick: z.number().int(),
    epoch: z.number().int(),
    creditSupply: z.object({
      issued: z.number().int(),
      burned: z.number().int(),
      circulating: z.number().int(),
      issuanceCapPerEpoch: z.number().int(),
    }),
    production: z.partialRecord(Resource, z.object({ produced: z.number().int(), consumed: z.number().int(), stock: z.number().int() })),
    quotes: z.array(MarketQuote),
    openTasks: z.number().int(),
    verifiedTasksThisEpoch: z.number().int(),
    pointsThisEpoch: z.number().int(),
    rewardMode: z.literal("dry_run").describe("MVP: no real payouts."),
  })
  .meta({ id: "EconomySummary" });
export type EconomySummary = z.infer<typeof EconomySummary>;
