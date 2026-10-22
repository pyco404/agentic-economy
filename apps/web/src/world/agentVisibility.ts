/** Render budget, not identity cap. Every visible identity competes by distance; important
 * selections win. The backend retains/simulates the entire reconciled population. */
export function visibleAgentSubset<T extends { id: string; x: number; z: number }>(agents: readonly T[], visible: (a: T) => boolean, focus: { x: number; z: number }, selected: string | null | undefined, limit = 512): T[] {
  return agents.filter(visible).sort((a, b) => {
    if (a.id === selected) return -1;
    if (b.id === selected) return 1;
    const distance = (a.x - focus.x) ** 2 + (a.z - focus.z) ** 2 - (b.x - focus.x) ** 2 - (b.z - focus.z) ** 2;
    return distance || a.id.localeCompare(b.id);
  }).slice(0, limit);
}
