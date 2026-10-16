/** Read-only planning checks. A clear centerline is not permission to build a railway. */
export interface RailPoint { x: number; z: number }
export interface RailObstacle { id: string; x: number; z: number; width: number; depth: number }

/** Conservative swept envelope: expands each obstacle by the rail half-width.
 * Slab intersections check every point of each segment, including endpoints.
 * For curves, callers must supply their actual sampled render path, not just control points.
 * This protects horizontal footprints only; bridges, grades, supports, station access,
 * pedestrians and traffic require independent validation before placement.
 */
export function railConflicts(points: readonly RailPoint[], obstacles: readonly RailObstacle[], halfWidth: number) {
  if (points.length < 2 || !Number.isFinite(halfWidth) || halfWidth <= 0 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.z)) ||
    obstacles.some((o) => ![o.x, o.z, o.width, o.depth].every(Number.isFinite) || o.width < 0 || o.depth < 0))
    throw new Error("Rail clearance requires finite geometry, two path points and a positive envelope.");
  const conflicts = new Map<string, number[]>();
  for (const obstacle of obstacles) for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    let enter = 0, exit = 1;
    for (const [from, delta, min, max] of [
      [a.x, b.x - a.x, obstacle.x - obstacle.width / 2 - halfWidth, obstacle.x + obstacle.width / 2 + halfWidth],
      [a.z, b.z - a.z, obstacle.z - obstacle.depth / 2 - halfWidth, obstacle.z + obstacle.depth / 2 + halfWidth],
    ] as const) {
      if (Math.abs(delta) < 1e-12) { if (from < min || from > max) { enter = 1; exit = 0; break; } }
      else {
        const t0 = (min - from) / delta, t1 = (max - from) / delta;
        enter = Math.max(enter, Math.min(t0, t1)); exit = Math.min(exit, Math.max(t0, t1));
      }
    }
    if (enter <= exit) {
      const segments = conflicts.get(obstacle.id) ?? [];
      if (!segments.includes(i - 1)) segments.push(i - 1);
      conflicts.set(obstacle.id, segments);
    }
  }
  return [...conflicts].map(([id, segments]) => ({ id, segments })).sort((a, b) => a.id.localeCompare(b.id));
}
