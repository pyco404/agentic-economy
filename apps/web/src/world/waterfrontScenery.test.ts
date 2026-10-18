import{describe,it,expect}from'vitest';
import{waterfrontScenery}from'./waterfrontScenery';
import type{ChunkVisual}from'./layout';
const fixture=()=>{const t=Array(1024).fill('g');for(let z=0;z<32;z++)for(let x=20;x<32;x++)t[z*32+x]='w';for(let x=20;x<32;x++)t[16*32+x]='b';for(let z=0;z<14;z++)for(let x=1;x<9;x++)t[z*32+x]='f';return [{id:'test',x:0,z:0,seed:1,terrain:t.join(''),elevation:'3'.repeat(1024),buildings:[],trees:[]}]as ChunkVisual[];};
describe('structured waterfront scenery',()=>{
 it('places procedural greenhouses on complete cultivated envelopes without creating economic records',()=>{const chunks=fixture(),before=structuredClone(chunks),parts=[...waterfrontScenery(chunks,7).values()].flat(),roofs=parts.filter(p=>p.geometry==='roof');expect(roofs.length).toBeGreaterThan(0);for(const roof of roofs){for(let x=roof.position[0]-1.5;x<=roof.position[0]+1.5;x+=.5)for(let z=roof.position[2]-2.5;z<=roof.position[2]+2.5;z+=.5)expect(chunks[0]!.terrain![Math.floor(z)*32+Math.floor(x)]).toBe('f');}expect(chunks).toEqual(before);expect(parts.every(p=>!p.buildingId)).toBe(true);});
 it('retains legacy scenery and respects deterministic seed changes in the cache',()=>{const c=fixture();const first=[...waterfrontScenery(c,7).values()].flat();expect([...waterfrontScenery(c,7).values()].flat()).toEqual(first);const other=[...waterfrontScenery(c,8).values()].flat();expect(other).not.toEqual(first);expect([...waterfrontScenery(c,7).values()].flat()).toEqual(first);c[0]!.terrain='g'.repeat(1024);expect(waterfrontScenery([...c],7).size).toBe(0);});
});
