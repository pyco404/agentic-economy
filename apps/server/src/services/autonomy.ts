import type { SocialMoment } from '@agentic-economy/shared';
import { approvedVenues, type CognitiveProfile, type Decision } from '../sim/autonomy.js';
import type { NavGrid } from '../sim/nav.js';
import type { SimCommand, SimState } from '../sim/types.js';

export interface Observation {
  tick: number; agentId: string; sequence: number; revision: number; name: string;
  personality: CognitiveProfile['personality']; preferences: string[]; goal: CognitiveProfile['goal'];
  memories: SocialMoment[]; relationships: CognitiveProfile['relationships'];
  moving: boolean; nearby: Array<{ id: string; name: string; speakingToMe: boolean }>;
  venues: Array<{ id: string; name: string; distance: number }>;
  invitations: Array<{ id: string; from: string; purpose: string }>;
}
/** Data-only inference seam. No app context, tools, secrets, RPC or persistence handles. */
export interface ModelProvider { readonly name: 'mock'; infer(observation: Readonly<Observation>, signal: AbortSignal): Promise<unknown> }
export function observe(s:SimState,nav:NavGrid,id:string):Observation|null{
  const p=s.autonomy?.profiles[id],a=s.agents[id];if(!p||!a||a.status!=='active'||s.tick<p.nextDecisionTick)return null;
  const distance=(b:typeof a)=>Math.abs(b.cell.x-a.cell.x)+Math.abs(b.cell.y-a.cell.y);
  return structuredClone({tick:s.tick,agentId:id,sequence:p.sequence+1,revision:p.revision,name:a.displayName,
    personality:p.personality,preferences:p.preferences,goal:p.goal,memories:p.memories,relationships:p.relationships,moving:!!p.destination||s.autonomy!.invitations.some(i=>i.status==='accepted'&&[i.from,i.to].includes(id)),
    nearby:s.autonomy!.participants.filter(other=>other!==id).map(id=>s.agents[id]!).filter(b=>b.status==='active'&&!b.path.length&&distance(b)<=2).map(b=>({id:b.id,name:b.displayName,speakingToMe:!!s.autonomy!.profiles[b.id]!.current?.partnerIds.includes(id)})),
    venues:approvedVenues(s,nav,id).map(id=>({id,name:s.buildings[id]!.name,distance:nav.distance(a.cell,s.buildings[id]!.entrance)!})).sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)),
    invitations:s.autonomy!.invitations.filter(i=>i.to===id&&i.status==='pending'&&i.untilTick>s.tick).map(i=>({id:i.id,from:i.from,purpose:i.purpose}))});
}
function freeze<T>(value:T):T{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
/** Asynchronous local grammar fixture, not intelligence or a paid model. Output remains untrusted. */
export class MockModelProvider implements ModelProvider {
  readonly name='mock' as const;
  constructor(private latencyMs=30){}
  async infer(o:Readonly<Observation>,signal:AbortSignal):Promise<unknown>{
    await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(Error('Mock inference cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},this.latencyMs);if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});});
    const invitation=o.invitations[0];if(invitation)return{kind:'respond',invitationId:invitation.id,accept:o.sequence%5!==0};
    if(o.moving)return{kind:'react',reaction:'wave',speech:'I’m on my way to meet the neighbours.'};
    const affinity=(id:string)=>o.relationships.find(r=>r.agentId===id)?.affinity??0;
    const peer=o.nearby.find(p=>p.speakingToMe)??[...o.nearby].sort((a,b)=>affinity(b.id)-affinity(a.id)||a.id.localeCompare(b.id))[0];
    const remembered=peer&&o.memories.some(m=>m.phase==='consequence'&&m.kind==='friendship'&&m.participants.includes(peer.id));
    if(peer&&o.sequence%3!==0)return{kind:'converse',targetId:peer.id,speech:remembered?'I remember our last shared city moment. Shall we catch up?':peer.speakingToMe?'That sounds interesting. Tell me more.':`Have you noticed the ${o.preferences[0]} around here?`};
    const venue=o.venues[o.sequence%Math.min(3,o.venues.length)];
    if(peer&&venue&&o.sequence%3===0)return{kind:o.sequence%2?'arrange':'invite',targetId:peer.id,buildingId:venue.id,purpose:'share ideas in the neighbourhood'};
    if(venue)return{kind:'move',buildingId:venue.id};
    return{kind:'react',reaction:'consider',speech:'I’ll pause and enjoy the city.'};
  }
}
export class AutonomousWorker {
  private inFlight:Promise<void>|null=null;private controller:AbortController|null=null;private stopped=false;private cursor=0;
  private pending=new Map<string,number>();
  readonly metrics={requests:0,timeouts:0,errors:0,enqueued:0};
  constructor(private provider:ModelProvider,private read:()=>SimState,private nav:NavGrid,private enqueue:(command:SimCommand,key:string)=>Promise<unknown>,private timeoutMs=1000){if(provider.name!=='mock')throw Error('Milestone 1 allows mock inference only');}
  pulse():Promise<void>{
    if(this.stopped)return Promise.resolve();if(this.inFlight)return this.inFlight;
    this.inFlight=this.run().finally(()=>{this.inFlight=null;});return this.inFlight;
  }
  private async run(){
    const s=this.read(),participants=s.autonomy?.participants??[];let observation:Observation|null=null;
    for(let i=0;i<participants.length;i++){const index=(this.cursor+i)%participants.length,id=participants[index]!;
      if((this.pending.get(id)??0)>(s.autonomy!.profiles[id]?.sequence??0))continue;
      this.pending.delete(id);observation=observe(s,this.nav,id);if(observation){this.cursor=(index+1)%participants.length;break;}}
    if(!observation)return;const o=freeze(observation),controller=this.controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined,proposal:unknown;
    this.metrics.requests++;
    try{proposal=await Promise.race([this.provider.infer(o,controller.signal),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{this.metrics.timeouts++;controller.abort();reject(Error('Inference deadline'));},this.timeoutMs);})]);}
    catch{if(!this.stopped)this.metrics.errors++;proposal=null;}
    finally{if(timer)clearTimeout(timer);this.controller=null;}
    if(this.stopped)return;
    // Only bounded JSON crosses the durable command boundary, even for a broken provider.
    try{const json=JSON.stringify(proposal);proposal=json&&json.length<=2048?JSON.parse(json):null;}catch{proposal=null;}
    const decision:Decision={agentId:o.agentId,sequence:o.sequence,observedTick:o.tick,revision:o.revision,proposal};
    await this.enqueue({type:'autonomy.decide',...decision},`local-autonomy:${o.agentId}:${o.sequence}`);this.pending.set(o.agentId,o.sequence);this.metrics.enqueued++;
  }
  async stop(){this.stopped=true;this.controller?.abort();await this.inFlight;}
}
