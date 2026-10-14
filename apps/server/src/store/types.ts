import type { AgentAction, Community, EconomicEvent, RewardRecord, TaskReceipt, TokenLaunch, TreasuryEntry } from "@agentic-economy/shared";

export interface WorldMeta {
  worldId: string;
  seed: string;
  generatorVersion: number;
  createdAt: string;
}

export interface ChallengeRecord {
  nonce: string;
  wallet: string;
  message: string;
  expiresAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  wallet: string;
  expiresAt: string;
}

export interface IdempotencyRecord {
  requestHash: string;
  status: number;
  body: unknown;
}

/** Launch persisted with an optimistic-concurrency version. */
export interface LaunchRecord {
  launch: TokenLaunch;
  version: number;
}

export type NewEvent = Omit<EconomicEvent, "seq">;

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

export class ConflictError extends Error {}

/**
 * Persistence boundary. Two implementations with identical semantics: in-memory (demo/tests) and
 * Postgres (devnet/production). Ledger-like tables (treasury entries, receipts, commands, events)
 * are append-only; Postgres additionally enforces that with triggers.
 */
export interface Store {
  readonly kind: "memory" | "postgres";
  close(): Promise<void>;

  getWorldMeta(): Promise<WorldMeta | null>;
  /** Insert-once; returns the persisted meta (existing one wins). */
  initWorldMeta(meta: WorldMeta): Promise<WorldMeta>;

  /** Append sim outputs; rows whose deterministic id already exists are skipped (replay-safe). Returns newly inserted events with seq. */
  appendSimOutputs(o: { events: NewEvent[]; actions: AgentAction[]; receipts: TaskReceipt[]; rewards: RewardRecord[] }): Promise<EconomicEvent[]>;
  listEvents(cursor: string | null, limit: number): Promise<PageResult<EconomicEvent>>;
  listAgentActions(agentId: string, cursor: string | null, limit: number): Promise<PageResult<AgentAction>>;
  listReceipts(cursor: string | null, limit: number): Promise<PageResult<TaskReceipt>>;
  listRewards(cursor: string | null, limit: number): Promise<PageResult<RewardRecord>>;

  createChallenge(c: ChallengeRecord): Promise<void>;
  /** Atomically mark a challenge used. Returns it only if it existed, matched the wallet, was unused and unexpired. */
  consumeChallenge(nonce: string, wallet: string, now: Date): Promise<ChallengeRecord | null>;
  createSession(s: SessionRecord): Promise<void>;
  getSession(tokenHash: string, now: Date): Promise<SessionRecord | null>;

  getIdempotent(key: string, wallet: string, route: string): Promise<IdempotencyRecord | null>;
  saveIdempotent(key: string, wallet: string, route: string, rec: IdempotencyRecord): Promise<void>;

  createLaunch(l: TokenLaunch): Promise<void>;
  getLaunch(id: string): Promise<LaunchRecord | null>;
  findLaunchBySignature(signature: string): Promise<TokenLaunch | null>;
  /** Optimistic update; throws ConflictError if `expectedVersion` is stale or the signature is bound elsewhere. */
  updateLaunch(l: TokenLaunch, expectedVersion: number): Promise<void>;
  /**
   * Atomically: update launch (confirmed), insert community, append treasury entries, append event.
   * Throws ConflictError if the launch version is stale or mint/launch already registered.
   */
  confirmLaunch(l: TokenLaunch, expectedVersion: number, community: Community, entries: TreasuryEntry[], event: NewEvent): Promise<void>;

  getCommunity(id: string): Promise<Community | null>;
  getCommunityByMint(mint: string): Promise<Community | null>;
  listCommunities(cursor: string | null, limit: number): Promise<PageResult<Community>>;
  allCommunities(): Promise<Community[]>;

  /** Append entries; duplicates of (signature, instructionIndex, account, stream, finality) are skipped. Returns inserted. */
  appendTreasuryEntries(entries: TreasuryEntry[]): Promise<TreasuryEntry[]>;
  listTreasuryEntries(cursor: string | null, limit: number): Promise<PageResult<TreasuryEntry>>;
  allTreasuryEntries(): Promise<TreasuryEntry[]>;
}

export const encodeCursor = (n: number) => Buffer.from(String(n)).toString("base64url");
export function decodeCursor(c: string | null): number | null {
  if (!c) return null;
  const n = Number(Buffer.from(c, "base64url").toString());
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
