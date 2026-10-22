import type { AppConfig } from '../config.js';
import type { Coordinator } from '../coord/types.js';
import type { Logger } from '../runtime.js';
import type { AecoSnapshot, SimState } from '../sim/types.js';
import { OFFICIAL_TREASURIES, type WorldStats, type Community, type TokenLaunch } from '@agentic-economy/shared';

/** Cluster-wide discovery lease; the existing command journal is the transactional outbox.
 * Entire snapshots commit in a fenced simulation tick, so interruption never exposes half a population. */
export class CommonAgentIndexer {
  private stopping = false;
  private timer: NodeJS.Timeout | null = null;
  private job: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private hintController: AbortController | null = null;
  private stopHints: (() => void) | null = null;
  private hintTimer: NodeJS.Timeout | null = null;
  private lastAttempt = 0;
  private lastPopulation = 0;
  constructor(private coord: Coordinator, private read: (signal: AbortSignal) => Promise<AecoSnapshot>, private log: Logger, private holder: string, private watch?: (hint: () => void, signal: AbortSignal) => (() => void)) {}
  runOnce(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.job) return this.job;
    this.job = this.run().catch(() => { this.log.warn({}, 'Common Agent coordinator unavailable; preserving population'); }).finally(() => { this.job = null; });
    return this.job;
  }
  private async run() {
    const lease = await this.coord.tryAcquireLease('aeco-common-agents', this.holder);
    if (!lease) return;
    if (this.stopping) { await lease.release(); return; }
    this.lastAttempt = Date.now();
    const controller = this.controller = new AbortController();
    const heartbeat = setInterval(() => { void lease.heartbeat().catch(() => controller.abort()); }, 5000);
    try {
      await lease.heartbeat();
      const snapshot = await this.read(controller.signal);
      await lease.heartbeat();
      if (lease.lost || controller.signal.aborted) return;
      this.lastPopulation = snapshot.holders.length;
      await this.coord.enqueueCommand({ type: 'aeco.reconcile', ...snapshot }, `aeco:${snapshot.network}:${snapshot.mint}:${snapshot.slot}`);
      this.log.info({ slot: snapshot.slot, holders: snapshot.holders.length }, 'Common Agent observation queued for reconciliation');
    } catch {
      // Never log upstream exception URLs/keys or replace failed reads with an empty snapshot.
      this.log.warn({}, 'Common Agent indexing unavailable; preserving previous population');
    } finally {
      clearInterval(heartbeat);
      await lease.release().catch(() => undefined);
      this.controller = null;
    }
  }
  start(intervalMs: number) {
    if (this.timer) return;
    this.stopping = false;
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.hintController = new AbortController();
    this.stopHints = this.watch?.(() => {
      if (this.hintTimer) return;
      // Reserve capacity for other read-only monitors on the Free plan. Large populations
      // reconcile less often; notifications never bypass the shared provider budget.
      const minimum = Math.max(60_000, (Math.ceil(this.lastPopulation / 100) + 14) * 86_400_000 / 8000);
      this.hintTimer = setTimeout(() => { this.hintTimer = null; void this.runOnce(); }, Math.max(1000, this.lastAttempt + minimum - Date.now()));
    }, this.hintController.signal) ?? null;
    void this.runOnce();
  }
  async stop() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer); this.timer = null;
    if (this.hintTimer) clearTimeout(this.hintTimer); this.hintTimer = null;
    this.hintController?.abort(); this.stopHints?.(); this.stopHints = null;
    this.controller?.abort(); await this.job;
  }
}

export function commonPopulation(config: AppConfig, s: SimState, now = Date.now()): NonNullable<WorldStats['aecoPopulation']> {
  const indexed = s.aecoPopulation;
  const enabled = config.aecoCommonAgents.enabled;
  const matching = indexed?.mint === config.aecoCommonAgents.mint && indexed?.network === config.solana.cluster;
  const active = matching ? s.agentOrder.filter(id => { const a = s.agents[id]!; return a.identity.kind === 'aeco_observed' && a.status === 'active'; }).length : 0;
  const current = matching && indexed && active === indexed.holders && now - Date.parse(indexed.checkedAt) <= config.aecoCommonAgents.intervalMs * 2;
  return { status: !enabled ? 'disabled' : !matching ? 'syncing' : current ? 'current' : 'stale',
    mint: config.aecoCommonAgents.mint, network: config.solana.cluster === 'localnet' ? null : config.solana.cluster,
    holders: matching ? indexed!.holders : 0, commonAgents: active,
    indexedSlot: matching ? indexed!.slot : null, checkedAt: matching ? indexed!.checkedAt : null };
}

/** Read-only indexing is bound to the owner's verified native platform launch, not arbitrary mints. */
export function isOfficialAecoLaunch(community: Pick<Community, 'id' | 'mint' | 'creatorWallet' | 'provenance'> | null, launch: Pick<TokenLaunch, 'status' | 'mode' | 'communityId' | 'mint' | 'launcherWallet'> | null | undefined): boolean {
  return !!community && community.creatorWallet === OFFICIAL_TREASURIES.aecoDeployer && community.provenance?.network === 'mainnet-beta' && community.provenance.quoteAsset === 'SOL' && !!launch && launch.status === 'confirmed' && launch.mode === 'production' && launch.communityId === community.id && launch.mint === community.mint && launch.launcherWallet === OFFICIAL_TREASURIES.aecoDeployer;
}
