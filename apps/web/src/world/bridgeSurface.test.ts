import {describe,it,expect} from 'vitest';
import {bridgeSurface,WATERFRONT_BRIDGES} from './bridgeSurface';
import type {ChunkVisual} from './layout';
const fixture=()=>{const terrain=Array(1024).fill('g');for(let z=0;z<32;z++)for(let x=10;x<=20;x++)terrain[z*32+x]='w';for(let x=0;x<32;x++)terrain[16*32+x]=x>=10&&x<=20?'b':'r';return {id:'bridge',x:0,z:0,seed:1,terrain:terrain.join(''),elevation:'3'.repeat(1024),buildings:[],trees:[]} as ChunkVisual;};
describe('navigable waterfront bridges',()=>{
 it('uses one continuous deck and gradual road approaches with cabin headroom',()=>{const c=fixture(),p=bridgeSurface([c]);expect(p.raised).toBe(11);expect(p.level(14,16)).toBe(WATERFRONT_BRIDGES.deck);expect(p.level(9,16)).toBeLessThan(p.level(10,16));expect(p.level(8,16)).toBeLessThan(p.level(9,16));expect(p.level(2,16)).toBeCloseTo(.24+(1.55-.24)/9);expect(p.level(14,16)-.2-(-.25)).toBeGreaterThan(1.12);expect(p.navigableUnder(14,16)).toBe(true);expect(p.navigableUnder(14,15)).toBe(false);});
 it('retains the existing short-span legacy bridge geometry',()=>{const c=fixture();c.terrain='g'.repeat(16*32)+'bbbbrrr'+'g'.repeat(1024-16*32-7);const p=bridgeSurface([c]);expect(p.raised).toBe(0);expect(p.level(1,16)).toBe(.24);expect(p.navigableUnder(1,16)).toBe(false);});
});
