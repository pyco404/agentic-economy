import { z } from "zod";
import { PublicKey } from "@agentic-economy/shared";

/**
 * Runtime configuration. Modes:
 * - demo:       mock chain, seeded demo communities/agents, fixtures. Everything labelled Demo Mode.
 * - devnet:     Solana devnet RPC for verification/eligibility. Requires Postgres.
 * - production: mainnet. Requires Postgres, real treasuries and FEE_ROUTING_VERIFIED=true before launches are enabled.
 */
const Env = z.object({
  MODE: z.enum(["demo", "devnet", "production"]).default("demo"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().default(8787),
  DATABASE_URL: z.string().optional(),
  WORLD_SEED: z.string().min(1).default("agentic-economy-genesis"),
  TICK_MS: z.coerce.number().int().min(50).max(10_000).default(500),
  SNAPSHOT_EVERY_TICKS: z.coerce.number().int().min(1).default(20),
  SIM_AUTOSTART: z.enum(["true", "false"]).default("true"),
  SOLANA_RPC_URL: z.string().url().optional(),
  SOLANA_CLUSTER: z.enum(["devnet", "mainnet-beta", "localnet"]).default("devnet"),
  PLATFORM_TREASURY: PublicKey.optional(),
  AGENT_REWARDS_TREASURY: PublicKey.optional(),
  /** Raw base units (6 decimals for Pump coins). Default 1,000 tokens. */
  HOLDER_MIN_BALANCE_RAW: z.string().regex(/^\d+$/).default("1000000000"),
  ELIGIBILITY_CACHE_SECONDS: z.coerce.number().int().min(0).default(60),
  MAX_AGENTS_PER_WALLET_PER_COMMUNITY: z.coerce.number().int().min(1).default(3),
  SESSION_TTL_SECONDS: z.coerce.number().int().min(60).default(12 * 3600),
  CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(30).default(300),
  AUTH_DOMAIN: z.string().default("localhost"),
  AUTH_URI: z.string().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
  /** Must be set to "true" explicitly, and only after the devnet test plan in docs passes. */
  FEE_ROUTING_VERIFIED: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type AppConfig = ReturnType<typeof loadConfig>;

/** Deterministic placeholder treasuries for demo mode only (NOT real accounts). */
export const DEMO_PLATFORM_TREASURY = "DemoP1atformTreasury1111111111111111111111";
export const DEMO_AGENT_TREASURY = "DemoAgentRewardsTreasury1111111111111111111";

export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const e = Env.parse(env);
  const demo = e.MODE === "demo";
  if (!demo && !e.DATABASE_URL) throw new Error(`MODE=${e.MODE} requires DATABASE_URL (Postgres)`);
  if (!demo && !e.SOLANA_RPC_URL) throw new Error(`MODE=${e.MODE} requires SOLANA_RPC_URL`);
  if (!demo && (!e.PLATFORM_TREASURY || !e.AGENT_REWARDS_TREASURY))
    throw new Error(`MODE=${e.MODE} requires PLATFORM_TREASURY and AGENT_REWARDS_TREASURY`);
  if (e.PLATFORM_TREASURY && e.PLATFORM_TREASURY === e.AGENT_REWARDS_TREASURY)
    throw new Error("PLATFORM_TREASURY and AGENT_REWARDS_TREASURY must be distinct accounts");

  const feeRoutingVerified = e.FEE_ROUTING_VERIFIED === "true";
  return {
    mode: e.MODE,
    host: e.HOST,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL ?? null,
    worldSeed: e.WORLD_SEED,
    tickMs: e.TICK_MS,
    snapshotEveryTicks: e.SNAPSHOT_EVERY_TICKS,
    simAutostart: e.SIM_AUTOSTART === "true",
    solana: { rpcUrl: e.SOLANA_RPC_URL ?? null, cluster: e.SOLANA_CLUSTER },
    treasuries: {
      platform: e.PLATFORM_TREASURY ?? DEMO_PLATFORM_TREASURY,
      agentRewards: e.AGENT_REWARDS_TREASURY ?? DEMO_AGENT_TREASURY,
    },
    eligibility: {
      minBalanceRaw: BigInt(e.HOLDER_MIN_BALANCE_RAW),
      cacheSeconds: e.ELIGIBILITY_CACHE_SECONDS,
      maxAgentsPerWalletPerCommunity: e.MAX_AGENTS_PER_WALLET_PER_COMMUNITY,
    },
    auth: {
      sessionTtlSeconds: e.SESSION_TTL_SECONDS,
      challengeTtlSeconds: e.CHALLENGE_TTL_SECONDS,
      domain: e.AUTH_DOMAIN,
      uri: e.AUTH_URI,
    },
    corsOrigins: e.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    feeRoutingVerified,
    /**
     * Real launches (and anything else that moves money) are enabled only in devnet/production
     * once fee routing has been verified. Demo mode uses the mock chain and never touches money.
     */
    financialFeaturesEnabled: !demo && feeRoutingVerified,
    logLevel: e.LOG_LEVEL,
  };
}
