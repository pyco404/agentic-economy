/** HISTORICAL TEMPLATE — DO NOT APPLY.
 * The owner now requires one production environment and explicit tested-commit releases.
 * This preserved staging/split example contains obsolete branches/origins and automatic migration setup.
 * Current workflow: infra/railway/README.md. No new environment or live configuration is created here.
 */
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

/**
 * Staging frontend (apps/web is owned by Codex; built by apps/web/Dockerfile into a static Caddy image with no
 * backend code and no secrets). Deploys Codex's development branch. Custom domains are attached with
 * `railway domain` (see infra/railway/README.md), not here, so an apply never touches existing domains.
 */
const WEB_BRANCH = "codex/frontend";
const FRONTEND_ORIGIN = "https://staging.useaeco.xyz";
/** Generated Railway domain of the frontend service (for checks before the custom domain's DNS is live). */
const FRONTEND_RAILWAY_ORIGIN: string | null = "https://agentic-economy-web-staging.up.railway.app";
/** Public API base the frontend is built against. Switch to https://api-staging.useaeco.xyz once its DNS and certificate are live. */
const API_PUBLIC_URL = "https://agentic-economy-staging.up.railway.app";

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
    // Read only by the 0.2.0 build still deployed on staging (equals its default). Remove when 0.3.0 is deployed.
    MAX_AGENTS_PER_WALLET_PER_COMMUNITY: "3",
    // Sign-In With Solana: `domain`/`URI` name the site the user signs in to (the frontend), which wallets
    // compare with the page that asks for the signature.
    AUTH_DOMAIN: new URL(FRONTEND_ORIGIN).host,
    AUTH_URI: FRONTEND_ORIGIN,
    // The hosted frontend, its generated Railway origin while DNS is pending, and the local dev server.
    CORS_ORIGINS: [FRONTEND_ORIGIN, FRONTEND_RAILWAY_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"].filter(Boolean).join(","),
    SESSION_TTL_SECONDS: "43200",
    CHALLENGE_TTL_SECONDS: "300",
  };

  const web = service("agentic-economy-web", {
    ...(GITHUB_REPO ? { source: github(GITHUB_REPO, { branch: WEB_BRANCH }) } : {}),
    build: {
      builder: "DOCKERFILE" as const,
      dockerfilePath: "apps/web/Dockerfile",
      watchPatterns: ["apps/web/**", "packages/shared/**", "pnpm-lock.yaml", "package.json", "pnpm-workspace.yaml", "tsconfig.base.json"],
    },
    // Static files only: no migrations, no simulation, no chain access. Caddy serves /healthz on $PORT.
    deploy: { healthcheckPath: "/healthz", healthcheckTimeout: 120, numReplicas: 1, restartPolicyType: "ON_FAILURE" as const, restartPolicyMaxRetries: 10 },
    // VITE_* are Docker build arguments (baked into the bundle); the Dockerfile pins VITE_DATA_MODE=api.
    // PORT matches the target port of the service's domains (8080, also the image default).
    env: { PORT: "8080", VITE_API_URL: API_PUBLIC_URL, VITE_WS_URL: `${API_PUBLIC_URL.replace(/^https:/, "wss:")}/api/v1/ws` },
  });

  if (TOPOLOGY === "single") {
    const app = service("agentic-economy", {
      ...source,
      build,
      // Exactly one replica: this process is also the simulation writer (a 2nd replica would just be a standby).
      deploy: { ...deployBase, numReplicas: 1, overlapSeconds: 15, drainingSeconds: 30 },
      env: { ROLE: "all", ...common, ...simVars, ...chainVars, ...apiVars, INDEXER_INTERVAL_MS: "30000" },
    });
    return project("agentic-economy", { resources: [db, app, web] });
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
  return project("agentic-economy", { resources: [db, sim, indexer, api, web] });
});
