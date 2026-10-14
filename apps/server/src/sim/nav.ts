import type { GridPos, TerrainCode } from "@agentic-economy/shared";
import { isWalkable } from "@agentic-economy/world-spec";

/**
 * Road-network navigation. Agents only walk on road/bridge/plaza cells. Distance fields are
 * computed by BFS from each destination and cached (destinations are a small, fixed set of
 * building entrances), so paths are deterministic and cheap.
 */
export class NavGrid {
  private readonly walkable: Uint8Array;
  private readonly fields = new Map<number, Int32Array>();

  constructor(
    readonly width: number,
    readonly height: number,
    terrain: readonly TerrainCode[],
  ) {
    this.walkable = new Uint8Array(width * height);
    for (let i = 0; i < terrain.length; i++) this.walkable[i] = isWalkable(terrain[i]) ? 1 : 0;
  }

  isWalkable(p: GridPos): boolean {
    return p.x >= 0 && p.y >= 0 && p.x < this.width && p.y < this.height && this.walkable[p.y * this.width + p.x] === 1;
  }

  private field(target: GridPos): Int32Array {
    const key = target.y * this.width + target.x;
    let f = this.fields.get(key);
    if (f) return f;
    f = new Int32Array(this.width * this.height).fill(-1);
    f[key] = 0;
    const queue = new Int32Array(this.width * this.height);
    let head = 0;
    let tail = 0;
    queue[tail++] = key;
    while (head < tail) {
      const cur = queue[head++]!;
      const x = cur % this.width;
      const y = (cur - x) / this.width;
      const d = f[cur]! + 1;
      // Fixed neighbour order (E, W, S, N) keeps paths deterministic.
      const neighbours = [
        x + 1 < this.width ? cur + 1 : -1,
        x > 0 ? cur - 1 : -1,
        y + 1 < this.height ? cur + this.width : -1,
        y > 0 ? cur - this.width : -1,
      ];
      for (const j of neighbours) {
        if (j < 0 || f[j] !== -1 || this.walkable[j] !== 1) continue;
        f[j] = d;
        queue[tail++] = j;
      }
    }
    this.fields.set(key, f);
    return f;
  }

  /** Walking distance in cells, or null if unreachable. */
  distance(from: GridPos, to: GridPos): number | null {
    const d = this.field(to)[from.y * this.width + from.x]!;
    return d < 0 ? null : d;
  }

  /** Cells to walk (excluding `from`, including `to`), or null if unreachable. */
  path(from: GridPos, to: GridPos): GridPos[] | null {
    const f = this.field(to);
    let cur = from.y * this.width + from.x;
    if (f[cur]! < 0) return null;
    const out: GridPos[] = [];
    while (f[cur]! > 0) {
      const x = cur % this.width;
      const y = (cur - x) / this.width;
      const d = f[cur]!;
      const candidates = [cur + 1, cur - 1, cur + this.width, cur - this.width].filter((j, i) => {
        if (i === 0 && x + 1 >= this.width) return false;
        if (i === 1 && x === 0) return false;
        if (i === 2 && y + 1 >= this.height) return false;
        if (i === 3 && y === 0) return false;
        return f[j] === d - 1;
      });
      cur = candidates[0]!;
      out.push({ x: cur % this.width, y: Math.floor(cur / this.width) });
    }
    return out;
  }
}
