import { createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { z } from "zod";
import { OFFICIAL_TREASURIES, PublicKey } from "@agentic-economy/shared";

/**
 * Runtime configuration. Modes:
 * - demo:       mock chain, seeded demo communities/agents, fixtures. Everything labelled Demo Mode.
 * - devnet:     Solana devnet RPC for verification/eligibility. Requires Postgres.
 * - production: mainnet reads; launches require separate explicit approval and all execution gates.
 */
export const ROLES = ["all", "api", "sim", "indexer"] as const;
export type Role = (typeof ROLES)[number];

const Env = z.object({
  MODE: z.enum(["demo", "devnet", "production"]).default("demo"),
  /**
   * all     = API + WebSocket + simulation (+ indexer outside demo) in one process (local dev, first Railway deploy)
   * api     = HTTP + WebSocket only; reads the leader's published state; commands go through the durable inbox
   * sim     = simulation worker; ticks only while holding Postgres leadership (safe to run standbys)
   * indexer = Pump.fun/Solana treasury indexer; works only while holding its lease
   */
  ROLE: z.enum(ROLES).default("all"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().default(8787),
  DATABASE_URL: z.string().optional(),
  WORLD_SEED: z.string().min(1).default("agentic-economy-genesis"),
  TICK_MS: z.coerce.number().int().min(50).max(10_000).default(500),
  SNAPSHOT_EVERY_TICKS: z.coerce.number().int().min(1).default(20),
  SIM_AUTOSTART: z.enum(["true", "false"]).default("true"),
  /** Publish the gzipped state view for API read replicas every N ticks (also on any tick that applied commands). */
  VIEW_EVERY_TICKS: z.coerce.number().int().min(1).default(2),
  /** How long durable WebSocket stream events are kept for client resume. */
  STREAM_RETENTION_MINUTES: z.coerce.number().int().min(1).default(60),
  /** How often a standby simulation worker retries acquiring leadership. */
  LEADER_RETRY_MS: z.coerce.number().int().min(100).default(2_000),
  TOKEN_MARKET_INDEX_ENABLED: z.enum(["true","false"]).default("true"),
  TOKEN_MARKET_REFRESH_MS: z.coerce.number().int().min(30000).max(3600000).default(60000),
  TOKEN_MARKET_PAGE_SIZE: z.coerce.number().int().min(1).max(20).default(8),
  INDEXER_INTERVAL_MS: z.coerce.number().int().min(1_000).default(30_000),
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "localnet"]).default("devnet"),
  /** Read-only Mainnet monitoring, independent of launch execution and the demo ledger. */
  TREASURY_READ_RPC_URL: z.string().url().optional(),
  HELIUS_API_KEY: z.string().min(1).optional(),
  PLATFORM_TREASURY: PublicKey.optional(),
  AGENT_REWARDS_TREASURY: PublicKey.optional(),
  /** Raw base units (6 decimals for Pump coins). Default 1,000 tokens. */
  AECO_COMMON_AGENTS_ENABLED: z.enum(["true", "false"]).default("false"),
  AECO_MINT: PublicKey.optional(),
  AECO_MINT_VERIFIED: z.enum(["true", "false"]).default("false"),
  AECO_RECONCILE_INTERVAL_MS: z.coerce.number().int().min(60_000).default(1_800_000),
  AECO_EXCLUDED_WALLETS: z.string().default(""),
  HOLDER_MIN_BALANCE_RAW: z.string().regex(/^\d+$/).default("1000000000"),
  ELIGIBILITY_CACHE_SECONDS: z.coerce.number().int().min(0).default(60),
  /** Demo house agents: per signed-in wallet, and across the whole city. */
  HOUSE_AGENTS_PER_WALLET: z.coerce.number().int().min(0).default(5),
  HOUSE_AGENTS_MAX: z.coerce.number().int().min(0).default(60),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(12 * 3600),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
  /** Off by default: enabling it deletes expired sign-in rows from the configured database. */
  AUTH_PRUNE_ENABLED: z.enum(["true", "false"]).default("false"),
  AUTH_PRUNE_GRACE_SECONDS: z.coerce.number().int().min(3600).default(86_400),
  AUTH_PRUNE_BATCH: z.coerce.number().int().min(1).max(5000).default(500),
  AUTH_PRUNE_MAX_BATCHES: z.coerce.number().int().min(1).max(100).default(20),
  AUTH_PRUNE_INTERVAL_SECONDS: z.coerce.number().int().min(60).default(900),
  AUTH_DOMAIN: z.string().default("localhost"),
  AUTH_URI: z.string().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  /** Must be set to "true" explicitly, and only after the devnet test plan in docs passes. */
  FEE_ROUTING_VERIFIED: z.enum(["true", "false"]).default("false"),
  /** Separate owner-approved Mainnet activation; never set by normal demo/staging deployment. */
  MAINNET_LAUNCH_APPROVED: z.enum(["true", "false"]).default("false"),
  /** Separate public-release approval. Unset/false preserves deployer-only Mainnet access. */
  MAINNET_PUBLIC_LAUNCH_APPROVED: z.enum(["true", "false"]).default("false"),
  PUMP_LAUNCH_ENABLED: z.enum(["true", "false"]).default("false"),
  PUMP_LAUNCH_LOOKUP_TABLE: PublicKey.optional(),
  /** Trusted operator binding only. Does not activate execution or supply any form fields. */
  PUMP_PREPARED_MINT_DRAFT_ID: z.string().uuid().optional(),
  /** Legacy compatibility setting; ignored by the current SOL-only launch policy. */
  USDC_LAUNCH_ENABLED: z.enum(["true", "false"]).default("false"),
  /** Commitment a launch needs before its community is registered (immutable). Production always requires finalized. */
  LAUNCH_REGISTRATION_COMMITMENT: z.enum(["confirmed", "finalized"]).optional(),
  PUMP_LOCAL_GENESIS_HASH: PublicKey.optional(),
  /** Shared across authenticated preparation requests in each API process, never a wallet quota. */
  LAUNCHPAD_PREPARATION_CONCURRENCY: z.coerce.number().int().min(1).max(256).default(8),
  PINATA_JWT: z.string().optional(),
  IPFS_GATEWAY: z.string().url().default("https://gateway.pinata.cloud"),
  LOGO_MAX_BYTES: z.coerce.number().int().min(1024).max(5_000_000).default(5_000_000),
  LOGO_MAX_PIXELS: z.coerce.number().int().min(1).max(32_000_000).default(16_000_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

/** Deterministic placeholder treasuries for demo mode only — derived from public seeds, NEVER real accounts. */
const demoKey = (label: string) => Keypair.fromSeed(createHash("sha256").update(`agentic-economy-demo:${label}`).digest()).publicKey.toBase58();
/**
 * USDC quote mints accepted by Pump per network. Devnet's is the six-decimal SPL mint in the live devnet
 * Global allowlist (the mainnet USDC address is not a token mint on devnet); localnet clones devnet.
 * Prepare still verifies the allowlist, owner and decimals on chain before building a launch.
 */
export const USDC_QUOTE_MINTS = {
  devnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  localnet: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "mainnet-beta": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;
export const DEMO_PLATFORM_TREASURY = demoKey("platform-treasury");
export const DEMO_AGENT_TREASURY = demoKey("agent-rewards-treasury");

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  // Empty values (e.g. `SOLANA_RPC_URL=` copied from .env.example) mean "unset".
  const e = Env.parse(Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== "")));
  const demo = e.MODE === "demo";
  const usesChain = e.ROLE !== "sim"; // the simulation never talks to Solana (least privilege)
  if (!demo && !e.DATABASE_URL) throw new Error(`MODE=${e.MODE} requires DATABASE_URL (Postgres)`);
  if (e.ROLE !== "all" && !e.DATABASE_URL) throw new Error(`ROLE=${e.ROLE} requires DATABASE_URL: separate processes coordinate through Postgres`);
  if (demo && e.ROLE === "indexer") throw new Error("ROLE=indexer is not used in demo mode (the mock chain is in-process)");
  if (!demo && usesChain && !e.SOLANA_RPC_URL) throw new Error(`MODE=${e.MODE} ROLE=${e.ROLE} requires SOLANA_RPC_URL`);
  if (!demo && usesChain && (!e.PLATFORM_TREASURY || !e.AGENT_REWARDS_TREASURY))
    throw new Error(`MODE=${e.MODE} ROLE=${e.ROLE} requires PLATFORM_TREASURY and AGENT_REWARDS_TREASURY`);
  if (e.PLATFORM_TREASURY && e.PLATFORM_TREASURY === e.AGENT_REWARDS_TREASURY)
    throw new Error("PLATFORM_TREASURY and AGENT_REWARDS_TREASURY must be distinct accounts");

  if (e.PLATFORM_TREASURY === OFFICIAL_TREASURIES.aecoDeployer || e.AGENT_REWARDS_TREASURY === OFFICIAL_TREASURIES.aecoDeployer)
    throw new Error("The AECO deployer is reserved and cannot receive treasury fees");
  if (e.MODE === "production" && usesChain && (e.PLATFORM_TREASURY !== OFFICIAL_TREASURIES.platform || e.AGENT_REWARDS_TREASURY !== OFFICIAL_TREASURIES.agentRewards))
    throw new Error("Mainnet treasury recipients must match the official platform and Agent Rewards identities");
  if (e.MODE !== "production" && [e.PLATFORM_TREASURY, e.AGENT_REWARDS_TREASURY].some(a => a === OFFICIAL_TREASURIES.platform || a === OFFICIAL_TREASURIES.agentRewards))
    throw new Error("Official Mainnet treasury identities cannot be used as demo or Devnet fee recipients");

  if (e.MODE === "production" && e.LAUNCH_REGISTRATION_COMMITMENT === "confirmed")
    throw new Error("MODE=production registers launches only at finalized commitment");
  const feeRoutingVerified = e.FEE_ROUTING_VERIFIED === "true";
  const mainnetApproved = e.MODE === "production" && e.MAINNET_LAUNCH_APPROVED === "true";
  if (e.MAINNET_PUBLIC_LAUNCH_APPROVED === "true" && !mainnetApproved)
    throw new Error("Public Mainnet launching requires separate Mainnet execution approval");
  if (e.MAINNET_LAUNCH_APPROVED === "true" && e.MODE !== "production") throw new Error("Mainnet approval cannot be used outside production");
  if (mainnetApproved && (e.SOLANA_CLUSTER !== "mainnet-beta" || !e.PUMP_LAUNCH_LOOKUP_TABLE || !feeRoutingVerified || e.PUMP_LAUNCH_ENABLED !== "true" || !(["https://useaeco.xyz","https://www.useaeco.xyz"].includes(e.AUTH_URI)) || e.CORS_ORIGINS.split(",").some(origin=>!["https://useaeco.xyz","https://www.useaeco.xyz"].includes(origin.trim()))))
    throw new Error("Approved Mainnet launching requires Mainnet RPC configuration, lookup table, verified routing, HTTPS and explicit launch enablement");

  if (e.AECO_COMMON_AGENTS_ENABLED === "true" && (!e.AECO_MINT || e.AECO_MINT_VERIFIED !== "true" || !e.HELIUS_API_KEY || demo || e.SOLANA_CLUSTER === "localnet" || (e.MODE === "production") !== (e.SOLANA_CLUSTER === "mainnet-beta")))
    throw new Error("Automatic Common Agents require a verified mint, matching network and backend Helius reads; no financial execution is enabled");
  const aecoExcluded = e.AECO_EXCLUDED_WALLETS.split(",").map(x => x.trim()).filter(Boolean).map(x => PublicKey.parse(x));
  return {
    aecoCommonAgents: { enabled: e.AECO_COMMON_AGENTS_ENABLED === "true", mint: e.AECO_MINT ?? null, intervalMs: e.AECO_RECONCILE_INTERVAL_MS, excludedWallets: aecoExcluded },
    mode: e.MODE,
    role: e.ROLE as Role,
    launchRegistrationCommitment: e.LAUNCH_REGISTRATION_COMMITMENT ?? (e.MODE === "production" ? "finalized" : "confirmed"),
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL ?? null,
    worldSeed: e.WORLD_SEED,
    tickMs: e.TICK_MS,
    snapshotEveryTicks: e.SNAPSHOT_EVERY_TICKS,
    simAutostart: e.SIM_AUTOSTART === "true",
    viewEveryTicks: e.VIEW_EVERY_TICKS,
    streamRetentionMinutes: e.STREAM_RETENTION_MINUTES,
    leaderRetryMs: e.LEADER_RETRY_MS,
    indexerIntervalMs: e.INDEXER_INTERVAL_MS,
    tokenMarket: {indexEnabled:e.TOKEN_MARKET_INDEX_ENABLED==='true',refreshMs:e.TOKEN_MARKET_REFRESH_MS,pageSize:e.TOKEN_MARKET_PAGE_SIZE},
    solana: { rpcUrl: e.SOLANA_RPC_URL ?? null, cluster: e.SOLANA_CLUSTER },
    treasuryReadRpcUrl: e.TREASURY_READ_RPC_URL ?? null,
    heliusApiKey: e.HELIUS_API_KEY ?? null,
    treasuries: {
      platform: e.PLATFORM_TREASURY ?? DEMO_PLATFORM_TREASURY,
      agentRewards: e.AGENT_REWARDS_TREASURY ?? DEMO_AGENT_TREASURY,
    },
    eligibility: {
      minBalanceRaw: BigInt(e.HOLDER_MIN_BALANCE_RAW),
      cacheSeconds: e.ELIGIBILITY_CACHE_SECONDS,
    },
    houseAgents: { perWallet: e.HOUSE_AGENTS_PER_WALLET, max: e.HOUSE_AGENTS_MAX },
    auth: {
      sessionTtlSeconds: e.SESSION_TTL_SECONDS,
      challengeTtlSeconds: e.CHALLENGE_TTL_SECONDS,
      domain: e.AUTH_DOMAIN,
      uri: e.AUTH_URI,
      prune: {
        enabled: e.AUTH_PRUNE_ENABLED === "true",
        graceSeconds: e.AUTH_PRUNE_GRACE_SECONDS,
        batch: e.AUTH_PRUNE_BATCH,
        maxBatches: e.AUTH_PRUNE_MAX_BATCHES,
        intervalSeconds: e.AUTH_PRUNE_INTERVAL_SECONDS,
      },
    },
    corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    feeRoutingVerified,
    pumpLaunch: {preparedMintDraftId:e.PUMP_PREPARED_MINT_DRAFT_ID??null,enabled:(e.MODE==="devnet"||mainnetApproved)&&feeRoutingVerified&&e.PUMP_LAUNCH_ENABLED==="true",mainnetApproved,publicMainnetApproved:e.MAINNET_PUBLIC_LAUNCH_APPROVED==="true",lookupTable:e.PUMP_LAUNCH_LOOKUP_TABLE??null,localGenesisHash:e.PUMP_LOCAL_GENESIS_HASH??null,
      usdcEnabled:false, // Product policy: preserve legacy implementation, never enable new USDC launches.
      // The quote mint is fixed per network, never client-supplied; prepare re-checks it against the live Pump Global allowlist.
      usdcMint:USDC_QUOTE_MINTS[e.SOLANA_CLUSTER]},
    /**
     * Mainnet requires its separate owner-approval gate as well as all existing gates.
     * Setting FEE_ROUTING_VERIFIED alone never enables Mainnet.
     * Demo mode uses the mock chain and never touches money.
     */
    financialFeaturesEnabled: (e.MODE === "devnet" || mainnetApproved) && feeRoutingVerified,
    launchpadPreparationConcurrency: e.LAUNCHPAD_PREPARATION_CONCURRENCY,
    pinata: {jwt:e.PINATA_JWT??null,gateway:e.IPFS_GATEWAY,maxBytes:e.LOGO_MAX_BYTES,maxPixels:e.LOGO_MAX_PIXELS},
    logLevel: e.LOG_LEVEL,
  };
}
