import {nextTreasuryEntry} from './treasury-entry.js';
import type { AgentAction, Community, EconomicEvent, RewardRecord, TaskReceipt, TokenLaunch, TreasuryEntry } from "@agentic-economy/shared";
import {
  ConflictError,
  decodeCursor,
  encodeCursor,
  type ChallengeRecord,
  type IdempotencyRecord,
  type LaunchRecord,
  type NewEvent,
  type PageResult,
  type SessionRecord,
  type Store,
  type WorldMeta,
} from "./types.js";

/** Newest-first page over rows carrying a numeric seq. */
function pageDesc<T>(rows: Array<{ seq: number; row: T }>, cursor: string | null, limit: number): PageResult<T> {
  const before = decodeCursor(cursor);
  const filtered = rows.filter((r) => before === null || r.seq < before).sort((a, b) => b.seq - a.seq);
  const items = filtered.slice(0, limit);
  const more = filtered.length > limit;
  return { items: items.map((r) => r.row), nextCursor: more && items.length ? encodeCursor(items[items.length - 1]!.seq) : null };
}

const clone = <T>(v: T): T => structuredClone(v);
const treasuryKey = (e: TreasuryEntry) => `${e.signature}|${e.instructionIndex}|${e.account}|${e.stream}|${e.finality}`;

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private world: WorldMeta | null = null;
  private events: EconomicEvent[] = [];
  private eventIds = new Set<string>();
  private actions: Array<{ seq: number; row: AgentAction }> = [];
  private actionIds = new Set<string>();
  private receipts: Array<{ seq: number; row: TaskReceipt }> = [];
  private receiptIds = new Set<string>();
  private rewards: Array<{ seq: number; row: RewardRecord }> = [];
  private rewardIds = new Set<string>();
  private challenges = new Map<string, ChallengeRecord & { used: boolean }>();
  private sessions = new Map<string, SessionRecord>();
  private idem = new Map<string, IdempotencyRecord>();
  private launches = new Map<string, LaunchRecord>();
  private communities: Array<{ seq: number; row: Community }> = [];
  private treasury: TreasuryEntry[] = [];
  private treasuryKeys = new Set<string>();
  private seq = 0;

  async close() {}

  async getWorldMeta() {
    return this.world;
  }
  async initWorldMeta(meta: WorldMeta) {
    this.world ??= meta;
    return this.world;
  }

  async appendSimOutputs(o: { events: NewEvent[]; actions: AgentAction[]; receipts: TaskReceipt[]; rewards: RewardRecord[] }) {
    const inserted: EconomicEvent[] = [];
    for (const e of o.events) {
      if (this.eventIds.has(e.id)) continue;
      this.eventIds.add(e.id);
      const row = { ...clone(e), seq: ++this.seq };
      this.events.push(row);
      inserted.push(row);
    }
    const add = <T extends { id: string }>(ids: Set<string>, list: Array<{ seq: number; row: T }>, rows: T[]) => {
      for (const r of rows) {
        if (ids.has(r.id)) continue;
        ids.add(r.id);
        list.push({ seq: ++this.seq, row: clone(r) });
      }
    };
    add(this.actionIds, this.actions, o.actions);
    add(this.receiptIds, this.receipts, o.receipts);
    add(this.rewardIds, this.rewards, o.rewards);
    // Bound memory in long-running demo processes.
    if (this.events.length > 20_000) this.events.splice(0, 5_000);
    if (this.actions.length > 50_000) this.actions.splice(0, 10_000);
    return inserted;
  }
  async listEvents(cursor: string | null, limit: number) {
    return pageDesc(this.events.map((e) => ({ seq: e.seq, row: e })), cursor, limit);
  }
  async listAgentActions(agentId: string, cursor: string | null, limit: number) {
    return pageDesc(this.actions.filter((a) => a.row.agentId === agentId), cursor, limit);
  }
  async listReceipts(cursor: string | null, limit: number) {
    return pageDesc(this.receipts, cursor, limit);
  }
  async listRewards(cursor: string | null, limit: number) {
    return pageDesc(this.rewards, cursor, limit);
  }

  async createChallenge(c: ChallengeRecord) {
    this.challenges.set(c.nonce, { ...c, used: false });
  }
  async consumeChallenge(nonce: string, wallet: string, now: Date) {
    const c = this.challenges.get(nonce);
    if (!c || c.used || c.wallet !== wallet || new Date(c.expiresAt) <= now) return null;
    c.used = true;
    return { nonce: c.nonce, wallet: c.wallet, message: c.message, expiresAt: c.expiresAt };
  }
  async createSession(s: SessionRecord) {
    this.sessions.set(s.tokenHash, s);
  }
  async revokeSession(tokenHash:string) { this.sessions.delete(tokenHash); }
  async pruneExpiredAuth(cutoff: Date, limit: number) {
    const sweep = <T extends { expiresAt: string }>(m: Map<string, T>) => {
      let n = 0;
      for (const [k, v] of m) if (n < limit && new Date(v.expiresAt) < cutoff) { m.delete(k); n++; }
      return n;
    };
    return { challenges: sweep(this.challenges), sessions: sweep(this.sessions) };
  }
  async getSession(tokenHash: string, now: Date) {
    const s = this.sessions.get(tokenHash);
    return s && new Date(s.expiresAt) > now ? s : null;
  }

  async getIdempotent(key: string, wallet: string, route: string) {
    return this.idem.get(`${key}|${wallet}|${route}`) ?? null;
  }
  async saveIdempotent(key: string, wallet: string, route: string, rec: IdempotencyRecord) {
    const k = `${key}|${wallet}|${route}`;
    if (!this.idem.has(k)) this.idem.set(k, clone(rec));
  }

  async createLaunch(l: TokenLaunch) {
    if (this.launches.has(l.id) || [...this.launches.values()].some((r) => r.launch.mint === l.mint)) throw new ConflictError("launch exists");
    this.launches.set(l.id, { launch: clone(l), version: 0 });
  }
  async getLaunch(id: string) {
    const r = this.launches.get(id);
    return r ? clone(r) : null;
  }
  async findLaunchBySignature(signature: string) {
    for (const r of this.launches.values()) if (r.launch.signature === signature) return clone(r.launch);
    return null;
  }
  async updateLaunch(l: TokenLaunch, expectedVersion: number) {
    const cur = this.launches.get(l.id);
    if (!cur || cur.version !== expectedVersion) throw new ConflictError("stale launch version");
    if (l.signature) for (const r of this.launches.values()) if (r.launch.id !== l.id && r.launch.signature === l.signature) throw new ConflictError("signature bound to another launch");
    this.launches.set(l.id, { launch: clone(l), version: expectedVersion + 1 });
  }
  async confirmLaunch(l: TokenLaunch, expectedVersion: number, community: Community, entries: TreasuryEntry[], event: NewEvent) {
    if (this.communities.some((c) => c.row.mint === community.mint || c.row.launchId === community.launchId)) throw new ConflictError("community already registered");
    await this.updateLaunch(l, expectedVersion);
    this.communities.push({ seq: ++this.seq, row: clone(community) });
    await this.appendTreasuryEntries(entries);
    await this.appendSimOutputs({ events: [event], actions: [], receipts: [], rewards: [] });
  }

  async getCommunity(id: string) {
    const c = this.communities.find((c) => c.row.id === id);
    return c ? clone(c.row) : null;
  }
  async getCommunityByMint(mint: string) {
    const c = this.communities.find((c) => c.row.mint === mint);
    return c ? clone(c.row) : null;
  }
  async listCommunities(cursor: string | null, limit: number) {
    return pageDesc(this.communities, cursor, limit);
  }
  async allCommunities() {
    return this.communities.map((c) => clone(c.row));
  }

  async appendTreasuryEntries(entries: TreasuryEntry[]) {
    const inserted: TreasuryEntry[] = [];
    for (const input of entries) {
      const e=nextTreasuryEntry(input,this.treasury);if(!e)continue;
      if (e.stream === "launch_fee" && e.account !== "platform") throw new Error("launch fees may only be credited to the platform treasury");
      const k = treasuryKey(e);
      if (this.treasuryKeys.has(k)) continue;
      this.treasuryKeys.add(k);
      const row = { ...clone(e), seq: ++this.seq };
      this.treasury.push(row);
      inserted.push(row);
    }
    return inserted;
  }
  async listTreasuryEntries(cursor: string | null, limit: number) {
    return pageDesc(this.treasury.map((e) => ({ seq: e.seq, row: e })), cursor, limit);
  }
  async allTreasuryEntries() {
    return this.treasury.map(clone);
  }
}
