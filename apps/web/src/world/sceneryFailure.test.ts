import{describe,it,expect,vi}from'vitest';
vi.mock('./waterNavigation',()=>({waterNavigation:()=>{throw Error('Optional water navigation failed');}}));
import{prepareScenery,type SceneryMessage}from'./sceneryPlan';
import type{ChunkVisual}from'./layout';
describe('optional transport preparation failure',()=>{
 it('still prepares the complete static world and reports unavailable transport',()=>{
  const chunk:ChunkVisual={id:'0:0',x:0,z:0,seed:1,terrain:'g'.repeat(1024),elevation:'3'.repeat(1024),buildings:[],trees:[]};
  const messages:SceneryMessage[]=[];
  prepareScenery({revision:1,chunks:[chunk],seed:1,style:'frontier',center:{x:16,z:16},known:{}},m=>messages.push(m));
  const scene=messages.find(m=>m.kind==='scenery');expect(scene?.kind).toBe('scenery');if(scene?.kind!=='scenery')throw Error('Missing static world');
  expect(scene.landmass.cells.size).toBeGreaterThan(0);expect(scene.landmass.frontier.positions.length).toBeGreaterThan(0);
  expect(scene.ambient.navigation).toBeUndefined();expect(scene.ambient.navigationError).toContain('Optional water navigation failed');expect(scene.ambient.cars).toEqual([]);
 });
});
