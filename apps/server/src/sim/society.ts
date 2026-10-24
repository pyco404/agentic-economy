import type { AgentSocial, GridPos, SocialKind, SocialMoment, SocialPersonality, SocialPresence, SocialRelationship } from '@agentic-economy/shared';
import type { AgentSimState, SimState } from './types.js';
import type { NavGrid } from './nav.js';

export const SOCIAL_BUDGET = { interval: 5, encounterSpacing: 20, agentsPerStep: 192, comparisons: 512, encountersPerStep: 2,
  memories: 12, relationships: 12, history: 96, gatherings: 2, crowd: 8, venues: 16 } as const;
interface Profile {
  lastSpeech: string; celebratedTasks: number;
  personality: SocialPersonality; need: number; cooldown: number; current: SocialPresence | null;
  memories: SocialMoment[]; relationships: SocialRelationship[];
  visit: { eventId: string; target: GridPos; untilTick: number; buildingId: string; purpose: string } | null;
}
interface Gathering { invitationId: string; id: string; kind: SocialKind; buildingId: string; participants: string[]; untilTick: number; arrived: string[] }
export interface SocietyState {
  version: 1; enabled: boolean; startedTick: number; counter: number; cursor: number; nextEncounterTick: number; nextGatheringTick: number;
  profiles: Record<string, Profile>; history: SocialMoment[]; gatherings: Gathering[];
}
export interface SocialOutput { moment: SocialMoment; speech: string; reaction: SocialPresence['reaction'] }
const hash = (text: string) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const distance = (a: GridPos, b: GridPos) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const temperaments = ['sociable', 'reflective', 'spirited', 'practical'] as const;
const interests = ['music', 'gardening', 'craft', 'food', 'stories'] as const;
const routines = ['morning market', 'afternoon stroll', 'evening square'] as const;
const topics = { music: 'a new melody', gardening: 'the riverside gardens', craft: 'a handmade design', food: 'fresh bread', stories: 'a city story' };
const name = (a: AgentSimState) => a.identity.kind === 'aeco_observed'
  ? `${a.identity.wallet.slice(0, 4)}…${a.identity.wallet.slice(-4)}` : a.displayName;

export function configureSociety(s: SimState, enabled: boolean) {
  if (!s.society && !enabled) return; // Legacy snapshots remain byte-for-byte compatible while disabled.
  s.society ??= { version: 1, enabled, startedTick: s.tick, counter: 0, cursor: 0,
    nextEncounterTick: s.tick, nextGatheringTick: s.tick + 30, profiles: {}, history: [], gatherings: [] };
  s.society.enabled = enabled;
  if (!enabled) {
    s.society.gatherings = [];
    for (const [id, p] of Object.entries(s.society.profiles)) {
      if (p.visit && s.agents[id] && !s.agents[id]!.taskId && !s.agents[id]!.cargo) { s.agents[id]!.path = []; s.agents[id]!.target = null; }
      p.current = null; p.visit = null;
    }
  }
}
function profile(s: SimState, a: AgentSimState): Profile {
  const seed = hash(`${s.worldSeed}:social:v1:${a.id}`);
  return s.society!.profiles[a.id] ??= { lastSpeech: "", celebratedTasks: a.perf.tasksCompleted, personality: { temperament: temperaments[seed % 4]!,
    interest: interests[Math.floor(seed / 4) % 5]!, routine: routines[Math.floor(seed / 20) % 3]! },
    need: 40 + seed % 35, cooldown: s.tick, current: null, memories: [], relationships: [], visit: null };
}
function free(a: AgentSimState, p: Profile, tick: number) {
  return a.status === 'active' && !a.taskId && !a.cargo && a.busyTicks === 0 && !p.visit &&
    !p.current && p.cooldown <= tick;
}
function remember(s: SimState, moment: SocialMoment) {
  const society = s.society!;
  society.history.unshift(moment); society.history.length = Math.min(society.history.length, SOCIAL_BUDGET.history);
  for (const id of moment.participants) {
    const p = society.profiles[id]; if (!p) continue;
    p.memories.unshift(moment); p.memories.length = Math.min(p.memories.length, SOCIAL_BUDGET.memories);
  }
}
function relation(p: Profile, other: string, delta: number, tick: number) {
  let r = p.relationships.find(r => r.agentId === other);
  if (!r) {
    if (p.relationships.length >= SOCIAL_BUDGET.relationships) {
      p.relationships.sort((a, b) => a.lastTick - b.lastTick || a.agentId.localeCompare(b.agentId)); p.relationships.shift();
    }
    p.relationships.push(r = { agentId: other, affinity: 0, encounters: 0, lastTick: tick });
  }
  r.affinity = Math.max(-100, Math.min(100, r.affinity + delta)); r.encounters++; r.lastTick = tick;
}
function moment(s: SimState, kind: SocialKind, phase: SocialMoment['phase'], participants: string[],
  buildingId: string | null, location: GridPos, summary: string): SocialMoment {
  return { id: `soc_${s.tick.toString(36)}_${(++s.society!.counter).toString(36)}`, tick: s.tick,
    kind, phase, summary: summary.slice(0, 320), participants, buildingId, location: { ...location }, simulated: true };
}
function present(s: SimState, a: AgentSimState, m: SocialMoment, speech: string,
  reaction: SocialPresence['reaction'], untilTick: number) {
  const p = profile(s, a);
  p.lastSpeech = speech;
  p.current = { eventId: m.id, kind: m.kind, description: m.summary.slice(0, 160), speech,
    reaction, partnerIds: m.participants.filter(id => id !== a.id), untilTick, location: { ...m.location } };
}
/** No network/LLM calls: bounded safe grammar chooses topics from needs, venue and shared memories. */
function conversation(s: SimState, a: AgentSimState, b: AgentSimState): SocialOutput {
  const pa = profile(s, a), pb = profile(s, b), past = pa.relationships.find(r => r.agentId === b.id);
  const variation = hash(`${a.id}:${b.id}:${s.tick}:${past?.encounters ?? 0}`);
  const shared = pa.personality.interest === pb.personality.interest;
  const kind: SocialKind = a.perf.tasksCompleted > pa.celebratedTasks ? 'celebration' : past && past.affinity < 0 ? 'reconciliation'
    : past && past.affinity >= 18 ? 'friendship'
      : !shared && pa.personality.temperament === 'spirited' && variation % 4 === 0 ? 'disagreement'
        : pa.personality.temperament === 'practical' && pb.personality.temperament === 'practical' ? 'negotiation' : 'conversation';
  if (kind === "celebration") pa.celebratedTasks = a.perf.tasksCompleted;
  const topic = topics[variation % 2 ? pa.personality.interest : pb.personality.interest];
  const descriptions: Record<typeof kind, string> = {
    celebration: `${name(a)} and ${name(b)} celebrate a completed neighbourhood task.`,
    conversation: `${name(a)} and ${name(b)} stop to talk about ${topic}.`,
    friendship: `${name(a)} catches up with friend ${name(b)} about ${topic}.`,
    disagreement: `${name(a)} and ${name(b)} disagree over plans for ${topic}.`,
    reconciliation: `${name(a)} and ${name(b)} revisit their disagreement and find common ground.`,
    negotiation: `${name(a)} and ${name(b)} work out a shared plan for ${topic}.`,
  };
  const m = moment(s, kind, 'encounter', [a.id, b.id], null, a.cell, descriptions[kind]);
  const remembered = pa.memories.find(memory => memory.participants.includes(b.id) &&
    (kind !== 'reconciliation' || memory.kind === 'disagreement' && memory.phase === 'encounter'));
  m.causedBy = remembered?.id ?? null;
  const phrases = kind === 'celebration' ? ['That task is finished. Thanks for cheering me on!', 'A little celebration for a job well done.'] : kind === 'reconciliation' ? ['Can we start again?', 'Let’s find a middle ground.']
    : kind === 'disagreement' ? ['I see it differently.', 'Could we try another approach?']
      : kind === 'friendship' ? [`Good to see you! How is ${topic}?`, 'Same place tomorrow?']
        : kind === 'negotiation' ? ['You sketch it; I’ll help build it.', 'Let’s agree on a plan first.']
          : [`Have you noticed ${topic}?`, `I have an idea about ${topic}.`, `Tell me more about ${topic}.`];
  const freshPhrases = phrases.filter(line => line !== pa.lastSpeech);
  const speech = freshPhrases[variation % freshPhrases.length]!;
  a.path = []; a.target = null; b.path = []; b.target = null;
  present(s, a, m, speech, kind === 'disagreement' ? 'consider' : 'talk', s.tick + 14);
  present(s, b, m, kind === 'reconciliation' ? 'I’m glad we talked.' : shared ? 'That’s one of my favourites.' : 'Let me think about that.', 'talk', s.tick + 14);
  remember(s, m);
  return { moment: m, speech, reaction: 'talk' };
}
function conclude(s: SimState, current: SocialPresence, output: SocialOutput[]) {
  const ids = Object.keys(s.society!.profiles).filter(id => s.society!.profiles[id]!.current?.eventId === current.eventId).sort();
  const presentIds = ids.filter(id => s.agents[id]?.status === 'active');
  // An exit/pause is not a successful social interaction. Clear it without inventing a consequence.
  if (presentIds.length >= 2) {
    const delta = current.kind === 'disagreement' ? -8 : current.kind === 'reconciliation' ? 16 : 10;
    const becameFriends = presentIds.length === 2 && (s.society!.profiles[presentIds[0]!]!.relationships.find(r => r.agentId === presentIds[1])?.affinity ?? 0) < 18 && delta > 0;
    for (const id of presentIds) for (const other of presentIds) if (id !== other)
      relation(s.society!.profiles[id]!, other, delta, s.tick);
    const summary = current.kind === 'disagreement' ? 'A small disagreement ends; the neighbours give each other space.'
      : current.kind === 'reconciliation' ? 'A follow-up conversation settles a disagreement and rebuilds trust.'
        : current.kind === 'negotiation' ? 'The neighbours agree on a shared creative plan. No payment or paid service is involved.'
          : becameFriends && (s.society!.profiles[presentIds[0]!]!.relationships.find(r => r.agentId === presentIds[1])?.affinity ?? 0) >= 18
            ? `${name(s.agents[presentIds[0]!]!)} and ${name(s.agents[presentIds[1]!]!)} become friends after getting to know each other.`
            : presentIds.length === 2 ? `${name(s.agents[presentIds[0]!]!)} and ${name(s.agents[presentIds[1]!]!)} leave their ${current.kind} feeling more connected.`
              : `${presentIds.length} neighbours leave their ${current.kind} with stronger connections.`;
    const m = moment(s, current.kind, 'consequence', presentIds, null, current.location, summary);
    m.causedBy = current.eventId;
    remember(s, m); output.push({ moment: m, speech: '', reaction: 'wave' });
  }
  for (const id of ids) {
    const p = s.society!.profiles[id]!;
    p.need = Math.max(0, p.need - 45); p.current = null; p.visit = null;
    p.cooldown = s.tick + 40 + hash(id) % 40;
  }
}

/** Called only from the fenced engine, every five ticks. Spatial bins avoid an all-pairs scan. */
export function stepSociety(s: SimState, nav: NavGrid, workEvents: Array<{ type: string; buildingId: string | null; agentId: string | null; data?: Record<string, unknown> }> = []): { events: SocialOutput[]; changed: string[]; comparisons: number } {
  const result = { events: [] as SocialOutput[], changed: [] as string[], comparisons: 0 };
  const society = s.society;
  if (!society?.enabled || s.tick % SOCIAL_BUDGET.interval) return result;
  const ended = new Set<string>();
  for (const [id, p] of Object.entries(society.profiles)) {
    if (s.agents[id]?.status !== 'active') { p.current = null; p.visit = null; continue; }
    if (p.visit && p.visit.untilTick <= s.tick) { p.visit = null; p.cooldown = s.tick + 30; }
    if (p.current && p.current.untilTick <= s.tick && !ended.has(p.current.eventId)) {
      ended.add(p.current.eventId); conclude(s, p.current, result.events);
    }
  }
  const bins = new Map<string, AgentSimState[]>();
  for (let i = 0; i < s.agentOrder.length; i++) {
    const id = s.agentOrder[(society.cursor + i) % s.agentOrder.length]!;
    const a = s.agents[id]!; if (a.status !== 'active') continue;
    const p = profile(s, a); p.need = Math.min(100, p.need + (p.personality.temperament === 'sociable' ? 3 : 1));
    const key = `${Math.floor(a.cell.x / 3)},${Math.floor(a.cell.y / 3)}`;
    // Crowded entrances must not create unbounded candidate scans.
    const bucket = bins.get(key) ?? []; if (bucket.length < 24) bucket.push(a); bins.set(key, bucket);
  }
  let starts = 0;
  for (let i = 0; s.tick >= society.nextEncounterTick && i < Math.min(s.agentOrder.length, SOCIAL_BUDGET.agentsPerStep); i++) {
    const a = s.agents[s.agentOrder[(society.cursor + i) % s.agentOrder.length]!]!, pa = society.profiles[a.id];
    if (!pa || !free(a, pa, s.tick) || pa.need < 35) continue;
    const bx = Math.floor(a.cell.x / 3), by = Math.floor(a.cell.y / 3);
    const nearby: AgentSimState[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) nearby.push(...(bins.get(`${bx + dx},${by + dy}`) ?? []));
    // A familiar neighbour gets priority: memories influence who meets again.
    nearby.sort((b, c) => Number(pa.relationships.some(r => r.agentId === c.id)) - Number(pa.relationships.some(r => r.agentId === b.id)) || b.id.localeCompare(c.id));
    for (const b of nearby) {
      if (result.comparisons >= SOCIAL_BUDGET.comparisons) break;
      result.comparisons++;
      if (a.id === b.id || !free(b, profile(s, b), s.tick) || distance(a.cell, b.cell) > 1) continue;
      result.events.push(conversation(s, a, b)); starts++; break;
    }
    if (starts >= SOCIAL_BUDGET.encountersPerStep || result.comparisons >= SOCIAL_BUDGET.comparisons) break;
  }
  if (starts) society.nextEncounterTick = s.tick + SOCIAL_BUDGET.encounterSpacing;
  society.cursor = (society.cursor + SOCIAL_BUDGET.agentsPerStep) % Math.max(1, s.agentOrder.length);
  advanceGatherings(s, nav, result.events);
  for (const e of workEvents.filter(e => e.type === 'task.verified' && e.data?.taskKind === 'maintenance' && e.buildingId).slice(0, 1)) {
    const building = s.buildings[e.buildingId!]!;
    const m = moment(s, 'construction', 'consequence', e.agentId ? [e.agentId] : [], building.id, building.entrance,
      `Repairs at ${building.name} are finished; the neighbourhood has a maintained workplace again.`);
    remember(s, m); result.events.push({ moment: m, speech: 'Ready for the next shift.', reaction: 'wave' });
  }
  planRoutines(s, nav);
  // Publish compact social presence together with same-tick agent movement, in existing 128-agent batches.
  result.changed = s.agentOrder.filter(id => society.profiles[id]?.current || society.profiles[id]?.visit ||
    society.profiles[id]?.memories[0]?.tick === s.tick);
  return result;
}

function advanceGatherings(s: SimState, nav: NavGrid, output: SocialOutput[]) {
  const society = s.society!;
  for (const g of society.gatherings) {
    if (s.tick >= g.untilTick) {
      for (const id of g.participants) {
        const p = society.profiles[id]!, a = s.agents[id];
        if (p.visit?.eventId === g.id) { p.visit = null; p.cooldown = s.tick + 60; if (a) { a.path = []; a.target = null; } }
      }
      continue;
    }
    const building = s.buildings[g.buildingId]!;
    const arrived = g.participants.filter(id => s.agents[id]?.status === 'active' && distance(s.agents[id]!.cell, building.entrance) <= 2);
    for (const id of arrived) {
      if (g.arrived.includes(id)) continue;
      g.arrived.push(id);
    }
    // A planned event is not a performance/crowd until neighbours actually arrive.
    if (arrived.length >= 2 && (g.kind !== 'performance' || arrived.includes(g.participants[0]!))) {
      const speech = g.kind === 'performance' ? 'A little music for the square!' : g.kind === 'market' ? 'Look at what we made today!' : 'There’s room for everyone here.';
      const m = { causedBy: g.invitationId, id: g.id, tick: s.tick, kind: g.kind, phase: 'encounter' as const,
        summary: `${arrived.length} neighbours gather for a ${g.kind} at ${building.name}.`, participants: arrived,
        buildingId: building.id, location: { ...building.entrance }, simulated: true as const };
      const first = !society.history.some(h => h.id === g.id && h.phase === 'encounter');
      for (const id of arrived) {
        const p = society.profiles[id]!;
        if (!p.current) present(s, s.agents[id]!, m, id === arrived[0] ? speech : 'Glad I came along.', 'cheer', g.untilTick);
      }
      if (first) { remember(s, m); output.push({ moment: m, speech, reaction: 'cheer' }); }
    }

  }
  society.gatherings = society.gatherings.filter(g => g.untilTick > s.tick);
  if (s.tick < society.nextGatheringTick || society.gatherings.length >= SOCIAL_BUDGET.gatherings) return;
  society.nextGatheringTick = s.tick + 30;
  const venues = s.buildingOrder.filter(id => ['market', 'town_hall', 'bakery', 'warehouse'].includes(s.buildings[id]!.kind) &&
    s.buildings[id]!.status !== 'reserved_lot' && nav.isWalkable(s.buildings[id]!.entrance)).slice(0, SOCIAL_BUDGET.venues);
  if (!venues.length) return;
  const building = s.buildings[venues[Math.floor(s.tick / 30) % venues.length]!]!;
  const candidates = s.agentOrder.map(id => s.agents[id]!).filter(a => free(a, profile(s, a), s.tick) && distance(a.cell, building.entrance) < 50)
    .sort((a, b) => distance(a.cell, building.entrance) - distance(b.cell, building.entrance) || a.id.localeCompare(b.id));
  const participants: string[] = [];
  const destinations = [building.entrance, ...[[1, 0], [-1, 0], [0, 1], [0, -1]].map(([x, y]) => ({ x: building.entrance.x + x!, y: building.entrance.y + y! }))].filter(p => nav.isWalkable(p));
  const musician = candidates.find(a => profile(s, a).personality.interest === 'music');
  let kind: SocialKind = building.kind === 'market' ? 'market' : musician ? 'performance' : 'festival';
  if (kind === 'performance' && musician) { candidates.splice(candidates.indexOf(musician), 1); candidates.unshift(musician); }
  const id = `gather_${s.tick.toString(36)}_${++society.counter}`;
  for (const a of candidates.slice(0, 24)) {
    if (participants.length >= SOCIAL_BUDGET.crowd) break;
    const target = destinations[participants.length % destinations.length]!;
    const path = nav.path(a.cell, target); if (!path || path.length > 80) continue;
    const p = profile(s, a); p.visit = { eventId: id, target, untilTick: s.tick + 90, buildingId: building.id, purpose: `Join the ${kind}` };
    a.path = path; a.target = { ...target }; a.activity = path.length ? 'moving' : 'resting'; participants.push(a.id);
  }
  if (kind === 'performance' && participants[0] !== musician?.id) kind = 'festival';
  if (participants.length < 2) {
    for (const id of participants) { society.profiles[id]!.visit = null; s.agents[id]!.path = []; s.agents[id]!.target = null; }
    return;
  }
  const m = moment(s, kind, 'invitation', participants, building.id, building.entrance,
    `${name(s.agents[participants[0]!]!)} invites neighbours to a ${kind} at ${building.name}.`);
  remember(s, m); output.push({ moment: m, speech: 'Come join us!', reaction: 'wave' });
  society.gatherings.push({ invitationId: m.id, id, kind, buildingId: building.id, participants, untilTick: s.tick + 90, arrived: [] });
  society.nextGatheringTick = s.tick + 100;
}

/** Social movement uses the existing road/bridge navigator, never teleportation or client steering. */
export function stepSocialAgent(s: SimState, a: AgentSimState): boolean {
  if (!s.society?.enabled || a.status !== 'active') return false;
  const p = s.society.profiles[a.id];
  if (!p || a.taskId || a.cargo || a.busyTicks) return false;
  if (p.current && p.current.untilTick > s.tick) { a.activity = 'resting'; return true; }
  if (!p.visit || p.visit.untilTick <= s.tick) return false;
  for (let i = 0; i < 2 && a.path.length; i++) a.cell = a.path.shift()!;
  a.activity = a.path.length ? 'moving' : 'resting'; if (!a.path.length) { a.target = null; if (p.visit.eventId.startsWith('routine_')) p.visit.untilTick = Math.min(p.visit.untilTick, s.tick + 10); }
  return true;
}
export function socialSummary(s: SimState, id: string): AgentSocial | undefined {
  const p = s.society?.profiles[id]; if (!p || !s.society?.enabled) return undefined;
  const agent = s.agents[id], available = agent?.status === 'active' && !agent.taskId && !agent.cargo && !agent.busyTicks;
  const current = available && p.current && p.current.untilTick > s.tick ? p.current : null;
  return { tick: s.tick, personality: p.personality, mood: current?.reaction === 'cheer' ? 'delighted' : current?.reaction === 'consider' ? 'thoughtful' : p.need > 60 ? 'curious' : 'content', socialNeed: p.need, current,
    destination: available && p.visit && s.buildings[p.visit.buildingId] ? { buildingId: p.visit.buildingId, name: s.buildings[p.visit.buildingId]!.name.slice(0, 100), purpose: p.visit.purpose, location: p.visit.target } : null };
}

/** Stable preferences change the destination with simulated time of day; only two new routes per step. */
function planRoutines(s: SimState, nav: NavGrid) {
  const society = s.society!, phase = Math.floor((s.tick % 240) / 80);
  if (s.tick % 20 !== 10) return;
  const venues = s.buildingOrder.filter(id => ['market', 'town_hall', 'bakery'].includes(s.buildings[id]!.kind) && s.buildings[id]!.status !== 'reserved_lot').slice(0, SOCIAL_BUDGET.venues);
  let planned = 0;
  for (let i = 0; i < Math.min(s.agentOrder.length, SOCIAL_BUDGET.agentsPerStep); i++) {
    const a = s.agents[s.agentOrder[(society.cursor + i) % s.agentOrder.length]!]!, p = society.profiles[a.id];
    if (!p || !free(a, p, s.tick) || routines.indexOf(p.personality.routine) !== phase) continue;
    const building = venues.map(id => s.buildings[id]!).filter(b => phase === 0 ? b.kind === 'market' || b.kind === 'bakery' : b.kind === 'town_hall')
      .sort((b, c) => distance(a.cell, b.entrance) - distance(a.cell, c.entrance) || b.id.localeCompare(c.id))[0];
    if (!building || distance(a.cell, building.entrance) < 2) continue;
    const path = nav.path(a.cell, building.entrance); if (!path || path.length > 80) continue;
    p.visit = { eventId: `routine_${a.id}_${s.tick}`, target: { ...building.entrance }, untilTick: s.tick + 60,
      buildingId: building.id, purpose: p.personality.routine };
    a.path = path; a.target = { ...building.entrance }; a.activity = 'moving';
    if (++planned >= 2) break;
  }
}
