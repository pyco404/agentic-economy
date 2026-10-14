import type { BuildingCatalogEntry, BuildingKind, Resource } from "@agentic-economy/shared";

export interface Recipe {
  inputs: Partial<Record<Resource, number>>;
  outputs: Partial<Record<Resource, number>>;
  /** Ticks per production cycle. 0 = no production. */
  cycleTicks: number;
}

export interface KindSpec extends Recipe {
  label: string;
  description: string;
  /** Profession that operates this building, if any. */
  profession: string | null;
  /** Max stock (all resources combined) held at the building. */
  storageCapacity: number;
  /** Condition points lost per simulated day. */
  wearPerDay: number;
}

/** Single source of truth for building kinds and recipes, shared by the simulation and the bootstrap catalog. */
export const KIND_SPECS: Record<BuildingKind, KindSpec> = {
  house: { label: "House", description: "Home for simulated residents; drives bread demand.", profession: null, inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 0, wearPerDay: 1 },
  apartment: { label: "Apartment block", description: "Dense housing; drives bread demand.", profession: "property_manager", inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 0, wearPerDay: 2 },
  farm: { label: "Farm", description: "Grows wheat on surrounding fields.", profession: "farmer", inputs: {}, outputs: { wheat: 2 }, cycleTicks: 6, storageCapacity: 60, wearPerDay: 2 },
  mill: { label: "Mill", description: "Grinds wheat into flour using energy.", profession: "manufacturer", inputs: { wheat: 3, energy: 1 }, outputs: { flour: 2 }, cycleTicks: 8, storageCapacity: 80, wearPerDay: 3 },
  bakery: { label: "Bakery", description: "Bakes bread from flour using energy.", profession: "manufacturer", inputs: { flour: 2, energy: 1 }, outputs: { bread: 3 }, cycleTicks: 8, storageCapacity: 60, wearPerDay: 3 },
  market: { label: "Market", description: "Residents buy bread here (demand sink).", profession: "merchant", inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 120, wearPerDay: 2 },
  warehouse: { label: "Warehouse", description: "Bulk storage for any goods.", profession: "logistics_operator", inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 400, wearPerDay: 1 },
  factory: { label: "Workshop factory", description: "Assembles maintenance kits from timber and stone (consumed by repairs).", profession: "manufacturer", inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 120, wearPerDay: 3 },
  headquarters: { label: "Community headquarters", description: "A token community's branded presence in the city.", profession: "property_manager", inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 40, wearPerDay: 1 },
  town_hall: { label: "Town hall", description: "Civic center; funds resident wages from controlled City Credit issuance.", profession: null, inputs: {}, outputs: {}, cycleTicks: 0, storageCapacity: 0, wearPerDay: 1 },
  lumber_yard: { label: "Lumber yard", description: "Produces timber for construction and maintenance.", profession: "builder", inputs: {}, outputs: { timber: 1 }, cycleTicks: 10, storageCapacity: 60, wearPerDay: 2 },
  quarry: { label: "Quarry", description: "Produces stone for construction and maintenance.", profession: "builder", inputs: {}, outputs: { stone: 1 }, cycleTicks: 12, storageCapacity: 60, wearPerDay: 2 },
  power_station: { label: "Power station", description: "Generates energy consumed by mills and bakeries.", profession: "manufacturer", inputs: {}, outputs: { energy: 3 }, cycleTicks: 6, storageCapacity: 90, wearPerDay: 3 },
};

export function buildingCatalog(): BuildingCatalogEntry[] {
  return (Object.keys(KIND_SPECS) as BuildingKind[]).map((kind) => {
    const s = KIND_SPECS[kind];
    return {
      kind,
      label: s.label,
      description: s.description,
      profession: s.profession,
      inputs: s.inputs,
      outputs: s.outputs,
      cycleTicks: s.cycleTicks,
    };
  });
}
