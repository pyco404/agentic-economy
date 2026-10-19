import {TokenMarketService} from './services/token-market.js';
import type { AppConfig } from "./config.js";
import { MockChain } from "./chain/mock.js";
import { SolanaRpcChain } from "./chain/solana.js";
import { ChainFeatureUnavailable, type ChainGateway } from "./chain/types.js";
import { MemoryCoordinator } from "./coord/memory.js";
import { PgCoordinator } from "./coord/postgres.js";
import type { Coordinator } from "./coord/types.js";
import { CityRuntime, type Logger } from "./runtime.js";
import { AuthService } from "./services/auth.js";
import { AgentService, CommunityService, EligibilityService } from "./services/community.js";
import { IndexerWorker, TreasuryIndexer } from "./services/indexer.js";
import { AuthPruner } from "./services/auth-pruner.js";
import { LaunchService } from "./services/launch.js";
import { TreasuryService } from "./services/treasury.js";
import { MemoryStore } from "./store/memory.js";
import { PostgresStore } from "./store/postgres.js";
import type { Store } from "./store/types.js";

export interface AppContext {
  config: AppConfig;
  store: Store;
  coord: Coordinator;
  chain: ChainGateway;
  runtime: CityRuntime;
  auth: AuthService;
  treasury: TreasuryService;
  tokenMarket: TokenMarketService;
  launches: LaunchService;
  communities: CommunityService;
  eligibility: EligibilityService;
  agents: AgentService;
  /** Present when this process runs the treasury indexer (ROLE=indexer, or ROLE=all outside demo). */
  indexer: IndexerWorker | null;
  /** Present when AUTH_PRUNE_ENABLED=true on a process that serves the API. */
  authPruner: AuthPruner | null;
  /** Mutated by the WebSocket gateway. */
  wsStats: { connections: number };
  close(): Promise<void>;
}

const consoleLogger: Logger = {
  info: (o, m) => console.log(JSON.stringify({ level: "info", msg: m, ...(o as object) })),
  warn: (o, m) => console.warn(JSON.stringify({ level: "warn", msg: m, ...(o as object) })),
  error: (o, m) => console.error(JSON.stringify({ level: "error", msg: m, ...(o as object) })),
};
const silentLogger: Logger = { info() {}, warn() {}, error() {} };

/** The simulation role never needs chain access; any accidental use fails loudly. */
class NoChain implements ChainGateway {
  readonly source = "solana_rpc" as const;
  private fail(): never {
    throw new ChainFeatureUnavailable("no_chain_in_role", "this process role has no Solana access");
  }
  getTransaction = async () => this.fail();
  getFeeRoutingState = async () => this.fail();
  getTokenBalance = async () => this.fail();
  buildLaunchTransaction = async () => this.fail();
  listSignaturesForAddress = async () => this.fail();
}

export async function createContext(config: AppConfig, overrides: { store?: Store; coord?: Coordinator; chain?: ChainGateway; logger?: Logger } = {}): Promise<AppContext> {
  const logger = overrides.logger ?? (config.logLevel === "silent" ? silentLogger : consoleLogger);
  let store: Store;
  let coord: Coordinator;
  if (overrides.store) {
    store = overrides.store;
    coord =
      overrides.coord ??
      (store instanceof PostgresStore ? new PgCoordinator(store.pool, config.databaseUrl!, logger) : new MemoryCoordinator(store as MemoryStore));
  } else if (config.databaseUrl) {
    const pgStore = await PostgresStore.connect(config.databaseUrl);
    store = pgStore;
    coord = new PgCoordinator(pgStore.pool, config.databaseUrl, logger);
  } else {
    const mem = new MemoryStore();
    store = mem;
    coord = new MemoryCoordinator(mem);
  }
  const chain = overrides.chain ?? (config.mode === "demo" ? new MockChain() : config.role === "sim" ? new NoChain() : new SolanaRpcChain(config.solana.rpcUrl!,{...config.pumpLaunch,cluster:config.solana.cluster}));

  const runtime = await CityRuntime.create(config, store, coord, logger);
  const auth = new AuthService(store, config);
  const treasury = new TreasuryService(store, config);
  const communities = new CommunityService(store, runtime.reader);
  const eligibility = new EligibilityService(chain, communities, config);
  const agents = new AgentService(runtime.reader, runtime.bus, store, config);
  const launches = new LaunchService(store, chain, config, treasury, coord, runtime.bus, runtime.reader);

  const runsIndexer = config.role === "indexer" || (config.role === "all" && config.mode !== "demo");
  const indexer = runsIndexer
    ? new IndexerWorker(
        new TreasuryIndexer(chain, store, treasury, coord, [config.treasuries.agentRewards, config.treasuries.platform], logger),
        coord,
        logger,
        runtime.sim?.holder ?? `indexer:${process.pid}`,
      )
    : null;

  const authPruner = config.auth.prune.enabled && (config.role === "api" || config.role === "all") ? new AuthPruner(store, config.auth.prune, logger) : null;

  return {
    config,
    store,
    coord,
    chain,
    runtime,
    auth,
    treasury,
    tokenMarket:new TokenMarketService(store,chain,config.mode==='demo'?'demo':config.solana.cluster),
    launches,
    communities,
    eligibility,
    agents,
    indexer,
    authPruner,
    wsStats: { connections: 0 },
    async close() {
      await indexer?.stop();
      await authPruner?.stop();
      await runtime.stop();
      await coord.close();
      await store.close();
    },
  };
}
