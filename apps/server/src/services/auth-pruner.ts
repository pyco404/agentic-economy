import type { AppConfig } from "../config.js";
import type { Store } from "../store/types.js";
import type { Logger } from "../runtime.js";

export interface AuthPruneResult { challenges: number; sessions: number; batches: number; complete: boolean }

/**
 * Removes sign-in challenges and sessions that expired (or sessions revoked) more than the grace period ago.
 * Only those two tables are touched: wallet identities, drafts, activations, launches and financial evidence live
 * elsewhere and nothing references these rows. Each batch is one short statement that skips locked rows, a run is
 * capped at maxBatches, and repeated or concurrent runs are idempotent. The grace period keeps rows near their
 * expiry untouched, so a sign-in in flight is never affected (expired rows are already rejected by every reader).
 */
export class AuthPruner {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<AuthPruneResult> | null = null;

  constructor(
    private readonly store: Store,
    private readonly config: AppConfig["auth"]["prune"],
    private readonly log?: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  runOnce(): Promise<AuthPruneResult> {
    // One run at a time per process; other replicas are safe through SKIP LOCKED.
    this.running ??= this.sweep().finally(() => { this.running = null; });
    return this.running;
  }

  private async sweep(): Promise<AuthPruneResult> {
    const cutoff = new Date(this.now().getTime() - this.config.graceSeconds * 1000);
    const total = { challenges: 0, sessions: 0, batches: 0, complete: false };
    while (total.batches < this.config.maxBatches) {
      const r = await this.store.pruneExpiredAuth(cutoff, this.config.batch);
      total.batches++; total.challenges += r.challenges; total.sessions += r.sessions;
      if (r.challenges < this.config.batch && r.sessions < this.config.batch) { total.complete = true; break; }
    }
    if (total.challenges || total.sessions) this.log?.info({ ...total, cutoff: cutoff.toISOString() }, "pruned expired auth rows");
    return total;
  }

  start() {
    if (this.timer) return;
    const tick = () => void this.runOnce().catch((e) => this.log?.warn({ err: (e as Error).message }, "auth prune failed; retrying next interval"));
    this.timer = setInterval(tick, this.config.intervalSeconds * 1000);
    this.timer.unref();
    tick();
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.running?.catch(() => undefined);
  }
}
