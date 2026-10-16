import { z } from "zod";
import { page, PageQuery, DataMode, AgentId, CommunityId, LaunchId } from "./primitives.js";
import { WorldBootstrap, WorldChunk, WorldStats } from "./world.js";
import { EconomicEvent, EconomySummary, MarketsResponse, Task, TaskStatus, TaskReceipt, RewardRecord } from "./economy.js";
import {
  ActivateAgentRequest,
  ActivateAgentResponse,
  AgentAction,
  AgentResponse,
  AgentSummary,
  CreateAgentRequest,
  CreateHouseAgentRequest,
  HolderEligibility,
  MyActivationResponse,
  PatchAgentRequest,
} from "./agents.js";
import { CommunityResponse, Community } from "./community.js";
import { ConfirmLaunchRequest, LaunchResponse, PrepareLaunchRequest, PrepareLaunchResponse } from "./launch.js";
import { TreasuryEntry, TreasurySummary } from "./treasury.js";
import { ChallengeRequest, ChallengeResponse, VerifyRequest, VerifyResponse, WalletIdentity } from "./auth.js";

/* ---------- Response envelopes ---------- */

export const ChunksQuery = z
  .object({
    x: z.coerce.number().int().describe("Center chunk x (chunk units, not cells)."),
    y: z.coerce.number().int().describe("Center chunk y (chunk units)."),
    radius: z.coerce.number().int().min(0).max(4).default(1),
  })
  .meta({ id: "ChunksQuery" });

export const ChunksResponse = z.object({ mode: DataMode, chunks: z.array(WorldChunk) }).meta({ id: "ChunksResponse" });
export type ChunksResponse = z.infer<typeof ChunksResponse>;

export const WorldAgentsResponse = z
  .object({ mode: DataMode, tick: z.number().int(), agents: z.array(AgentSummary) })
  .meta({ id: "WorldAgentsResponse" });

export const ActivityPage = page(EconomicEvent).extend({ mode: DataMode }).meta({ id: "ActivityPage" });
export const CommunityPage = page(Community).extend({ mode: DataMode }).meta({ id: "CommunityPage" });
export const AgentSummaryPage = page(AgentSummary).extend({ mode: DataMode }).meta({ id: "AgentSummaryPage" });
export const AgentActionPage = page(AgentAction).extend({ mode: DataMode }).meta({ id: "AgentActionPage" });
export const TaskPage = page(Task).extend({ mode: DataMode }).meta({ id: "TaskPage" });
export const ReceiptPage = page(TaskReceipt).extend({ mode: DataMode }).meta({ id: "ReceiptPage" });
export const RewardPage = page(RewardRecord).extend({ mode: DataMode }).meta({ id: "RewardPage" });
export const TreasuryEntryPage = page(TreasuryEntry).extend({ mode: DataMode }).meta({ id: "TreasuryEntryPage" });

export const TasksQuery = PageQuery.extend({ status: TaskStatus.optional() }).meta({ id: "TasksQuery" });
export const PageQuerySchema = PageQuery.meta({ id: "PageQuery" });

export const ProcessRole = z.enum(["all", "api", "sim", "indexer"]).meta({ id: "ProcessRole" });

/** Liveness: the process is up. Always 200 while the process can answer. */
export const HealthResponse = z
  .object({
    status: z.enum(["ok", "degraded"]),
    mode: DataMode,
    role: ProcessRole,
    contractVersion: z.string(),
    tick: z.number().int().describe("Tick of the state this process can read (0 if none yet)."),
    simRunning: z.boolean().describe("A simulation leader has committed a tick within the last 10 s (cluster-wide)."),
    store: z.enum(["memory", "postgres"]),
    financialFeaturesEnabled: z.boolean(),
    simLeader: z.object({
      localLeader: z.boolean().describe("This process currently holds simulation leadership."),
      epoch: z.number().int(),
      lastTick: z.number().int(),
      heartbeatAgeMs: z.number().int().nullable(),
    }),
  })
  .meta({ id: "HealthResponse" });

/** Readiness: 200 only when this process can do its role's job; 503 otherwise (body still returned). */
export const ReadinessResponse = z
  .object({
    ready: z.boolean(),
    role: ProcessRole,
    checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().nullable() })),
  })
  .meta({ id: "ReadinessResponse" });

export const DemoSignResponse = z
  .object({ signature: z.string(), note: z.string() })
  .meta({ id: "DemoSignResponse" });

export const IdParam = z.object({ id: z.string() });

/* ---------- Route registry (single source for server + OpenAPI + clients) ---------- */

export type HttpMethod = "get" | "post" | "patch";

export interface RouteDef {
  method: HttpMethod;
  /** Fastify-style path (`:id`). */
  path: string;
  operationId: string;
  summary: string;
  tag: "world" | "economy" | "agents" | "communities" | "launches" | "treasury" | "auth" | "system" | "demo";
  /** Requires `Authorization: Bearer <session token>`. */
  auth: boolean;
  /** Accepts/requires `Idempotency-Key` header. */
  idempotencyKey?: "required" | "optional";
  params?: z.ZodObject;
  query?: z.ZodObject;
  body?: z.ZodType;
  response: z.ZodType;
  successStatus?: 200 | 201;
  /** Only available when MODE=demo. */
  demoOnly?: boolean;
  /** Retired: always answers 410 `gone`, naming the replacement routes in `details.replacements`. */
  retired?: { since: string; replacements: readonly string[] };
}

const P = "/api/v1";

export const routes = {
  health: { method: "get", path: "/healthz", operationId: "health", summary: "Liveness + mode, role and simulation leadership", tag: "system", auth: false, response: HealthResponse },
  readiness: { method: "get", path: "/readyz", operationId: "readiness", summary: "Readiness for this process role (503 when not ready)", tag: "system", auth: false, response: ReadinessResponse },

  worldBootstrap: { method: "get", path: `${P}/world/bootstrap`, operationId: "getWorldBootstrap", summary: "World seed, regions, building catalog, simulation clock", tag: "world", auth: false, response: WorldBootstrap },
  worldChunks: { method: "get", path: `${P}/world/chunks`, operationId: "getWorldChunks", summary: "Chunks (terrain, buildings, props) around a chunk coordinate", tag: "world", auth: false, query: ChunksQuery, response: ChunksResponse },
  worldStats: { method: "get", path: `${P}/world/stats`, operationId: "getWorldStats", summary: "Population, economy, agent and community counts", tag: "world", auth: false, response: WorldStats },
  worldAgents: { method: "get", path: `${P}/world/agents`, operationId: "getWorldAgents", summary: "All agents with positions (compact)", tag: "world", auth: false, response: WorldAgentsResponse },

  activities: { method: "get", path: `${P}/activities`, operationId: "listActivities", summary: "Public activity feed (newest first)", tag: "economy", auth: false, query: PageQuerySchema, response: ActivityPage },
  markets: { method: "get", path: `${P}/markets`, operationId: "getMarkets", summary: "Simulated City Credit prices and listings", tag: "economy", auth: false, response: MarketsResponse },
  economySummary: { method: "get", path: `${P}/economy/summary`, operationId: "getEconomySummary", summary: "Credit supply, production totals, task stats", tag: "economy", auth: false, response: EconomySummary },
  tasks: { method: "get", path: `${P}/tasks`, operationId: "listTasks", summary: "Service tasks (open and verified)", tag: "economy", auth: false, query: TasksQuery, response: TaskPage },
  receipts: { method: "get", path: `${P}/tasks/receipts`, operationId: "listTaskReceipts", summary: "Verification receipts (hash-chained)", tag: "economy", auth: false, query: PageQuerySchema, response: ReceiptPage },
  rewards: { method: "get", path: `${P}/rewards`, operationId: "listRewardRecords", summary: "Dry-run contribution records (no payouts)", tag: "economy", auth: false, query: PageQuerySchema, response: RewardPage },

  communities: { method: "get", path: `${P}/communities`, operationId: "listCommunities", summary: "Communities launched through Agentic Economy", tag: "communities", auth: false, query: PageQuerySchema, response: CommunityPage },
  community: { method: "get", path: `${P}/communities/:id`, operationId: "getCommunity", summary: "Community and token details", tag: "communities", auth: false, params: z.object({ id: CommunityId }), response: CommunityResponse },
  communityAgents: { method: "get", path: `${P}/communities/:id/agents`, operationId: "listCommunityAgents", summary: "Agents affiliated with a community", tag: "communities", auth: false, params: z.object({ id: CommunityId }), query: PageQuerySchema, response: AgentSummaryPage },
  communityEligibility: { method: "get", path: `${P}/communities/:id/eligibility`, operationId: "getHolderEligibility", summary: "Signed-in wallet's holder eligibility (from chain data)", tag: "communities", auth: true, params: z.object({ id: CommunityId }), response: HolderEligibility },

  agent: { method: "get", path: `${P}/agents/:id`, operationId: "getAgent", summary: "Agent profile, location, inventory, performance", tag: "agents", auth: false, params: z.object({ id: AgentId }), response: AgentResponse },
  createAgent: { method: "post", path: `${P}/agents`, operationId: "createAgent", summary: "RETIRED in 0.3.0 (410 gone): use activateAgent or createHouseAgent", tag: "agents", auth: true, idempotencyKey: "required", body: CreateAgentRequest, response: AgentResponse, successStatus: 201, retired: { since: "0.3.0", replacements: ["POST /api/v1/agents/activate", "POST /api/v1/agents/house"] } },
  activateAgent: { method: "post", path: `${P}/agents/activate`, operationId: "activateAgent", summary: "Activate a community token's one token-linked agent (token launcher's wallet only)", tag: "agents", auth: true, idempotencyKey: "required", body: ActivateAgentRequest, response: ActivateAgentResponse, successStatus: 201 },
  createHouseAgent: { method: "post", path: `${P}/agents/house`, operationId: "createHouseAgent", summary: "DEMO ONLY: create a house agent (no wallet owner; rate limited)", tag: "agents", auth: true, idempotencyKey: "required", body: CreateHouseAgentRequest, response: AgentResponse, successStatus: 201, demoOnly: true },
  myActivation: { method: "get", path: `${P}/me/activation`, operationId: "getMyActivation", summary: "Signed-in wallet's token-linked activation, if any", tag: "agents", auth: true, response: MyActivationResponse },
  patchAgent: { method: "patch", path: `${P}/agents/:id`, operationId: "updateAgent", summary: "Pause/resume or update bounded strategy (owner only)", tag: "agents", auth: true, idempotencyKey: "optional", params: z.object({ id: AgentId }), body: PatchAgentRequest, response: AgentResponse },
  agentActivity: { method: "get", path: `${P}/agents/:id/activity`, operationId: "listAgentActivity", summary: "Agent decision/action log (newest first)", tag: "agents", auth: false, params: z.object({ id: AgentId }), query: PageQuerySchema, response: AgentActionPage },

  treasury: { method: "get", path: `${P}/treasury`, operationId: "getTreasury", summary: "Public fee/allocation summary with reconciliation state", tag: "treasury", auth: false, response: TreasurySummary },
  treasurySummary: { method: "get", path: `${P}/treasury/summary`, operationId: "getTreasurySummary", summary: "Alias of /treasury", tag: "treasury", auth: false, response: TreasurySummary },
  treasuryEntries: { method: "get", path: `${P}/treasury/entries`, operationId: "listTreasuryEntries", summary: "Append-only treasury ledger (newest first)", tag: "treasury", auth: false, query: PageQuerySchema, response: TreasuryEntryPage },

  authChallenge: { method: "post", path: `${P}/auth/challenge`, operationId: "createAuthChallenge", summary: "Create single-use sign-in message", tag: "auth", auth: false, body: ChallengeRequest, response: ChallengeResponse },
  authVerify: { method: "post", path: `${P}/auth/verify`, operationId: "verifyAuthChallenge", summary: "Verify wallet signature, open session", tag: "auth", auth: false, body: VerifyRequest, response: VerifyResponse },
  authSession: { method: "get", path: `${P}/auth/session`, operationId: "getSession", summary: "Current session identity", tag: "auth", auth: true, response: WalletIdentity },

  prepareLaunch: { method: "post", path: `${P}/launches/prepare`, operationId: "prepareLaunch", summary: "Validate metadata; build atomic fee + Pump.fun create + 60/40 fee-sharing transaction", tag: "launches", auth: true, idempotencyKey: "required", body: PrepareLaunchRequest, response: PrepareLaunchResponse, successStatus: 201 },
  confirmLaunch: { method: "post", path: `${P}/launches/confirm`, operationId: "confirmLaunch", summary: "Verify landed transaction on-chain and register community (idempotent)", tag: "launches", auth: true, idempotencyKey: "optional", body: ConfirmLaunchRequest, response: LaunchResponse },
  launch: { method: "get", path: `${P}/launches/:id`, operationId: "getLaunch", summary: "Launch progress and errors", tag: "launches", auth: false, params: z.object({ id: LaunchId }), response: LaunchResponse },

  demoSignLaunch: { method: "post", path: `${P}/demo/launches/:id/sign`, operationId: "demoSignLaunch", summary: "DEMO ONLY: simulate wallet signing + landing of a prepared launch on the mock chain", tag: "demo", auth: true, params: z.object({ id: LaunchId }), body: z.object({ outcome: z.enum(["success", "tx_failed", "missing_fee_sharing", "wrong_fee", "launcher_share"]).default("success").describe("Demo failure injection: tx_failed, missing_fee_sharing (no fee-sharing config), wrong_fee (charge != 0.05 SOL), launcher_share (launcher given a creator-fee share).") }).meta({ id: "DemoSignRequest" }), response: DemoSignResponse, demoOnly: true },
} as const satisfies Record<string, RouteDef>;

export type RouteName = keyof typeof routes;
export type RouteResponse<N extends RouteName> = z.infer<(typeof routes)[N]["response"]>;
