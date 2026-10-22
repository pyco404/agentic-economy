import { z } from "zod";
import { BuildingId, ChunkCoord, CommunityId, AgentId, GridPos, DataMode } from "./primitives.js";
import { Resource } from "./economy.js";

export const BuildingKind = z
  .enum([
    "house",
    "apartment",
    "farm",
    "mill",
    "bakery",
    "market",
    "warehouse",
    "factory",
    "headquarters",
    "town_hall",
    "lumber_yard",
    "quarry",
    "power_station",
  ])
  .meta({ id: "BuildingKind" });
export type BuildingKind = z.infer<typeof BuildingKind>;

export const RoofStyle = z.enum(["flat", "gable", "hip", "shed", "sawtooth", "dome"]).meta({ id: "RoofStyle" });
export type RoofStyle = z.infer<typeof RoofStyle>;

export const Material = z.enum(["plaster", "brick", "timber", "stone", "concrete", "glass"]).meta({ id: "Material" });
export type Material = z.infer<typeof Material>;

export const WindowPattern = z.enum(["none", "grid", "bands", "sparse", "storefront"]).meta({ id: "WindowPattern" });
export type WindowPattern = z.infer<typeof WindowPattern>;

export const DistrictTheme = z
  .enum(["civic", "residential", "market", "industrial", "agricultural", "waterfront"])
  .meta({ id: "DistrictTheme" });
export type DistrictTheme = z.infer<typeof DistrictTheme>;

export const Facing = z.enum(["n", "e", "s", "w"]).meta({ id: "Facing", description: "Side of the footprint the entrance faces." });
export type Facing = z.infer<typeof Facing>;

/**
 * Parametric description of a code-generated building. Renderers MUST derive every visual
 * detail deterministically from these params (+ `seed`), never from client-side randomness.
 */
export const BuildingParams = z
  .object({
    width: z.number().int().min(1).max(16).describe("Footprint width in cells (x)."),
    depth: z.number().int().min(1).max(16).describe("Footprint depth in cells (y)."),
    height: z.number().min(0.2).max(40).describe("Wall height in world units (1 unit = 1 cell)."),
    floors: z.number().int().min(1).max(12),
    roofStyle: RoofStyle,
    material: Material,
    windowPattern: WindowPattern,
    districtTheme: DistrictTheme,
    /** Palette index 0..7 into the renderer's muted pastel roof palette. */
    roofPalette: z.number().int().min(0).max(7),
    facing: Facing,
    seed: z.number().int().min(0).max(0xffffffff).describe("Per-building deterministic seed for secondary detail."),
  })
  .meta({ id: "BuildingParams" });
export type BuildingParams = z.infer<typeof BuildingParams>;

export const BuildingStatus = z.enum(["active", "idle", "under_construction", "needs_maintenance", "reserved_lot"]).meta({ id: "BuildingStatus" });

export const Building = z
  .object({
    id: BuildingId,
    kind: BuildingKind,
    name: z.string(),
    /** Top-left (min x, min y) cell of the footprint. */
    origin: GridPos,
    /** Entrance cell (adjacent road/plaza cell agents walk to). */
    entrance: GridPos,
    chunk: ChunkCoord,
    params: BuildingParams,
    status: BuildingStatus,
    /** 0..100; deteriorates over time; maintenance restores it. */
    condition: z.number().min(0).max(100),
    /** Owning agent, if any (null = city-operated). */
    ownerAgentId: AgentId.nullable(),
    /** Headquarters / branding association. Any community may operate any profession anywhere. */
    communityId: CommunityId.nullable(),
    /** Snapshot of stock held at this building (authoritative server inventory). */
    inventory: z.partialRecord(Resource, z.number().int().min(0)),
    /** Optional HQ branding colours (hex) — headquarters only. */
    branding: z.object({ primary: z.string(), accent: z.string() }).nullable(),
  })
  .meta({ id: "Building" });
export type Building = z.infer<typeof Building>;

/** Static tree / prop placement. */
export const Prop = z
  .object({
    kind: z.enum(["tree_round", "tree_cone", "bush", "rock", "lamp"]),
    pos: GridPos,
    scale: z.number().min(0.3).max(2),
    seed: z.number().int().min(0).max(0xffffffff),
  })
  .meta({ id: "Prop" });
export type Prop = z.infer<typeof Prop>;

/**
 * Terrain cells encoded as one character per cell, row-major (y then x), length = size*size.
 * Legend: g grass, w water, s sand/shore, r road, p plaza/path, f field (farmland), b bridge (road over water), x building footprint.
 */
export const TERRAIN_LEGEND = {
  g: "grass",
  w: "water",
  s: "sand",
  r: "road",
  p: "plaza",
  f: "field",
  b: "bridge",
  x: "building",
} as const;
export type TerrainCode = keyof typeof TERRAIN_LEGEND;

export const WorldChunk = z
  .object({
    coord: ChunkCoord,
    size: z.number().int().positive(),
    /** Monotonic per-chunk version; increments on any structural change (building placed, upgraded...). */
    version: z.number().int().min(0),
    terrain: z.string().describe("size*size chars, see TERRAIN_LEGEND."),
    /** Elevation per cell, 0..9, same order/length as terrain, one digit per cell. */
    elevation: z.string(),
    buildings: z.array(Building),
    props: z.array(Prop),
  })
  .meta({ id: "WorldChunk" });
export type WorldChunk = z.infer<typeof WorldChunk>;

export const Region = z
  .object({
    id: z.string(),
    name: z.string(),
    theme: DistrictTheme,
    /** Inclusive-exclusive cell bounds. */
    bounds: z.object({ minX: z.number().int(), minY: z.number().int(), maxX: z.number().int(), maxY: z.number().int() }),
  })
  .meta({ id: "Region" });
export type Region = z.infer<typeof Region>;

export const BuildingCatalogEntry = z
  .object({
    kind: BuildingKind,
    label: z.string(),
    description: z.string(),
    profession: z.string().nullable(),
    inputs: z.partialRecord(Resource, z.number().int().positive()),
    outputs: z.partialRecord(Resource, z.number().int().positive()),
    cycleTicks: z.number().int().min(0),
  })
  .meta({ id: "BuildingCatalogEntry" });
export type BuildingCatalogEntry = z.infer<typeof BuildingCatalogEntry>;

export const WorldBootstrap = z
  .object({
    mode: DataMode,
    contractVersion: z.string(),
    worldId: z.string(),
    seed: z.string(),
    generatorVersion: z.number().int(),
    size: z.object({ width: z.number().int(), height: z.number().int() }),
    chunkSize: z.number().int(),
    chunks: z.array(ChunkCoord).describe("All chunk coordinates that currently exist."),
    regions: z.array(Region),
    catalog: z.array(BuildingCatalogEntry),
    sim: z.object({
      tick: z.number().int().min(0),
      tickMs: z.number().int().positive(),
      serverTime: z.iso.datetime({ offset: true }),
      /** Ticks per simulated day (for day/night or UI clocks). */
      ticksPerDay: z.number().int().positive(),
    }),
  })
  .meta({ id: "WorldBootstrap" });
export type WorldBootstrap = z.infer<typeof WorldBootstrap>;

export const WorldStats = z
  .object({
    mode: DataMode,
    tick: z.number().int(),
    population: z.number().int().describe("Simulated residents (demand sink)."),
    activeAgents: z.number().int(),
    aecoPopulation: z.object({
      status: z.enum(["disabled", "syncing", "current", "stale"]),
      mint: z.string().nullable(), network: z.enum(["devnet", "mainnet-beta"]).nullable(),
      holders: z.number().int().nonnegative(), commonAgents: z.number().int().nonnegative(),
      indexedSlot: z.number().int().nonnegative().nullable(), checkedAt: z.string().nullable(),
    }).optional(),
    pausedAgents: z.number().int(),
    communities: z.number().int(),
    buildings: z.number().int(),
    creditsInCirculation: z.number().int().describe("Total City Credits (milli-credits) held by all accounts. Non-withdrawable."),
    goodsProduced: z.partialRecord(Resource, z.number().int()),
    goodsConsumed: z.partialRecord(Resource, z.number().int()),
    verifiedTasks: z.number().int(),
  })
  .meta({ id: "WorldStats" });
export type WorldStats = z.infer<typeof WorldStats>;
