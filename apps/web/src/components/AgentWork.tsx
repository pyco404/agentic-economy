import { useEffect, useMemo, useState } from 'react';
import type { Dashboard } from '../api/adapter';
import type { AgentSummary, Resource, Task } from '../api/shared';
import { displayAgentName } from '../api/agentIdentity';
import { currentAssignment, workDescription } from '../api/agentWork';
const cc = (value:number) => (value/1000).toLocaleString(undefined,{maximumFractionDigits:3});
export function JobFacts({task,data,onViewBuilding,onViewAgent}:{task:Task;data:Dashboard;onViewBuilding?:(id:string)=>void;onViewAgent?:(id:string)=>void}) {
 const workplace=data.worldChunks?.flatMap(c=>c.buildings).find(b=>b.id===task.toBuildingId);
 const agent=data.agents.find(a=>a.id===task.claimedBy);
 const recipe=task.kind==='production_shift'?data.bootstrap.catalog.find(c=>c.kind===workplace?.kind)?.inputs:undefined;
 const receipt=data.receipts?.find(r=>r.id===task.receiptId&&r.taskId===task.id&&r.agentId===task.claimedBy);
 return <span className="work-facts">
  <span>Workplace: {workplace?.name??(import.meta.env.DEV?task.toBuildingId:"Details unavailable")}</span>
  {recipe&&Object.keys(recipe).length>0&&<span>Facility inputs per production cycle: {Object.entries(recipe).map(([resource,quantity])=>`${quantity} ${resource}`).join(', ')}</span>}
  <span>Assigned agent: {agent?displayAgentName(agent):task.claimedBy?'Assigned':'Unassigned'}</span>
  <span>{task.resource?`${task.quantity} ${task.resource}`:'On-site city work'} · {cc(receipt?.creditsPaid??task.rewardCredits)} virtual CC {receipt?'recorded':'task budget'} · {receipt?.pointsAwarded??task.points} points {receipt?'awarded':'before verification adjustments'}</span>
  {receipt&&<span className="positive">{import.meta.env.DEV?`Receipt ${receipt.id} · `:''}{receipt.checks.every(c=>c.passed)?'city work checks passed':'review city work checks'}</span>}
  {task.status==='verified'&&!receipt&&<span>City work completed{task.receiptId?' · receipt outside the latest receipt page':' · no individual agent receipt'}</span>}
  <span className="work-actions">{workplace&&onViewBuilding&&<button type="button" className="text-button" onClick={()=>onViewBuilding(workplace.id)}>View workplace in city</button>}{agent&&onViewAgent&&<button type="button" className="text-button" onClick={()=>onViewAgent(agent.id)}>View agent in city</button>}</span>
 </span>;
}
export function ProductionFacilities({data,onViewBuilding,onHighlight}:{data:Dashboard;onViewBuilding?:(id:string)=>void;onHighlight?:(ids:string[])=>void}) {
 const [stage,setStage]=useState<Resource|'residents'>('wheat');
 const facilities=useMemo(()=>{
  const kinds=new Set(data.bootstrap.catalog.filter(c=>stage==='residents'?c.kind==='market':(c.outputs[stage]??0)>0).map(c=>c.kind));
  return data.worldChunks?.flatMap(c=>c.buildings).filter(b=>kinds.has(b.kind)&&b.status!=='reserved_lot')??[];
 },[stage,data.bootstrap.catalog,data.worldChunks]);
 useEffect(()=>{onHighlight?.(facilities.map(b=>b.id));return()=>onHighlight?.([]);},[facilities,onHighlight]);
 return <section className="surface production-facilities" aria-label="Production chain workplaces">
  <h2>Follow the production chain</h2>
  <div className="work-actions" role="group" aria-label="Production stages">{(['wheat','flour','bread','residents'] as const).map(resource=><button type="button" key={resource} className="secondary capitalize" aria-pressed={stage===resource} onClick={()=>setStage(resource)}>{resource}</button>)}</div>
  <p className="small muted">{facilities.length} registered {stage==='residents'?'demand facilities':'production facilities'} highlighted. Production can also run without an agent shift. Resource deliveries are shown only for assigned delivery tasks.</p>
  <div className="slim-scroll work-facilities" tabIndex={0} role="region" aria-label="Participating workplaces">{facilities.map(b=><div key={b.id} className="task-row"><span><b>{b.name}</b><small>{b.kind} · {data.agents.filter(a=>currentAssignment(a)?.toBuildingId===b.id).length} assigned agents</small></span><button type="button" className="text-button" onClick={()=>onViewBuilding?.(b.id)}>View in city</button></div>)}{!facilities.length&&<p>Registered facilities are unavailable in this data source.</p>}</div>
 </section>;
}
export function WorkingAgents({data,onViewAgent}:{data:Dashboard;onViewAgent?:(id:string)=>void}) {
 const agents=data.agents.filter(a=>currentAssignment(a));
 return <section className="surface" aria-label="Agents at work"><h2>Agents at work</h2><p className="small muted">Virtual City Credits and contribution points · no wallet payments</p><div className="slim-scroll work-facilities" tabIndex={0} role="region" aria-label="Current work assignments">{agents.map(agent=><div className="task-row" key={agent.id}><span><b>{displayAgentName(agent)}</b><small>{workDescription(agent)}</small>{import.meta.env.DEV&&agent.state==='working'&&<small>{agent.work?.remainingWorkTicks} work ticks remaining</small>}</span><button className="text-button" type="button" onClick={()=>onViewAgent?.(agent.id)}>Watch agent</button></div>)}{!agents.length&&<p>No active assignments in the latest authoritative snapshot.</p>}</div></section>;
}
export function CurrentAgentWork({agent,data,onViewBuilding}:{agent:AgentSummary;data:Dashboard;onViewBuilding?:(id:string)=>void}) {
 const task=currentAssignment(agent),receipts=data.receipts?.filter(r=>r.agentId===agent.id)??[];
 return <section aria-label="Agent work evidence"><h3>Current assignment</h3><p data-testid="agent-work-description">{workDescription(agent)}</p>{import.meta.env.DEV&&(agent.work?<p className="small muted">Simulation tick {agent.work.tick}{agent.state==='working'?` · ${agent.work.remainingWorkTicks} work ticks remaining`:''}</p>:<p>Detailed assignments are unavailable.</p>)}{task&&<JobFacts task={task} data={data} onViewBuilding={onViewBuilding}/>}
 <h3>Recent city work receipts</h3>{receipts.slice(0,5).map(r=><p className="small selectable" key={r.id}>{import.meta.env.DEV?`${r.id} · `:''}{r.kind==='production_shift'?'Work shift':r.kind.replaceAll('_',' ')} · {cc(r.creditsPaid)} virtual CC · {r.pointsAwarded} points {import.meta.env.DEV?`· tick ${r.completedTick}`:''}</p>)}{!receipts.length&&<p className="small muted">No receipts for this agent in the latest receipt page.</p>}</section>;
}
