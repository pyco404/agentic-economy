import type { AgentSummary, Task } from './shared';
export type WorkPose = 'farm' | 'mill' | 'bakery' | 'warehouse' | 'maintenance' | 'workshop';
/** An assignment must belong to this canonical agent. Walking alone is not work. */
export function currentAssignment(agent: Pick<AgentSummary, 'id' | 'work'>) {
  const task = agent.work?.task;
  return task?.claimedBy === agent.id && ['claimed', 'in_progress'].includes(task.status) ? task : null;
}
export function workDescription(agent: Pick<AgentSummary, 'id' | 'state' | 'work'> & Partial<Pick<AgentSummary, 'social'>>) {
  if (agent.state === 'paused') return 'Paused';
  if (agent.social?.current) return `City World · ${agent.social.current.description}`;
  if (agent.social?.destination && !currentAssignment(agent)) return `${agent.state === 'moving' ? 'Visiting' : 'At'} ${agent.social.destination.name} · ${agent.social.destination.purpose}`;
  if (!agent.work) return 'Work details unavailable on this backend';
  const task = currentAssignment(agent), destination = agent.work?.destination;
  if (!task || !destination) return agent.state === 'moving' ? 'Walking · no assigned job' : agent.state === 'resting' ? 'Resting · awaiting an assignment' : 'No active assignment';
  if (agent.state === 'moving') return `Traveling to ${destination.name}`;
  if (agent.state === 'delivering') return `Transporting ${Object.keys(agent.work!.cargo).join(', ') || task.resource || 'supplies'} to ${destination.name}`;
  if (agent.state === 'working') return `${task.kind === 'maintenance' ? 'Maintaining' : 'Work shift at'} ${destination.name}`;
  return `Assigned to ${destination.name}`;
}
/** Only animate presence work at the server's registered entrance, after arrival. */
export function workPose(agent: Pick<AgentSummary, 'id' | 'state' | 'work'>, x: number, z: number): WorkPose | null {
  const task = currentAssignment(agent), place = agent.work?.destination;
  if (agent.state !== 'working' || !task || !place || Math.hypot(x-place.entrance.x-.5,z-place.entrance.y-.5) > .18) return null;
  if (task.kind === 'maintenance') return 'maintenance';
  if (task.kind !== 'production_shift' || task.status !== 'in_progress') return null;
  return place.kind === 'farm' ? 'farm' : place.kind === 'mill' ? 'mill' : place.kind === 'bakery' ? 'bakery' : place.kind === 'warehouse' ? 'warehouse' : 'workshop';
}
export function observableTasks(tasks: Task[], agents: AgentSummary[]) {
  const all = new Map(tasks.map(task => [task.id, task]));
  for (const agent of agents) { const task = currentAssignment(agent); if (task) all.set(task.id,task); }
  return [...all.values()].sort((a,b)=>Number(['claimed','in_progress'].includes(b.status))-Number(['claimed','in_progress'].includes(a.status)) || b.createdTick-a.createdTick || a.id.localeCompare(b.id));
}
