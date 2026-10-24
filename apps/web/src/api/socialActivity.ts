import { SocialMoment, type AgentSummary, type EconomicEvent } from './shared';

export const isSocialActivity = (event: Pick<EconomicEvent, 'type'>) => event.type.startsWith('social.');
export function socialMoment(event: Pick<EconomicEvent, 'data'>) {
  const parsed = SocialMoment.safeParse(event.data.social);
  return parsed.success ? parsed.data : null;
}
/** Focus only authoritative positions; never infer a launch, transfer or paid job from a social event. */
export function activityFocus(event: EconomicEvent, agents: AgentSummary[], buildings: Array<{ id: string; x: number; z: number }>) {
  const social = isSocialActivity(event) ? socialMoment(event) : null;
  if (social) return { x: social.location.x + .5, z: social.location.y + .5, agentId: social.participants[0] ?? null };
  const agent = agents.find(a => a.id === event.agentId);
  const building = buildings.find(b => b.id === event.buildingId);
  // Historical work stays attached to its recorded workplace, even after its
  // performer leaves. Retain the agent ID so the profile remains accessible.
  if (building) return { x: building.x, z: building.z, agentId: agent?.id ?? null };
  if (agent) return { x: agent.pos.x, z: agent.pos.y, agentId: agent.id };
  return null;
}
export function interestingActivity(event: EconomicEvent) {
  return isSocialActivity(event) || ['launch.confirmed', 'community.registered', 'building.placed', 'maintenance.completed', 'production.completed', 'task.claimed', 'task.verified'].includes(event.type);
}

/** Presentation-only highlights. Detailed filters and persisted history retain
 * every event. Automated facility cycles are not individual work achievements. */
export function cityHighlights(events: EconomicEvent[]) {
  const recent = new Map<string, number>();
  return [...events].sort((a, b) => b.tick - a.tick || b.seq - a.seq).filter(interestingActivity).filter(event => {
    if (event.type === 'production.completed') return false;
    if (event.type !== 'task.verified' && event.type !== 'task.claimed') return true;
    const kind = typeof event.data.taskKind === 'string' ? event.data.taskKind : event.summary.replace(/^.*completed /, '').split(' for ')[0];
    const key = `${event.type}:${event.buildingId}:${kind}`;
    const tick = recent.get(key);
    if (tick !== undefined && Math.abs(tick - event.tick) < 120) return false;
    recent.set(key, event.tick);
    return true;
  });
}
