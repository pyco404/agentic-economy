import type { Part } from "./geometry";
import type { FrontierData } from "./frontier";
import { hashSeed, type ChunkVisual } from "./layout";
import { railTerrain } from "./railTerrain";
import type { ScenicFootprint, ScenicRail } from "./outskirts";
import { generateTreeParts } from "./vegetationGeometry";

/** Decorative expansion parcels. These never become authoritative buildings,
 * economic facilities, air services, vehicle destinations or boat routes. */
export const SUPPORT_DISTRICTS = { maxSites: 9, maxParts: 1800,
  maxAccess: 90, railMargin: 3.4, maxRise: .45 } as const;
type Theme = "aviation" | "transport" | "service" | "agriculture" | "woodland" | "wetland";
export interface SupportSite { theme: Theme; x: number; z: number; width: number; depth: number;
  level: number; access: { x: number; z: number }[] }
export function planSupportDistricts(chunks: ChunkVisual[], frontier: FrontierData, seed: number,
  catalog: { cx: number; cy: number }[] | undefined, rails: readonly ScenicRail[],
  infrastructure: readonly Part[], footprint: ScenicFootprint) {
  const parts: Part[] = [], sites: SupportSite[] = [], cleared: number[] = [];
  const report = { sites, parts: 0, parkedAircraft: 0, parkedCars: 0, accessTiles: 0, reachableOuterTiles: 0 };
  const empty = () => ({ parts, report, clearedFrontierParts: cleared });
  const coords = catalog?.length ? catalog : chunks.map(c => ({ cx: c.x, cy: c.z }));
  if (!coords.length || !frontier.positions.length) return empty();
  const canonical = new Set(coords.map(c => `${c.cx}:${c.cy}`));
  const inside = (x: number, z: number) => canonical.has(`${Math.floor(x / 32)}:${Math.floor(z / 32)}`);
  const terrain = railTerrain(chunks, frontier);
  // Frontier land triangles can underlie rendered water near a tapered bank.
  // Water takes precedence for new paths even when a substrate triangle exists.
  const water = railTerrain([], { ...frontier, positions: [] });
  const ground = (x:number,z:number) => water(x,z)?.wet ? {height:0,wet:true} : terrain(x,z);
  const loaded = new Map(chunks.map(c=>[`${c.x}:${c.z}`,c]));
  const edgeAccess = (x:number,z:number) => {
    if(!inside(x,z))return true;
    const cx=Math.floor(x/32),cz=Math.floor(z/32),c=loaded.get(`${cx}:${cz}`);
    if(!c || c.terrain?.[(Math.floor(z)-cz*32)*32+Math.floor(x)-cx*32]!=="g")return false;
    const edge=[[-1,0],[1,0],[0,-1],[0,1]].some(([dx,dz])=>!canonical.has(`${cx+dx!}:${cz+dz!}`) &&
      (dx===-1?x-cx*32:dx===1?(cx+1)*32-x:dz===-1?z-cz*32:(cz+1)*32-z)<=5);
    return edge && !chunks.some(chunk=>chunk.buildings.some(b=>Math.abs(b.x-x)<b.width/2+1.2&&Math.abs(b.z-z)<b.depth/2+1.2) ||
      chunk.trees.some(t=>Math.hypot(t.x-x,t.z-z)<2));
  };
  const corners = (x: number, z: number, w: number, d: number, test: (x: number, z: number) => boolean) => {
    for (let dx = -w / 2; dx <= w / 2; dx += 1) for (let dz = -d / 2; dz <= d / 2; dz += 1)
      if (!test(x + dx, z + dz)) return false;
    return true;
  };
  const bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (let i = 0; i < frontier.positions.length; i += 3) {
    const x = frontier.positions[i]!, z = frontier.positions[i + 2]!;
    bounds.minX = Math.min(bounds.minX, x); bounds.maxX = Math.max(bounds.maxX, x);
    bounds.minZ = Math.min(bounds.minZ, z); bounds.maxZ = Math.max(bounds.maxZ, z);
  }
  const structures = [...infrastructure, ...frontier.parts.filter(p => !p.role?.startsWith("tree-") && p.scale[1] > .4)]
    .map(p => { const a = p.rotation?.[1] ?? 0; return { x: p.position[0], z: p.position[2],
      w: Math.abs(Math.cos(a)) * p.scale[0] + Math.abs(Math.sin(a)) * p.scale[2],
      d: Math.abs(Math.sin(a)) * p.scale[0] + Math.abs(Math.cos(a)) * p.scale[2],
      bottom: p.position[1] - p.scale[1] / 2, top: p.position[1] + p.scale[1] / 2 }; });
  const blocked = (x: number, z: number, w: number, d: number, height: number, access: boolean) => {
    if (structures.some(p => Math.abs(x - p.x) < (w + p.w) / 2 + .3 && Math.abs(z - p.z) < (d + p.d) / 2 + .3 &&
      p.top > height && (!access || p.bottom < height + 2.6))) return true;
    for (const rail of rails) for (let i = 1; i < rail.points.length; i++) {
      const a = rail.points[i - 1]!, b = rail.points[i]!, dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < Math.hypot(w, d) / 2 + SUPPORT_DISTRICTS.railMargin &&
        (!access || (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t - height < 3.2)) return true;
    }
    return false;
  };
  // Flood access from real roads, on retained dry land only. No fictitious road
  // seed or path across a canal; elevated rail decks need pedestrian clearance.
  type Node = { x: number; z: number; y: number; parent: string | null; distance: number };
  const nodes = new Map<string, Node>(), queue: string[] = [], tested = new Set<string>();
  const key = (x: number, z: number) => `${x}:${z}`;
  for (const c of [...chunks].sort((a,b)=>a.x-b.x||a.z-b.z)) for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) {
    if (!"rpb".includes(c.terrain?.[z * 32 + x] ?? "")) continue;
    const px = c.x * 32 + Math.floor(x / 2) * 2 + 1, pz = c.z * 32 + Math.floor(z / 2) * 2 + 1, g = ground(px, pz);
    if (!g || g.wet) continue;
    const id = key(px, pz); if(nodes.has(id))continue;
    nodes.set(id, { x: px, z: pz, y: g.height, parent: null, distance: 0 }); queue.push(id);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const id = queue[cursor]!, node = nodes.get(id)!;
    if (node.distance >= SUPPORT_DISTRICTS.maxAccess) continue;
    for (const [dx, dz] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
      const x = node.x + dx!, z = node.z + dz!, next = key(x, z);
      if (nodes.has(next) || tested.has(next) || !edgeAccess(x,z)) continue;
      const g = ground(x, z);
      if (!g || g.wet || !corners(x, z, 2, 2, (a, b) => { const land = ground(a, b); return footprint.contains(a, b) && !!land && !land.wet; }) ||
        blocked(x, z, 2, 2, g.height, true)) { tested.add(next); continue; }
      // Do not reject globally after an unsuitable predecessor: another
      // neighbor can approach this tile along a gentler grade.
      if (Math.abs(g.height - node.y) > .35) continue;
      nodes.set(next, { x, z, y: g.height, parent: id, distance: node.distance + 2 }); queue.push(next);
    }
  }
  const accessTiles = new Set<string>();
  report.reachableOuterTiles = [...nodes.values()].filter(n=>!inside(n.x,n.z)).length;
  const reserved = (x: number, z: number, margin = 0) => sites.some(s => Math.abs(x - s.x) < s.width / 2 + margin && Math.abs(z - s.z) < s.depth / 2 + margin);
  const programs: [Theme, number, number, number, number][] = [
    ["aviation", 18, 12, .25, 0], ["transport", 14, 12, 1, .5], ["agriculture", 14, 12, .5, 1],
    ["service", 12, 10, .8, 0], ["wetland", 12, 10, 0, .7], ["woodland", 12, 12, .1, .1],
    ["agriculture", 14, 12, .8, 1], ["service", 12, 10, 1, .85], ["woodland", 12, 12, .1, .9],
  ];
  const cx = (Math.min(...coords.map(c => c.cx)) + Math.max(...coords.map(c => c.cx)) + 1) * 16;
  const cz = (Math.min(...coords.map(c => c.cy)) + Math.max(...coords.map(c => c.cy)) + 1) * 16;
  for (const [theme, width, depth, tx, tz] of programs) {
    if (sites.length >= SUPPORT_DISTRICTS.maxSites || parts.length + 200 > SUPPORT_DISTRICTS.maxParts) break;
    const targetX = cx + (tx - .5) * (bounds.maxX - bounds.minX) * .65;
    const targetZ = cz + (tz - .5) * (bounds.maxZ - bounds.minZ) * .65;
    const wooded: Node[] = [];
    if(theme==="woodland")for(let x=Math.ceil(bounds.minX/4)*4+1;x<bounds.maxX;x+=4)
      for(let z=Math.ceil(bounds.minZ/4)*4+1;z<bounds.maxZ;z+=4){
        const g=ground(x,z);if(!inside(x,z)&&footprint.contains(x,z)&&g&&!g.wet)wooded.push({x,z,y:g.height,parent:null,distance:0});
      }
    const candidates = (theme==="woodland"?wooded:[...nodes.values()].filter(n => !inside(n.x, n.z) && n.distance > 4))
      .sort((a, b) => (Math.hypot(a.x - targetX, a.z - targetZ) + a.distance * .15 + hashSeed(seed, a.x, a.z) % 19 * .02) -
        (Math.hypot(b.x - targetX, b.z - targetZ) + b.distance * .15 + hashSeed(seed, b.x, b.z) % 19 * .02));
    for (const n of candidates) {
      const x = n.x, z = n.z;
      if (sites.some(s => Math.abs(s.x - x) < (s.width + width) / 2 + 5 && Math.abs(s.z - z) < (s.depth + depth) / 2 + 5)) continue;
      if (blocked(x, z, width, depth, n.y, false)) continue;
      const heights: number[] = [];
      if (!corners(x, z, width + 1, depth + 1, (a, b) => {
        const g = ground(a, b); if (inside(a, b) || !footprint.contains(a, b) || !g || g.wet || accessTiles.has(key(a, b))) return false;
        heights.push(g.height); return true;
      })) continue;
      const level = Math.max(...heights) + .035;
      if (level - Math.min(...heights) > SUPPORT_DISTRICTS.maxRise) continue;
      // Choose the shortest existing approach to an edge, rather than drawing
      // an arbitrary line from the pad through buildings or rail foundations.
      const approaches = [[x - width / 2 - 2, z], [x + width / 2 + 2, z], [x, z - depth / 2 - 2], [x, z + depth / 2 + 2]]
        .map(([a, b]) => nodes.get(key(Math.round((a! - 1) / 2) * 2 + 1, Math.round((b! - 1) / 2) * 2 + 1)))
        .filter((v): v is Node => !!v).sort((a, b) => a.distance - b.distance);
      let access: Node[] | undefined;
      for (const start of approaches) {
        const path: Node[] = []; let current: Node | undefined = start, valid = true;
        while (current && current.parent !== null) {
          if (reserved(current.x, current.z, 1) || Math.abs(current.x - x) < width / 2 && Math.abs(current.z - z) < depth / 2) { valid = false; break; }
          path.push(current); current = nodes.get(current.parent);
        }
        if (valid && current) { access = path; break; }
      }
      if (!access && theme!=="woodland") continue;
      access ??= [];
      const site: SupportSite = { theme, x, z, width, depth, level, access: access.map(p => ({ x: p.x, z: p.z })) };
      sites.push(site);
      const box = (color: string, dx: number, y: number, dz: number, w: number, h: number, d: number, geometry = "box") =>
        parts.push({ geometry, color, position: [x + dx, level + y, z + dz], scale: [w, h, d] });
      const tree = (dx: number, dz: number, kind: "evergreen" | "layered" | "ornamental" | "shrub", scale = 1) =>
        parts.push(...generateTreeParts({ x: x + dx, z: z + dz,
          elevation:theme==="woodland"?ground(x+dx,z+dz)!.height:level, kind, scale, zone: "natural", placement: "natural" }));
      const shed = (dx: number, dz: number, w: number, d: number, h: number, roof: string) => {
        box("#e9dfc8", dx, h / 2, dz, w, h, d); box(roof, dx, h + .3, dz, w + .25, .6, d + .25, "roof");
        box("#537e6d", dx, .65, dz + d / 2 + .04, w * .45, 1.3, .08);
        box("#82aabd", dx - w * .32, h * .65, dz + d / 2 + .045, .55, .5, .09);
      };
      // Graded shallow parcel, not a tall platform. Existing ground remains.
      const fill = level-Math.min(...heights)+.035;
      if(theme!=="woodland")box(["aviation", "transport", "service"].includes(theme) ? "#c5c9bd" : "#b8c797", 0, -fill/2, 0, width, fill, depth);
      if (theme === "aviation") {
        shed(-5, -3.3, 5, 3.3, 2.3, "#91a59a");
        for (const [dx, dz] of [[1.5, -1.6], [5.7, 2.2]]) {
          box("#f2e7ce", dx!, .65, dz!, .55, .45, 2.7, "round");
          box("#82aabd", dx!, .66, dz!, 3.7, .09, .65);
          box("#537e6d", dx!, .8, dz! - .9, 1.35, .08, .42);
          box("#537e6d", dx!, 1, dz! - 1, .09, .7, .5);
          for (const side of [-.3, .3]) box("#526761", dx! + side, .22, dz!, .12, .4, .25);
          box("#f2e7ce", dx!, .025, dz! + 1.9, 3.3, .035, .12); report.parkedAircraft++;
        }
        box("#c77f66", -7, .45, 2.8, 1.1, .9, 1.1, "cylinder");
        box("#f2e7ce", -7, .94, 2.8, 1.2, .08, 1.2, "cylinder");
      } else if (theme === "transport") {
        shed(-4.4, -3.3, 3, 2.8, 1.6, "#91a59a");
        for (const dx of [-4.5, -2.25, 0, 2.25, 4.5]) {
          box("#f2e7ce", dx, .025, 2.1, .08, .035, 3.5);
          box(["#537e6d", "#82aabd", "#c77f66"][report.parkedCars % 3]!, dx + .9, .42, 2, .65, .4, 1.25);
          box("#82aabd", dx + .9, .75, 1.9, .55, .3, .65); report.parkedCars++;
        }
        box("#f2e7ce", 2.2, .025, -2.8, .13, .035, 2.2);
        box("#537e6d", 5.1, 1.2, -3.8, 2.5, .12, 1.5);
        for (const dx of [4.1, 6.1]) box("#b7ac90", dx, .55, -3.8, .1, 1.1, .1);
      } else if (theme === "agriculture") {
        shed(-4.5, -3.1, 3.4, 2.8, 1.8, "#c77f66");
        for (const dx of [-1.5, .2, 1.9, 3.6, 5.3]) {
          box("#b9a986", dx, .025, 0, 1.2, .04, 9);
          for (const dz of [-3.5, -1.5, .5, 2.5, 4]) box("#8fa777", dx, .18, dz, .85, .3, 1.3, "round");
        }
        for (const dz of [.3, 2.4, 4.5]) tree(-4.8, dz, "ornamental", .85);
      } else if (theme === "service") {
        shed(-2.5, -1.9, 4.7, 3.7, 2, "#91a59a");
        for (const [i, dz] of [-2.5, 0, 2.5].entries()) {
          box(i % 2 ? "#c77f66" : "#82aabd", 3.4, .6, dz, 2.3, 1.2, 1.5);
          for (const dx of [2.6, 3.4, 4.2]) box("#eee5d4", dx, .65, dz + .76, .05, 1, .035);
        }
        for (const dx of [-4, -2, 0]) box("#b9aa8d", dx, .25, 3.5, 1.1, .5, 1.1);
      } else if (theme === "woodland") {
        for (let i = 0; i < 18; i++) { const h = hashSeed(seed + i, x, z);
          tree((h % 100) / 10 - 4.8, ((h >>> 8) % 100) / 10 - 4.8,
            ["evergreen", "layered", "ornamental"][(h >>> 16) % 3]! as "evergreen", .9 + (h % 7) * .06); }
      } else {
        // Small lined retention basin, not a new navigable/economic waterway.
        box("#d9d4bc", 0, .08, 0, 10.4, .22, 8.4, "cylinder");
        box("#83bbca", 0, .205, 0, 9.4, .025, 7.4, "cylinder");
        for (const dx of [-4, -2, 0, 2, 4]) { tree(dx, 4, "shrub", .75); box("#c7c194", dx, .35, -4, .18, .7, .18, "cone"); }
        box("#b9aa8d", -4.1, .26, 0, 1.5, .13, 3);
      }
      // A perimeter footway gives each compound usable circulation and joins
      // whichever side was reached by the actual access flood.
      for (const side of theme==="woodland"?[]:[-1, 1]) {
        box("#ded4bd", 0, .02, side * (depth / 2 - .4), width, .035, .8);
        box("#ded4bd", side * (width / 2 - .4), .021, 0, .8, .035, depth - 1.6);
      }
      for (const tile of access) { const id = key(tile.x, tile.z); if (accessTiles.has(id)) continue;
        accessTiles.add(id); parts.push({ geometry: "box", color: "#ded4bd", position: [tile.x, tile.y + .025, tile.z], scale: [2, .035, 2] }); }
      if(access.length){const start=access[0]!,dx=Math.max(-width/2,Math.min(width/2,start.x-x)),dz=Math.max(-depth/2,Math.min(depth/2,start.z-z));
        const ax=x+dx,az=z+dz,run=Math.hypot(ax-start.x,az-start.z),rise=level-start.y;
        parts.push({geometry:"box",color:"#ded4bd",position:[(start.x+ax)/2,(level+start.y)/2+.045,(start.z+az)/2],
          scale:[1.6,.04,Math.hypot(run,rise)],rotation:[-Math.atan2(rise,run),Math.atan2(ax-start.x,az-start.z),0]});}
      break;
    }
  }
  // Remove whole pre-existing tree groups only where compounds/access replace
  // them. Shared references let the caller retain every other scenic object.
  const displaced = frontier.parts.filter(p => p.role === "tree-trunk" &&
    (reserved(p.position[0], p.position[2], 1.3) || [...accessTiles].some(id => { const [x, z] = id.split(":").map(Number); return Math.hypot(p.position[0] - x!, p.position[2] - z!) < 2; })));
  frontier.parts.forEach((p, i) => { if (p.role?.startsWith("tree-") && displaced.some(t => Math.abs(p.position[0] - t.position[0]) < .8 && p.position[2] === t.position[2])) cleared.push(i); });
  report.parts = parts.length; report.accessTiles = accessTiles.size;
  return empty();
}
