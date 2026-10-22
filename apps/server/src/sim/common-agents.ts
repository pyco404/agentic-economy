import { createHash } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import { DEFAULT_STRATEGY, AGENT_SPEED } from './engine.js';
import type { AecoSnapshot, AgentSimState, SimState } from './types.js';
import type { NavGrid } from './nav.js';

/** Gamine's owner-bound hash pattern, domain-separated from launcher and legacy identities.
 * No random salt: a rebuild, full exit and re-entry always identify the same wallet/mint agent. */
export function commonAgentId(network: string, mint: string, wallet: string): string {
  return `agt_${createHash('sha256').update(`agentic-economy:common:v1:${network}:${mint}:${wallet}`).digest('hex').slice(0, 40)}`;
}
const stableNumber = (id: string) => Number.parseInt(id.slice(-8), 16);

/** Called only by the fenced simulation writer from a durable, complete finalized observation.
 * Reject the entire observation before mutation. A failure or old slot can never imply a full exit. */
export function applyCommonAgents(s: SimState, snapshot: AecoSnapshot, nav: NavGrid): void {
  const previous = s.aecoPopulation;
  if (previous && (snapshot.network !== previous.network || snapshot.mint !== previous.mint)) throw new Error('Common Agent mint/network change requires explicit migration');
  if (previous && snapshot.slot <= previous.slot) return;
  if (!Number.isSafeInteger(snapshot.slot) || snapshot.slot < 0 || !Number.isInteger(snapshot.decimals) || snapshot.decimals < 0 || snapshot.decimals > 255 || !Number.isFinite(Date.parse(snapshot.checkedAt))) throw new Error('Invalid Common Agent snapshot');
  new PublicKey(snapshot.mint);
  const owners = new Set<string>();
  for (const h of snapshot.holders) {
    if (owners.has(h.wallet) || !/^[1-9][0-9]*$/.test(h.balanceRaw) || !PublicKey.isOnCurve(new PublicKey(h.wallet).toBytes())) throw new Error('Invalid Common Agent holder');
    owners.add(h.wallet);
    const existing = s.agents[commonAgentId(snapshot.network, snapshot.mint, h.wallet)];
    if (existing && (existing.identity.kind !== 'aeco_observed' || existing.identity.wallet !== h.wallet)) throw new Error('Common Agent identity collision');
  }
  const entrances = s.buildingOrder.map(id => s.buildings[id]!.entrance).filter(p => nav.isWalkable(p));
  if (!entrances.length) throw new Error('No accessible Common Agent spawn');
  for (const h of [...snapshot.holders].sort((a, b) => a.wallet < b.wallet ? -1 : a.wallet > b.wallet ? 1 : 0)) {
    const id = commonAgentId(snapshot.network, snapshot.mint, h.wallet);
    const identity = { kind: 'aeco_observed' as const, wallet: h.wallet, tokenMint: snapshot.mint, network: snapshot.network, balanceRaw: h.balanceRaw, decimals: snapshot.decimals, observedSlot: snapshot.slot };
    let agent = s.agents[id];
    if (!agent) {
      // Full address is a collision-free persisted wallet name; the UI shortens it for display.
      agent = { id, name: 'Common Agent', displayName: `${h.wallet} · AECO`, identity, ownerWallet: null,
        communityId: snapshot.communityId ?? 'com_aecoCommon', profession: 'logistics_operator', status: 'active', activity: 'idle',
        strategy: { ...DEFAULT_STRATEGY, dailyBudget: 0, preferredResources: [] }, permissions: [],
        createdTick: s.tick, cell: { ...entrances[stableNumber(id) % entrances.length]! },
        path: [], target: null, taskId: null, busyTicks: 0, cargo: null, spentToday: 0,
        perf: { creditsEarned: 0, creditsSpent: 0, tasksCompleted: 0, tasksFailed: 0 }, totalPoints: 0, verifiedTasks: 0,
        nextDecisionTick: s.tick + stableNumber(id) % 32 };
      s.agents[id] = agent;
      s.agentOrder.push(id);
      // No starter credits, tasks, rewards, owner controls or wallet permissions.
    }
    if (snapshot.communityId) agent.communityId = snapshot.communityId;
    agent.identity = identity;
    agent.status = 'active';
    if (agent.activity === 'paused') agent.activity = 'idle';
  }
  for (const id of s.agentOrder) {
    const a = s.agents[id]!;
    if (a.identity.kind !== 'aeco_observed' || owners.has(a.identity.wallet)) continue;
    a.identity = { ...a.identity, balanceRaw: '0', observedSlot: snapshot.slot };
    a.status = 'paused'; a.activity = 'paused'; a.path = []; a.target = null;
  }
  s.aecoPopulation = { mint: snapshot.mint, network: snapshot.network, slot: snapshot.slot, checkedAt: snapshot.checkedAt, decimals: snapshot.decimals, holders: owners.size };
}

/** Basic Phase 2 simulation only: cached road/bridge paths and visiting neighbourhood entrances.
 * Stagger decisions, try a bounded number of destinations, and never run the economic planner. */
export function stepCommonAgent(a: AgentSimState, s: SimState, nav: NavGrid): boolean {
  if (a.path.length) {
    for (let i = 0; i < AGENT_SPEED && a.path.length; i++) a.cell = a.path.shift()!;
    if (!a.path.length) { a.target = null; a.activity = 'resting'; a.nextDecisionTick = s.tick + 12 + stableNumber(a.id) % 24; }
    return true;
  }
  if (s.tick < a.nextDecisionTick) return false;
  a.nextDecisionTick = s.tick + 32;
  const offset = (stableNumber(a.id) + Math.floor(s.tick / 32)) % s.buildingOrder.length;
  for (let attempt = 0; attempt < 4; attempt++) {
    const target = s.buildings[s.buildingOrder[(offset + attempt) % s.buildingOrder.length]!]!.entrance;
    const distance = nav.distance(a.cell, target);
    if (distance === null || distance < 2) continue;
    const path = nav.path(a.cell, target);
    if (!path?.length) continue;
    a.path = path; a.target = { ...target }; a.activity = 'moving'; return true;
  }
  a.activity = 'resting'; return false;
}
