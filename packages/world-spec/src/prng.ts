/**
 * Deterministic pseudo-random utilities. Never use Math.random in world generation or simulation:
 * every client and every server restart must derive identical output from the same seed.
 */

/** 32-bit FNV-1a followed by a murmur3 finalizer for avalanche. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Derive a stable sub-seed from a root seed and any path of parts. */
export function deriveSeed(root: string | number, ...parts: Array<string | number>): number {
  return hashString([String(root), ...parts.map(String)].join(":"));
}

/** mulberry32 — small, fast, good-enough 32-bit generator with serializable state. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Serializable internal state (for simulation snapshots). */
  get seedState(): number {
    return this.state;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from empty list");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  u32(): number {
    return Math.floor(this.next() * 4294967296) >>> 0;
  }
}

/** Smooth 2D value noise in [0,1], deterministic per seed. */
export function valueNoise2D(seed: number, x: number, y: number, scale: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const x0 = Math.floor(sx);
  const y0 = Math.floor(sy);
  const fx = sx - x0;
  const fy = sy - y0;
  const lattice = (ix: number, iy: number) => hashString(`${seed}|${ix}|${iy}`) / 4294967295;
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const a = lattice(x0, y0);
  const b = lattice(x0 + 1, y0);
  const c = lattice(x0, y0 + 1);
  const d = lattice(x0 + 1, y0 + 1);
  const u = smooth(fx);
  const v = smooth(fy);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}
