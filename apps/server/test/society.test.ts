import { beforeAll, describe, expect, it } from 'vitest';
import { Agent, EconomicEvent, SocialMoment } from '@agentic-economy/shared';
import { generateWorld, type WorldLayout } from '@agentic-economy/world-spec';
import { SimEngine, createInitialState, DEFAULT_STRATEGY, hashState } from '../src/sim/engine.js';
import { configureSociety, SOCIAL_BUDGET, socialSummary, stepSocialAgent, stepSociety } from '../src/sim/society.js';
import { toAgent } from '../src/sim/view.js';
import { MemoryStore } from '../src/store/memory.js';
import { MemoryCoordinator } from '../src/coord/memory.js';
import { makeEnv } from './helpers.js';
import { demoWallet } from '../src/demo-seed.js';

let layout: WorldLayout;
beforeAll(() => { layout = generateWorld('social-test-world'); });
const waitPlanner = { name: 'test-wait', propose: () => ({ kind: 'wait' as const, reason: 'No claimed job', utility: 0 }) };
function city(count = 12) {
  const e = new SimEngine(createInitialState(layout), layout, waitPlanner);
  for (let i = 0; i < count; i++) e.enqueue({ type: 'agent.create_house', agentId: `agt_social${String(i).padStart(4, '0')}`,
    communityId: 'com_socialTest', syntheticName: `Neighbour_${100 + i}`, profession: 'merchant', strategy: { ...DEFAULT_STRATEGY } }, i);
  e.step(); configureSociety(e.state, true);
  stepSociety(e.state, e.nav); // Tick 1: no work before the first cadence.
  return e;
}
function socialStep(e: SimEngine, tick: number) { e.state.tick = tick; return stepSociety(e.state, e.nav); }

describe('authoritative social simulation', () => {
  it('leaves legacy snapshots and economic behavior unchanged while disabled', () => {
    const e = city(0); delete e.state.society;
    const before = JSON.stringify(e.state);
    configureSociety(e.state, false); stepSociety(e.state, e.nav);
    expect(JSON.stringify(e.state)).toBe(before);
  });
  it('creates proximity-based encounters, symmetric consequences and bounded memories without financial effects', () => {
    const e = city(4), s = e.state;
    s.society!.nextGatheringTick = 1e9;
    const balances = JSON.stringify(s.ledger), points = JSON.stringify(s.epochPoints);
    const first = socialStep(e, 5);
    expect(first.events.filter(x => x.moment.phase === 'encounter')).toHaveLength(2);
    for (const x of first.events) expect(SocialMoment.safeParse(x.moment).success).toBe(true);
    socialStep(e, 20);
    const a = s.society!.profiles[s.agentOrder[0]!]!;
    expect(a.relationships).toHaveLength(1); expect(a.relationships[0]!.encounters).toBe(1);
    const b = s.society!.profiles[a.relationships[0]!.agentId]!;
    expect(b.relationships[0]!.affinity).toBe(a.relationships[0]!.affinity);
    expect(a.memories[0]!.phase).toBe('consequence');
    expect(JSON.stringify(s.ledger)).toBe(balances); expect(JSON.stringify(s.epochPoints)).toBe(points);
    expect(s.stats.verifiedTasks).toBe(0);
    for (let tick = 25; tick < 3000; tick += 5) socialStep(e, tick);
    expect(s.society!.history.length).toBeLessThanOrEqual(SOCIAL_BUDGET.history);
    for (const p of Object.values(s.society!.profiles)) {
      expect(p.memories.length).toBeLessThanOrEqual(12); expect(p.relationships.length).toBeLessThanOrEqual(12);
    }
  });
  it('derives disagreements, reconciliation and celebrations from persistent circumstances', () => {
    const e = city(2), s = e.state;
    s.society!.nextGatheringTick = 1e9;
    socialStep(e, 5);
    const [a, b] = s.agentOrder.map(id => s.agents[id]!);
    const pa = s.society!.profiles[a!.id]!, pb = s.society!.profiles[b!.id]!;
    const ready = () => { for (const p of [pa, pb]) { p.current = null; p.visit = null; p.need = 100; p.cooldown = 0; } s.society!.nextEncounterTick = 0; };
    ready(); pa.personality.temperament = 'practical'; pb.personality.temperament = 'practical';
    expect(socialStep(e, 10).events[0]!.moment.kind).toBe('negotiation');
    socialStep(e, 25);
    pa.personality.temperament = 'spirited'; pb.personality.temperament = 'reflective';
    pa.personality.interest = 'music'; pb.personality.interest = 'food';
    pa.relationships = []; pb.relationships = [];
    let dispute: ReturnType<typeof stepSociety>['events'][number] | undefined;
    for (let tick = 100; tick < 300; tick += 5) {
      ready();
      const candidate = socialStep(e, tick).events.find(e => e.moment.kind === 'disagreement');
      if (candidate) { dispute = candidate; break; }
    }
    expect(dispute).toBeDefined();
    socialStep(e, dispute!.moment.tick + 15);
    expect(pa.relationships[0]!.affinity).toBeLessThan(0);
    ready();
    const followUp = socialStep(e, dispute!.moment.tick + 100).events[0]!.moment;
    expect(followUp.kind).toBe('reconciliation'); expect(followUp.causedBy).toBe(dispute!.moment.id);
    socialStep(e, followUp.tick + 15);
    expect(pa.relationships[0]!.affinity).toBeGreaterThan(0);
    ready(); a!.perf.tasksCompleted++;
    expect(socialStep(e, followUp.tick + 100).events[0]!.moment.kind).toBe('celebration');
    expect(s.stats.verifiedTasks).toBe(0); expect(a!.totalPoints).toBe(0);
  });
  it('preserves personalities, relationships and identical event output across snapshot restart and command replay', () => {
    const e = city(20);
    e.enqueue({ type: 'society.configure', enabled: true }, 100);
    for (let i = 0; i < 45; i++) e.step();
    const recovered = new SimEngine(JSON.parse(JSON.stringify(e.state)), layout, waitPlanner);
    for (let i = 0; i < 150; i++) {
      expect(recovered.step()).toEqual(e.step());
      expect(hashState(recovered.state)).toBe(hashState(e.state));
    }
    expect(Object.values(e.state.society!.profiles).some(p => p.memories.length > 0)).toBe(true);
    expect(Agent.safeParse(toAgent(e.state, e.state.agents[e.state.agentOrder[0]!]!)).success).toBe(true);
  });
  it('does not interrupt claimed jobs or paused agents, and never invents a completed encounter after an exit', () => {
    const e = city(3), s = e.state;
    s.society!.nextGatheringTick = 1e9;
    const [a, b, c] = s.agentOrder.map(id => s.agents[id]!);
    c!.taskId = 'tsk_doNotInterrupt';
    socialStep(e, 5);
    expect(s.society!.profiles[c!.id]!.current).toBeNull();
    expect(stepSocialAgent(s, c!)).toBe(false); expect(c!.taskId).toBe('tsk_doNotInterrupt');
    expect(socialSummary(s, c!.id)!.current).toBeNull();
    expect(socialSummary(s, c!.id)!.destination).toBeNull();
    a!.status = 'paused'; socialStep(e, 10); socialStep(e, 20);
    expect(s.society!.profiles[b!.id]!.relationships).toHaveLength(0);
    expect(s.society!.history.some(h => h.phase === 'consequence')).toBe(false);
    configureSociety(s, false);
    expect(socialSummary(s, b!.id)).toBeUndefined();
  });
  it('gathers actual arrivals at existing entrances and concludes each gathering only once', () => {
    const e = city(32), s = e.state, events = [];
    const hall = Object.values(s.buildings).find(b => b.kind === 'town_hall')!;
    // Use the real civic plaza and real walkable neighbour cells, not teleported event attendees.
    for (const a of Object.values(s.agents)) a.cell = { ...hall.entrance };
    s.society!.nextGatheringTick = 0;
    for (let t = 5; t < 250; t++) {
      s.tick = t;
      for (const a of Object.values(s.agents)) { stepSocialAgent(s, a); expect(e.nav.isWalkable(a.cell)).toBe(true); }
      const out = stepSociety(s, e.nav); events.push(...out.events);
      for (const g of s.society!.gatherings) expect(g.participants.length).toBeLessThanOrEqual(8);
    }
    const invites = events.filter(e => e.moment.phase === 'invitation');
    expect(invites.length).toBeGreaterThan(0);
    const gathering = events.find(e => ['festival', 'market', 'performance'].includes(e.moment.kind) && e.moment.phase === 'encounter');
    expect(gathering).toBeDefined(); expect(gathering!.moment.participants.length).toBeGreaterThanOrEqual(2);
    const consequenceIds = events.filter(e => e.moment.phase === 'consequence').map(e => e.moment.id);
    expect(new Set(consequenceIds).size).toBe(consequenceIds.length);
    const causes = events.filter(e => e.moment.phase === "consequence").map(e => e.moment.causedBy);
    expect(new Set(causes).size).toBe(causes.length);
  });
  it('bounds spatial comparisons, crowd sizes and snapshot overhead with 400 agents', () => {
    const e = city(400); e.state.society!.nextGatheringTick = 1e9;
    const start = performance.now();
    for (let tick = 5; tick <= 200; tick += 5) {
      const out = socialStep(e, tick);
      expect(out.comparisons).toBeLessThanOrEqual(SOCIAL_BUDGET.comparisons);
      expect(out.events.filter(x => x.moment.phase === 'encounter').length).toBeLessThanOrEqual(SOCIAL_BUDGET.encountersPerStep);
    }
    const elapsed = performance.now() - start;
    console.log(JSON.stringify({ fixture: "social-400", meanStepMs: Number((elapsed / 40).toFixed(2)), comparisonCap: SOCIAL_BUDGET.comparisons }));
    expect(elapsed).toBeLessThan(2500);
    expect(Buffer.byteLength(JSON.stringify(e.state.society))).toBeLessThan(1_500_000);
  });
  it('persists social events/actions through the existing fenced writer and recovers after leadership loss', async () => {
    const store = new MemoryStore(), coord = new MemoryCoordinator(store);
    const env = await makeEnv({ SOCIAL_SIMULATION_ENABLED: 'true' }, { store, coord });
    try {
      const rt = env.ctx.runtime;
      const subscribers: string[][] = [[], []];
      const offA = rt.hub!.subscribe(event => subscribers[0]!.push(JSON.stringify(event)));
      const offB = rt.hub!.subscribe(event => subscribers[1]!.push(JSON.stringify(event)));
      await rt.bus.enqueue({ type: 'aeco.reconcile', mint: demoWallet(80), network: 'devnet', slot: 1,
        checkedAt: '2026-10-23T00:00:00.000Z', decimals: 6,
        holders: Array.from({ length: 64 }, (_, i) => ({ wallet: demoWallet(100 + i), balanceRaw: '1000000' })) }, 'social-test:holders');
      for (let i = 0; i < 120; i++) await rt.tickOnce();
      offA(); offB();
      expect(subscribers[0]).toEqual(subscribers[1]);
      expect(subscribers[0]!.some(raw => { const e = JSON.parse(raw); return e.type === 'activity.created' && e.data.event.type.startsWith('social.'); })).toBe(true);
      const seqs = subscribers[0]!.map(raw => JSON.parse(raw).seq);
      expect(new Set(seqs).size).toBe(seqs.length);
      const expected = new SimEngine(JSON.parse(JSON.stringify(rt.state)), rt.layout);
      const next = expected.step(); coord.killLeader(); const actual = await rt.tickOnce();
      expect(actual).toEqual(next); expect(hashState(rt.state)).toBe(hashState(expected.state));
      const witness = rt.state.society!.history.find(h => h.participants.length > 0)!.participants[0]!;
      const history = await store.listAgentActions(witness, null, 100);
      expect(history.items.some(a => a.kind === 'social')).toBe(true);
      const events = await store.listEvents(null, 100);
      for (const event of events.items) expect(EconomicEvent.safeParse(event).success).toBe(true);
    } finally { await env.close(); }
  }, 40000);
});
