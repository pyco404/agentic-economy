import{expect,it}from'vitest';
import{demoDashboard}from'./adapter';
import{currentAssignment,observableTasks,visibleWork,workDescription,workPose}from'./agentWork';
import{applyServerEvent,mergeDashboard}from'./state';
import type{AgentSummary,Task}from'./shared';
const dashboard=()=>{const d=demoDashboard(),a=d.agents[0]!;const task:Task={id:'tsk_work0001',kind:'production_shift',status:'in_progress',createdTick:1,expiresTick:100,fromBuildingId:null,toBuildingId:'bld_work0001',resource:null,quantity:0,rewardCredits:1000,points:2,claimedBy:a.id,receiptId:null};const agent:AgentSummary={...a,state:'working',work:{tick:50,task,destination:{id:task.toBuildingId,name:'Real farm',kind:'farm',entrance:{x:4,y:6}},target:null,remainingWorkTicks:12,cargo:{}}};return{d,agent,task};};
it('ties travel, visual arrival and work to the same authoritative task, and never infers completion',()=>{
 const {agent}=dashboard();
 expect(visibleWork({...agent,state:'moving'},1,2)).toMatchObject({agentId:agent.id,taskId:'tsk_work0001',workplaceId:'bld_work0001',tick:50,stage:'traveling',pose:null});
 expect(visibleWork(agent,1,2)?.stage).toBe('arriving');
 expect(visibleWork(agent,4.5,6.5)).toMatchObject({stage:'working',pose:'farm'});
 agent.work!.task!.status='verified';expect(visibleWork(agent,4.5,6.5)).toBeNull();
});
it('animates only an owned active shift at the registered entrance, never arbitrary wandering',()=>{
 const{agent}=dashboard();expect(workPose(agent,4.5,6.5)).toBe('farm');expect(workPose(agent,30,6)).toBeNull();expect(workPose({...agent,state:'moving'},4.5,6.5)).toBeNull();expect(workPose({...agent,state:'paused'},4.5,6.5)).toBeNull();expect(workPose({...agent,work:undefined},4.5,6.5)).toBeNull();expect(workDescription({...agent,work:undefined})).toContain('unavailable');expect(workDescription({...agent,state:'moving'})).toBe('Traveling to Real farm');
 const other=structuredClone(agent);other.work!.task!.claimedBy='agt_other001';expect(currentAssignment(other)).toBeNull();expect(workPose(other,4.5,6.5)).toBeNull();
 const misplaced=structuredClone(agent);misplaced.work!.destination!.id='bld_unrelated';expect(workPose(misplaced,4.5,6.5)).toBeNull();
});
it('deduplicates queue entries, preserves actual assignment values, and never reopens completed work',()=>{
 const{agent,task}=dashboard();expect(observableTasks([task],[agent])).toEqual([task]);agent.work!.task!.status='verified';expect(currentAssignment(agent)).toBeNull();expect(workPose(agent,4.5,6.5)).toBeNull();
});
it('replayed moves and delayed HTTP responses cannot overwrite a newer assignment or credit counter',()=>{
 const{d,agent}=dashboard();d.agents=[agent];d.agentTicks={[agent.id]:50};
 const next={...agent,credits:9123,work:{...agent.work!,tick:60,remainingWorkTicks:2}};
 const moved=applyServerEvent(d,{v:1,type:'agent.moved',seq:1,tick:60,ts:new Date().toISOString(),data:{moves:[{id:agent.id,pos:agent.pos,state:'working',target:null,speed:2,agent:next}]}});
 expect(moved.agents[0]?.credits).toBe(9123);
 const replay=applyServerEvent(moved,{v:1,type:'agent.moved',seq:1,tick:51,ts:new Date().toISOString(),data:{moves:[{id:agent.id,pos:agent.pos,state:'moving',target:null,speed:2,agent}]}});
 expect(replay.agents[0]?.work?.remainingWorkTicks).toBe(2);
 const stale=mergeDashboard(replay,{...d,agentTicks:{[agent.id]:50}});expect(stale.agents[0]?.work?.remainingWorkTicks).toBe(2);expect(stale.agents[0]?.credits).toBe(9123);
});
