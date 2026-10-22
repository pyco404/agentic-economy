import type {
  AgentPermission,
  AgentStrategy,
  BuildingKind,
  GridPos,
  Profession,
  Resource,
  TaskKind,
  TaskStatus,
  EconomicEventType,
  AgentState as AgentActivityState,
  AgentIdentity,
} from "@agentic-economy/shared";

/**
 * Authoritative simulation state. Plain JSON (no Maps/BigInts/classes) so snapshots are trivially
 * serializable and two states can be compared by hashing their canonical JSON.
 * All money is integer milli-credits (mCC). All randomness flows through `rngState`.
 */
export interface SimState {
  /** 2 since contract 0.3.0 (agent identity). v1 snapshots are upgraded on load: see `sim/identity.ts`. */
  version: 2;
  worldSeed: string;
  /** Last complete finalized holder snapshot, persisted in the existing fenced snapshot/journal. */
  aecoPopulation?: { mint: string; network: "devnet" | "mainnet-beta"; slot: number; checkedAt: string; decimals: number; holders: number };
  tick: number;
  rngState: number;
  counters: { action: number; task: number; lot: number; receipt: number; event: number };
  buildings: Record<string, BuildingState>;
  /** Stable iteration order (object key order is insertion order but we never rely on it). */
  buildingOrder: string[];
  agents: Record<string, AgentSimState>;
  agentOrder: string[];
  tasks: Record<string, TaskState>;
  ledger: LedgerState;
  stats: {
    produced: Record<Resource, number>;
    consumed: Record<Resource, number>;
    verifiedTasks: number;
    verifiedTasksThisEpoch: number;
    pointsThisEpoch: number;
  };
  market: Record<Resource, { price: number; dayAgo: number }>;
  residents: { population: number; breadBacklog: number };
  receiptsHead: string;
  epoch: number;
  /** Points per agent for the current epoch (dry-run reward basis). */
  epochPoints: Record<string, number>;
  /** Receipt ids per agent for the current epoch (capped). */
  epochReceipts: Record<string, string[]>;
  communities: Record<string, { communityId: string; hqBuildingId: string | null }>;
}

export interface Lot {
  id: string;
  qty: number;
  /** Building ids this lot has been stored at, oldest first (provenance; capped). */
  path: string[];
}

export interface BuildingState {
  id: string;
  kind: BuildingKind;
  name: string;
  origin: GridPos;
  entrance: GridPos;
  status: "active" | "idle" | "needs_maintenance" | "reserved_lot";
  condition: number;
  /** Account that pays for and earns from this building. "city" unless agent-operated. */
  account: string;
  ownerAgentId: string | null;
  communityId: string | null;
  branding: { primary: string; accent: string } | null;
  stock: Partial<Record<Resource, Lot[]>>;
  /** Goods reserved for open tasks, by task id. */
  reserved: Record<string, { resource: Resource; lots: Lot[] }>;
  production: { progress: number; running: boolean; inputsConsumed: boolean };
  /** Agent currently working a shift here. */
  workerAgentId: string | null;
  /** Material consumed by repairs (stone for masonry, timber otherwise). */
  repairResource: Resource;
  /** Max stock (incl. reserved). */
  storageCapacity: number;
}

export interface AgentSimState {
  id: string;
  /** Free-text name from creation (historical, not unique). */
  name: string;
  /** Wallet with owner controls: activating wallet (token_linked), legacy owner (legacy), null (house). */
  ownerWallet: string | null;
  communityId: string;
  profession: Profession;
  status: "active" | "paused";
  activity: AgentActivityState;
  strategy: AgentStrategy;
  permissions: AgentPermission[];
  createdTick: number;
  cell: GridPos;
  path: GridPos[];
  target: GridPos | null;
  taskId: string | null;
  /** Ticks remaining for an in-place activity (shift, repair, rest). */
  busyTicks: number;
  cargo: { resource: Resource; lots: Lot[] } | null;
  spentToday: number;
  perf: { creditsEarned: number; creditsSpent: number; tasksCompleted: number; tasksFailed: number };
  totalPoints: number;
  verifiedTasks: number;
  /** Next tick the planner may run for this agent (decision throttling). */
  nextDecisionTick: number;
  identity: AgentIdentity;
  /** Persisted, unique name shown everywhere. */
  displayName: string;
}

export interface TaskState {
  id: string;
  kind: TaskKind;
  status: TaskStatus;
  createdTick: number;
  expiresTick: number;
  fromBuildingId: string | null;
  toBuildingId: string;
  resource: Resource | null;
  quantity: number;
  /** Fee paid to the performing agent (escrowed). Grows with the urgency premium. */
  rewardCredits: number;
  baseReward: number;
  /** Cost of goods paid to the supplier on delivery (escrowed). */
  goodsCredits: number;
  /** Account that funded the escrow. */
  payer: string;
  points: number;
  claimedBy: string | null;
  claimedTick: number | null;
  pickupTick: number | null;
  /** Shift tasks: ticks of presence still required. */
  workTicksRemaining: number;
  receiptId: string | null;
  /** Profession(s) allowed to claim. */
  professions: Profession[];
}

export interface LedgerState {
  balances: Record<string, number>;
  issued: number;
  burned: number;
  issuedThisEpoch: number;
}

/* --------------------------------------------------------------- outputs */

export interface SimEvent {
  /** Deterministic id: tick + per-tick index. */
  id: string;
  tick: number;
  type: EconomicEventType;
  summary: string;
  agentId: string | null;
  buildingId: string | null;
  communityId: string | null;
  data: Record<string, unknown>;
}

export interface SimAction {
  id: string;
  agentId: string;
  tick: number;
  kind: "move" | "claim_task" | "pickup" | "deliver" | "produce" | "trade" | "maintain" | "rest" | "wait" | "rejected";
  reason: string;
  utility: number;
  taskId: string | null;
  buildingId: string | null;
  detail: Record<string, unknown>;
}

export interface SimReceipt {
  id: string;
  taskId: string;
  agentId: string;
  ownerWallet: string | null;
  kind: TaskKind;
  claimedTick: number;
  pickupTick: number | null;
  completedTick: number;
  from: GridPos | null;
  to: GridPos;
  resource: Resource | null;
  quantity: number;
  lots: string[];
  creditsPaid: number;
  pointsAwarded: number;
  pointAdjustments: Array<{ reason: string; delta: number }>;
  checks: Array<{ check: string; passed: boolean }>;
  prevHash: string;
  hash: string;
}

export interface SimRewardRecord {
  id: string;
  epoch: number;
  agentId: string;
  ownerWallet: string | null;
  points: number;
  estimatedShareBps: number;
  receiptIds: string[];
}

export interface TickOutput {
  tick: number;
  events: SimEvent[];
  actions: SimAction[];
  receipts: SimReceipt[];
  rewards: SimRewardRecord[];
  moves: Array<{ id: string; cell: GridPos; activity: AgentActivityState; target: GridPos | null }>;
  pricesChanged: boolean;
  changedBuildings: string[];
}

/** Inputs applied at the start of a tick. Persisted (command log) so state can be replayed deterministically. */
export interface AecoSnapshot {
  /** Existing verified native token community when available; never creates a synthetic launch. */
  communityId?: string;
  mint: string; network: "devnet" | "mainnet-beta"; slot: number; checkedAt: string; decimals: number;
  holders: Array<{ wallet: string; balanceRaw: string }>;
}
export type SimCommand =
  | ({ type: "aeco.reconcile" } & AecoSnapshot)
  | {
      /** Pre-0.3.0 holder activation. No longer issued; still replayed from the log (creates a legacy agent). */
      type: "agent.create";
      agentId: string;
      ownerWallet: string;
      communityId: string;
      name: string;
      profession: Profession;
      strategy: AgentStrategy;
    }
  | {
      /** Token-linked activation; the activation row was reserved atomically with this command. */
      type: "agent.activate";
      agentId: string;
      activationId: string;
      communityId: string;
      launchId: string;
      tokenMint: string;
      activatingWallet: string;
      displayName: string;
      profession: Profession;
      strategy: AgentStrategy;
    }
  | {
      /** Demo house agent; the name was reserved in the database before queueing. No owner. */
      type: "agent.create_house";
      agentId: string;
      communityId: string;
      syntheticName: string;
      profession: Profession;
      strategy: AgentStrategy;
    }
  | { type: "agent.update"; agentId: string; status?: "active" | "paused"; strategy?: Partial<AgentStrategy> }
  | { type: "community.register"; communityId: string; name: string; branding: { primary: string; accent: string } };

export interface LoggedCommand {
  /** The tick at whose start the command is applied. */
  tick: number;
  seq: number;
  command: SimCommand;
}
