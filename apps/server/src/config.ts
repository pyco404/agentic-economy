import { createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { z } from "zod";
import { PublicKey } from "@agentic-economy/shared";

/**
 * Runtime configuration. Modes:
 * - demo:       mock chain, seeded demo communities/agents, fixtures. Everything labelled Demo Mode.
 * - devnet:     Solana devnet RPC for verification/eligibility. Requires Postgres.
 * - production: mainnet reads only. Requires Postgres; financial execution stays hard-disabled.
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
  INDEXER_INTERVAL_MS: z.coerce.number().int().min(1_000).default(30_000),
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "localnet"]).default("devnet"),
  PLATFORM_TREASURY: PublicKey.optional(),
  AGENT_REWARDS_TREASURY: PublicKey.optional(),
  /** Raw base units (6 decimals for Pump coins). Default 1,000 tokens. */
  HOLDER_MIN_BALANCE_RAW: z.string().regex(/^\d+$/).default("1000000000"),
  ELIGIBILITY_CACHE_SECONDS: z.coerce.number().int().min(0).default(60),
  /** Demo house agents: per signed-in wallet, and across the whole city. */
  HOUSE_AGENTS_PER_WALLET: z.coerce.number().int().min(0).default(5),
  HOUSE_AGENTS_MAX: z.coerce.number().int().min(0).default(60),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(12 * 3600),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
  AUTH_DOMAIN: z.string().default("localhost"),
  AUTH_URI: z.string().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  /** Must be set to "true" explicitly, and only after the devnet test plan in docs passes. */
  FEE_ROUTING_VERIFIED: z.enum(["true", "false"]).default("false"),
  PUMP_LAUNCH_ENABLED: z.enum(["true", "false"]).default("false"),
  PUMP_LAUNCH_LOOKUP_TABLE: PublicKey.optional(),
  PUMP_LOCAL_GENESIS_HASH: PublicKey.optional(),
  PINATA_JWT: z.string().optional(),
  IPFS_GATEWAY: z.string().url().default("https://gateway.pinata.cloud"),
  LOGO_MAX_BYTES: z.coerce.number().int().min(1024).max(5_000_000).default(5_000_000),
  LOGO_MAX_PIXELS: z.coerce.number().int().min(1).max(32_000_000).default(16_000_000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

/** Deterministic placeholder treasuries for demo mode only — derived from public seeds, NEVER real accounts. */
const demoKey = (label: string) => Keypair.fromSeed(createHash("sha256").update(`agentic-economy-demo:${label}`).digest()).publicKey.toBase58();
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

  const feeRoutingVerified = e.FEE_ROUTING_VERIFIED === "true";
  return {
    mode: e.MODE,
    role: e.ROLE as Role,
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
    solana: { rpcUrl: e.SOLANA_RPC_URL ?? null, cluster: e.SOLANA_CLUSTER },
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
    },
    corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    feeRoutingVerified,
    pumpLaunch: {enabled:e.MODE==="devnet"&&feeRoutingVerified&&e.PUMP_LAUNCH_ENABLED==="true",lookupTable:e.PUMP_LAUNCH_LOOKUP_TABLE??null,localGenesisHash:e.PUMP_LOCAL_GENESIS_HASH??null},
    /**
     * Real execution is restricted to verified devnet. Mainnet stays hard-disabled
     * even if a deployment accidentally sets FEE_ROUTING_VERIFIED=true.
     * Demo mode uses the mock chain and never touches money.
     */
    financialFeaturesEnabled: e.MODE === "devnet" && feeRoutingVerified,
    pinata: {jwt:e.PINATA_JWT??null,gateway:e.IPFS_GATEWAY,maxBytes:e.LOGO_MAX_BYTES,maxPixels:e.LOGO_MAX_PIXELS},
    logLevel: e.LOG_LEVEL,
  };
}
