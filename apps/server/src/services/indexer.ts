import { AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS } from "@agentic-economy/shared";
import { PUMP_IX, sharingConfigPda } from "../chain/pump.js";
import type { ChainGateway } from "../chain/types.js";
import type { Coordinator, Lease } from "../coord/types.js";
import { publishDurable } from "../roles/stream.js";
import type { Logger } from "../roles/sim-worker.js";
import type { Store } from "../store/types.js";
import type { TreasuryService } from "./treasury.js";

/**
 * Polls the agent-rewards and platform treasuries for new transactions and ingests Pump creator-fee
 * distributions into the append-only ledger, then re-checks pending entries for finality/reversal.
 *
 * Double counting is impossible by construction: ledger rows are unique on
 * (signature, instruction, account, stream, finality) and stream events are keyed by ledger entry id.
 * The lease only avoids wasted RPC work; restarts (which reset in-memory cursors) simply re-read history.
 */
export class TreasuryIndexer {
  private cursors = new Map<string, string | null>();
  private scans = new Map<string,{head:string|null;before?:string;until:string|null}>();

  constructor(
    private readonly chain: ChainGateway,
    private readonly store: Store,
    private readonly treasury: TreasuryService,
    private readonly coord: Coordinator,
    /** [agentRewardsTreasury, platformTreasury] */
    private readonly addresses: string[],
    private readonly log: Logger,
  ) {}

  private publish(entries: Awaited<ReturnType<Store["appendTreasuryEntries"]>>) {
    return Promise.all(entries.map((e) => publishDurable(this.coord, `treasury:${e.id}`, "treasury.updated", 0, { entry: e })));
  }

  async runOnce(heartbeat:()=>Promise<void>=async()=>{}): Promise<number> {
    let inserted = 0;
    const communities = await this.store.allCommunities();
    for (const address of this.addresses) {
      let scan=this.scans.get(address);
      if(!scan){scan={head:null,until:this.cursors.get(address)??null};this.scans.set(address,scan);}
      // Bound work per iteration without skipping a backlog larger than one RPC page.
      // Advance a page only after every available receipt was processed successfully.
      for(let page=0;page<10;page++){
        const sigs=await this.chain.listSignaturesForAddress(address,scan.until,100,scan.before);
        if(sigs.length&&!scan.head)scan.head=sigs[0]!;
        for(const [index,sig] of [...sigs].reverse().entries()){
          if(index%10===0)await heartbeat();
          const tx=await this.chain.getTransaction(sig);
          if(!tx)throw new Error(`Treasury transaction unavailable; cursor retained: ${sig}`);
          const res=await this.treasury.ingestCreatorFeeDistribution(tx,communities);
          if(!res.accepted&&tx.instructions.some(i=>i.discriminatorHex===PUMP_IX.distributeCreatorFeesV2))this.log.warn({signature:sig,reason:res.reason},'creator-fee evidence not credited');
          await this.publish(res.inserted);inserted+=res.inserted.length;
        }
        if(sigs.length<100){if(scan.head)this.cursors.set(address,scan.head);this.scans.delete(address);break;}
        scan.before=sigs.at(-1)!;
      }
    }
    const reconciled = await this.treasury.reconcilePending(this.chain);
    await this.publish(reconciled);
    return inserted + reconciled.length;
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
      const shares = new Map(sc?.shareholders.map((h) => [h.address, h.shareBps]) ?? []);
      const ok =
        sc !== null &&
        sc.adminRevoked &&
        sc.status === "Active" &&
        sc.shareholders.length === 2 &&
        shares.get(this.addresses[0]!) === AGENT_TREASURY_CREATOR_FEE_BPS &&
        shares.get(this.addresses[1]!) === PLATFORM_TREASURY_CREATOR_FEE_BPS &&
        r.bondingCurveCreator === sharingConfigPda(c.mint);
      if (ok) continue;
      drifted.push(c.id);
      this.log.warn({ communityId: c.id, mint: c.mint }, "fee routing drift detected");
      await publishDurable(this.coord, `drift:${c.id}:${new Date().toISOString().slice(0, 13)}`, "system.notice", 0, {
        level: "incident",
        code: "fee_routing_drift",
        message: `Creator-fee routing for ${c.symbol} (${c.mint}) no longer matches the locked 60/40 configuration.`,
      });
    }
    return drifted;
  }
}

/** Singleton loop around TreasuryIndexer: only the holder of the `indexer` lease does work. */
export class IndexerWorker {
  private lease: Lease | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private runs = 0;
  readonly metrics = { runs: 0, errors: 0, inserted: 0, acquisitions: 0, driftChecks: 0, lastSuccess:0, consecutiveFailures:0 };

  constructor(
    private readonly indexer: TreasuryIndexer,
    private readonly coord: Coordinator,
    private readonly log: Logger,
    readonly holder: string,
  ) {}

  get isActive() {
    return this.lease !== null && !this.lease.lost;
  }

  /** One iteration: acquire/verify the lease, then index. Returns false if another instance holds the lease. */
  async runOnce(): Promise<boolean> {
    if (this.running) return this.isActive;
    this.running = true;
    try {
      if (!this.isActive) {
        this.lease = await this.coord.tryAcquireLease("indexer", this.holder);
        if (!this.lease) return false;
        this.metrics.acquisitions += 1;
        this.log.info({ epoch: this.lease.epoch }, "acquired indexer lease");
      }
      await this.lease!.heartbeat();
      this.metrics.inserted += await this.indexer.runOnce(()=>this.lease!.heartbeat());
      if (this.runs++ % 10 === 0) {
        this.metrics.driftChecks += 1;
        await this.indexer.checkRoutingDrift();
      }
      this.metrics.runs += 1;this.metrics.lastSuccess=Date.now();this.metrics.consecutiveFailures=0;
      return true;
    } catch (e) {
      this.metrics.errors += 1;this.metrics.consecutiveFailures++;
      this.log.error({ err: String(e) }, "indexer iteration failed");
      if (this.lease?.lost) this.lease = null;
      return this.isActive;
    } finally {
      this.running = false;
    }
  }

  start(intervalMs: number) {
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.lease?.release().catch(() => undefined);
    this.lease = null;
  }
}
