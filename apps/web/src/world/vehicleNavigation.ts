import { connectGraph, type NavEdge, type NavPoint } from "./navigation";
import { STREETS, type StreetPlan } from "./streets";

export const TRAFFIC_NAV = { step: .5, radius: .5, maxRasterCells: 1_048_576, minComponent: 40, minTrip: 18, acceleration: 1.2, stopMin: 3, stopVariation: 5 } as const;
const axes = [[0, 1], [1, 0], [0, -1], [-1, 0]] as const;
const key = (x: number, z: number, direction: number) => `${Math.round(x * 2)}:${Math.round(z * 2)}:${direction}`;
/** Directed pose graph over real paving. Wide-road center flags were discarding
 * valid junction approaches. This checks the entire car envelope instead; no
 * paving, bridge or persisted parcel is moved to connect a missing edge. */
export function vehicleNavigation(streets: StreetPlan, preferLanes = true) {
  const nodes = new Map<string, NavPoint>(), directions = new Map<string, number>(), priority = new Map<string, number>();
  const tiles=[...streets.tiles.values()];
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
  for(const t of tiles){minX=Math.min(minX,t.x);maxX=Math.max(maxX,t.x);minZ=Math.min(minZ,t.z);maxZ=Math.max(maxZ,t.z);}
  const width=maxX-minX+1,depth=maxZ-minZ+1;
  // Bounded numeric raster removes string allocation from swept-envelope
  // checks. Very large/sparse future worlds retain the exact Map fallback.
  const dense=tiles.length>0&&width*depth<=TRAFFIC_NAV.maxRasterCells;
  const paving=dense?new Uint8Array(width*depth):null,levels=dense?new Float64Array(width*depth):null;
  if(paving&&levels)for(const t of tiles){const index=(t.z-minZ)*width+t.x-minX;paving[index]=t.walk?1:2;levels[index]=t.level;}
  const cell=(x:number,z:number)=>{
    const ix=Math.floor(x/STREETS.grid),iz=Math.floor(z/STREETS.grid);
    return ix<minX||ix>maxX||iz<minZ||iz>maxZ?-1:(iz-minZ)*width+ix-minX;
  };
  const paved=(x:number,z:number)=>{if(paving)return paving[cell(x,z)]===2;const tile=streets.tiles.get(`${Math.floor(x/STREETS.grid)}:${Math.floor(z/STREETS.grid)}`);return !!tile&&!tile.walk;};
  const level=(x:number,z:number)=>{if(!levels)return streets.tiles.get(`${Math.floor(x/STREETS.grid)}:${Math.floor(z/STREETS.grid)}`)?.level;const index=cell(x,z);return paving![index]?levels[index]:undefined;};
  const fit = (x: number, z: number, heading: number) => {
    if(level(x,z)===undefined)return false;
    // Slight conservative envelope leaves room for interpolation between samples.
    const sin=Math.sin(heading),cos=Math.cos(heading);
    for(const side of [-STREETS.carHalfWidth-.025,0,STREETS.carHalfWidth+.025])
      for(const length of [-STREETS.carHalfLength-.025,0,STREETS.carHalfLength+.025]){
        if(!paved(x+cos*side+sin*length,z-sin*side+cos*length))return false;
      }
    return true;
  };
  const extent = (x:number,z:number,dx:number,dz:number) => {let d=.25;while(d<6&&paved(x+dx*d,z+dz*d))d+=.25;return d;};
  for (const tile of streets.tiles.values()) {
    if (tile.walk || tile.x % 2 || tile.z % 2) continue;
    const x = tile.x * .25, z = tile.z * .25;
    const west=extent(x,z,-1,0),east=extent(x,z,1,0),north=extent(x,z,0,-1),south=extent(x,z,0,1);
    const wideX=west+east>4,wideZ=north+south>4;
    for (let heading = 0; heading < 4; heading++) {
      const [dx, dz] = axes[heading]!;
      let penalty=0;
      if(preferLanes&&wideX!==wideZ) {
        const along=wideX?dx:dz;
        const end=wideX?Math.min(west,east)<1.5:Math.min(north,south)<1.5;
        if(!along&&!end)penalty=12;
        const width=wideX?north+south:west+east;
        // A genuinely constrained one-car verge is a yielding section. Normal
        // carriageways retain opposing lanes; intersections use swept arcs.
        if(along&&width>=1.5&&!end) {
          const middle=wideX?z+(south-north)/2:x+(east-west)/2;
          const right=dx?-dx*(z-middle):dz*(x-middle);
          if(right<.2)penalty=6;
        }
      }
      if (!fit(x, z, Math.atan2(dx, dz))) continue;
      const id = key(x, z, heading); nodes.set(id, { x, y: level(x, z)! + .04, z, heading: Math.atan2(dx,dz) }); directions.set(id, heading); priority.set(id,penalty);
    }
  }
  const edges = new Map<string, NavEdge[]>();
  // Compact, structured-cloneable samples keep the mobile graph lean. Expand
  // only the selected journey, rather than retaining 780k point objects.
  const packed=(points:NavPoint[])=>new Float32Array(points.flatMap(p=>[p.x,p.y,p.z,p.heading!]));
  for (const [id, point] of nodes) {
    const heading = directions.get(id)!, [dx, dz] = axes[heading]!, list: NavEdge[] = [];
    const forward = key(point.x + dx * .5, point.z + dz * .5, heading), to = nodes.get(forward);
    if (to && fit((point.x + to.x) / 2, (point.z + to.z) / 2, Math.atan2(dx, dz))) list.push({ to: forward, cost: .5 });
    for (const turn of [-1, 1]) for (const radius of [.5, 1, 1.5, 2]) {
      const nextHeading = (heading + turn + 4) % 4, [nx, nz] = axes[nextHeading]!;
      const end = key(point.x + (dx + nx) * radius, point.z + (dz + nz) * radius, nextHeading);
      if (!nodes.has(end)) continue;
      const samples: NavPoint[] = [];
      for (let i = 0; i <= 24; i++) {
        const a = i / 24 * Math.PI / 2;
        const x = point.x + dx * radius * Math.sin(a) + nx * radius * (1 - Math.cos(a));
        const z = point.z + dz * radius * Math.sin(a) + nz * radius * (1 - Math.cos(a));
        if (!fit(x, z, Math.atan2(dx * Math.cos(a) + nx * Math.sin(a), dz * Math.cos(a) + nz * Math.sin(a)))) break;
        samples.push({ x, y: level(x, z)! + .04, z, heading: Math.atan2(dx * Math.cos(a) + nx * Math.sin(a), dz * Math.cos(a) + nz * Math.sin(a)) });
      }
      if (samples.length === 25) list.push({ to: end, cost: Math.PI * radius / 2, curve: packed(samples) });
    }
    // Validated gentle lane adjustments accommodate changes in usable verge
    // width. End headings match the original direction; no sideways sliding.
    for (const length of [1, 1.5]) for (const side of [-.5, .5]) {
      const end = key(point.x + dx * length + dz * side, point.z + dz * length - dx * side, heading);
      if (!nodes.has(end)) continue;
      const samples: NavPoint[] = [];
      for (let i=0;i<=24;i++) {
        const t=i/24, lateral=side*t*t*(3-2*t), slope=side*6*t*(1-t);
        const x=point.x+dx*length*t+dz*lateral,z=point.z+dz*length*t-dx*lateral;
        if(!fit(x,z,Math.atan2(dx*length+dz*slope,dz*length-dx*slope))) break;
        samples.push({x,y:level(x,z)!+.04,z,heading:Math.atan2(dx*length+dz*slope,dz*length-dx*slope)});
      }
      if(samples.length===25)list.push({to:end,cost:samples.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-samples[i]!.x,p.z-samples[i]!.z),0)+.1,curve:packed(samples)});
    }
    // Lane-respecting routes are strongly preferred. A physically narrow
    // connector remains a yielding link instead of inventing wider pavement.
    list.forEach(edge=>edge.cost*=1+(priority.get(id)??0)+(priority.get(edge.to)??0));
    edges.set(id, list);
  }
  return { ...connectGraph("vehicle", nodes, edges), preferred:[...priority].filter(([,penalty])=>!penalty).map(([id])=>id) };
}
