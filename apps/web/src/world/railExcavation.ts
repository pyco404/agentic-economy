/** Actual triangle clipping for narrow rail cuttings, retaining interpolated vertex colours. */
export interface RailCut { minX: number; maxX: number; minZ: number; maxZ: number }
type Vertex = { p: number[]; c: number[] };
export function excavateRailTerrain(positions: readonly number[], colors: readonly number[], cuts: readonly RailCut[]) {
  let polygons: Vertex[][] = [];
  for (let i = 0; i < positions.length; i += 9) polygons.push([0, 3, 6].map((j) => ({
    p: positions.slice(i + j, i + j + 3), c: colors.slice(i + j, i + j + 3),
  })));
  const clip = (polygon: Vertex[], axis: number, boundary: number, sign: number) => {
    const result: Vertex[] = [];
    polygon.forEach((b, i) => {
      const a = polygon[(i + polygon.length - 1) % polygon.length]!;
      const da = (a.p[axis]! - boundary) * sign, db = (b.p[axis]! - boundary) * sign;
      if ((da >= 0) !== (db >= 0)) {
        const t = da / (da - db);
        result.push({ p: a.p.map((v, n) => v + (b.p[n]! - v) * t), c: a.c.map((v, n) => v + (b.c[n]! - v) * t) });
      }
      if (db >= 0) result.push(b);
    });
    return result;
  };
  for (const cut of cuts) polygons = polygons.flatMap((polygon) => {
    if (polygon.every((v) => v.p[0]! <= cut.minX) || polygon.every((v) => v.p[0]! >= cut.maxX) ||
      polygon.every((v) => v.p[2]! <= cut.minZ) || polygon.every((v) => v.p[2]! >= cut.maxZ)) return [polygon];
    const outside: Vertex[][] = [];
    let remaining = polygon;
    for (const [axis, boundary, sign] of [[0, cut.minX, -1], [0, cut.maxX, 1], [2, cut.minZ, -1], [2, cut.maxZ, 1]]) {
      const piece = clip(remaining, axis!, boundary!, sign!);
      if (piece.length >= 3) outside.push(piece);
      remaining = clip(remaining, axis!, boundary!, -sign!);
      if (remaining.length < 3) break;
    }
    return outside;
  });
  const p: number[] = [], c: number[] = [];
  for (const polygon of polygons) for (let i = 1; i < polygon.length - 1; i++)
    for (const vertex of [polygon[0]!, polygon[i]!, polygon[i + 1]!]) { p.push(...vertex.p); c.push(...vertex.c); }
  return { positions: p, colors: c };
}
