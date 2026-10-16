import {
  PUMP_TOKEN_DECIMALS,
  type ActivateAgentRequest,
  type Agent,
  type AgentActivation,
  type AgentStrategy,
  type Community,
  type CreateHouseAgentRequest,
  type HolderEligibility,
  type PatchAgentRequest,
} from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import type { ChainGateway } from "../chain/types.js";
import type { ActivationRecord } from "../coord/types.js";
import type { CommandBus, StateReader } from "../roles/read-model.js";
import { DEFAULT_STRATEGY } from "../sim/engine.js";
import { houseNameCandidates, walletNameCandidates } from "../sim/identity.js";
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
 * Agent lifecycle (contract 0.3.0). Creation reserves the identity and queues the create command in one
 * transaction (see Coordinator.enqueueIdentityCommand); the simulation leader applies it. Agents never
 * get wallet signing authority, and nothing here moves funds.
 */
export class AgentService {
  constructor(
    private readonly reader: StateReader,
    private readonly bus: CommandBus,
    private readonly store: Store,
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

  /**
   * Token-linked activation: only the verified wallet that launched the community's token through Agentic
   * Economy. One agent per mint and one per wallet (database-enforced). Holdings are never consulted, so
   * buying a token cannot activate anything. Demo mode only until real activation is approved.
   */
  async activate(wallet: string, req: ActivateAgentRequest, requestKey: string): Promise<{ activation: AgentActivation; agent: Agent }> {
    if (this.config.mode !== "demo") throw new AppError("feature_disabled", "token-linked agent activation is disabled outside demo mode until it is approved");
    const community = await this.store.getCommunity(req.communityId);
    if (!community) throw new AppError("not_found", `community ${req.communityId} not found (only tokens launched through Agentic Economy exist here)`);
    const launch = (await this.store.getLaunch(community.launchId))?.launch;
    // The mint comes from the confirmed platform launch record, never from the client.
    if (!launch || launch.status !== "confirmed" || launch.mode !== this.config.mode || launch.communityId !== community.id || launch.mint !== community.mint)
      throw new AppError("conflict", "this community's token launch is not a confirmed Agentic Economy launch in this mode");
    if (launch.launcherWallet !== wallet)
      throw new AppError("not_token_launcher", "only the wallet that launched this token through Agentic Economy can activate its agent");

    const agentId = newId("agt");
    const activationId = newId("act");
    const strategy = this.strategy(DEFAULT_STRATEGY, req.strategy);
    const r = await this.bus.enqueueIdentity(
      `agent.activate:${wallet}:${requestKey}`,
      {
        kind: "token_linked",
        agentId,
        nameCandidates: walletNameCandidates(wallet),
        activation: { id: activationId, agentId, communityId: community.id, launchId: launch.id, tokenMint: launch.mint, activatingWallet: wallet },
      },
      (displayName) => ({
        type: "agent.activate",
        agentId,
        activationId,
        communityId: community.id,
        launchId: launch.id,
        tokenMint: launch.mint,
        activatingWallet: wallet,
        displayName,
        profession: req.profession,
        strategy,
      }),
    );
    if (!r.ok) {
      if (r.reason === "wallet_taken" || r.reason === "mint_taken") throw activationConflict(r.reason, r.activation);
      throw new AppError("unavailable", "could not allocate a display name; retry with the same Idempotency-Key");
    }
    await this.bus.awaitApplied(r.enqueued.id);
    const done = r.activation && (await this.bus.activationByAgent(r.activation.agentId));
    if (!done) throw new AppError("internal", "activation row missing after reservation");
    return { activation: toContractActivation(done), agent: this.get(done.agentId) };
  }

  /** The caller's activation, looked up from the authenticated session wallet only. */
  async myActivation(wallet: string): Promise<{ activation: AgentActivation | null; agent: Agent | null }> {
    const a = await this.bus.activationByWallet(wallet);
    if (!a) return { activation: null, agent: null };
    return { activation: toContractActivation(a), agent: a.applied && this.reader.state.agents[a.agentId] ? this.get(a.agentId) : null };
  }

  /** DEMO ONLY: a house agent with a reserved synthetic name. The caller is recorded for quotas, never as owner. */
  async createHouse(wallet: string, req: CreateHouseAgentRequest, requestKey: string): Promise<Agent> {
    if (this.config.mode !== "demo") throw new AppError("feature_disabled", "house agent creation is only available in demo mode");
    if (!(await this.store.getCommunity(req.communityId))) throw new AppError("not_found", `community ${req.communityId} not found`);
    const agentId = newId("agt");
    const strategy = this.strategy(DEFAULT_STRATEGY, req.strategy);
    const r = await this.bus.enqueueIdentity(
      `agent.create_house:${wallet}:${requestKey}`,
      { kind: "house", agentId, requestedBy: wallet, maxPerRequester: this.config.houseAgents.perWallet, maxTotal: this.config.houseAgents.max, nameCandidates: houseNameCandidates() },
      (syntheticName) => ({ type: "agent.create_house", agentId, communityId: req.communityId, syntheticName, profession: req.profession, strategy }),
    );
    if (!r.ok) {
      if (r.reason === "quota_reached")
        throw new AppError("forbidden", `house agent limit reached (${this.config.houseAgents.perWallet} per signed-in wallet, ${this.config.houseAgents.max} in the city)`);
      throw new AppError("unavailable", "could not allocate a house name; retry with the same Idempotency-Key");
    }
    await this.bus.awaitApplied(r.enqueued.id);
    return this.get((r.enqueued.command as { agentId: string }).agentId);
  }

  /** Owner controls: activating wallet (token_linked) or recorded owner (legacy). House agents have no owner. */
  async update(wallet: string, id: string, req: PatchAgentRequest, requestKey: string | null = null) {
    const a = this.reader.state.agents[id];
    if (!a) throw new AppError("not_found", `agent ${id} not found`);
    if (a.ownerWallet === null) throw new AppError("forbidden", "house agents have no owner and cannot be changed by a wallet");
    if (a.ownerWallet !== wallet) throw new AppError("forbidden", "only the agent's owner wallet can change it");
    if (req.strategy) this.strategy(a.strategy, req.strategy);
    await this.bus.submit({ type: "agent.update", agentId: id, status: req.status, strategy: req.strategy }, requestKey ? `agent.update:${wallet}:${requestKey}` : null);
    return this.get(id);
  }
}

function toContractActivation(a: ActivationRecord): AgentActivation {
  return {
    id: a.id,
    agentId: a.agentId,
    communityId: a.communityId,
    launchId: a.launchId,
    tokenMint: a.tokenMint,
    activatingWallet: a.activatingWallet,
    displayName: a.displayName,
    status: a.applied ? "active" : "pending",
    requestedAt: a.requestedAt,
  };
}

/** 409 with the canonical IDs of the activation that already holds the wallet or mint. */
function activationConflict(reason: "wallet_taken" | "mint_taken", a: ActivationRecord): AppError {
  const details = { activationId: a.id, agentId: a.agentId, communityId: a.communityId, tokenMint: a.tokenMint, displayName: a.displayName, status: a.applied ? "active" : "pending" };
  if (!a.applied) return new AppError("activation_in_progress", "an activation for this wallet or token is already being applied; retry with the same Idempotency-Key", details);
  return reason === "wallet_taken"
    ? new AppError("wallet_already_activated", "this wallet has already activated a token-linked agent (one per wallet)", details)
    : new AppError("mint_already_activated", "this token already has its token-linked agent (one per token)", details);
}
