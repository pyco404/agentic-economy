import type { ChunkCoord, Prop } from "@agentic-economy/shared";
import type { BuildingPlacement, WorldLayout } from "./generate.js";

/** Static (generated) portion of a chunk. Dynamic building state (inventory, condition, owner) is merged by the server. */
export interface StaticChunk {
  coord: ChunkCoord;
  size: number;
  terrain: string;
  elevation: string;
  /** Buildings whose ORIGIN cell lies in this chunk (a footprint may extend into a neighbour chunk). */
  buildings: BuildingPlacement[];
  props: Prop[];
}

export function chunkCoords(layout: Pick<WorldLayout, "width" | "height" | "chunkSize">): ChunkCoord[] {
  const out: ChunkCoord[] = [];
  for (let cy = 0; cy < Math.ceil(layout.height / layout.chunkSize); cy++)
    for (let cx = 0; cx < Math.ceil(layout.width / layout.chunkSize); cx++) out.push({ cx, cy });
  return out;
}

export function chunkOfCell(layout: Pick<WorldLayout, "chunkSize">, x: number, y: number): ChunkCoord {
  return { cx: Math.floor(x / layout.chunkSize), cy: Math.floor(y / layout.chunkSize) };
}

export function extractChunk(layout: WorldLayout, coord: ChunkCoord): StaticChunk {
  const s = layout.chunkSize;
  const x0 = coord.cx * s;
  const y0 = coord.cy * s;
  let terrain = "";
  let elevation = "";
  for (let y = y0; y < y0 + s; y++) {
    for (let x = x0; x < x0 + s; x++) {
      const inside = x < layout.width && y < layout.height;
      const i = y * layout.width + x;
      terrain += inside ? layout.terrain[i] : "w";
      elevation += inside ? String(layout.elevation[i]) : "0";
    }
  }
  const within = (p: { x: number; y: number }) => p.x >= x0 && p.x < x0 + s && p.y >= y0 && p.y < y0 + s;
  return {
    coord,
    size: s,
    terrain,
    elevation,
    buildings: layout.buildings.filter((b) => within(b.origin)),
    props: layout.props.filter((p) => within(p.pos)),
  };
}
