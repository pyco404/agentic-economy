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

/** Immutable token-linked activation (0.3.0). Never updated, freed or deleted. */
export interface ActivationRecord {
  id: string;
  agentId: string;
  communityId: string;
  launchId: string;
  tokenMint: string;
  activatingWallet: string;
  displayName: string;
  /** The `agent.activate` inbox command reserved with this row. */
  inboxId: number;
  requestedAt: string;
  /** Derived from the inbox: the simulation has applied the create command. */
  applied: boolean;
}

/**
 * Identity rows reserved in the SAME transaction as the create command's inbox row, so an agent is never
 * queued without its identity and an identity is never reserved without its agent. The first free name
 * in `nameCandidates` is taken (all display names share one uniqueness domain).
 */
export type IdentityReservation =
  | {
      kind: "house";
      agentId: string;
      /** Authenticated caller, recorded for quotas and audit only; never an owner. */
      requestedBy: string;
      maxPerRequester: number;
      /** Cap on house agents across the whole city (protects the shared simulation). */
      maxTotal: number;
      nameCandidates: string[];
    }
  | {
      kind: "token_linked";
      agentId: string;
      nameCandidates: string[];
      activation: Pick<ActivationRecord, "id" | "agentId" | "communityId" | "launchId" | "tokenMint" | "activatingWallet">;
    };

export type IdentityEnqueueResult =
  | { ok: true; enqueued: EnqueueResult; displayName: string; activation: ActivationRecord | null }
  /** Another activation already holds this wallet or mint (it may still be pending). */
  | { ok: false; reason: "wallet_taken" | "mint_taken"; activation: ActivationRecord }
  | { ok: false; reason: "names_exhausted" | "quota_reached" };

export interface Coordinator {
  readonly kind: "memory" | "postgres";
  tryAcquireSimLeadership(holder: string): Promise<LeaderSession | null>;
  tryAcquireLease(name: string, holder: string): Promise<Lease | null>;

  /** Durable command submission. `dedupeKey` makes retries return the original command. */
  enqueueCommand(command: SimCommand, dedupeKey: string | null): Promise<EnqueueResult>;
  /**
   * Atomically reserve an agent identity and queue its create command (`build` receives the chosen name).
   * Serialised cluster-wide; a repeated `dedupeKey` returns the original reservation unchanged.
   */
  enqueueIdentityCommand(dedupeKey: string, reservation: IdentityReservation, build: (displayName: string) => SimCommand): Promise<IdentityEnqueueResult>;
  activationByWallet(wallet: string): Promise<ActivationRecord | null>;
  activationByAgent(agentId: string): Promise<ActivationRecord | null>;
  inboxStatus(id: number): Promise<{ appliedTick: number | null } | null>;

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
