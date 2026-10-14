import { AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS } from "@agentic-economy/shared";
import { sharingConfigPda } from "../chain/pump.js";
import type { ChainGateway } from "../chain/types.js";
import type { CityRuntime, Logger } from "../runtime.js";
import type { Store } from "../store/types.js";
import type { TreasuryService } from "./treasury.js";

/**
 * Polls the agent-rewards and platform treasuries for new transactions and ingests Pump
 * creator-fee distributions into the append-only ledger, then re-checks pending entries for
 * finality/reversal. Every step is idempotent, so restarts (which reset the in-memory cursors)
 * simply re-read recent history without double-counting.
 */
export class TreasuryIndexer {
  private cursors = new Map<string, string | null>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly chain: ChainGateway,
    private readonly store: Store,
    private readonly treasury: TreasuryService,
    private readonly runtime: CityRuntime,
    /** [agentRewardsTreasury, platformTreasury] */
    private readonly addresses: string[],
    private readonly log: Logger,
  ) {}

  async runOnce(): Promise<number> {
    let inserted = 0;
    const communities = await this.store.allCommunities();
    for (const address of this.addresses) {
      const sigs = await this.chain.listSignaturesForAddress(address, this.cursors.get(address) ?? null, 100);
      if (sigs.length) this.cursors.set(address, sigs[0]!);
      for (const sig of sigs.reverse()) {
        const tx = await this.chain.getTransaction(sig);
        if (!tx) continue;
        const res = await this.treasury.ingestCreatorFeeDistribution(tx, communities);
        for (const e of res.inserted) this.runtime.publish("treasury.updated", this.runtime.engine.tick, { entry: e });
        inserted += res.inserted.length;
      }
    }
    for (const e of await this.treasury.reconcilePending(this.chain)) {
      this.runtime.publish("treasury.updated", this.runtime.engine.tick, { entry: e });
      inserted += 1;
    }
    return inserted;
  }

  /**
   * Detect fee-routing drift on registered communities (e.g. a Pump.fun community takeover changing the
   * sharing config or converting the coin to holder rewards). Returns the community ids that drifted.
   */
  async checkRoutingDrift(): Promise<string[]> {
    const drifted: string[] = [];
    for (const c of await this.store.allCommunities()) {
      const r = await this.chain.getFeeRoutingState(c.mint);
      const sc = r.sharingConfig;
      const pda = sharingConfigPda(c.mint);
      const shares = new Map(sc?.shareholders.map((h) => [h.address, h.shareBps]) ?? []);
      const ok =
        sc !== null &&
        sc.adminRevoked &&
        sc.status === "Active" &&
        sc.shareholders.length === 2 &&
        shares.get(this.addresses[0]!) === AGENT_TREASURY_CREATOR_FEE_BPS &&
        shares.get(this.addresses[1]!) === PLATFORM_TREASURY_CREATOR_FEE_BPS &&
        r.bondingCurveCreator === pda;
      if (ok) continue;
      drifted.push(c.id);
      this.log.warn({ communityId: c.id, mint: c.mint }, "fee routing drift detected");
      this.runtime.publish("system.notice", this.runtime.engine.tick, {
        level: "incident",
        code: "fee_routing_drift",
        message: `Creator-fee routing for ${c.symbol} (${c.mint}) no longer matches the locked 60/40 configuration.`,
      });
    }
    return drifted;
  }

  start(intervalMs: number) {
    let runs = 0;
    this.timer = setInterval(() => {
      this.runOnce().catch((err) => this.log.error({ err }, "treasury indexer failed"));
      if (runs++ % 10 === 0) this.checkRoutingDrift().catch((err) => this.log.error({ err }, "routing drift check failed"));
    }, intervalMs);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
