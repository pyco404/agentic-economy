import { PUMP_TOKEN_DECIMALS, type AgentStrategy, type Community, type CreateAgentRequest, type HolderEligibility, type PatchAgentRequest } from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import type { ChainGateway } from "../chain/types.js";
import type { CommandBus, StateReader } from "../roles/read-model.js";
import { DEFAULT_STRATEGY } from "../sim/engine.js";
import type { SimState } from "../sim/types.js";
import { toAgent } from "../sim/view.js";
import type { Store } from "../store/types.js";
import { AppError } from "../util/errors.js";
import { newId } from "../util/ids.js";

const BRAND_COLORS = ["#c98b6b", "#7a9e7e", "#6b8fc9", "#b58db6", "#d4a95a", "#5fa8a0", "#c96b7e", "#8a8fc9"];

/** Deterministic HQ branding derived from the mint. */
export function communityBranding(mint: string) {
  let h = 0;
  for (const ch of mint) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { primary: BRAND_COLORS[h % BRAND_COLORS.length]!, accent: BRAND_COLORS[(h >>> 8) % BRAND_COLORS.length]! };
}

/** Immutable registry record + live stats from simulation state. Prominence = verified useful work, never volume. */
export function decorateCommunity(c: Community, s: SimState): Community {
  const agents = s.agentOrder.map((id) => s.agents[id]!).filter((a) => a.communityId === c.id);
  return {
    ...c,
    headquartersBuildingId: s.communities[c.id]?.hqBuildingId ?? null,
    stats: {
      agents: agents.length,
      activeAgents: agents.filter((a) => a.status === "active").length,
      verifiedTasks: agents.reduce((n, a) => n + a.verifiedTasks, 0),
      prominence: agents.reduce((n, a) => n + a.totalPoints, 0),
    },
  };
}

export class CommunityService {
  constructor(
    private readonly store: Store,
    private readonly reader: StateReader,
  ) {}

  decorate(c: Community): Community {
    return decorateCommunity(c, this.reader.state);
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

/**
 * Agent lifecycle: holder-gated activation, owner-only updates. Changes are durable commands applied by the
 * simulation leader (never direct engine calls). Agents never get wallet signing authority.
 */
export class AgentService {
  constructor(
    private readonly reader: StateReader,
    private readonly bus: CommandBus,
    private readonly eligibility: EligibilityService,
    private readonly config: AppConfig,
  ) {}

  get(id: string) {
    const s = this.reader.state;
    const a = s.agents[id];
    if (!a) throw new AppError("not_found", `agent ${id} not found`);
    return toAgent(s, a);
  }

  private strategy(base: AgentStrategy, patch: Partial<AgentStrategy> | undefined): AgentStrategy {
    const next = { ...base, ...(patch ?? {}) };
    if (next.homeBuildingId && !this.reader.state.buildings[next.homeBuildingId]) throw new AppError("bad_request", "homeBuildingId does not exist");
    return next;
  }

  /** `requestKey` (wallet-scoped Idempotency-Key) makes retries return the same agent instead of creating another. */
  async create(wallet: string, req: CreateAgentRequest, requestKey: string | null = null) {
    // Fresh chain read on activation: a cached "eligible" must not outlive a sold position.
    const elig = await this.eligibility.check(wallet, req.communityId, { fresh: true });
    if (!elig.eligible)
      throw new AppError("not_eligible", `wallet holds ${elig.balance} base units; ${elig.threshold} required to activate an agent for this community`, elig);
    const dedupeKey = requestKey ? `agent.create:${wallet}:${requestKey}` : null;
    const s = this.reader.state;
    const existing = s.agentOrder.filter((id) => s.agents[id]!.ownerWallet === wallet && s.agents[id]!.communityId === req.communityId).length;
    const cap = this.config.eligibility.maxAgentsPerWalletPerCommunity;
    const command = {
      type: "agent.create" as const,
      agentId: newId("agt"),
      ownerWallet: wallet,
      communityId: req.communityId,
      name: req.name,
      profession: req.profession,
      strategy: this.strategy(DEFAULT_STRATEGY, req.strategy),
    };
    // Existing agents come from the read model; queued-but-unapplied creates are counted atomically at enqueue.
    // A retry with the same key returns the original command before the cap is evaluated.
    const queued = await this.bus.enqueue(command, dedupeKey, { wallet, communityId: req.communityId, maxPending: Math.max(0, cap - existing) });
    if (!queued) throw new AppError("forbidden", `agent capacity reached: at most ${cap} agents per wallet per community (including queued activations)`);
    const agentId = queued.command.type === "agent.create" ? queued.command.agentId : command.agentId;
    await this.bus.awaitApplied(queued.id);
    return this.get(agentId);
  }

  async update(wallet: string, id: string, req: PatchAgentRequest, requestKey: string | null = null) {
    const a = this.reader.state.agents[id];
    if (!a) throw new AppError("not_found", `agent ${id} not found`);
    if (a.ownerWallet !== wallet) throw new AppError("forbidden", "only the agent's owner wallet can change it");
    if (req.strategy) this.strategy(a.strategy, req.strategy);
    await this.bus.submit({ type: "agent.update", agentId: id, status: req.status, strategy: req.strategy }, requestKey ? `agent.update:${wallet}:${requestKey}` : null);
    return this.get(id);
  }
}
