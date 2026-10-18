import * as THREE from "three";
import { createBatch, type GeometryLibrary, type Part } from "./geometry";
import { createJourneyFleet } from "./journeys";
import { WATER_NAV, type WaterPlan } from "./waterNavigation";

export const BOATS = { enabled: true, count: 3, bob: .018, headingRate: .85, wakeOpacity: .18 } as const;
export type BoatKind = "cargo" | "ferry" | "service";
/** Closed low-poly hull, tapered bow and narrower submerged chine. No sprites. */
export function boatHull() {
  const outline=[[-.5,-.5],[.5,-.5],[.5,.2],[0,.6],[-.5,.2]];
  const vertices=outline.map(([x,z])=>new THREE.Vector3(x!,.2,z!));
  vertices.push(...outline.map(([x,z])=>new THREE.Vector3(x!*.65,-.16,z!*.8)));
  const positions:number[]=[];
  const triangle=(a:number,b:number,c:number)=>positions.push(...vertices[a]!.toArray(),...vertices[b]!.toArray(),...vertices[c]!.toArray());
  for(let i=1;i<4;i++){triangle(0,i+1,i);triangle(5,5+i,6+i);}
  for(let i=0;i<5;i++){const next=(i+1)%5;triangle(i,next,5+next);triangle(i,5+next,5+i);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();geometry.computeBoundingSphere();return geometry;
}
export function boatParts(kind:BoatKind):Part[] {
  const parts:Part[]=[],put=(color:string,position:Part["position"],scale:Part["scale"],geometry="box")=>parts.push({geometry,color,position,scale});
  const green="#416a54",cream="#f3e8cf",sage="#92a783",clay="#bc7f63",glass="#769ba8";
  put(kind==="ferry"?cream:green,[0,0,0],[kind==="service"?.6:.8,1,kind==="service"?1.25:1.7],"boat-hull");
  put(cream,[0,.23,-.04],[kind==="service"?.47:.64,.06,kind==="service"?.85:1.3]);
  if(kind==="cargo"){
    put(cream,[0,.49,.4],[.5,.46,.43]);put(green,[0,.75,.4],[.6,.07,.52]);put(glass,[0,.55,.625],[.37,.15,.025]);
    for(const x of [-.16,.16])for(const z of [-.5,-.16])put(z<-.3?clay:sage,[x,.4,z],[.27,.28,.27]);
  }else if(kind==="ferry"){
    put(cream,[0,.5,0],[.62,.48,1.1]);put(green,[0,.77,0],[.76,.08,1.2]);
    for(const x of [-.32,.32])for(const z of [-.34,0,.34])put(glass,[x,.54,z],[.025,.2,.23]);
    put(glass,[0,.55,.565],[.42,.2,.025]);
  }else{
    put(clay,[0,.36,-.28],[.33,.2,.28]);put(sage,[0,.42,.24],[.32,.27,.28]);put(glass,[0,.46,.395],[.25,.12,.025]);
    put(green,[0,.59,.24],[.42,.05,.36]);
  }
  for(const x of [-1,1])put(cream,[x*(kind==="service"?.25:.35),.26,-.62],[.045,.1,.1]);
  return parts;
}
export function createBoatScene(plan:WaterPlan,library:GeometryLibrary,seed:number) {
  const group=new THREE.Group();group.name="Decorative water transport";group.add(createBatch(plan.parts,library,false));
  const moving=new THREE.Group();group.add(moving);
  const byComponent=new Map<number,string[]>();for(const dock of plan.docks){const list=byComponent.get(dock.component)??[];list.push(dock.node);byComponent.set(dock.component,list);}
  const groups=[...byComponent.values()].sort((a,b)=>plan.graph.components[plan.graph.component.get(b[0]!)!]!.length-plan.graph.components[plan.graph.component.get(a[0]!)!]!.length);
  const starts:string[]=[];
  if(groups[0]){starts.push(groups[0][0]!);if(groups[0].length>=4)starts.push(groups[0][1]!);}
  if(groups[1])starts.push(groups[1][0]!);
  else if(groups[0]&&starts.length<3)starts.push(groups[0][2]!);
  const kinds:BoatKind[]=["cargo","ferry","service"];
  const fleet=createJourneyFleet(plan.graph,starts.slice(0,BOATS.count),plan.docks.map(d=>d.node),{seed,minTrip:8,dwellMin:WATER_NAV.dwellMin,dwellVariation:WATER_NAV.dwellVariation,
    acceleration:WATER_NAV.acceleration,separation:2.4,boats:true,turnRate:BOATS.headingRate,speed:i=>WATER_NAV.speed[kinds[i]!]});
  const hull=boatHull(),geometries:{[key:string]:THREE.BufferGeometry}={...library,"boat-hull":hull};
  const entries=fleet.actors.flatMap((_,actor)=>boatParts(kinds[actor]!).map(part=>({actor,part}))),batches=new Map<string,typeof entries>();
  for(const entry of entries){const list=batches.get(entry.part.geometry)??[];list.push(entry);batches.set(entry.part.geometry,list);}
  const color=new THREE.Color();
  const meshes=[...batches].map(([geometry,list])=>{
    const mesh=new THREE.InstancedMesh(geometries[geometry]!,new THREE.MeshLambertMaterial({color:"#ffffff",flatShading:true}),list.length);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);list.forEach((entry,i)=>mesh.setColorAt(i,color.set(entry.part.color)));moving.add(mesh);return{mesh,list};
  });
  const wakes=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({color:"#f5f0d8",transparent:true,opacity:BOATS.wakeOpacity,depthWrite:false,side:THREE.DoubleSide}),Math.max(1,starts.length*2));
  wakes.count=starts.length*2;wakes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);moving.add(wakes);
  const pose=new THREE.Object3D(),local=new THREE.Object3D(),matrix=new THREE.Matrix4();
  let last=-Infinity;
  const update=(time:number,enabled=true)=>{
    moving.visible=enabled&&BOATS.enabled;if(!moving.visible||time-last<1/30)return;last=time;fleet.update(time);
    const poses=fleet.actors.map((actor,i)=>{pose.position.set(actor.position.x,actor.position.y+Math.sin(time*1.2+i)*BOATS.bob,actor.position.z);
      pose.rotation.set(0,actor.heading,Math.sin(time*.8+i)*.012);pose.scale.setScalar(1);pose.updateMatrix();return pose.matrix.clone();});
    for(const{mesh,list}of meshes){list.forEach(({actor,part},i)=>{local.position.set(...part.position);local.rotation.set(...(part.rotation??[0,0,0]));local.scale.set(...part.scale);local.updateMatrix();matrix.multiplyMatrices(poses[actor]!,local.matrix);mesh.setMatrixAt(i,matrix);});mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
    fleet.actors.forEach((actor,i)=>{for(let side=0;side<2;side++){
      const speed=actor.speed/WATER_NAV.speed[kinds[i]!],sign=side?1:-1;
      pose.position.set(actor.position.x-Math.sin(actor.heading)*1.15+Math.cos(actor.heading)*sign*.28,actor.position.y+.025,actor.position.z-Math.cos(actor.heading)*1.15-Math.sin(actor.heading)*sign*.28);
      pose.rotation.set(-Math.PI/2,0,-actor.heading+sign*.18);pose.scale.set(.07*speed,1.1*speed,1);pose.updateMatrix();wakes.setMatrixAt(i*2+side,pose.matrix);
    }});wakes.instanceMatrix.needsUpdate=true;wakes.computeBoundingSphere();
  };
  update(0);return{group,update,setActorsVisible:(visible:boolean)=>{moving.visible=visible;},fleet,
    report:()=>({...fleet.report(),types:kinds.slice(0,fleet.actors.length),docks:plan.docks.map(d=>({id:d.id,node:d.node,x:d.x,z:d.z,component:d.component})),network:plan.report})};
}
