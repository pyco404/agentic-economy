import { PUMP_TOKEN_DECIMALS, type AgentStrategy, type Community, type CreateAgentRequest, type HolderEligibility, type PatchAgentRequest } from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import type { ChainGateway } from "../chain/types.js";
import type { CityRuntime } from "../runtime.js";
import { DEFAULT_STRATEGY } from "../sim/engine.js";
import { toAgent } from "../sim/view.js";
import type { Store } from "../store/types.js";
import { AppError } from "../util/errors.js";
import { newId } from "../util/ids.js";

/** Communities are read from the immutable registry and decorated with live stats from the simulation. */
export class CommunityService {
  constructor(
    private readonly store: Store,
    private readonly runtime: CityRuntime,
  ) {}

  decorate(c: Community): Community {
    const s = this.runtime.engine.state;
    const agents = s.agentOrder.map((id) => s.agents[id]!).filter((a) => a.communityId === c.id);
    const verified = agents.reduce((n, a) => n + a.verifiedTasks, 0);
    return {
      ...c,
      headquartersBuildingId: s.communities[c.id]?.hqBuildingId ?? null,
      stats: {
        agents: agents.length,
        activeAgents: agents.filter((a) => a.status === "active").length,
        verifiedTasks: verified,
        // Prominence = sustained useful service (verified points), never trading volume.
        prominence: agents.reduce((n, a) => n + a.totalPoints, 0),
      },
    };
  }

  async get(id: string): Promise<Community> {
    const c = await this.store.getCommunity(id);
    if (!c) throw new AppError("not_found", `community ${id} not found (only tokens launched through Agentic Economy exist here)`);
    return this.decorate(c);
  }
}

/**
 * Holder eligibility from trusted chain data (never client claims). Results are cached for
 * ELIGIBILITY_CACHE_SECONDS; after expiry the next check re-reads the chain.
 */
export class EligibilityService {
  private readonly cache = new Map<string, HolderEligibility>();

  constructor(
    private readonly chain: ChainGateway,
    private readonly communities: CommunityService,
    private readonly config: AppConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async check(wallet: string, communityId: string, opts: { fresh?: boolean } = {}): Promise<HolderEligibility> {
    const community = await this.communities.get(communityId);
    const key = `${wallet}|${community.mint}`;
    const cached = this.cache.get(key);
    const now = this.now();
    if (!opts.fresh && cached && new Date(cached.expiresAt) > now) return cached;
    const bal = await this.chain.getTokenBalance(wallet, community.mint);
    const threshold = this.config.eligibility.minBalanceRaw;
    const result: HolderEligibility = {
      wallet,
      communityId,
      mint: community.mint,
      eligible: bal.amount >= threshold,
      balance: bal.amount.toString(),
      threshold: threshold.toString(),
      decimals: bal.decimals ?? PUMP_TOKEN_DECIMALS,
      source: this.chain.source,
      slot: bal.slot,
      checkedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + this.config.eligibility.cacheSeconds * 1000).toISOString(),
    };
    this.cache.set(key, result);
    return result;
  }
}

/** Agent lifecycle: holder-gated activation, owner-only updates. Agents never get wallet signing authority. */
export class AgentService {
  constructor(
    private readonly runtime: CityRuntime,
    private readonly eligibility: EligibilityService,
    private readonly config: AppConfig,
  ) {}

  get(id: string) {
    const s = this.runtime.engine.state;
    const a = s.agents[id];
    if (!a) throw new AppError("not_found", `agent ${id} not found`);
    return toAgent(s, a);
  }

  private strategy(base: AgentStrategy, patch: Partial<AgentStrategy> | undefined): AgentStrategy {
    const next = { ...base, ...(patch ?? {}) };
    if (next.homeBuildingId && !this.runtime.engine.state.buildings[next.homeBuildingId]) throw new AppError("bad_request", "homeBuildingId does not exist");
    return next;
  }

  async create(wallet: string, req: CreateAgentRequest) {
    // Fresh chain read on activation: a cached "eligible" must not outlive a sold position.
    const elig = await this.eligibility.check(wallet, req.communityId, { fresh: true });
    if (!elig.eligible)
      throw new AppError("not_eligible", `wallet holds ${elig.balance} base units; ${elig.threshold} required to activate an agent for this community`, elig);
    const s = this.runtime.engine.state;
    const existing = s.agentOrder.filter((id) => s.agents[id]!.ownerWallet === wallet && s.agents[id]!.communityId === req.communityId).length;
    const cap = this.config.eligibility.maxAgentsPerWalletPerCommunity;
    if (existing + this.runtime.pendingAgentCreates(wallet, req.communityId) >= cap)
      throw new AppError("forbidden", `agent capacity reached: at most ${cap} agents per wallet per community`);
    const agentId = newId("agt");
    await this.runtime.submit({
      type: "agent.create",
      agentId,
      ownerWallet: wallet,
      communityId: req.communityId,
      name: req.name,
      profession: req.profession,
      strategy: this.strategy(DEFAULT_STRATEGY, req.strategy),
    });
    return this.get(agentId);
  }

  async update(wallet: string, id: string, req: PatchAgentRequest) {
    const a = this.runtime.engine.state.agents[id];
    if (!a) throw new AppError("not_found", `agent ${id} not found`);
    if (a.ownerWallet !== wallet) throw new AppError("forbidden", "only the agent's owner wallet can change it");
    if (req.strategy) this.strategy(a.strategy, req.strategy);
    await this.runtime.submit({ type: "agent.update", agentId: id, status: req.status, strategy: req.strategy });
    return this.get(id);
  }
}
