import { bridgeSurface } from "./bridgeSurface";
import type { FrontierData } from "./frontier";
import type { ChunkVisual } from "./layout";

/** Exact barycentric samples of the existing frontier mesh, plus persisted cells. */
export function railTerrain(chunks: ChunkVisual[], frontier: FrontierData) {
  const bridges = bridgeSurface(chunks);
  const cells = new Map<string, { height: number; wet: boolean }>();
  for (const c of chunks) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++)
    cells.set(`${c.x * 32 + x}:${c.z * 32 + z}`, {
      height: (c.terrain?.[z * 32 + x] === "w" || bridges.navigableUnder(c.x * 32 + x,c.z * 32 + z)) ? -0.25 : Number(c.elevation?.[z * 32 + x] ?? 0) * 0.08,
      wet: (c.terrain?.[z * 32 + x] === "w" || bridges.navigableUnder(c.x * 32 + x,c.z * 32 + z)),
    });
  const buckets = new Map<string, number[][]>();
  for (const [positions, wet] of [[frontier.positions, false], [frontier.water, true]] as const)
    for (let i = 0; i < positions.length; i += 9) {
      const t = [...positions.slice(i, i + 9), wet ? 1 : 0];
      const xs = [t[0]!, t[3]!, t[6]!], zs = [t[2]!, t[5]!, t[8]!];
      for (let x = Math.floor(Math.min(...xs) / 8); x <= Math.floor(Math.max(...xs) / 8); x++)
        for (let z = Math.floor(Math.min(...zs) / 8); z <= Math.floor(Math.max(...zs) / 8); z++) {
          const key = `${x}:${z}`, list = buckets.get(key) ?? []; list.push(t); buckets.set(key, list);
        }
    }
  return (x: number, z: number) => {
    const cell = cells.get(`${Math.floor(x)}:${Math.floor(z)}`);
    if (cell) return cell;
    for (const t of buckets.get(`${Math.floor(x / 8)}:${Math.floor(z / 8)}`) ?? []) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = t as number[];
      const den = (bz! - cz!) * (ax! - cx!) + (cx! - bx!) * (az! - cz!);
      if (Math.abs(den) < 1e-8) continue;
      const u = ((bz! - cz!) * (x - cx!) + (cx! - bx!) * (z - cz!)) / den;
      const v = ((cz! - az!) * (x - cx!) + (ax! - cx!) * (z - cz!)) / den;
      if (u >= -1e-6 && v >= -1e-6 && u + v <= 1 + 1e-6)
        return { height: u * ay! + v * by! + (1 - u - v) * cy!, wet: !!t[9] };
    }
    return null;
  };
}
