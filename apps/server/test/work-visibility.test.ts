import { expect,it } from 'vitest';
import { AgentSummary,ServerEvent } from '@agentic-economy/shared';
import { generateWorld } from '@agentic-economy/world-spec';
import { createInitialState,DEFAULT_STRATEGY,hashState,SimEngine } from '../src/sim/engine.js';
import { toAgentSummary } from '../src/sim/view.js';
import { makeEnv } from './helpers.js';
import { seedDemo } from '../src/demo-seed.js';
import { checkLedgerInvariant } from '../src/sim/ledger.js';
import { alignmentCommands } from '../src/ops/world-alignment.js';

it('replays nine existing workers with exclusive shifts, shared deliveries and event-linked completions after restart',()=>{
 const layout=generateWorld('agentic-economy-genesis');
 const engine=new SimEngine(createInitialState(layout),layout);
 alignmentCommands().forEach((command,index)=>engine.enqueue(command,index+1));
 for(let n=0;n<120;n++)engine.step();
 const restarted=new SimEngine(structuredClone(engine.state),layout);
 let completed=0,working=0,shared=0;
 const started=performance.now();
 for(let n=0;n<240;n++){
  const out=engine.step(), replay=restarted.step();
  expect(hashState(restarted.state)).toBe(hashState(engine.state));expect(replay.events).toEqual(out.events);
  const sites=new Map<string,number>();
  for(const a of Object.values(engine.state.agents)){
   if(!a.taskId)continue;
   const task=engine.state.tasks[a.taskId]!;
   expect(task.claimedBy).toBe(a.id);sites.set(task.toBuildingId,(sites.get(task.toBuildingId)??0)+1);
   if(a.activity==='working'){
    working++;expect(a.cell).toEqual(engine.state.buildings[task.toBuildingId]!.entrance);
    if(task.kind==='production_shift')expect(engine.state.buildings[task.toBuildingId]!.workerAgentId).toBe(a.id);
   }
  }
  shared+=Number([...sites.values()].some(count=>count>1));
  for(const receipt of out.receipts){
   completed++;expect(receipt.checks.every(check=>check.passed)).toBe(true);
   expect(out.events.some(e=>e.type==='task.verified'&&e.data.taskId===receipt.taskId&&e.agentId===receipt.agentId)).toBe(true);
  }
 }
 expect(working).toBeGreaterThan(0);expect(completed).toBeGreaterThan(0);expect(shared).toBeGreaterThan(0);
 console.info(JSON.stringify({workRehearsal:{ticks:240,completed,workingSamples:working,sharedSiteTicks:shared,replayPairMs:performance.now()-started}}));
},30000);

it('projects a genuine claim → travel → workplace shift → verified receipt cycle without writing economic state',()=>{
 const layout=generateWorld('work-visibility-test');
 let engine=new SimEngine(createInitialState(layout),layout);
 engine.enqueue({type:'community.register',communityId:'com_work0001',name:'Work test',branding:{primary:'#789684',accent:'#ddd1b6'}},1);
 engine.enqueue({type:'agent.create',agentId:'agt_work0001',ownerWallet:'7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',communityId:'com_work0001',name:'Work test',profession:'farmer',strategy:{...DEFAULT_STRATEGY,risk:'high'}},2);
 const stages=new Set<string>();let targetTask:string|null=null,receiptSeen=false,restarted=false;const visited=new Set<string>();
 for(let n=0;n<800&&!receiptSeen;n++){
  const out=engine.step(),a=engine.state.agents.agt_work0001!;
  const before=hashState(engine.state),summary=AgentSummary.parse(toAgentSummary(engine.state,a));
  expect(hashState(engine.state)).toBe(before);expect(checkLedgerInvariant(engine.state.ledger)).toBeNull();
  const work=summary.work!;
  if(!targetTask&&work.task?.kind==='production_shift'&&summary.state==='moving'){targetTask=work.task.id;stages.add('claimed');}
  if(work.task?.id===targetTask){
   expect(work.task?.claimedBy).toBe(a.id);
   expect(work.destination?.id).toBe(work.task?.toBuildingId);
   expect(engine.nav.isWalkable(work.destination!.entrance)).toBe(true);
   expect(engine.nav.isWalkable(a.cell)).toBe(true);visited.add(`${a.cell.x}:${a.cell.y}`);
   if(summary.state==='moving')stages.add('traveling');
   if(summary.state==='working'){
    stages.add('working');expect(a.cell).toEqual(work.destination!.entrance);expect(work.remainingWorkTicks).toBe(a.busyTicks);
    if(!restarted){engine=new SimEngine(structuredClone(engine.state),layout);restarted=true;}
   }
  }
  for(const r of out.receipts)if(r.taskId===targetTask){
   receiptSeen=true;stages.add('verified');expect(r.checks.every(c=>c.passed)).toBe(true);expect(r.agentId).toBe(a.id);
   expect(summary.work?.task).toBeNull();expect(summary.verifiedTasks).toBeGreaterThan(0);
  }
 }
 expect([...stages]).toEqual(['claimed','traveling','working','verified']);expect(visited.size).toBeGreaterThan(4);expect(restarted).toBe(true);
});
it('accepts historical movement records without assignment metadata',()=>{
 const event={v:1,type:'agent.moved',seq:1,tick:12,ts:new Date().toISOString(),data:{moves:[{id:'agt_legacy001',pos:{x:2.5,y:4.5},state:'moving',target:{x:3,y:4},speed:2}]}};
 const parsed=ServerEvent.parse(event);
 expect(parsed.type).toBe('agent.moved');
 if(parsed.type==='agent.moved'){
  expect(parsed.data.moves[0]?.pos).toEqual({x:2.5,y:4.5});
  expect(parsed.data.moves[0]?.agent).toBeUndefined();
 }
});

it('publishes stationary workplace progress through the existing stream and read APIs',async()=>{
 const env=await makeEnv();
 try{
  await seedDemo(env.ctx);const observed:Array<{id:string;task:string;remaining:number;tick:number}>=[];
  const stop=env.ctx.runtime.hub!.subscribe(event=>{
   if(event.type==='agent.moved')for(const move of event.data.moves){
    const work=move.agent?.work;
    if(move.state==='working'&&work?.task)observed.push({id:move.id,task:work.task.id,remaining:work.remainingWorkTicks,tick:event.tick});
   }
  });
  for(let n=0;n<180;n++)await env.ctx.runtime.tickOnce();
  stop();
  expect(observed.some((a,i)=>observed.slice(i+1).some(b=>a.id===b.id&&a.task===b.task&&a.remaining>b.remaining))).toBe(true);
  const response=await env.app.inject({method:'GET',url:'/api/v1/world/agents'});
  expect(response.statusCode).toBe(200);
  for(const a of response.json().agents)expect(AgentSummary.parse(a).work?.tick).toBe(env.ctx.runtime.tick);
 }finally{await env.close();}
},20000);
