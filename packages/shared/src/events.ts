import { z } from "zod";
import { AgentId, ChunkCoord, WorldPos, GridPos, DataMode } from "./primitives.js";
import { AgentAction, AgentState, AgentSummary } from "./agents.js";
import { WorldChunk } from "./world.js";
import { EconomicEvent, MarketQuote } from "./economy.js";
import { Community } from "./community.js";
import { TreasuryEntry } from "./treasury.js";

/**
 * WebSocket protocol v1 — see contracts/events.md for the full semantics.
 * Every server message is an envelope { v, type, seq, tick, ts, data }.
 * `seq` is a global, strictly increasing stream sequence. Messages filtered out by your
 * subscription leave gaps — gaps are NOT data loss. On reconnect send `resume` with your last seq.
 */
const envelope = <T extends string, D extends z.ZodType>(type: T, data: D) =>
  z.object({
    v: z.literal(1),
    type: z.literal(type),
    seq: z.number().int().min(0),
    tick: z.number().int().min(0),
    ts: z.iso.datetime({ offset: true }),
    data,
  });

export const WorldSnapshotEvent = envelope(
  "world.snapshot",
  z.object({
    mode: DataMode,
    worldId: z.string(),
    seed: z.string(),
    reason: z.enum(["join", "resume_gap", "subscription_changed", "server_restart"]),
    subscribedChunks: z.array(ChunkCoord).nullable().describe("null = all chunks."),
    agents: z.array(AgentSummary),
    quotes: z.array(MarketQuote),
    chunkVersions: z.array(z.object({ coord: ChunkCoord, version: z.number().int() })),
  }),
).meta({ id: "WorldSnapshotEvent" });

export const ChunkUpdatedEvent = envelope("world.chunk.updated", z.object({ chunk: WorldChunk })).meta({
  id: "ChunkUpdatedEvent",
});

export const AgentMove = z
  .object({
    id: AgentId,
    pos: WorldPos,
    state: AgentState,
    target: GridPos.nullable(),
    /** Cells per tick, for client-side interpolation/extrapolation. */
    speed: z.number(),
  })
  .meta({ id: "AgentMove" });

export const AgentMovedEvent = envelope("agent.moved", z.object({ moves: z.array(AgentMove) })).meta({
  id: "AgentMovedEvent",
});

export const AgentActionEvent = envelope("agent.action", z.object({ action: AgentAction })).meta({
  id: "AgentActionEvent",
});

export const PriceUpdatedEvent = envelope("economy.price_updated", z.object({ quotes: z.array(MarketQuote) })).meta({
  id: "PriceUpdatedEvent",
});

export const ActivityCreatedEvent = envelope("activity.created", z.object({ event: EconomicEvent })).meta({
  id: "ActivityCreatedEvent",
});

export const CommunityUpdatedEvent = envelope("community.updated", z.object({ community: Community })).meta({
  id: "CommunityUpdatedEvent",
});

/** Only confirmed/reconciled on-chain receipts are broadcast (never estimates). */
export const TreasuryUpdatedEvent = envelope("treasury.updated", z.object({ entry: TreasuryEntry })).meta({
  id: "TreasuryUpdatedEvent",
});

export const SystemNoticeEvent = envelope(
  "system.notice",
  z.object({
    level: z.enum(["info", "warning", "incident"]),
    code: z.string(),
    message: z.string(),
  }),
).meta({ id: "SystemNoticeEvent" });

/** Heartbeat every 15 s. Does not consume a seq (seq = last emitted seq). Drop the connection after 45 s of silence. */
export const HeartbeatEvent = envelope("system.heartbeat", z.object({ simRunning: z.boolean() })).meta({
  id: "HeartbeatEvent",
});

export const ServerEvent = z
  .discriminatedUnion("type", [
    WorldSnapshotEvent,
    ChunkUpdatedEvent,
    AgentMovedEvent,
    AgentActionEvent,
    PriceUpdatedEvent,
    ActivityCreatedEvent,
    CommunityUpdatedEvent,
    TreasuryUpdatedEvent,
    SystemNoticeEvent,
    HeartbeatEvent,
  ])
  .meta({ id: "ServerEvent" });
export type ServerEvent = z.infer<typeof ServerEvent>;
export type ServerEventType = ServerEvent["type"];
export type ServerEventOf<T extends ServerEventType> = Extract<ServerEvent, { type: T }>;

/** Client → server messages. */
export const ClientMessage = z
  .discriminatedUnion("type", [
    z.object({
      v: z.literal(1),
      type: z.literal("subscribe"),
      /** Chunks currently visible. null/omitted = everything (fine for the compact Genesis district). Max 64. */
      chunks: z.array(ChunkCoord).max(64).nullable(),
    }),
    z.object({ v: z.literal(1), type: z.literal("resume"), lastSeq: z.number().int().min(0) }),
    z.object({ v: z.literal(1), type: z.literal("ping"), nonce: z.string().max(64) }),
  ])
  .meta({ id: "ClientMessage" });
export type ClientMessage = z.infer<typeof ClientMessage>;

/** Reply to `ping` (not sequenced). */
export const PongMessage = z
  .object({ v: z.literal(1), type: z.literal("pong"), nonce: z.string(), ts: z.iso.datetime({ offset: true }) })
  .meta({ id: "PongMessage" });
