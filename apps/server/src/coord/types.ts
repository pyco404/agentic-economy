import type { AgentAction, EconomicEvent, RewardRecord, TaskReceipt } from "@agentic-economy/shared";
import type { LoggedCommand, SimCommand } from "../sim/types.js";
import type { NewEvent } from "../store/types.js";

/** A durable, sequenced WebSocket stream record. `payload` is the envelope JSON without `seq`. */
export interface StreamRecord {
  seq: number;
  key: string;
  type: string;
  tick: number;
  payload: string;
}
export type StreamDraft = Omit<StreamRecord, "seq">;

export interface InboxRow {
  id: number;
  command: SimCommand;
}

export interface Snapshot {
  tick: number;
  state: string;
  hash: string;
}

export interface Recovery {
  snapshot: Snapshot | null;
  /** Applied-command log entries with tick >= snapshot tick, in seq order. */
  log: LoggedCommand[];
  /** Engine tick after the last committed tick (0 if nothing committed yet). */
  lastTick: number;
  /** Highest applied command seq (-1 if none). */
  maxSeq: number;
}

/** Everything produced by one simulation tick, committed atomically by the leader. */
export interface TickCommit {
  /** Engine tick after the step (= stepped tick + 1). */
  nextTick: number;
  applied: Array<{ inboxId: number; logged: LoggedCommand }>;
  events: NewEvent[];
  actions: AgentAction[];
  receipts: TaskReceipt[];
  rewards: RewardRecord[];
  /** Builds stream records once persisted events have their seqs (only NEWLY inserted events are passed). */
  buildStream: (insertedEvents: EconomicEvent[]) => StreamDraft[];
  snapshot: Snapshot | null;
  view: Buffer | null;
  pruneStreamOlderThan: Date | null;
}

/**
 * Exclusive right to run the simulation. Lost when the underlying lock/connection is lost; every
 * commit asserts the fencing epoch, so a lost or superseded session can never write.
 */
export interface LeaderSession {
  readonly epoch: number;
  readonly lost: boolean;
  onLost(cb: (reason: string) => void): void;
  loadRecovery(): Promise<Recovery>;
  claimInbox(limit: number): Promise<InboxRow[]>;
  /** Returns the highest stream seq written (null if none). Throws (and marks lost) if fencing fails. */
  commitTick(c: TickCommit): Promise<number | null>;
  publishView(tick: number, stateGz: Buffer): Promise<void>;
  release(): Promise<void>;
}

/** Exclusive lease for other singleton workers (indexer). */
export interface Lease {
  readonly name: string;
  readonly epoch: number;
  readonly lost: boolean;
  heartbeat(): Promise<void>;
  release(): Promise<void>;
}

export interface SimStatus {
  epoch: number;
  holder: string | null;
  heartbeatAt: string | null;
  lastTick: number;
}

export interface CoordinationListener {
  onStream?(latestSeq: number): void;
  onView?(tick: number): void;
  onApplied?(inboxIds: number[], tick: number): void;
  /** Connection to the notification channel was re-established; consumers should re-read durable state. */
  onReconnect?(): void;
}

export interface EnqueueResult {
  id: number;
  command: SimCommand;
  existing: boolean;
  appliedTick: number | null;
}

/** Atomic admission check for agent creation: reject if the wallet already has `maxPending` or more queued creates. */
export interface EnqueueGuard {
  wallet: string;
  communityId: string;
  maxPending: number;
}

export interface Coordinator {
  readonly kind: "memory" | "postgres";
  tryAcquireSimLeadership(holder: string): Promise<LeaderSession | null>;
  tryAcquireLease(name: string, holder: string): Promise<Lease | null>;

  /** Durable command submission. `dedupeKey` makes retries return the original command. */
  /** Returns null when `guard` rejects the command (nothing is enqueued). */
  enqueueCommand(command: SimCommand, dedupeKey: string | null, guard?: EnqueueGuard): Promise<EnqueueResult | null>;
  inboxStatus(id: number): Promise<{ appliedTick: number | null } | null>;
  pendingAgentCreates(wallet: string, communityId: string): Promise<number>;

  /** Append stream records from non-sim producers (API, indexer); duplicates by key are skipped. */
  appendStream(drafts: StreamDraft[]): Promise<StreamRecord[]>;
  readStream(afterSeq: number, limit: number): Promise<StreamRecord[]>;
  streamBounds(): Promise<{ oldest: number | null; latest: number }>;

  loadView(): Promise<{ tick: number; epoch: number; stateGz: Buffer } | null>;
  simStatus(): Promise<SimStatus>;

  listen(l: CoordinationListener): Promise<() => Promise<void>>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export class LeadershipLost extends Error {}
