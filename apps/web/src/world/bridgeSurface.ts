import type { ChunkVisual } from './layout';

export const WATERFRONT_BRIDGES = { minimumSpan: 7, deck: 1.55, approach: 8 } as const;
const cache = new WeakMap<ChunkVisual[], ReturnType<typeof build>>();
const key=(x:number,z:number)=>`${Math.floor(x)}:${Math.floor(z)}`;
function build(chunks:ChunkVisual[]){
  const cells=new Map<string,{code:string;level:number}>(), levels=new Map<string,number>(), water=new Set<string>();
  for(const c of chunks){const size=c.size??32;for(let z=0;z<size;z++)for(let x=0;x<size;x++)cells.set(key(c.x*size+x,c.z*size+z),{code:c.terrain?.[z*size+x]??'g',level:Number(c.elevation?.[z*size+x]??0)*.08});}
  const broadWater=[...cells.values()].filter(c=>c.code==='w').length/cells.size>=.15;
  for(const [id,cell] of cells){
    if(!broadWater)break;
    if(cell.code!=='b')continue;
    const [x,z]=id.split(':').map(Number) as [number,number];
    for(const [dx,dz] of [[1,0],[0,1]] as const){
      if(cells.get(key(x-dx,z-dz))?.code==='b')continue;
      const span:string[]=[];let length=0;
      while(cells.get(key(x+dx*length,z+dz*length))?.code==='b'){span.push(key(x+dx*length,z+dz*length));length++;}
      if(length<WATERFRONT_BRIDGES.minimumSpan)continue;
      for(const k of span){levels.set(k,WATERFRONT_BRIDGES.deck);water.add(k);}
      for(const side of [-1,1])for(let d=1;d<=WATERFRONT_BRIDGES.approach;d++){
        const k=key(x+dx*(side<0?-d:length-1+d),z+dz*(side<0?-d:length-1+d));
        const c=cells.get(k);if(!c||!['r','p'].includes(c.code))break;
        levels.set(k,Math.max(levels.get(k)??c.level,c.level+(WATERFRONT_BRIDGES.deck-c.level)*(1-d/(WATERFRONT_BRIDGES.approach+1))));
      }
    }
  }
  return { level:(x:number,z:number)=>levels.get(key(x,z))??cells.get(key(x,z))?.level??0,
    navigableUnder:(x:number,z:number)=>water.has(key(x,z)), raised:water.size };
}
/** Long waterfront bridges share one deck/ramp profile across terrain, paving,
 * vehicles and citizens. Legacy short spans keep their original geometry. */
export function bridgeSurface(chunks:ChunkVisual[]){let p=cache.get(chunks);if(!p){p=build(chunks);cache.set(chunks,p);}return p;}
