import type { LoggedCommand, SimCommand } from "../sim/types.js";
import type { MemoryStore } from "../store/memory.js";
import {
  LeadershipLost,
  type CoordinationListener,
  type Coordinator,
  type EnqueueGuard,
  type EnqueueResult,
  type InboxRow,
  type Lease,
  type LeaderSession,
  type Recovery,
  type Snapshot,
  type StreamDraft,
  type StreamRecord,
  type TickCommit,
} from "./types.js";

interface InboxEntry {
  id: number;
  dedupeKey: string | null;
  command: SimCommand;
  appliedSeq: number | null;
  appliedTick: number | null;
}

/**
 * Single-process coordinator for demo mode and tests. Same semantics as the Postgres coordinator
 * (exclusive leadership with fencing epochs, durable-for-the-process command log and event stream),
 * plus test hooks to simulate leadership loss.
 */
export class MemoryCoordinator implements Coordinator {
  readonly kind = "memory" as const;
  private leader: MemoryLeaderSession | null = null;
  private epoch = 0;
  private lastTick = 0;
  private heartbeatAt: string | null = null;
  private holder: string | null = null;
  private snapshots: Snapshot[] = [];
  private log: LoggedCommand[] = [];
  private inbox: InboxEntry[] = [];
  private stream: Array<StreamRecord & { at: number }> = [];
  private streamKeys = new Set<string>();
  private streamSeq = 0;
  private view: { tick: number; epoch: number; stateGz: Buffer } | null = null;
  private listeners = new Set<CoordinationListener>();
  private leases = new Map<string, MemoryLease>();
  private leaseEpochs = new Map<string, number>();

  constructor(private readonly store: MemoryStore) {}

  async tryAcquireSimLeadership(holder: string): Promise<LeaderSession | null> {
    if (this.leader && !this.leader.lost) return null;
    this.epoch += 1;
    this.holder = holder;
    this.leader = new MemoryLeaderSession(this, this.epoch);
    return this.leader;
  }

  async tryAcquireLease(name: string, holder: string): Promise<Lease | null> {
    const cur = this.leases.get(name);
    if (cur && !cur.lost) return null;
    const epoch = (this.leaseEpochs.get(name) ?? 0) + 1;
    this.leaseEpochs.set(name, epoch);
    const lease = new MemoryLease(name, epoch, holder);
    this.leases.set(name, lease);
    return lease;
  }

  /** TEST HOOK: simulate the leader's database session dying. */
  killLeader(reason = "simulated connection loss") {
    this.leader?.markLost(reason);
  }

  /* ---------------- leader internals ---------------- */

  assertEpoch(epoch: number) {
    if (epoch !== this.epoch || !this.leader || this.leader.lost) throw new LeadershipLost(`fencing: epoch ${epoch} is no longer the leader`);
  }

  recovery(): Recovery {
    const snapshot = this.snapshots.reduce<Snapshot | null>((b, s) => (!b || s.tick > b.tick ? s : b), null);
    const from = snapshot?.tick ?? 0;
    return {
      snapshot,
      log: this.log.filter((c) => c.tick >= from).sort((a, b) => a.seq - b.seq).map((c) => structuredClone(c)),
      lastTick: this.lastTick,
      maxSeq: this.log.reduce((m, c) => Math.max(m, c.seq), -1),
    };
  }

  claim(limit: number): InboxRow[] {
    return this.inbox
      .filter((r) => r.appliedSeq === null)
      .slice(0, limit)
      .map((r) => ({ id: r.id, command: structuredClone(r.command) }));
  }

  async commit(epoch: number, c: TickCommit): Promise<number | null> {
    this.assertEpoch(epoch);
    // Validate before mutating anything (all-or-nothing, like the SQL transaction).
    for (const a of c.applied) if (this.log.some((l) => l.seq === a.logged.seq)) throw new Error(`command seq ${a.logged.seq} already logged`);
    for (const a of c.applied) {
      this.log.push(structuredClone(a.logged));
      const row = this.inbox.find((r) => r.id === a.inboxId);
      if (row) {
        row.appliedSeq = a.logged.seq;
        row.appliedTick = a.logged.tick;
      }
    }
    const inserted = await this.store.appendSimOutputs({ events: c.events, actions: c.actions, receipts: c.receipts, rewards: c.rewards });
    const written = this.insertStream(c.buildStream(inserted));
    if (c.snapshot) {
      this.snapshots = this.snapshots.filter((s) => s.tick !== c.snapshot!.tick);
      this.snapshots.push(c.snapshot);
      if (this.snapshots.length > 5) this.snapshots.shift();
    }
    if (c.pruneStreamOlderThan) {
      const cutoff = c.pruneStreamOlderThan.getTime();
      this.stream = this.stream.filter((r) => r.at >= cutoff);
    }
    this.lastTick = c.nextTick;
    this.heartbeatAt = new Date().toISOString();
    if (c.view) this.view = { tick: c.nextTick, epoch, stateGz: c.view };
    const applied = c.applied.map((a) => a.inboxId);
    queueMicrotask(() => {
      for (const l of this.listeners) {
        if (written.length) l.onStream?.(written[written.length - 1]!.seq);
        if (c.view) l.onView?.(c.nextTick);
        if (applied.length) l.onApplied?.(applied, c.nextTick - 1);
      }
    });
    return written.length ? written[written.length - 1]!.seq : null;
  }

  setView(epoch: number, tick: number, stateGz: Buffer) {
    this.assertEpoch(epoch);
    this.view = { tick, epoch, stateGz };
    queueMicrotask(() => {
      for (const l of this.listeners) l.onView?.(tick);
    });
  }

  release(epoch: number) {
    if (this.leader && this.leader.epoch === epoch) {
      this.leader.markLost("released");
      this.leader = null;
      this.holder = null;
    }
  }

  private insertStream(drafts: StreamDraft[]): StreamRecord[] {
    const out: StreamRecord[] = [];
    for (const d of drafts) {
      if (this.streamKeys.has(d.key)) continue;
      this.streamKeys.add(d.key);
      const rec: StreamRecord = { ...d, seq: ++this.streamSeq };
      this.stream.push({ ...rec, at: Date.now() });
      out.push(rec);
    }
    if (this.stream.length > 20_000) this.stream.splice(0, 5_000);
    return out;
  }

  /* ---------------- public API ---------------- */

  async enqueueCommand(command: SimCommand, dedupeKey: string | null, guard?: EnqueueGuard): Promise<EnqueueResult | null> {
    if (dedupeKey) {
      const existing = this.inbox.find((r) => r.dedupeKey === dedupeKey);
      if (existing) return { id: existing.id, command: structuredClone(existing.command), existing: true, appliedTick: existing.appliedTick };
    }
    if (guard && (await this.pendingAgentCreates(guard.wallet, guard.communityId)) >= guard.maxPending) return null;
    const row: InboxEntry = { id: this.inbox.length + 1, dedupeKey, command: structuredClone(command), appliedSeq: null, appliedTick: null };
    this.inbox.push(row);
    return { id: row.id, command: structuredClone(command), existing: false, appliedTick: null };
  }

  async inboxStatus(id: number) {
    const r = this.inbox.find((x) => x.id === id);
    return r ? { appliedTick: r.appliedTick } : null;
  }

  async pendingAgentCreates(wallet: string, communityId: string) {
    return this.inbox.filter((r) => r.appliedSeq === null && r.command.type === "agent.create" && r.command.ownerWallet === wallet && r.command.communityId === communityId).length;
  }

  async appendStream(drafts: StreamDraft[]) {
    const written = this.insertStream(drafts);
    if (written.length)
      queueMicrotask(() => {
        for (const l of this.listeners) l.onStream?.(written[written.length - 1]!.seq);
      });
    return written;
  }

  async readStream(afterSeq: number, limit: number) {
    return this.stream
      .filter((r) => r.seq > afterSeq)
      .slice(0, limit)
      .map(({ at: _at, ...r }) => r);
  }

  async streamBounds() {
    return { oldest: this.stream[0]?.seq ?? null, latest: this.streamSeq };
  }

  async loadView() {
    return this.view;
  }

  async simStatus() {
    return { epoch: this.epoch, holder: this.holder, heartbeatAt: this.heartbeatAt, lastTick: this.lastTick };
  }

  async listen(l: CoordinationListener) {
    this.listeners.add(l);
    return async () => {
      this.listeners.delete(l);
    };
  }

  async ping() {
    return true;
  }

  async close() {
    this.listeners.clear();
  }
}

class MemoryLeaderSession implements LeaderSession {
  private _lost = false;
  private callbacks: Array<(r: string) => void> = [];

  constructor(
    private readonly coord: MemoryCoordinator,
    readonly epoch: number,
  ) {}

  get lost() {
    return this._lost;
  }

  markLost(reason: string) {
    if (this._lost) return;
    this._lost = true;
    for (const cb of this.callbacks) cb(reason);
  }

  onLost(cb: (reason: string) => void) {
    this.callbacks.push(cb);
  }

  async loadRecovery() {
    this.coord.assertEpoch(this.epoch);
    return this.coord.recovery();
  }

  async claimInbox(limit: number) {
    this.coord.assertEpoch(this.epoch);
    return this.coord.claim(limit);
  }

  async commitTick(c: TickCommit) {
    return this.coord.commit(this.epoch, c);
  }

  async publishView(tick: number, stateGz: Buffer) {
    this.coord.setView(this.epoch, tick, stateGz);
  }

  async release() {
    this.coord.release(this.epoch);
  }
}

class MemoryLease implements Lease {
  lost = false;
  constructor(
    readonly name: string,
    readonly epoch: number,
    readonly holder: string,
  ) {}
  async heartbeat() {
    if (this.lost) throw new LeadershipLost(`lease ${this.name} lost`);
  }
  async release() {
    this.lost = true;
  }
}
