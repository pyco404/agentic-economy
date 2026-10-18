import type { ChunkVisual } from './layout';
import { hashSeed } from './layout';
import type { Part } from './geometry';
import { bridgeSurface } from './bridgeSurface';
import { generateTreeParts } from './vegetationGeometry';

export const WATERFRONT_SCENERY={greenhouses:8,forestTrees:120,treeSpacing:2.8} as const;
const cache=new WeakMap<ChunkVisual[],{seed:number;parts:Map<string,Part[]>}>();
/** Agricultural architecture and woodland are scenery, never economic entities.
 * Entire envelopes are checked against the real terrain and parcel catalog. */
export function waterfrontScenery(chunks:ChunkVisual[],seed:number){
  const cached=cache.get(chunks);if(cached?.seed===seed)return cached.parts;
  const result=new Map<string,Part[]>();cache.set(chunks,{seed,parts:result});
  if(!bridgeSurface(chunks).raised)return result;
  const terrain=new Map<string,{code:string;level:number;owner:string}>();
  const buildings=chunks.flatMap(c=>c.buildings);
  for(const c of chunks)for(let z=0;z<32;z++)for(let x=0;x<32;x++)terrain.set(`${c.x*32+x}:${c.z*32+z}`,{code:c.terrain?.[z*32+x]??'g',level:Number(c.elevation?.[z*32+x]??0)*.08,owner:c.id});
  const cell=(x:number,z:number)=>terrain.get(`${Math.floor(x)}:${Math.floor(z)}`);
  const add=(owner:string,parts:Part[])=>{const list=result.get(owner)??[];list.push(...parts);result.set(owner,list);};
  const used:{x:number;z:number;radius:number}[]=[];
  const free=(x:number,z:number,w:number,d:number,code:string)=>{
    for(let px=x-w/2;px<=x+w/2;px+=.5)for(let pz=z-d/2;pz<=z+d/2;pz+=.5)if(cell(px,pz)?.code!==code)return false;
    return !buildings.some(b=>Math.abs(x-b.x)<w/2+b.width/2+1.5&&Math.abs(z-b.z)<d/2+b.depth/2+1.5)&&!used.some(p=>Math.hypot(p.x-x,p.z-z)<p.radius+Math.max(w,d)/2);
  };
  let greenhouses=0,trees=0;
  for(const c of chunks)for(let z=c.z*32+3;z<c.z*32+30;z+=2)for(let x=c.x*32+3;x<c.x*32+30;x+=2){
    const center=cell(x,z)!;
    if(greenhouses<WATERFRONT_SCENERY.greenhouses&&free(x,z,3,5,'f')){
      const p:Part[]=[],box=(color:string,dx:number,y:number,dz:number,w:number,h:number,d:number,geometry='box')=>p.push({geometry,color,position:[x+dx,center.level+y,z+dz],scale:[w,h,d]});
      box('#dedbc5',0,.04,0,3.1,.08,5.1);box('#c4d8ce',0,.55,0,2.8,1.02,4.8);
      box('#bfd3cb',0,1.2,0,2.95,.5,4.95,'roof');
      for(const side of [-1,1]){box('#f0ead6',side*1.43,.57,0,.07,1.1,4.9);for(const dz of [-2.4,-1.2,0,1.2,2.4])box('#e7e6cc',side*1.45,.57,dz,.07,1.1,.075);}
      for(const dz of [-2.4,-1.2,0,1.2,2.4])box('#e8e6d1',0,1.47,dz,2.9,.045,.075);
      box('#6b8f7a',0,.4,2.45,.65,.8,.05);add(c.id,p);used.push({x,z,radius:3.7});greenhouses++;
    } else if(!(x>=50&&(z<28||z>100))&&trees<WATERFRONT_SCENERY.forestTrees&&(x<15||x>115||z<18||z>112)&&hashSeed(seed+700,x,z)%5<3&&free(x,z,2.6,2.6,'g')){
      const species=['evergreen','layered','broadleaf','columnar'] as const;
      add(c.id,generateTreeParts({x,z,elevation:center.level,scale:.95+(hashSeed(seed,x,z)%30)/100,kind:species[hashSeed(seed+1,x,z)%4]!,zone:'natural',placement:'natural'}));
      used.push({x,z,radius:WATERFRONT_SCENERY.treeSpacing/2});trees++;
    }
  }
  return result;
}
