import {describe,it,expect} from 'vitest';
import {generateWorld} from '@agentic-economy/world-spec';
import {AgentSummary,WorldStats} from '@agentic-economy/shared';
import {alignedState,alignmentCommands,APPROVED_WORLD_SEED,WORLD_ALIGNMENT_PLAN_SHA} from '../src/ops/world-alignment.js';
import {createInitialState,SimEngine,hashState} from '../src/sim/engine.js';
import {toAgentSummary,worldStats} from '../src/sim/view.js';
import {checkLedgerInvariant} from '../src/sim/ledger.js';

describe('approved world alignment without token or treasury records',()=>{
 it('prevents an old worker from recovering a new-seed snapshot with the wrong navigation geometry',()=>{
  const prior=generateWorld('aeco-production-genesis'),next=alignedState(createInitialState(prior),1000,-1);
  expect(()=>new SimEngine(next.state,prior)).toThrow(/seed/);
 });
 it('reuses exactly the approved generator and creates only nine ownerless house agents in three simulation groups',()=>{
  const old=createInitialState(generateWorld('aeco-production-genesis')),before=hashState(old),n=alignedState(old,1000,-1);
  expect(hashState(old)).toBe(before);expect(n.layout).toEqual(generateWorld(APPROVED_WORLD_SEED));expect(n.commands).toHaveLength(12);
  expect(n.state.agentOrder).toHaveLength(9);expect(Object.keys(n.state.communities)).toHaveLength(3);
  expect(new Set(n.state.agentOrder).size).toBe(9);expect(n.state.aecoPopulation).toBeUndefined();
  for(const id of n.state.agentOrder){const a=n.state.agents[id]!;expect(a.ownerWallet).toBeNull();expect(a.identity.kind).toBe('house');AgentSummary.parse(toAgentSummary(n.state,a));}
  const stats=WorldStats.parse(worldStats('production',n.state));expect(stats).toMatchObject({activeAgents:9,communities:0,buildings:404,verifiedTasks:0});
  expect(stats.simulation?.groups).toHaveLength(3);expect(stats.simulation?.groups.every(g=>g.activeAgents===3&&g.headquartersBuildingId)).toBe(true);
  expect(alignmentCommands().some(c=>c.type==='agent.activate'||c.type==='aeco.reconcile')).toBe(false);expect(WORLD_ALIGNMENT_PLAN_SHA).toMatch(/^[a-f0-9]{64}$/);
 });
 it('works, moves and completes genuinely simulated tasks; identities and deterministic continuation survive restart',()=>{
  const n=alignedState(createInitialState(generateWorld('aeco-production-genesis')),1000,-1),engine=new SimEngine(n.state,n.layout);
  const positions=engine.state.agentOrder.map(id=>JSON.stringify(engine.state.agents[id]!.cell));
  for(let i=0;i<500;i++)engine.step();
  expect(engine.state.agentOrder.some((id,i)=>JSON.stringify(engine.state.agents[id]!.cell)!==positions[i])).toBe(true);
  expect(engine.state.stats.verifiedTasks).toBeGreaterThan(0);expect(checkLedgerInvariant(engine.state.ledger)).toBeNull();
  const restored=new SimEngine(JSON.parse(JSON.stringify(engine.state)),n.layout);
  for(let i=0;i<25;i++){engine.step();restored.step();}expect(hashState(restored.state)).toBe(hashState(engine.state));
  expect(restored.state.agentOrder).toEqual(n.state.agentOrder);
 });
 it('refuses an unexpected seed or any existing agent/community/holder state',()=>{
  const old=createInitialState(generateWorld('wrong-seed'));expect(()=>alignedState(old,1000,-1)).toThrow();
  const valid=createInitialState(generateWorld('aeco-production-genesis'));valid.agentOrder=['agt_existing'];expect(()=>alignedState(valid,1000,-1)).toThrow();
 });
});
