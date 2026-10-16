import { gunzipSync } from "node:zlib";
import type { ServerEvent, ServerEventOf, ServerEventType } from "@agentic-economy/shared";
import type { Coordinator, EnqueueResult, IdentityEnqueueResult, IdentityReservation, StreamRecord } from "../coord/types.js";
import { upgradeState, type SimStateV1 } from "../sim/identity.js";
import type { SimCommand, SimState } from "../sim/types.js";
import { AppError } from "../util/errors.js";
import type { Logger, SimWorker } from "./sim-worker.js";
import { publishDurable } from "./stream.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read model for API processes. On the simulation leader (ROLE=all) it reads the live engine;
 * everywhere else it follows the leader's published, gzipped state view (refreshed on NOTIFY, with
 * a polling fallback). It never runs the simulation itself.
 */
export class StateReader {
  private cache: { tick: number; state: SimState } | null = null;
  private refreshing: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private waiters: Array<() => void> = [];

  constructor(
    private readonly coord: Coordinator,
    private readonly sim: SimWorker | null,
    private readonly log: Logger,
  ) {}

  get available(): boolean {
    return Boolean(this.sim?.engine) || this.cache !== null;
  }

  /** Current authoritative-or-followed state. Throws 503 if no state has been published yet. */
  get state(): SimState {
    const live = this.sim?.engine?.state;
    if (live) return live;
    if (this.cache) return this.cache.state;
    throw new AppError("unavailable", "simulation state is not available yet (no simulation leader has published state)");
  }

  get tick(): number {
    return this.sim?.engine?.tick ?? this.cache?.tick ?? 0;
  }

  /** Reload the published view if it is newer than what we hold. */
  refresh(): Promise<void> {
    this.refreshing ??= (async () => {
      try {
        const v = await this.coord.loadView();
        if (v && (!this.cache || v.tick > this.cache.tick)) {
          this.cache = { tick: v.tick, state: upgradeState(JSON.parse(gunzipSync(v.stateGz).toString("utf8")) as SimState | SimStateV1) };
          this.wake();
        }
      } catch (e) {
        this.log.warn({ err: String(e) }, "state view refresh failed");
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  wake() {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }

  async start(pollMs = 5_000) {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), pollMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Resolve once the readable state has reached `tick` (or throw 503 after `timeoutMs`). */
  async waitForTick(tick: number, timeoutMs: number) {
    const deadline = Date.now() + timeoutMs;
    while (this.tick < tick) {
      if (Date.now() > deadline) throw new AppError("unavailable", `state view has not reached tick ${tick} yet`);
      if (!this.sim?.engine) await this.refresh();
      if (this.tick >= tick) return;
      await Promise.race([new Promise<void>((r) => this.waiters.push(r)), sleep(200)]);
    }
  }
}

/**
 * Durable WebSocket event stream for API processes. Records come from Postgres (stream_events) after a
 * NOTIFY hint, so nothing is lost if a notification is missed, the listener reconnects, or the API restarts:
 * clients resume from their last seq against the durable table.
 */
export class EventHub {
  private lastSeq = 0;
  private listeners = new Set<(e: ServerEvent) => void>();
  private draining: Promise<void> | null = null;
  private again = false;
  private unlisten: (() => Promise<void>) | null = null;
  /** Expands stored markers (e.g. chunk updates carry only coordinates) into full events. */
  expand: (e: ServerEvent) => ServerEvent | null = (e) => e;

  constructor(
    private readonly coord: Coordinator,
    private readonly log: Logger,
  ) {}

  get currentSeq() {
    return this.lastSeq;
  }

  async start() {
    this.lastSeq = (await this.coord.streamBounds()).latest;
    this.unlisten = await this.coord.listen({
      onStream: () => void this.drain(),
      onReconnect: () => void this.drain(),
    });
  }

  async stop() {
    await this.unlisten?.();
  }

  subscribe(l: (e: ServerEvent) => void) {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private toEvent(r: StreamRecord): ServerEvent | null {
    try {
      return this.expand({ ...(JSON.parse(r.payload) as Omit<ServerEvent, "seq">), seq: r.seq } as ServerEvent);
    } catch (e) {
      this.log.warn({ err: String(e), seq: r.seq }, "dropping unreadable stream record");
      return null;
    }
  }

  /** Read everything after lastSeq from the durable stream and fan it out (coalesces concurrent calls). */
  drain(): Promise<void> {
    if (this.draining) {
      this.again = true;
      return this.draining;
    }
    this.draining = (async () => {
      try {
        do {
          this.again = false;
          for (;;) {
            const batch = await this.coord.readStream(this.lastSeq, 500);
            for (const r of batch) {
              this.lastSeq = r.seq;
              const e = this.toEvent(r);
              if (e) for (const l of this.listeners) l(e);
            }
            if (batch.length < 500) break;
          }
        } while (this.again);
      } catch (e) {
        this.log.warn({ err: String(e) }, "stream drain failed; will retry on next notification");
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  /**
   * Events after `lastSeq` for a resuming client: the replay list, "gap" if they were pruned (client needs a
   * snapshot) or "ahead" if the client saw a seq we don't have (e.g. database reset).
   */
  async since(lastSeq: number, max = 2_000): Promise<ServerEvent[] | "gap" | "ahead"> {
    const { oldest, latest } = await this.coord.streamBounds();
    if (lastSeq > latest) return "ahead";
    if (lastSeq === latest) return [];
    if (oldest === null || oldest > lastSeq + 1) return "gap";
    const rows = await this.coord.readStream(lastSeq, max + 1);
    if (rows.length > max) return "gap";
    return rows.map((r) => this.toEvent(r)).filter((e): e is ServerEvent => e !== null);
  }

  publish<T extends ServerEventType>(key: string, type: T, tick: number, data: ServerEventOf<T>["data"]) {
    return publishDurable(this.coord, key, type, tick, data);
  }
}

/**
 * API → simulation command path. Commands are written to the durable inbox (with a dedupe key so client
 * retries never double-apply); the leader applies them on its next tick and records them in the
 * append-only command log. Callers wait until the change is visible in their read model.
 */
export class CommandBus {
  private waiters = new Map<number, Array<() => void>>();
  private unlisten: (() => Promise<void>) | null = null;

  constructor(
    private readonly coord: Coordinator,
    private readonly reader: StateReader,
    private readonly sim: SimWorker | null,
  ) {}

  async start() {
    this.unlisten = await this.coord.listen({
      onApplied: (ids) => {
        for (const id of ids) for (const w of this.waiters.get(id) ?? []) w();
      },
      onView: () => void this.reader.refresh(),
    });
  }

  async stop() {
    await this.unlisten?.();
  }

  enqueue(command: SimCommand, dedupeKey: string | null): Promise<EnqueueResult> {
    return this.coord.enqueueCommand(command, dedupeKey);
  }

  /** Reserve an agent identity and queue its create command atomically (see Coordinator.enqueueIdentityCommand). */
  enqueueIdentity(dedupeKey: string, reservation: IdentityReservation, build: (displayName: string) => SimCommand): Promise<IdentityEnqueueResult> {
    return this.coord.enqueueIdentityCommand(dedupeKey, reservation, build);
  }

  activationByWallet(wallet: string) {
    return this.coord.activationByWallet(wallet);
  }

  activationByAgent(agentId: string) {
    return this.coord.activationByAgent(agentId);
  }

  /** Wait until inbox command `id` is applied AND visible to this process's reads. */
  async awaitApplied(id: number, timeoutMs = 15_000): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const st = await this.coord.inboxStatus(id);
      if (st?.appliedTick !== null && st?.appliedTick !== undefined) {
        await this.reader.waitForTick(st.appliedTick + 1, Math.max(1, deadline - Date.now()));
        return st.appliedTick;
      }
      if (Date.now() > deadline)
        throw new AppError("unavailable", "the simulation has not applied this request yet; it is queued and will apply when the simulation is running. Retry with the same Idempotency-Key.", { inboxId: id });
      // A co-located simulation that isn't looping (tests, scripts) is driven directly.
      if (this.sim && !this.sim.looping) await this.sim.tickOnce();
      else
        await Promise.race([
          new Promise<void>((r) => this.waiters.set(id, [...(this.waiters.get(id) ?? []), r])),
          sleep(250),
        ]);
      this.waiters.delete(id);
    }
  }

  async submit(command: SimCommand, dedupeKey: string | null, timeoutMs?: number) {
    const r = (await this.enqueue(command, dedupeKey))!;
    const appliedTick = r.appliedTick ?? (await this.awaitApplied(r.id, timeoutMs));
    if (r.appliedTick !== null) await this.reader.waitForTick(r.appliedTick + 1, timeoutMs ?? 15_000);
    return { ...r, appliedTick };
  }
}
