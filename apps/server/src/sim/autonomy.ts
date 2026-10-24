import { z } from 'zod';
import type { AgentSocial, SocialMoment, SocialPersonality, SocialPresence, SocialRelationship } from '@agentic-economy/shared';
import type { SimState } from './types.js';
import type { NavGrid } from './nav.js';

const text = (max: number) => z.string().trim().min(1).max(max).refine(s => !/[<>]|https?:\/\//i.test(s) && ![...s].some(c => c.charCodeAt(0)<32));
const id = z.string().min(1).max(100);
const destination = z.object({ kind: z.literal('move'), buildingId: id }).strict();
export const AutonomousAction = z.discriminatedUnion('kind', [destination,
  z.object({ kind: z.literal('converse'), targetId: id, speech: text(100) }).strict(),
  z.object({ kind: z.enum(['invite', 'arrange']), targetId: id, buildingId: id, purpose: text(80) }).strict(),
  z.object({ kind: z.literal('respond'), invitationId: id, accept: z.boolean() }).strict(),
  z.object({ kind: z.literal('react'), reaction: z.enum(['wave', 'cheer', 'consider']), speech: text(100) }).strict(),
]);
export type AutonomousAction = z.infer<typeof AutonomousAction>;
export interface Decision { agentId: string; sequence: number; observedTick: number; revision: number; proposal: unknown }
export interface CognitiveProfile {
  revision: number; sequence: number; nextDecisionTick: number; personality: SocialPersonality; preferences: string[];
  goal: { description: string; buildingId: string | null; status: 'active' | 'completed' | 'declined' } | null;
  memories: SocialMoment[]; relationships: SocialRelationship[]; current: SocialPresence | null;
  destination: { buildingId: string; purpose: string } | null;
}
interface Invitation { id: string; from: string; to: string; buildingId: string; purpose: string; kind: 'invite' | 'arrange'; status: 'pending' | 'accepted' | 'declined' | 'completed' | 'expired'; untilTick: number; meetingStartedTick?: number }
export interface AutonomousState { version: 1; participants: string[]; profiles: Record<string, CognitiveProfile>; invitations: Invitation[]; history: SocialMoment[]; counter: number }
export interface AutonomousEvent { moment: SocialMoment; rejected?: boolean }
export const AUTONOMY_LIMITS = { participants: 5, memories: 12, relationships: 12, history: 96, invitations: 24, observationTicks: 8, cooldown: 8 } as const;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const names = (s: SimState, ids: string[]) => ids.map(id => s.agents[id]!.displayName).join(' and ');
const venueKinds = new Set(['market', 'town_hall', 'bakery', 'warehouse']);
export function approvedVenues(s: SimState, nav: NavGrid, agentId: string) {
  const a=s.agents[agentId]; if(!a)return [];
  return s.buildingOrder.filter(id => { const b=s.buildings[id]!; return venueKinds.has(b.kind) && b.status!=='reserved_lot' && nav.distance(a.cell,b.entrance)!==null; }).slice(0,16);
}
export function configureAutonomy(s: SimState, participants: string[]) {
  if(s.autonomy) return; // Cohort is immutable for this local rehearsal.
  if(participants.length!==5 || new Set(participants).size!==5 || participants.some(id=>{const a=s.agents[id];return !a || a.identity.kind!=='house' || a.ownerWallet!==null || a.status!=='active' || a.taskId || a.cargo || a.busyTicks;}))throw Error('Local autonomy requires five existing, available ownerless city residents');
  s.autonomy={version:1,participants:[...participants],profiles:Object.fromEntries(participants.map((id,i)=>[id,{revision:0,sequence:0,nextDecisionTick:s.tick,
    personality:{temperament:(['sociable','reflective','spirited','practical','sociable']as const)[i]!,interest:(['music','gardening','craft','food','stories']as const)[i]!,routine:'afternoon stroll'},
    preferences:[(['music','gardening','craft','food','stories']as const)[i]!],goal:null,memories:[],relationships:[],current:null,destination:null}])),invitations:[],history:[],counter:0};
  for(const id of participants){s.agents[id]!.path=[];s.agents[id]!.target=null;}
}
function emit(s: SimState, kind: SocialMoment['kind'], phase: SocialMoment['phase'], participants: string[], summary: string, buildingId: string|null=null, causedBy: string|null=null): AutonomousEvent {
  const state=s.autonomy!, location=buildingId?s.buildings[buildingId]!.entrance:s.agents[participants[0]!]!.cell;
  const moment:SocialMoment={id:`auto_${s.tick}_${++state.counter}`,tick:s.tick,kind,phase,participants:[...participants],summary:summary.slice(0,320),buildingId,location:{...location},causedBy,simulated:true};
  state.history.unshift(moment);state.history.length=Math.min(state.history.length,96);
  for(const id of participants){const p=state.profiles[id];if(p){p.memories.unshift(structuredClone(moment));p.memories.length=Math.min(p.memories.length,12);}}
  return {moment};
}
function relate(s:SimState,a:string,b:string){
  for(const [id,other]of[[a,b],[b,a]]){const p=s.autonomy!.profiles[id!]!;let r=p.relationships.find(r=>r.agentId===other);
    if(!r){r={agentId:other!,affinity:0,encounters:0,lastTick:s.tick};p.relationships.push(r);if(p.relationships.length>12)p.relationships.shift();}
    r.affinity=Math.min(100,r.affinity+3);r.encounters++;r.lastTick=s.tick;
  }
}
function presence(s:SimState,id:string,event:AutonomousEvent,speech:string,reaction:SocialPresence['reaction']){
  s.autonomy!.profiles[id]!.current={eventId:event.moment.id,kind:event.moment.kind,description:event.moment.summary.slice(0,160),speech,reaction,
    partnerIds:event.moment.participants.filter(other=>other!==id),untilTick:s.tick+14,location:{...event.moment.location}};
}
function walk(s:SimState,nav:NavGrid,id:string,buildingId:string,purpose:string){const a=s.agents[id]!,p=s.autonomy!.profiles[id]!;
  a.path=nav.path(a.cell,s.buildings[buildingId]!.entrance)!;a.target={...s.buildings[buildingId]!.entrance};a.activity='moving';p.destination={buildingId,purpose};p.goal={description:purpose,buildingId,status:'active'};
}
/** Model output is untrusted. Only the local fenced engine invokes this reducer. */
export function applyDecision(s:SimState,nav:NavGrid,d:Decision):AutonomousEvent[]{
  const p=s.autonomy?.profiles[d.agentId],a=s.agents[d.agentId];if(!p||!a)return [];
  if(!Number.isSafeInteger(d.sequence)||d.sequence<=p.sequence)return [];
  const stale=d.sequence!==p.sequence+1 || d.revision!==p.revision || !Number.isSafeInteger(d.observedTick) || d.observedTick>s.tick || s.tick-d.observedTick>8;
  // Consume a sequence even on rejection; a retry cannot turn a rejected decision into an action.
  p.sequence=d.sequence;p.revision++;p.nextDecisionTick=s.tick+8;
  const reject=()=>[{...emit(s,'conversation','consequence',[a.id],`${a.displayName}'s proposed action was declined by the city rules.`),rejected:true}];
  if(stale || a.status!=='active'||a.taskId||a.cargo||a.busyTicks)return reject();
  let size=0;try{size=JSON.stringify(d.proposal)?.length??0;}catch{return reject();}if(size>2048)return reject();
  const parsed=AutonomousAction.safeParse(d.proposal);if(!parsed.success)return reject();const action=parsed.data;
  const available=(id:string)=>{const v=s.agents[id];return !!s.autonomy!.profiles[id]&&v?.status==='active'&&!v.taskId&&!v.cargo&&!v.busyTicks;};
  if('targetId'in action && (action.targetId===a.id||!available(action.targetId)))return reject();
  if('buildingId'in action && !approvedVenues(s,nav,a.id).includes(action.buildingId))return reject();
  if(action.kind==='move'){
    walk(s,nav,a.id,action.buildingId,'Visit the neighbourhood');return [emit(s,'conversation','invitation',[a.id],`${a.displayName} sets out for ${s.buildings[action.buildingId]!.name}.`,action.buildingId)];
  }
  if(action.kind==='converse'){
    const b=s.agents[action.targetId]!;if(distance(a.cell,b.cell)>2 || a.path.length || b.path.length)return reject();
    const reciprocal=s.autonomy!.profiles[b.id]!.current;
    const e=emit(s,'conversation','encounter',[a.id,b.id],`${a.displayName} says: “${action.speech}”`);presence(s,a.id,e,action.speech,'talk');
    if(reciprocal?.partnerIds.includes(a.id)&&reciprocal.untilTick>s.tick){relate(s,a.id,b.id);return[e,emit(s,'friendship','consequence',[a.id,b.id],`${names(s,[a.id,b.id])} exchanged replies and became better acquainted.`,null,reciprocal.eventId)];}return[e];
  }
  if(action.kind==='invite'||action.kind==='arrange'){
    if(!approvedVenues(s,nav,action.targetId).includes(action.buildingId) || s.autonomy!.invitations.some(i=>i.from===a.id&&i.to===action.targetId&&['pending','accepted'].includes(i.status)))return reject();
    if(s.autonomy!.invitations.length>=24){const index=s.autonomy!.invitations.findIndex(i=>!['pending','accepted'].includes(i.status));if(index<0)return reject();s.autonomy!.invitations.splice(index,1);}
    const e=emit(s,action.kind==='arrange'?'negotiation':'festival','invitation',[a.id,action.targetId],`${a.displayName} invites ${names(s,[action.targetId])} to ${action.purpose}.`,action.buildingId);
    s.autonomy!.invitations.push({id:e.moment.id,from:a.id,to:action.targetId,buildingId:action.buildingId,purpose:action.purpose,kind:action.kind,status:'pending',untilTick:s.tick+160});presence(s,a.id,e,'Would you like to join me?','wave');return[e];
  }
  if(action.kind==='respond'){
    const i=s.autonomy!.invitations.find(i=>i.id===action.invitationId);if(!i||i.to!==a.id||i.status!=='pending'||s.tick>=i.untilTick||!available(i.from))return reject();
    if(action.accept&&[i.from,i.to].some(id=>!approvedVenues(s,nav,id).includes(i.buildingId)))return reject();
    i.status=action.accept?'accepted':'declined';
    const e=emit(s,'negotiation','encounter',[i.from,i.to],`${a.displayName} ${action.accept?'accepts':'declines'} the invitation.`,i.buildingId,i.id);presence(s,a.id,e,action.accept?'Yes, let’s meet there.':'Another time, perhaps.','wave');
    if(action.accept){for(const id of[i.from,i.to]){walk(s,nav,id,i.buildingId,i.purpose);s.autonomy!.profiles[id]!.revision++;}}return[e];
  }
  if(action.kind==='react'){const e=emit(s,'celebration','encounter',[a.id],`${a.displayName} reacts: “${action.speech}”`);presence(s,a.id,e,action.speech,action.reaction);return[e];}
  return reject();
}
export function stepAutonomy(s:SimState):AutonomousEvent[]{
  if(!s.autonomy)return [];const out:AutonomousEvent[]=[];
  for(const id of s.autonomy.participants){const a=s.agents[id]!,p=s.autonomy.profiles[id]!;
    if(p.current&&p.current.untilTick<=s.tick)p.current=null;
    if(a.status!=='active')continue;
    if(p.destination){for(let i=0;i<2&&a.path.length;i++)a.cell=a.path.shift()!;a.activity=a.path.length?'moving':'resting';
      if(!a.path.length&&distance(a.cell,s.buildings[p.destination.buildingId]!.entrance)===0){const b=p.destination.buildingId;p.destination=null;a.target=null;
        if(!s.autonomy.invitations.some(i=>i.status==='accepted'&&[i.from,i.to].includes(id)&&i.buildingId===b))p.goal!.status='completed';
        p.revision++;out.push(emit(s,'conversation','consequence',[id],`${a.displayName} arrived at ${s.buildings[b]!.name}.`,b));}}
    else a.activity='resting';
  }
  for(const i of s.autonomy.invitations){if(!['pending','accepted'].includes(i.status))continue;
    if(s.tick>=i.untilTick||[i.from,i.to].some(id=>s.agents[id]?.status!=='active')){i.status='expired';for(const id of[i.from,i.to]){const goal=s.autonomy.profiles[id]!.goal;if(goal?.description===i.purpose&&goal.status==='active')goal.status='declined';}out.push(emit(s,'negotiation','consequence',[i.from,i.to],'The social plan expired without a completed gathering.',i.buildingId,i.id));continue;}
    if(i.status==='accepted'&&[i.from,i.to].every(id=>distance(s.agents[id]!.cell,s.buildings[i.buildingId]!.entrance)===0)){
      if(i.meetingStartedTick===undefined){i.meetingStartedTick=s.tick;const e=emit(s,'conversation','encounter',[i.from,i.to],`${names(s,[i.from,i.to])} arrived and began their planned conversation.`,i.buildingId,i.id);for(const id of[i.from,i.to])presence(s,id,e,'Let’s share our ideas.','talk');out.push(e);}
      else if(s.tick-i.meetingStartedTick>=8){i.status='completed';relate(s,i.from,i.to);const e=emit(s,'friendship','consequence',[i.from,i.to],`${names(s,[i.from,i.to])} met and completed their shared city activity. No payment was involved.`,i.buildingId,i.id);for(const id of[i.from,i.to]){const p=s.autonomy.profiles[id]!;if(p.goal?.description===i.purpose)p.goal.status='completed';presence(s,id,e,'It was good to spend time together.','cheer');}out.push(e);}
    }else delete i.meetingStartedTick;
  }return out;
}
export function autonomySummary(s:SimState,id:string):AgentSocial|undefined{const p=s.autonomy?.profiles[id];if(!p)return;
 return {tick:s.tick,personality:p.personality,mood:'curious',socialNeed:50,current:s.agents[id]?.status==='active'?p.current:null,destination:p.destination?{...p.destination,name:s.buildings[p.destination.buildingId]!.name,location:s.buildings[p.destination.buildingId]!.entrance}:null};
}
