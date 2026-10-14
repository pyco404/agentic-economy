import type { AppConfig } from "./config.js";
import { MockChain } from "./chain/mock.js";
import { SolanaRpcChain } from "./chain/solana.js";
import type { ChainGateway } from "./chain/types.js";
import { CityRuntime, type Logger } from "./runtime.js";
import { AuthService } from "./services/auth.js";
import { AgentService, CommunityService, EligibilityService } from "./services/community.js";
import { LaunchService } from "./services/launch.js";
import { TreasuryService } from "./services/treasury.js";
import { MemoryStore } from "./store/memory.js";
import { PostgresStore } from "./store/postgres.js";
import type { Store } from "./store/types.js";

export interface AppContext {
  config: AppConfig;
  store: Store;
  chain: ChainGateway;
  runtime: CityRuntime;
  auth: AuthService;
  treasury: TreasuryService;
  launches: LaunchService;
  communities: CommunityService;
  eligibility: EligibilityService;
  agents: AgentService;
  /** Mutated by the WebSocket gateway. */
  wsStats: { connections: number };
  close(): Promise<void>;
}

const consoleLogger: Logger = {
  info: (o, m) => console.log(JSON.stringify({ level: "info", msg: m, ...(o as object) })),
  warn: (o, m) => console.warn(JSON.stringify({ level: "warn", msg: m, ...(o as object) })),
  error: (o, m) => console.error(JSON.stringify({ level: "error", msg: m, err: String((o as { err?: unknown }).err ?? "") })),
};
const silentLogger: Logger = { info() {}, warn() {}, error() {} };

export async function createContext(config: AppConfig, overrides: { store?: Store; chain?: ChainGateway; logger?: Logger } = {}): Promise<AppContext> {
  const store = overrides.store ?? (config.databaseUrl ? await PostgresStore.connect(config.databaseUrl) : new MemoryStore());
  const chain = overrides.chain ?? (config.mode === "demo" ? new MockChain() : new SolanaRpcChain(config.solana.rpcUrl!));
  const logger = overrides.logger ?? (config.logLevel === "silent" ? silentLogger : consoleLogger);
  const runtime = await CityRuntime.create(config, store, logger);
  const auth = new AuthService(store, config);
  const treasury = new TreasuryService(store, config);
  const communities = new CommunityService(store, runtime);
  const eligibility = new EligibilityService(chain, communities, config);
  const agents = new AgentService(runtime, eligibility, config);
  const launches = new LaunchService(store, chain, config, treasury, runtime);
  // community.updated: at most once per community per tick, for events that change its page.
  const COMMUNITY_EVENTS = new Set(["community.registered", "building.placed", "agent.activated", "agent.paused", "agent.resumed", "task.verified"]);
  runtime.onSimEvents = (events) => {
    const ids = new Set(events.filter((e) => e.communityId && COMMUNITY_EVENTS.has(e.type)).map((e) => e.communityId!));
    for (const id of ids)
      void store
        .getCommunity(id)
        .then((c) => c && runtime.publish("community.updated", runtime.engine.tick, { community: communities.decorate(c) }))
        .catch((err) => logger.error({ err }, "community.updated failed"));
  };
  return {
    config,
    store,
    chain,
    runtime,
    auth,
    treasury,
    launches,
    communities,
    eligibility,
    agents,
    wsStats: { connections: 0 },
    async close() {
      await runtime.stop();
      await store.close();
    },
  };
}
