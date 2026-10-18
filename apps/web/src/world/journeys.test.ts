import{describe,it,expect}from'vitest';
import{gridGraph}from'./navigation';
import{createJourneyFleet}from'./journeys';
describe('fair departures on a shared waterway',()=>{
 it('lets every waiting vessel depart instead of prioritizing array order indefinitely',()=>{
  const nodes=new Map(Array.from({length:61},(_,x)=>[String(x),{x,y:0,z:0}])),graph=gridGraph('water',nodes);
  const fleet=createJourneyFleet(graph,['0','30','60'],['0','15','30','45','60'],{seed:4,minTrip:8,dwellMin:.5,dwellVariation:.5,acceleration:2,separation:1.2,boats:true,turnRate:3,speed:()=>3});
  for(let t=0;t<480;t+=.1)fleet.update(t);
  expect(fleet.actors.every(a=>a.completed>0)).toBe(true);
  expect(fleet.actors.every(a=>a.traveled>30)).toBe(true);
 });
});
