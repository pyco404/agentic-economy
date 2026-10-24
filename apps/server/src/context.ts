import {BackgroundRpc} from './chain/background-rpc.js';
import {cachedBackgroundChain} from './chain/background-cache.js';
import {MarketJournal} from './services/market-journal.js';
import { readAecoHolders } from "./chain/aeco-holders.js";
import { CommonAgentIndexer, isOfficialAecoLaunch } from "./services/common-agents.js";
import { HeliusReader, HeliusReadBudget } from './chain/helius.js';
import { heliusMarketChain } from './chain/helius-market.js';
import {PreparedMintStore} from './store/prepared-mint.js';
import {SignedLaunchStore} from './store/signed-launch.js';
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
  backgroundRpc?:BackgroundRpc;
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
  commonAgentIndexer: CommonAgentIndexer | null;
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
  const backgroundRpc=new BackgroundRpc(config.backgroundRpc,fetch,()=>Date.now(),()=>Math.random(),(method,code)=>logger.warn({method,code},'Background RPC read deferred'));
  const backgroundChain=!overrides.chain&&config.mode!=='demo'&&config.role!=='sim'?cachedBackgroundChain(new SolanaRpcChain(config.solana.rpcUrl!,undefined,{managedReads:true,fetch:backgroundRpc.fetch('live'),fetchForLane:lane=>backgroundRpc.fetch(lane)})):chain;
  const treasuryChain=!overrides.chain&&config.mode!=='demo'&&config.role!=='sim'?cachedBackgroundChain(new SolanaRpcChain(config.solana.rpcUrl!,undefined,{managedReads:true,fetch:backgroundRpc.fetch('treasury')})):chain;
  const heliusBudget = new HeliusReadBudget();
  const monitoringReader = config.heliusApiKey && config.role !== 'sim' ? new HeliusReader(config.heliusApiKey, 'mainnet-beta', heliusBudget,backgroundRpc.fetch('monitor',false)) : undefined;
  const marketReader = config.heliusApiKey && config.mode !== 'demo' && config.solana.cluster !== 'localnet' && config.role !== 'sim' ? new HeliusReader(config.heliusApiKey, config.solana.cluster, heliusBudget,backgroundRpc.fetch('holders',false)) : undefined;
  const marketChain = marketReader ? heliusMarketChain(backgroundChain, marketReader) : backgroundChain;
  const treasury = new TreasuryService(store, config, undefined, monitoringReader,backgroundRpc.fetch('monitor'));
  const communities = new CommunityService(store, runtime.reader);
  const eligibility = new EligibilityService(chain, communities, config);
  const agents = new AgentService(runtime.reader, runtime.bus, store, config);
  const submissions=new SignedLaunchStore(store instanceof PostgresStore?store.pool:undefined);
  await submissions.prune();
  let pruning:Promise<void>|undefined;
  const recoveryPruner=setInterval(()=>{if(!pruning)pruning=submissions.prune().catch(()=>logger.warn({},'Signed launch payload cleanup is temporarily unavailable')).finally(()=>{pruning=undefined;});},60_000);
  recoveryPruner.unref();
  const launches = new LaunchService(store, chain, config, treasury, coord, runtime.bus, runtime.reader,undefined,submissions,event=>logger.info(event,'Launch execution stage'),undefined,new PreparedMintStore(store instanceof PostgresStore?store.pool:undefined));

  const runsIndexer = config.role === "indexer" || (config.role === "all" && config.mode !== "demo");
  const indexer = runsIndexer
    ? new IndexerWorker(
        new TreasuryIndexer(treasuryChain, store, treasury, coord, [config.treasuries.agentRewards, config.treasuries.platform], logger),
        coord,
        logger,
        runtime.sim?.holder ?? `indexer:${process.pid}`,
      )
    : null;

  const commonAgentIndexer = config.aecoCommonAgents.enabled && runsIndexer && marketReader
    ? new CommonAgentIndexer(coord, async signal => {
        const community = await store.getCommunityByMint(config.aecoCommonAgents.mint!);
        if (config.mode === 'production') {
          const launch = community && (await store.getLaunch(community.launchId))?.launch;
          if (!isOfficialAecoLaunch(community, launch))
            throw new Error('Official AECO platform launch has not been verified');
        }
        const observed = await readAecoHolders(marketReader, config.aecoCommonAgents.mint!, new Set([...config.aecoCommonAgents.excludedWallets, config.treasuries.platform, config.treasuries.agentRewards]), signal);
        return { ...observed, ...(community ? { communityId: community.id } : {}) };
      }, logger, runtime.sim?.holder ?? `common:${process.pid}`, (hint, signal) => marketReader.watchTokenAccounts(config.aecoCommonAgents.mint!, hint, signal))
    : null;
  const authPruner = config.auth.prune.enabled && (config.role === "api" || config.role === "all") ? new AuthPruner(store, config.auth.prune, logger) : null;

  const tokenMarket=new TokenMarketService(store,marketChain,config.mode==='demo'?'demo':config.solana.cluster,fetch,()=>Date.now(),new MarketJournal(store instanceof PostgresStore?store.pool:undefined),config.tokenMarket,message=>logger.warn({},message));
  return {
    config,
    backgroundRpc,
    store,
    coord,
    chain,
    runtime,
    auth,
    treasury,
    tokenMarket,
    launches,
    communities,
    eligibility,
    agents,
    indexer,
    authPruner,
    commonAgentIndexer,
    wsStats: { connections: 0 },
    async close() {
      clearInterval(recoveryPruner);await pruning;
      backgroundRpc.close();
      await tokenMarket.stop();
      await commonAgentIndexer?.stop();
      await indexer?.stop();
      await authPruner?.stop();
      await runtime.stop();
      await coord.close();
      await store.close();
    },
  };
}
