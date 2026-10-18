import {beforeAll,describe,expect,it} from "vitest";
import * as THREE from "three";
import fixture from "./fixtures/underground-rail-world.json";
import type {ChunkVisual} from "./layout";
import {generateFrontier} from "./frontier";
import {waterNavigation,WATER_NAV} from "./waterNavigation";
import {vehicleNavigation} from "./vehicleNavigation";
import {createJourneyFleet} from "./journeys";
import {boatParts,boatHull} from "./boats";
import {findRoute,gridGraph,distance} from "./navigation";
import {planStreets,vehicleFitsStreet,carsOverlap} from "./streets";
import {buildPathNetwork,pedestrianNavigation} from "./agentMotion";
const chunks=fixture.chunks as ChunkVisual[];
let water:ReturnType<typeof waterNavigation>,roads:ReturnType<typeof vehicleNavigation>,streets:ReturnType<typeof planStreets>;
beforeAll(()=>{streets=planStreets(chunks,fixture.seed);roads=vehicleNavigation(streets);water=waterNavigation(chunks,generateFrontier(fixture.seed,chunks,fixture.catalog),fixture.seed);},120000);
describe("geometry-derived city navigation",()=>{
  it("builds distinct low-poly cargo, ferry and service silhouettes",()=>{
    const hull=boatHull();hull.computeBoundingBox();expect(hull.boundingBox!.max.y).toBeCloseTo(.2);
    expect(hull.getAttribute("position").count/3).toBeLessThan(30);
    const models=(["cargo","ferry","service"] as const).map(boatParts);
    expect(new Set(models.map(parts=>JSON.stringify(parts))).size).toBe(3);
    expect(models.flat().length).toBeLessThan(50);
    for(const part of models.flat()){
      const vertices=part.geometry==="boat-hull"?Array.from({length:hull.getAttribute("position").count},(_,i)=>[hull.getAttribute("position").getX(i),hull.getAttribute("position").getY(i),hull.getAttribute("position").getZ(i)]):[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>[x,y,z])));
      for(const [x,y,z]of vertices){expect(Math.hypot(part.position[0]+x!*part.scale[0],part.position[2]+z!*part.scale[2])).toBeLessThan(WATER_NAV.radius);expect(part.position[1]+y!*part.scale[1]+.03).toBeLessThan(WATER_NAV.height);}
    }
    hull.dispose();
  });
  it("preserves the movement clock through expansion and reaches newly connected destinations",()=>{
    const line=(length:number)=>gridGraph("pedestrian",new Map(Array.from({length},(_,x)=>[String(x),{x,y:0,z:0}])));
    const options={seed:7,minTrip:8,dwellMin:.5,dwellVariation:.5,acceleration:1,separation:1,speed:()=>1.5};
    const original=createJourneyFleet(line(20),["0"],["19"],options);
    for(let time=0;time<10;time+=.1)original.update(time);
    const expanded=createJourneyFleet(line(40),["0"],["19","39"],options);
    expanded.preserve(original);expanded.update(original.clock());
    expect(expanded.report()).toEqual(original.report());
    for(let time=10;time<100;time+=.1)expanded.update(time);
    expect(expanded.actors[0]!.destinations).toContain("39");
    expect(expanded.actors[0]!.completed).toBeGreaterThan(1);
  });
  it("keeps numeric and sparse paving lookups equivalent across negative coordinates",()=>{
    const tiles:typeof streets.tiles=new Map();
    for(let x=-8;x<=8;x++)for(let z=-8;z<=8;z++)tiles.set(`${x}:${z}`,{x,z,level:.24,walk:false,owner:"test",bridge:false});
    const dense=vehicleNavigation({...streets,tiles});
    const sparse=new Map(tiles);sparse.set("remote-walk",{x:2000000,z:2000000,level:0,walk:true,owner:"outer",bridge:false});
    const fallback=vehicleNavigation({...streets,tiles:sparse});
    expect(fallback.nodes).toEqual(dense.nodes);expect(fallback.edges).toEqual(dense.edges);expect(fallback.preferred).toEqual(dense.preferred);
  });
  it("finds distant pedestrian routes without cutting across missing cells",()=>{
    const graph=pedestrianNavigation(buildPathNetwork(chunks,fixture.seed));
    expect(Math.max(...graph.components.map(c=>c.length))).toBeGreaterThan(2000);
    const component=graph.components.reduce((a,b)=>a.length>b.length?a:b);
    const ids=[...component].sort((a,b)=>graph.nodes.get(a)!.x-graph.nodes.get(b)!.x);
    const route=findRoute(graph,ids[0]!,ids.at(-1)!)!;
    expect(route.length).toBeGreaterThan(100);
    route.slice(1).forEach((p,i)=>expect(distance(p,route[i]!)).toBeLessThanOrEqual(1.01));
    const tiny=gridGraph("pedestrian",new Map([["a",{x:0,y:0,z:0}],["b",{x:2,y:0,z:0}]]));expect(findRoute(tiny,"a","b")).toBeNull();
  });
  it("routes three procedural boat classes among accessible docks over ten simulated minutes",()=>{
    expect(water.docks.length).toBeGreaterThanOrEqual(6);
    for(const dock of water.docks)for(const [dx,dz]of [[0,0],[.3,0],[-.3,0],[0,.3],[0,-.3]]){
      const x=Math.floor(dock.shore.x+dx!),z=Math.floor(dock.shore.z+dz!),chunk=chunks.find(c=>x>=c.x*32&&x<(c.x+1)*32&&z>=c.z*32&&z<(c.z+1)*32)!;
      expect("gsp").toContain(chunk.terrain![(z-chunk.z*32)*32+x-chunk.x*32]);
    }
    const groups=new Map<number,string[]>();water.docks.forEach(d=>groups.set(d.component,[...(groups.get(d.component)??[]),d.node]));
    const sections=[...groups.values()];
    const fleet=createJourneyFleet(water.graph,[sections[0]![0]!,sections[0]![1]!,sections[1]![0]!],water.docks.map(d=>d.node),{seed:fixture.seed,minTrip:8,dwellMin:5,dwellVariation:8,acceleration:.38,separation:2.4,boats:true,speed:i=>[1.05,1.3,1.5][i]!});
    const previous=fleet.actors.map(a=>({...a.position}));
    for(let t=0;t<600;t+=.1){fleet.update(t);fleet.actors.forEach((a,i)=>{
      expect(distance(a.position,previous[i]!)).toBeLessThan(.16);previous[i]={...a.position};
      for(let j=0;j<i;j++)expect(distance(a.position,fleet.actors[j]!.position)).toBeGreaterThanOrEqual(2.4);
    });}
    fleet.actors.forEach(a=>{expect(a.completed).toBeGreaterThan(5);expect(new Set(a.history.flatMap(h=>[h.from,h.to])).size).toBeGreaterThanOrEqual(3);expect(a.traveled).toBeGreaterThan(100);});
    const rebuilt=createJourneyFleet(water.graph,fleet.actors.map(a=>a.node),water.docks.map(d=>d.node),{seed:fixture.seed,minTrip:8,dwellMin:5,dwellVariation:8,acceleration:.38,separation:2.4,boats:true,speed:()=>1});
    rebuilt.preserve(fleet);expect(rebuilt.report()).toEqual(fleet.report());rebuilt.update(fleet.clock());expect(rebuilt.report()).toEqual(fleet.report());
  });
  it("cars complete multi-intersection destination journeys without leaving paving or overlapping",()=>{
    const ids=roads.preferred!.filter(id=>roads.components[roads.component.get(id)!]!.length>1000);
    expect(ids.length).toBeGreaterThan(1000);
    const starts:string[]=[];for(let i=0;i<6;i++)starts.push([...ids].sort((a,b)=>{
      const score=(id:string)=>starts.length?Math.min(...starts.map(s=>distance(roads.nodes.get(s)!,roads.nodes.get(id)!))):0;
      return score(b)-score(a)||a.localeCompare(b);
    }).find(id=>!starts.includes(id))!);
    const a=new THREE.Vector3(),b=new THREE.Vector3();
    const fleet=createJourneyFleet(roads,starts,ids.filter((_,i)=>i%11===0),{seed:fixture.seed,minTrip:18,dwellMin:3,dwellVariation:5,acceleration:1.2,separation:1.4,speed:i=>2.2+i*.05,
      fits:(p,h)=>vehicleFitsStreet(a.set(p.x,p.y,p.z),h,streets),overlaps:(p,h,q,j)=>carsOverlap(a.set(p.x,p.y,p.z),h,b.set(q.x,q.y,q.z),j)});
    for(let t=0;t<600;t+=.1){fleet.update(t);for(const actor of fleet.actors)expect(vehicleFitsStreet(a.set(actor.position.x,actor.position.y,actor.position.z),actor.heading,streets)).toBe(true);for(let i=0;i<fleet.actors.length;i++)for(let j=0;j<i;j++){const p=fleet.actors[i]!,q=fleet.actors[j]!;expect(carsOverlap(a.set(p.position.x,p.position.y,p.position.z),p.heading,b.set(q.position.x,q.position.y,q.position.z),q.heading)).toBe(false);}}
    fleet.actors.forEach(actor=>{expect(actor.completed).toBeGreaterThanOrEqual(1);expect(actor.traveled).toBeGreaterThan(40);});
  },120000);
});
