/**
 * Agentic Economy — Railway Infrastructure as Code (replaces deprecated railway.json / railway.toml).
 *
 *   cd .railway && npm install          # installs the `railway` SDK used by this file
 *   railway link                        # link to your Railway project (once)
 *   railway config plan                 # review — nothing changes
 *   railway config apply                # apply (asks for confirmation)
 *
 * TOPOLOGY (edit below; a committed, reviewable change):
 *   "single" — stage 1: one service ROLE=all (API + WebSocket + simulation + indexer) + Postgres
 *   "split"  — stage 2: api (public, scalable) + sim (private, single writer) + indexer (private, lease)
 * Switching topologies changes which services this file owns; `plan` shows any deletion and
 * `apply` requires --confirm-destructive for it. Do the stage-1 → stage-2 switch as documented in
 * infra/railway/README.md (create the new services first, then remove the old one).
 *
 * Chain settings (SOLANA_RPC_URL, SOLANA_CLUSTER, treasury addresses) are `preserve()`d and stay UNSET for demo
 * staging, so the deployment has no chain access; this file never contains secret values.
 * MODE is pinned to "demo" and FEE_ROUTING_VERIFIED to "false".
 */
import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

const TOPOLOGY: "single" | "split" = "single";
/** Optional: "owner/repo" to connect the GitHub source from here; null = connect the repo in the dashboard. */
const GITHUB_REPO: string | null = "pyco404/agentic-economy";
const GITHUB_BRANCH = "staging";

export default defineRailway(() => {
  const db = postgres("Postgres");

  const source = GITHUB_REPO ? { source: github(GITHUB_REPO, { branch: GITHUB_BRANCH }) } : {};
  const build = {
    builder: "DOCKERFILE" as const,
    dockerfilePath: "infra/railway/Dockerfile",
    // Only backend changes trigger backend deploys (apps/web is deployed separately by the frontend).
    watchPatterns: ["apps/server/**", "packages/**", "infra/railway/**", "pnpm-lock.yaml", "package.json", "pnpm-workspace.yaml", "tsconfig.base.json"],
  };
  const deployBase = {
    preDeployCommand: ["node migrate.mjs"],
    healthcheckPath: "/readyz",
    healthcheckTimeout: 120,
    restartPolicyType: "ON_FAILURE" as const,
    restartPolicyMaxRetries: 10,
  };
  const common = {
    // Staging runs the mock chain with labelled demo data. Changing this to "devnet" or "production"
    // is a reviewed change to this file and requires explicit owner approval.
    MODE: "demo",
    DATABASE_URL: db.env.DATABASE_URL, // private network URL
    HOST: "::",
    LOG_LEVEL: "info",
    WORLD_SEED: "agentic-economy-genesis",
    TICK_MS: "500",
  };
  const simVars = { SNAPSHOT_EVERY_TICKS: "120", VIEW_EVERY_TICKS: "2", STREAM_RETENTION_MINUTES: "60", LEADER_RETRY_MS: "2000" };
  const chainVars = {
    SOLANA_RPC_URL: preserve(),
    SOLANA_CLUSTER: preserve(),
    PLATFORM_TREASURY: preserve(),
    AGENT_REWARDS_TREASURY: preserve(),
    FEE_ROUTING_VERIFIED: "false", // real launches stay disabled until verified AND approved
  };
  const apiVars = {
    HOLDER_MIN_BALANCE_RAW: "1000000000",
    ELIGIBILITY_CACHE_SECONDS: "60",
    // Demo-only house agents: per signed-in wallet, and city-wide (token-linked agents are one per token and per wallet).
    HOUSE_AGENTS_PER_WALLET: "5",
    HOUSE_AGENTS_MAX: "60",
    // Sign-in messages name the API's own Railway domain (resolved by Railway at deploy time).
    AUTH_DOMAIN: "${{RAILWAY_PUBLIC_DOMAIN}}",
    // Staging accepts the local frontend dev server only; add the hosted frontend origin when it exists.
    AUTH_URI: "http://localhost:5173",
    CORS_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
    SESSION_TTL_SECONDS: "43200",
    CHALLENGE_TTL_SECONDS: "300",
  };

  if (TOPOLOGY === "single") {
    const app = service("agentic-economy", {
      ...source,
      build,
      // Exactly one replica: this process is also the simulation writer (a 2nd replica would just be a standby).
      deploy: { ...deployBase, numReplicas: 1, overlapSeconds: 15, drainingSeconds: 30 },
      env: { ROLE: "all", ...common, ...simVars, ...chainVars, ...apiVars, INDEXER_INTERVAL_MS: "30000" },
    });
    return project("agentic-economy", { resources: [db, app] });
  }

  const sim = service("sim", {
    ...source,
    build,
    // Single writer enforced by Postgres leadership; 1 replica (a 2nd would be a hot standby, never a 2nd writer).
    deploy: { ...deployBase, numReplicas: 1, overlapSeconds: 15, drainingSeconds: 30 },
    env: { ROLE: "sim", ...common, ...simVars },
  });
  const indexer = service("indexer", {
    ...source,
    build,
    deploy: { ...deployBase, numReplicas: 1, overlapSeconds: 10, drainingSeconds: 15 },
    env: { ROLE: "indexer", ...common, ...chainVars, INDEXER_INTERVAL_MS: "30000" },
  });
  const api = service("api", {
    ...source,
    build,
    // Stateless apart from WebSocket connections; scale out by raising numReplicas.
    deploy: { ...deployBase, numReplicas: 1, overlapSeconds: 20, drainingSeconds: 20 },
    env: { ROLE: "api", ...common, ...chainVars, ...apiVars, STREAM_RETENTION_MINUTES: "60" },
  });
  return project("agentic-economy", { resources: [db, sim, indexer, api] });
});
