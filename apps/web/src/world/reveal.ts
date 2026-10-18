import * as THREE from 'three';

/** Static structure is committed together. Only ambient activation is staggered. */
export const CITY_REVEAL={duration:.45,actorsAt:.18,ambientAt:.45,entranceSeconds:.18,
 frameBudgetMs:6,maxJobsPerFrame:2,slowFrameMs:120}as const;
export type RevealLayer='ground'|'buildings'|'environment';
type Entry={key:string;object:THREE.Object3D;layer:RevealLayer};
export class CityReveal {
 private entries:Entry[]=[];
 private ready=false;
 private committedAt:number|null=null;
 private activated=false;
 private ambient=false;
 private completed=false;
 private fast=false;
 counts={ground:0,buildings:0,environment:0};
 readonly jobs:(()=>void)[]=[];
 constructor(private reduced:boolean){}
 begin(_seconds:number){}
 register(key:string,root:THREE.Object3D,_rank:number,_seconds:number,layer?:RevealLayer){
  root.traverse(object=>{
   if(!(object instanceof THREE.Mesh||object instanceof THREE.LineSegments||object instanceof THREE.Sprite))return;
   const material=(object as THREE.Mesh).material as THREE.Material|undefined;
   const category=layer??(object.userData.buildingIds?.some(Boolean)?'buildings':object.userData.role?.startsWith('tree-')||material?.userData.waterFlow||object.userData.scenicMotion?'environment':'ground');
   object.userData.revealHidden=this.committedAt===null;
   object.visible=this.committedAt!==null;
   this.entries.push({key,object,layer:category});
  });
 }
 forget(root:THREE.Object3D){const disposed=new Set<THREE.Object3D>();root.traverse(o=>disposed.add(o));this.entries=this.entries.filter(e=>!disposed.has(e.object));}
 accelerate(){this.fast=true;}
 setReady(ready:boolean){this.ready=ready;}
 setReduced(reduced:boolean){this.reduced=reduced;}
 work(now:()=>number=()=>performance.now()){
  const started=now();let count=0;
  while(this.jobs.length&&count<CITY_REVEAL.maxJobsPerFrame&&now()-started<CITY_REVEAL.frameBudgetMs){this.jobs.shift()!();count++;}
  return count;
 }
 update(seconds:number,_frameMs:number,detail:boolean){
  if(this.committedAt===null&&this.ready&&!this.jobs.length&&this.entries.length)this.committedAt=seconds;
  if(this.committedAt===null)return;
  for(const entry of this.entries){entry.object.userData.revealHidden=false;entry.object.visible=!entry.object.userData.detail||detail;}
  if(this.entries.length)this.counts=this.entries.reduce((n,e)=>{if(e.object.visible)n[e.layer]++;return n;},{ground:0,buildings:0,environment:0});
  const elapsed=seconds-this.committedAt;
  if(this.reduced||this.fast||elapsed>=CITY_REVEAL.actorsAt)this.activated=true;
  if(this.reduced||this.fast||elapsed>=CITY_REVEAL.ambientAt)this.ambient=true;
  if(this.ambient){this.completed=true;this.entries.length=0;}
 }
 get staticReady(){return this.committedAt!==null;}
 get actorsVisible(){return this.activated;}
 get ambientVisible(){return this.ambient;}
 get complete(){return this.completed;}
 get stage(){return this.complete?'complete':this.actorsVisible?'actors':this.staticReady?'environment':'ground';}
}
