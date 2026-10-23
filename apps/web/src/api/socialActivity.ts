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
  if (agent) return { x: agent.pos.x, z: agent.pos.y, agentId: agent.id };
  const building = buildings.find(b => b.id === event.buildingId);
  return building ? { x: building.x, z: building.z, agentId: null } : null;
}
export function interestingActivity(event: EconomicEvent) {
  return isSocialActivity(event) || ['launch.confirmed', 'community.registered', 'building.placed', 'maintenance.completed', 'production.completed', 'task.verified'].includes(event.type);
}
