import {
  CHUNK_SIZE,
  GENESIS_SIZE,
  type BuildingKind,
  type BuildingParams,
  type DistrictTheme,
  type Facing,
  type GridPos,
  type Material,
  type Prop,
  type Region,
  type RoofStyle,
  type TerrainCode,
  type WindowPattern,
} from "@agentic-economy/shared";
import { Rng, deriveSeed, hashString, valueNoise2D } from "./prng.js";

/** Bump whenever generation output changes for the same seed. Persisted worlds record the version they were built with. */
export const GENERATOR_VERSION = 1;

export interface BuildingPlacement {
  id: string;
  kind: BuildingKind;
  name: string;
  origin: GridPos;
  entrance: GridPos;
  params: BuildingParams;
  /** reserved_lot = empty headquarters plot awaiting a community. */
  status: "active" | "reserved_lot";
  theme: DistrictTheme;
}

export interface WorldLayout {
  worldId: string;
  seed: string;
  generatorVersion: number;
  width: number;
  height: number;
  chunkSize: number;
  /** Row-major terrain codes, length width*height. */
  terrain: TerrainCode[];
  /** Row-major elevation 0..9. */
  elevation: number[];
  buildings: BuildingPlacement[];
  props: Prop[];
  regions: Region[];
  center: GridPos;
}

interface Ctx {
  seed: string;
  w: number;
  h: number;
  terrain: TerrainCode[];
  elevation: number[];
  center: GridPos;
  industrial: GridPos;
  riverBase: number;
  riverPhase: number;
  buildings: BuildingPlacement[];
  usedIds: Set<string>;
  counters: Map<string, number>;
}

const idx = (c: Ctx, x: number, y: number) => y * c.w + x;
const inBounds = (c: Ctx, x: number, y: number) => x >= 0 && y >= 0 && x < c.w && y < c.h;
const at = (c: Ctx, x: number, y: number): TerrainCode | undefined => (inBounds(c, x, y) ? c.terrain[idx(c, x, y)] : undefined);
const set = (c: Ctx, x: number, y: number, t: TerrainCode) => {
  if (inBounds(c, x, y)) c.terrain[idx(c, x, y)] = t;
};

const ROAD_LIKE: ReadonlySet<TerrainCode> = new Set<TerrainCode>(["r", "b", "p"]);
export const isWalkable = (t: TerrainCode | undefined) => t !== undefined && ROAD_LIKE.has(t);

function riverX(c: Ctx, y: number): number {
  return c.riverBase + Math.sin(y / 17 + c.riverPhase) * 5 + Math.sin(y / 7 + c.riverPhase * 2) * 1.5;
}

export function themeAt(c: Pick<Ctx, "center" | "industrial" | "riverBase" | "riverPhase">, x: number, y: number): DistrictTheme {
  const di = Math.max(Math.abs(x - c.industrial.x), Math.abs(y - c.industrial.y));
  if (di <= 16) return "industrial";
  const d = Math.hypot(x - c.center.x, y - c.center.y);
  const rx = c.riverBase + Math.sin(y / 17 + c.riverPhase) * 5 + Math.sin(y / 7 + c.riverPhase * 2) * 1.5;
  if (x > rx + 2 && d < 52) return "waterfront";
  if (d < 9) return "civic";
  if (d < 20) return "market";
  if (d < 40) return "residential";
  return "agricultural";
}

/* ------------------------------------------------------------------ terrain */

function carveWater(c: Ctx) {
  const lake = { x: 16, y: c.h - 18, r: 10 + (hashString(`${c.seed}:lake`) % 4) };
  const ns = deriveSeed(c.seed, "shore");
  for (let y = 0; y < c.h; y++) {
    const rx = riverX(c, y);
    const width = 3 + (valueNoise2D(ns, 0, y, 9) > 0.62 ? 1 : 0);
    for (let x = 0; x < c.w; x++) {
      const dr = Math.abs(x - rx);
      const wobble = (valueNoise2D(ns, x, y, 5) - 0.5) * 4;
      const dl = Math.hypot(x - lake.x, y - lake.y) + wobble;
      if (dr <= width / 2 || dl <= lake.r) set(c, x, y, "w");
      else if (dr <= width / 2 + 1.2 || dl <= lake.r + 1.5) set(c, x, y, "s");
    }
  }
}

function computeElevation(c: Ctx) {
  const es = deriveSeed(c.seed, "elevation");
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const t = at(c, x, y);
      const n = valueNoise2D(es, x, y, 22) * 0.7 + valueNoise2D(es + 1, x, y, 7) * 0.3;
      // Gentle rise toward the map rim so the quarry sits on higher ground.
      const rim = Math.max(Math.abs(x - c.w / 2), Math.abs(y - c.h / 2)) / (c.w / 2);
      c.elevation[idx(c, x, y)] = t === "w" ? 0 : t === "s" ? 1 : Math.min(9, 1 + Math.floor(n * 3 + rim * rim * 4));
    }
  }
}

function layRoads(c: Ctx) {
  const arterials: number[] = [];
  for (let v = 8; v < c.w - 4; v += 16) arterials.push(v);
  const collectors: number[] = [];
  for (let v = 16; v < c.w - 4; v += 16) collectors.push(v);

  const lay = (vertical: boolean, line: number, bridgeOk: boolean, limit: ((x: number, y: number) => boolean) | null) => {
    for (let s = 2; s < (vertical ? c.h : c.w) - 2; s++) {
      const x = vertical ? line : s;
      const y = vertical ? s : line;
      if (limit && !limit(x, y)) continue;
      const t = at(c, x, y);
      if (t === "w") {
        if (bridgeOk) set(c, x, y, "b");
        continue;
      }
      if (t !== "b") set(c, x, y, "r");
    }
  };

  arterials.forEach((line, i) => {
    lay(true, line, i % 2 === 0, null);
    lay(false, line, i % 2 === 1, null);
  });
  const central = (x: number, y: number) => Math.max(Math.abs(x - c.center.x), Math.abs(y - c.center.y)) <= 28;
  for (const line of collectors) {
    lay(true, line, false, central);
    lay(false, line, false, central);
  }
  // Remove road stubs that ended at a river bank without a bridge (dead-end cells on sand next to water).
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        if (at(c, x, y) !== "r") continue;
        const n = [at(c, x + 1, y), at(c, x - 1, y), at(c, x, y + 1), at(c, x, y - 1)].filter(isWalkable).length;
        const nearWater = [at(c, x + 1, y), at(c, x - 1, y), at(c, x, y + 1), at(c, x, y - 1)].some((t) => t === "w");
        if (n <= 1 && nearWater) set(c, x, y, "s");
      }
    }
  }
}

/** Keep only the largest connected road network; disconnected fragments revert to grass. */
function pruneRoadNetwork(c: Ctx) {
  const comp = new Int32Array(c.w * c.h).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < comp.length; i++) {
    if (comp[i] !== -1 || !isWalkable(c.terrain[i])) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const cur = stack.pop()!;
      size++;
      const x = cur % c.w;
      const y = (cur - x) / c.w;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        if (!inBounds(c, nx, ny)) continue;
        const j = idx(c, nx, ny);
        if (comp[j] === -1 && isWalkable(c.terrain[j])) {
          comp[j] = id;
          stack.push(j);
        }
      }
    }
    sizes.push(size);
  }
  const main = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < comp.length; i++) {
    if (isWalkable(c.terrain[i]) && comp[i] !== main) c.terrain[i] = c.terrain[i] === "b" ? "w" : "g";
  }
}

/* ---------------------------------------------------------------- buildings */

interface Spot {
  x: number;
  y: number;
  facing: Facing;
  entrance: GridPos;
}

function rectFree(c: Ctx, x: number, y: number, w: number, d: number): boolean {
  if (x < 1 || y < 1 || x + w >= c.w - 1 || y + d >= c.h - 1) return false;
  for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) if (at(c, xx, yy) !== "g") return false;
  return true;
}

/** Entrance options: the middle cell of each side, which must be a walkable road/plaza cell. */
function entrances(c: Ctx, x: number, y: number, w: number, d: number): Spot[] {
  const mx = x + Math.floor(w / 2);
  const my = y + Math.floor(d / 2);
  const opts: Array<[Facing, number, number]> = [
    ["n", mx, y - 1],
    ["s", mx, y + d],
    ["w", x - 1, my],
    ["e", x + w, my],
  ];
  return opts.filter(([, ex, ey]) => isWalkable(at(c, ex, ey))).map(([facing, ex, ey]) => ({ x, y, facing, entrance: { x: ex, y: ey } }));
}

function mark(c: Ctx, x: number, y: number, w: number, d: number) {
  for (let yy = y; yy < y + d; yy++) for (let xx = x; xx < x + w; xx++) set(c, xx, yy, "x");
}

const ROOF_BY_KIND: Record<BuildingKind, RoofStyle[]> = {
  house: ["gable", "gable", "hip", "shed"],
  apartment: ["flat", "flat", "hip"],
  farm: ["gable"],
  mill: ["gable", "hip"],
  bakery: ["hip", "gable"],
  market: ["shed", "sawtooth"],
  warehouse: ["sawtooth", "flat", "gable"],
  factory: ["sawtooth"],
  headquarters: ["flat", "flat", "dome"],
  town_hall: ["dome"],
  lumber_yard: ["shed"],
  quarry: ["flat"],
  power_station: ["flat", "sawtooth"],
};

const MATERIAL_BY_KIND: Record<BuildingKind, Material[]> = {
  house: ["plaster", "plaster", "brick", "timber"],
  apartment: ["brick", "concrete", "plaster"],
  farm: ["timber"],
  mill: ["stone", "brick"],
  bakery: ["brick", "plaster"],
  market: ["timber", "plaster"],
  warehouse: ["concrete", "brick"],
  factory: ["concrete", "brick"],
  headquarters: ["glass", "concrete"],
  town_hall: ["stone"],
  lumber_yard: ["timber"],
  quarry: ["stone"],
  power_station: ["concrete"],
};

const WINDOWS_BY_KIND: Record<BuildingKind, WindowPattern[]> = {
  house: ["sparse", "grid"],
  apartment: ["grid", "bands"],
  farm: ["none", "sparse"],
  mill: ["sparse"],
  bakery: ["storefront"],
  market: ["storefront"],
  warehouse: ["bands", "none"],
  factory: ["bands"],
  headquarters: ["bands", "grid"],
  town_hall: ["grid"],
  lumber_yard: ["none"],
  quarry: ["none"],
  power_station: ["bands"],
};

const FLOORS_BY_KIND: Record<BuildingKind, [number, number]> = {
  house: [1, 2],
  apartment: [3, 6],
  farm: [1, 1],
  mill: [2, 3],
  bakery: [1, 2],
  market: [1, 1],
  warehouse: [1, 2],
  factory: [2, 3],
  headquarters: [4, 8],
  town_hall: [3, 3],
  lumber_yard: [1, 1],
  quarry: [1, 1],
  power_station: [2, 3],
};

export function buildingParams(seed: string, kind: BuildingKind, w: number, d: number, theme: DistrictTheme, facing: Facing, x: number, y: number): BuildingParams {
  const rng = new Rng(deriveSeed(seed, "params", kind, x, y));
  const [fmin, fmax] = FLOORS_BY_KIND[kind];
  const floors = rng.int(fmin, fmax);
  const floorHeight = kind === "warehouse" || kind === "factory" || kind === "power_station" ? 1.3 : kind === "quarry" ? 0.5 : 0.9;
  return {
    width: w,
    depth: d,
    height: Math.round((floors * floorHeight + 0.2) * 100) / 100,
    floors,
    roofStyle: rng.pick(ROOF_BY_KIND[kind]),
    material: rng.pick(MATERIAL_BY_KIND[kind]),
    windowPattern: rng.pick(WINDOWS_BY_KIND[kind]),
    districtTheme: theme,
    roofPalette: rng.int(0, 7),
    facing,
    seed: rng.u32(),
  };
}

function nextName(c: Ctx, kind: BuildingKind, rng: Rng): string {
  const n = (c.counters.get(kind) ?? 0) + 1;
  c.counters.set(kind, n);
  switch (kind) {
    case "farm":
      return `${rng.pick(["Golden", "Meadow", "Willow", "Amber", "Hillside", "Riverbend", "Sunfield", "Oakridge"])} ${rng.pick(["Acres", "Farm", "Fields", "Homestead"])}`;
    case "mill":
      return `${rng.pick(["Old Stone", "Riverside", "Northwind", "Waterwheel"])} Mill`;
    case "bakery":
      return `${rng.pick(["Corner", "Hearth", "Morning", "Crumb & Co."])} Bakery`;
    case "market":
      return "Genesis Market";
    case "town_hall":
      return "Genesis Town Hall";
    case "headquarters":
      return `Headquarters Lot ${n}`;
    case "warehouse":
      return `Depot ${String.fromCharCode(64 + ((n - 1) % 26) + 1)}${n > 26 ? Math.ceil(n / 26) : ""}`;
    case "house":
      return `Residence ${n}`;
    case "apartment":
      return `${rng.pick(["Linden", "Harbor", "Cedar", "Atlas", "Juniper", "Orchard"])} Apartments`;
    default:
      return `${kind.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())} ${n}`;
  }
}

function buildingId(c: Ctx, kind: BuildingKind, x: number, y: number): string {
  let salt = 0;
  for (;;) {
    const id = `bld_${deriveSeed(c.seed, "bld", kind, x, y, salt).toString(36).padStart(7, "0")}`;
    if (!c.usedIds.has(id)) {
      c.usedIds.add(id);
      return id;
    }
    salt++;
  }
}

function place(c: Ctx, kind: BuildingKind, spot: Spot, w: number, d: number, status: BuildingPlacement["status"] = "active") {
  const theme = themeAt(c, spot.x + w / 2, spot.y + d / 2);
  mark(c, spot.x, spot.y, w, d);
  const rng = new Rng(deriveSeed(c.seed, "name", kind, spot.x, spot.y));
  const placement: BuildingPlacement = {
    id: buildingId(c, kind, spot.x, spot.y),
    kind,
    name: nextName(c, kind, rng),
    origin: { x: spot.x, y: spot.y },
    entrance: spot.entrance,
    params: buildingParams(c.seed, kind, w, d, theme, spot.facing, spot.x, spot.y),
    status,
    theme,
  };
  c.buildings.push(placement);
  return placement;
}

/** Place a landmark at the best-scoring valid spot. Returns null if no valid spot exists. */
function placeSpecial(c: Ctx, kind: BuildingKind, w: number, d: number, score: (x: number, y: number) => number, status: BuildingPlacement["status"] = "active") {
  let best: Spot | null = null;
  let bestScore = Infinity;
  for (let y = 1; y < c.h - d - 1; y++) {
    for (let x = 1; x < c.w - w - 1; x++) {
      if (!rectFree(c, x, y, w, d)) continue;
      const opts = entrances(c, x, y, w, d);
      if (opts.length === 0) continue;
      const s = score(x + w / 2, y + d / 2);
      if (s < bestScore) {
        bestScore = s;
        best = opts[0]!;
      }
    }
  }
  return best ? place(c, kind, best, w, d, status) : null;
}

function distToWater(c: Ctx, x: number, y: number, max: number): number {
  for (let r = 1; r <= max; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (at(c, Math.round(x) + dx, Math.round(y) + dy) === "w") return r;
  }
  return max + 1;
}

function placeLandmarks(c: Ctx) {
  const { center } = c;
  const near = (tx: number, ty: number) => (x: number, y: number) => Math.hypot(x - tx, y - ty);

  placeSpecial(c, "town_hall", 6, 5, near(center.x, center.y));
  placeSpecial(c, "market", 5, 4, near(center.x + 8, center.y + 2));
  // Civic plaza around the core.
  for (let y = center.y - 7; y <= center.y + 7; y++)
    for (let x = center.x - 7; x <= center.x + 7; x++) if (at(c, x, y) === "g" && Math.hypot(x - center.x, y - center.y) < 6.5) set(c, x, y, "p");

  placeSpecial(c, "bakery", 3, 3, near(center.x + 12, center.y - 6));
  placeSpecial(c, "bakery", 3, 3, near(center.x - 10, center.y + 10));

  // Headquarters lots: a ring around the civic core, reserved for communities in registration order.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + 0.3;
    placeSpecial(c, "headquarters", 4, 4, near(center.x + Math.cos(a) * 15, center.y + Math.sin(a) * 15), "reserved_lot");
  }

  const riverScore = (ty: number) => (x: number, y: number) => distToWater(c, x, y, 6) * 6 + Math.abs(y - ty) * 0.5;
  placeSpecial(c, "mill", 4, 4, riverScore(c.industrial.y));
  placeSpecial(c, "mill", 4, 4, riverScore(c.center.y + 24));

  const ind = near(c.industrial.x, c.industrial.y);
  placeSpecial(c, "factory", 6, 5, ind);
  placeSpecial(c, "power_station", 5, 4, (x, y) => ind(x, y) + Math.abs(x - (c.industrial.x - 8)));
  for (let i = 0; i < 3; i++) placeSpecial(c, "warehouse", 5, 4, (x, y) => ind(x, y) + (i === 2 ? Math.hypot(x - center.x, y - center.y) * 0.5 : 0));

  placeSpecial(c, "lumber_yard", 4, 3, near(6, 6));
  placeSpecial(c, "quarry", 4, 4, (x, y) => -c.elevation[idx(c, Math.floor(x), Math.floor(y))]! * 10 + Math.hypot(x - c.w + 8, y - c.h + 8) * 0.2);
}

function fillDistricts(c: Ctx) {
  const rng = new Rng(deriveSeed(c.seed, "fill"));
  const farms: GridPos[] = [];
  for (let y = 2; y < c.h - 2; y++) {
    for (let x = 2; x < c.w - 2; x++) {
      if (at(c, x, y) !== "g") continue;
      const theme = themeAt(c, x, y);
      let kind: BuildingKind;
      let w: number;
      let d: number;
      let density: number;
      switch (theme) {
        case "civic":
        case "market":
          kind = rng.chance(0.55) ? "apartment" : "house";
          density = 0.85;
          break;
        case "residential":
          kind = rng.chance(0.14) ? "apartment" : "house";
          density = 0.75;
          break;
        case "waterfront":
          kind = rng.chance(0.3) ? "apartment" : "house";
          density = 0.65;
          break;
        case "industrial":
          kind = rng.chance(0.5) ? "warehouse" : "house";
          density = 0.35;
          break;
        case "agricultural":
          kind = farms.every((f) => Math.hypot(f.x - x, f.y - y) > 13) ? "farm" : "house";
          density = kind === "farm" ? 0.5 : 0.05;
          break;
      }
      if (!rng.chance(density)) continue;
      if (kind === "house") [w, d] = [rng.int(2, 3), rng.int(2, 3)];
      else if (kind === "apartment") [w, d] = [rng.int(3, 4), rng.int(3, 4)];
      else if (kind === "warehouse") [w, d] = [rng.int(4, 5), rng.int(3, 4)];
      else [w, d] = [3, 3];
      if (!rectFree(c, x, y, w, d)) continue;
      const opts = entrances(c, x, y, w, d);
      if (opts.length === 0) continue;
      const spot = opts[rng.int(0, opts.length - 1)]!;
      place(c, kind, spot, w, d);
      if (kind === "farm") {
        farms.push({ x, y });
        // Surround the barn with fields.
        for (let fy = y - 5; fy < y + d + 5; fy++)
          for (let fx = x - 5; fx < x + w + 5; fx++)
            if (at(c, fx, fy) === "g" && Math.hypot(fx - x - 1, fy - y - 1) < 6.5 && themeAt(c, fx, fy) === "agricultural") set(c, fx, fy, "f");
      }
    }
  }
}

function scatterProps(c: Ctx): Prop[] {
  const props: Prop[] = [];
  const ts = deriveSeed(c.seed, "trees");
  const rng = new Rng(deriveSeed(c.seed, "props"));
  for (let y = 1; y < c.h - 1; y++) {
    for (let x = 1; x < c.w - 1; x++) {
      const t = at(c, x, y);
      if (t === "p" && (x + y) % 5 === 0 && [at(c, x + 1, y), at(c, x - 1, y), at(c, x, y + 1), at(c, x, y - 1)].includes("r")) {
        props.push({ kind: "lamp", pos: { x, y }, scale: 1, seed: rng.u32() });
        continue;
      }
      if (t !== "g") continue;
      const theme = themeAt(c, x, y);
      const cluster = valueNoise2D(ts, x, y, 9);
      const base = theme === "agricultural" ? 0.18 : theme === "residential" || theme === "waterfront" ? 0.22 : theme === "industrial" ? 0.06 : 0.12;
      const p = base * (cluster > 0.55 ? 2.4 : 0.6);
      if (!rng.chance(p)) continue;
      const roll = rng.next();
      const kind: Prop["kind"] = roll < 0.55 ? "tree_round" : roll < 0.85 ? "tree_cone" : roll < 0.96 ? "bush" : "rock";
      props.push({ kind, pos: { x, y }, scale: Math.round((0.7 + rng.next() * 0.6) * 100) / 100, seed: rng.u32() });
    }
  }
  return props;
}

function computeRegions(c: Ctx): Region[] {
  const names: Record<DistrictTheme, string> = {
    civic: "Civic Core",
    market: "Market Ring",
    residential: "Old Town",
    industrial: "Riverside Works",
    waterfront: "East Bank",
    agricultural: "Outer Fields",
  };
  const boxes = new Map<DistrictTheme, Region["bounds"]>();
  for (const b of c.buildings) {
    const box = boxes.get(b.theme) ?? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    box.minX = Math.min(box.minX, b.origin.x);
    box.minY = Math.min(box.minY, b.origin.y);
    box.maxX = Math.max(box.maxX, b.origin.x + b.params.width);
    box.maxY = Math.max(box.maxY, b.origin.y + b.params.depth);
    boxes.set(b.theme, box);
  }
  return [...boxes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([theme, bounds]) => ({ id: `region_${theme}`, name: names[theme], theme, bounds }));
}

/** Generate the Genesis district deterministically from `seed`. Pure function: same input ⇒ identical output. */
export function generateWorld(seed: string, size = GENESIS_SIZE): WorldLayout {
  const rng = new Rng(deriveSeed(seed, "root"));
  const c: Ctx = {
    seed,
    w: size,
    h: size,
    terrain: new Array<TerrainCode>(size * size).fill("g"),
    elevation: new Array<number>(size * size).fill(1),
    center: { x: Math.round(size * 0.36) + rng.int(-3, 3), y: Math.round(size * 0.47) + rng.int(-3, 3) },
    industrial: { x: 0, y: 0 },
    riverBase: Math.round(size * 0.68) + rng.int(-4, 4),
    riverPhase: rng.next() * Math.PI * 2,
    buildings: [],
    usedIds: new Set(),
    counters: new Map(),
  };
  c.industrial = { x: c.riverBase - 12, y: Math.round(size * 0.18) };

  carveWater(c);
  layRoads(c);
  pruneRoadNetwork(c);
  computeElevation(c);
  placeLandmarks(c);
  fillDistricts(c);
  const props = scatterProps(c);

  return {
    worldId: `world_${hashString(`${seed}:${GENERATOR_VERSION}`).toString(36)}`,
    seed,
    generatorVersion: GENERATOR_VERSION,
    width: c.w,
    height: c.h,
    chunkSize: CHUNK_SIZE,
    terrain: c.terrain,
    elevation: c.elevation,
    buildings: c.buildings,
    props,
    regions: computeRegions(c),
    center: c.center,
  };
}
