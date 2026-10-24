import { beforeAll, describe, expect, it } from 'vitest';
import { generateWorld } from '@agentic-economy/world-spec';
import { Agent, SocialMoment } from '@agentic-economy/shared';
import { createInitialState, hashState, SimEngine } from '../src/sim/engine.js';
import { alignmentCommands } from '../src/ops/world-alignment.js';
import { applyDecision, approvedVenues, configureAutonomy, type Decision } from '../src/sim/autonomy.js';
import { AutonomousWorker, MockModelProvider, observe, type ModelProvider } from '../src/services/autonomy.js';
import { toAgent } from '../src/sim/view.js';
import { loadConfig } from '../src/config.js';
import { configureSociety, stepSociety } from '../src/sim/society.js';
import { applyCommonAgents } from '../src/sim/common-agents.js';
import { demoWallet } from '../src/demo-seed.js';
import type { SimCommand } from '../src/sim/types.js';
const ids=Array.from({length:5},(_,i)=>`agt_synthetic${i+1}`);let layout:ReturnType<typeof generateWorld>;
beforeAll(()=>{layout=generateWorld('agentic-economy-genesis');});
function city(local=true){const e=new SimEngine(createInitialState(layout),layout,undefined,local);alignmentCommands().forEach((c,i)=>e.enqueue(c,i));e.enqueue({type:'autonomy.configure',participants:ids},20);e.step();return e;}
function decision(e:SimEngine,agentId:string,proposal:unknown,patch:Partial<Decision>={}):Decision{const p=e.state.autonomy!.profiles[agentId]!;return{agentId,sequence:p.sequence+1,revision:p.revision,observedTick:e.tick,proposal,...patch};}
function apply(e:SimEngine,id:string,proposal:unknown){return applyDecision(e.state,e.nav,decision(e,id,proposal));}
const nearbyVenue=(e:SimEngine)=>approvedVenues(e.state,e.nav,ids[0]!)[0]!;
describe('local autonomous authority',()=>{
 it('requires exactly five existing available residents and leaves permissions/identities unchanged',()=>{
  const e=city(),p=e.state.autonomy!;expect(p.participants).toEqual(ids);expect(e.state.society?.enabled??false).toBe(false);
  for(const id of ids){const a=e.state.agents[id]!;expect(a.identity.kind).toBe('house');expect(a.ownerWallet).toBeNull();expect(a.taskId).toBeNull();}
  expect(e.state.agents.agt_synthetic6).toBeDefined();expect(p.profiles.agt_synthetic6).toBeUndefined();
  const other=city(false);expect(other.state.autonomy).toBeUndefined();expect(()=>configureAutonomy(other.state,ids.slice(1))).toThrow();
 });
 it.each([{kind:'sendTransaction'},{kind:'trade'},{kind:'move',buildingId:'missing'},{kind:'react',reaction:'cheer',speech:'hello',sql:'DROP TABLE agents'},{kind:'react',reaction:'wave',speech:'<script>alert(1)</script>'},{kind:'converse',targetId:'agt_synthetic6',speech:'Hi'}])('rejects untrusted/financial/out-of-cohort proposals %j',proposal=>{
  const e=city(),identity=structuredClone(e.state.agents[ids[0]!]!.identity),ledger=JSON.stringify(e.state.ledger);
  const out=apply(e,ids[0]!,proposal);expect(out[0]?.rejected).toBe(true);expect(e.state.agents[ids[0]!]!.identity).toEqual(identity);expect(JSON.stringify(e.state.ledger)).toBe(ledger);expect(e.state.autonomy!.profiles[ids[0]!]!.current).toBeNull();
 });
 it('rejects stale and future observations; duplicate sequences cause no second event',()=>{
  const e=city();const d=decision(e,ids[0]!,{kind:'react',reaction:'wave',speech:'Hello.'});d.observedTick-=9;
  expect(applyDecision(e.state,e.nav,d)[0]?.rejected).toBe(true);const n=e.state.autonomy!.counter;expect(applyDecision(e.state,e.nav,d)).toEqual([]);expect(e.state.autonomy!.counter).toBe(n);
  expect(applyDecision(e.state,e.nav,decision(e,ids[1]!,{kind:'react',reaction:'wave',speech:'Hello.'},{observedTick:e.tick+1}))[0]?.rejected).toBe(true);
 });
 it('updates relationships only after reciprocal conversation, with bounded confirmed memories',()=>{
  const e=city();apply(e,ids[0]!,{kind:'converse',targetId:ids[1],speech:'How is the garden?'});
  expect(e.state.autonomy!.profiles[ids[0]!]!.relationships).toEqual([]);
  const reply=apply(e,ids[1]!,{kind:'converse',targetId:ids[0],speech:'The flowers are looking lovely.'});expect(reply).toHaveLength(2);
  expect(e.state.autonomy!.profiles[ids[0]!]!.relationships[0]?.encounters).toBe(1);
  for(let i=0;i<30;i++)apply(e,ids[0]!,{kind:'react',reaction:'consider',speech:'A quiet moment.'});
  expect(e.state.autonomy!.profiles[ids[0]!]!.memories).toHaveLength(12);expect(e.state.autonomy!.history.length).toBeLessThanOrEqual(96);
  expect(e.state.autonomy!.history.every(m=>SocialMoment.safeParse(m).success)).toBe(true);
  expect(Agent.safeParse(toAgent(e.state,e.state.agents[ids[0]!]!)).success).toBe(true);
 });
 it('requires the named recipient to accept an arrangement and actual arrival before completion',()=>{
  const e=city(),venue=nearbyVenue(e);const plan=apply(e,ids[0]!,{kind:'arrange',targetId:ids[1],buildingId:venue,purpose:'share garden ideas'})[0]!.moment;
  expect(e.state.autonomy!.invitations[0]?.status).toBe('pending');expect(e.state.autonomy!.profiles[ids[0]!]!.relationships).toEqual([]);
  expect(apply(e,ids[2]!,{kind:'respond',invitationId:plan.id,accept:true})[0]?.rejected).toBe(true);
  apply(e,ids[1]!,{kind:'respond',invitationId:plan.id,accept:true});expect(e.state.autonomy!.invitations[0]?.status).toBe('accepted');
  for(let i=0;i<160&&e.state.autonomy!.invitations[0]!.status==='accepted';i++){
    e.step();const invitation=e.state.autonomy!.invitations[0]!;
    if(invitation.meetingStartedTick!==undefined&&invitation.status==='accepted')expect(e.state.autonomy!.profiles[ids[0]!]!.goal?.status).toBe('active');
  }
  expect(e.state.autonomy!.invitations[0]?.status).toBe('completed');const completed=e.state.autonomy!.history.find(m=>m.causedBy===plan.id&&m.phase==='consequence');expect(completed?.summary).toContain('No payment');
 });
 it('records declines and expiry without inventing completed activities',()=>{
  const e=city(),venue=nearbyVenue(e);apply(e,ids[0]!,{kind:'invite',targetId:ids[1],buildingId:venue,purpose:'meet at the market'});
  const i=e.state.autonomy!.invitations[0]!;apply(e,ids[1]!,{kind:'respond',invitationId:i.id,accept:false});expect(i.status).toBe('declined');expect(e.state.autonomy!.profiles[ids[0]!]!.relationships).toEqual([]);
  apply(e,ids[2]!,{kind:'invite',targetId:ids[3],buildingId:venue,purpose:'talk about music'});for(let n=0;n<165;n++)e.step();
  expect(e.state.autonomy!.invitations[1]?.status).toBe('expired');expect(e.state.autonomy!.history.some(m=>m.summary.includes('completed their shared'))).toBe(false);
 });
 it('replays external decisions and a snapshot restart to identical state without inference',()=>{
  const e=city(),checkpoint=structuredClone(e.state),commands:Array<{tick:number;seq:number;command:SimCommand}>=[];
  for(let n=0;n<40;n++){if(n%8===0){const command:SimCommand={type:'autonomy.decide',...decision(e,ids[n%5]!,{kind:'react',reaction:'wave',speech:'Hello, neighbours.'})};const logged=e.enqueue(command,100+n);commands.push(logged);}e.step();}
  const replay=new SimEngine(checkpoint,layout,undefined,true);
  while(replay.tick<e.tick){for(const c of commands.filter(c=>c.tick===replay.tick))replay.enqueueLogged(c);replay.step();}
  expect(hashState(replay.state)).toBe(hashState(e.state));const restart=new SimEngine(structuredClone(e.state),layout,undefined,true);expect(restart.step()).toEqual(e.step());
 });
 it('connects construction stories to verified maintenance tasks only',()=>{
  const e=city();configureSociety(e.state,true);e.state.tick=5;const b=e.state.buildingOrder[0]!;
  const out=stepSociety(e.state,e.nav,[{type:'task.verified',buildingId:b,agentId:ids[0]!,data:{taskKind:'maintenance'}}]);expect(out.events.some(e=>e.moment.kind==='construction')).toBe(true);
  e.state.tick=10;const wrong=stepSociety(e.state,e.nav,[{type:'task.verified',buildingId:b,agentId:ids[0]!,data:{taskKind:'delivery'}}]);expect(wrong.events.some(e=>e.moment.kind==='construction')).toBe(false);
 });
 it('fails closed outside the isolated configuration',()=>{
  const base={MODE:'demo',HOST:'127.0.0.1',SOLANA_CLUSTER:'localnet',LOCAL_AUTONOMY_ENABLED:'true'};
  expect(loadConfig(base).localAutonomy).toBe(true);
  for(const change of[{MODE:'production'},{HOST:'0.0.0.0'},{SOLANA_CLUSTER:'devnet'},{DATABASE_URL:'postgres:///existing'},{SOCIAL_SIMULATION_ENABLED:'true'},{PUMP_LAUNCH_ENABLED:'true'},{HELIUS_API_KEY:'test-credential'}])expect(()=>loadConfig({...base,...change})).toThrow();
 });
 it('preserves Common Agent reconciliation without adding Common Agents to the AI cohort',()=>{
  const e=city(),profiles=structuredClone(e.state.autonomy);
  const snapshot={mint:demoWallet(80),network:'devnet' as const,slot:1,checkedAt:'2026-10-24T00:00:00.000Z',decimals:6,holders:[{wallet:demoWallet(100),balanceRaw:'1000000'}]};
  applyCommonAgents(e.state,snapshot,e.nav);const common=e.state.agentOrder.map(id=>e.state.agents[id]!).find(a=>a.identity.kind==='aeco_observed')!;
  expect(common.permissions).toEqual([]);expect(e.state.autonomy).toEqual(profiles);applyCommonAgents(e.state,{...snapshot,slot:2,holders:[]},e.nav);expect(common.status).toBe('paused');
  applyCommonAgents(e.state,{...snapshot,slot:3},e.nav);expect(common.status).toBe('active');expect(e.state.autonomy!.profiles[common.id]).toBeUndefined();
 });
 it('keeps tick work bounded for the five-agent cohort',()=>{
  const e=city(),start=performance.now();for(let i=0;i<300;i++)e.step();const ms=performance.now()-start;
  console.log(JSON.stringify({fixture:'autonomy-five-300-ticks',milliseconds:ms,meanTickMs:ms/300}));expect(ms).toBeLessThan(5000);expect(e.state.autonomy!.participants).toHaveLength(5);
 });
});
describe('asynchronous inference boundary',()=>{
 it('does not block ticks, freezes sanitized observations and coalesces in-flight/pending work',async()=>{
  const e=city();let complete!:(value:unknown)=>void;let received:unknown;
  const provider:ModelProvider={name:'mock',infer:async o=>{received=o;return new Promise(resolve=>{complete=resolve;});}};const commands:SimCommand[]=[];
  const worker=new AutonomousWorker(provider,()=>e.state,e.nav,async c=>{commands.push(c);});const job=worker.pulse();expect(worker.pulse()).toBe(job);const tick=e.tick;e.step();expect(e.tick).toBe(tick+1);
  expect(Object.isFrozen(received)).toBe(true);expect(JSON.stringify(received)).not.toMatch(/privateKey|DATABASE_URL|ownerWallet|permissions/);complete({kind:'react',reaction:'wave',speech:'Hello.'});await job;expect(commands).toHaveLength(1);
  for(let i=0;i<4;i++){const p=worker.pulse();complete({kind:'react',reaction:'wave',speech:'Hello.'});await p;}await worker.pulse();expect(commands).toHaveLength(5);await worker.stop();
 });
 it('turns timeouts/provider errors into validated rejection and discards late results after stop',async()=>{
  const e=city(),commands:SimCommand[]=[];const never:ModelProvider={name:'mock',infer:()=>new Promise(()=>{})};
  const worker=new AutonomousWorker(never,()=>e.state,e.nav,async c=>{commands.push(c);},10);await worker.pulse();expect(worker.metrics.timeouts).toBe(1);expect(commands[0]).toMatchObject({type:'autonomy.decide',proposal:null});await worker.stop();
  const stopping=new AutonomousWorker(never,()=>e.state,e.nav,async c=>{commands.push(c);},10);const p=stopping.pulse();await stopping.stop();await p;expect(commands).toHaveLength(1);
 });
 it('rejects a decision that became stale while inference was delayed',async()=>{
  const e=city();let finish!:(value:unknown)=>void;
  const provider:ModelProvider={name:'mock',infer:()=>new Promise(resolve=>{finish=resolve;})};
  const worker=new AutonomousWorker(provider,()=>e.state,e.nav,async c=>{e.enqueue(c,100);});const pending=worker.pulse();
  for(let n=0;n<9;n++)e.step();finish({kind:'react',reaction:'wave',speech:'A delayed greeting.'});await pending;
  const result=e.step();expect(result.actions.some(a=>a.kind==='rejected')).toBe(true);expect(e.state.autonomy!.profiles[ids[0]!]!.current).toBeNull();await worker.stop();
 });
 it('mock provider makes no network requests and only emits structured proposals',async()=>{
  const e=city(),o=observe(e.state,e.nav,ids[0]!)!;const p=await new MockModelProvider(0).infer(o,new AbortController().signal);expect(p).toHaveProperty('kind');
 });
 it('uses confirmed shared memories when choosing a follow-up conversation',async()=>{
  const e=city();apply(e,ids[0]!,{kind:'converse',targetId:ids[1],speech:'How is the garden?'});apply(e,ids[1]!,{kind:'converse',targetId:ids[0],speech:'The flowers are growing.'});
  e.state.autonomy!.profiles[ids[0]!]!.nextDecisionTick=e.tick;
  const proposal=await new MockModelProvider(0).infer(observe(e.state,e.nav,ids[0]!)!,new AbortController().signal);
  expect(proposal).toMatchObject({kind:'converse',targetId:ids[1],speech:expect.stringContaining('remember our last shared city moment')});
 });
 it('converts nonserializable provider output to a safe rejection before persistence',async()=>{
  const e=city(),commands:SimCommand[]=[];const bad:ModelProvider={name:'mock',infer:async()=>({value:1n})};
  const worker=new AutonomousWorker(bad,()=>e.state,e.nav,async c=>{commands.push(c);});await worker.pulse();expect(commands[0]).toMatchObject({proposal:null});expect(()=>JSON.stringify(commands)).not.toThrow();await worker.stop();
 });
});
