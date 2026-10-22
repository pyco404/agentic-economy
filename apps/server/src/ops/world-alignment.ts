import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import type pg from 'pg';
import { generateWorld } from '@agentic-economy/world-spec';
import { createInitialState, DEFAULT_STRATEGY, hashState, SimEngine } from '../sim/engine.js';
import type { SimCommand, SimState } from '../sim/types.js';
import { LOCK_KEYS } from '../store/postgres.js';

export const APPROVED_WORLD_SEED='agentic-economy-genesis';
export const WORLD_ALIGNMENT_PROFILE='approved-genesis-synthetic-v1';
const previousSeed='aeco-production-genesis';
const groups=[
  {id:'com_syntheticHearth',name:'Hearth Bakers',description:'Synthetic bakers and couriers keeping the city fed.',branding:{primary:'#b58db6',accent:'#6b8fc9'},professions:['logistics_operator','merchant','manufacturer']},
  {id:'com_syntheticRiver',name:'Riverside Guild',description:'Synthetic farmers and haulers along the connected waterways.',branding:{primary:'#5fa8a0',accent:'#6b8fc9'},professions:['logistics_operator','farmer','merchant']},
  {id:'com_syntheticStone',name:'Stonewright Co',description:'Synthetic builders and property managers maintaining the city.',branding:{primary:'#c98b6b',accent:'#5fa8a0'},professions:['builder','property_manager','logistics_operator']},
] as const;
const names=['Juniper_101','Rye_102','Ember_103','Reed_104','Clover_105','Quay_106','Slate_107','Lintel_108','Cedar_109'];
export function alignmentCommands():SimCommand[]{
  let n=0;return groups.flatMap(g=>[
    {type:'community.register',communityId:g.id,name:`${g.name} · simulation`,branding:{...g.branding}} as SimCommand,
    ...g.professions.map(profession=>({type:'agent.create_house',agentId:`agt_synthetic${++n}`,communityId:g.id,
      syntheticName:names[n-1]!,profession,strategy:{...DEFAULT_STRATEGY}} as SimCommand)),
  ]);
}
export const WORLD_ALIGNMENT_PLAN={profile:WORLD_ALIGNMENT_PROFILE,fromSeed:previousSeed,toSeed:APPROVED_WORLD_SEED,
  writes:{world_meta:'update id=1 seed/world_id only',sim_snapshots:'append one transition checkpoint',
    sim_leader:'update id=1 tick/epoch and clear inactive holder',sim_view:'replace id=1 derived cache',
    sim_command_inbox:'append 12 already-applied synthetic commands',sim_commands:'append those same 12 commands',agent_names:'reserve 9 ownerless house-agent names'},
  commands:alignmentCommands(),protectedTables:['launches','communities','treasury_entries','agent_activations','launchpad_drafts','launchpad_operations','auth_challenges','sessions','idempotency_keys','task_receipts','reward_records']};
export const WORLD_ALIGNMENT_PLAN_SHA=createHash('sha256').update(JSON.stringify(WORLD_ALIGNMENT_PLAN)).digest('hex');

/** Pure generation with the existing staging generator/engine. No chain, launch or treasury dependencies. */
export function alignedState(previous:SimState,lastTick:number,maxSeq:number){
  if(previous.worldSeed!==previousSeed||previous.agentOrder.length||Object.keys(previous.communities).length||previous.aecoPopulation)
    throw new Error('Only the empty original production simulation is eligible');
  const layout=generateWorld(APPROVED_WORLD_SEED),state=createInitialState(layout);
  state.tick=lastTick+1;state.epoch=previous.epoch;
  for(const k of Object.keys(state.counters)as Array<keyof SimState['counters']>)state.counters[k]=Math.max(state.counters[k],previous.counters[k]);
  state.syntheticCity={profile:WORLD_ALIGNMENT_PROFILE,startedTick:state.tick,groups:groups.map(({id,name,description})=>({id,name,description}))};
  const commands=alignmentCommands().map((command,i)=>({tick:state.tick,seq:maxSeq+1+i,command}));
  const engine=new SimEngine(state,layout);commands.forEach(c=>engine.enqueueLogged(c));engine.step();
  if(state.agentOrder.length!==9||state.agentOrder.some(id=>state.agents[id]!.identity.kind!=='house'||state.agents[id]!.ownerWallet!==null))
    throw new Error('Synthetic identity invariant failed');
  return{layout,state,commands};
}

export type AlignmentOptions={database:'aeco_production'|'aeco_world_alignment_20261022_test';apply?:boolean;approvedPlanSha?:string;
  checkpoint?:(data:{meta:unknown;state:SimState;hash:string;lastTick:number;planSha:string})=>Promise<void>};

/** Explicit offline operator operation, never called by application startup or any HTTP endpoint.
 * The live writer must first stop. Every change commits atomically; no trigger is disabled or history deleted. */
export async function alignWorld(pool:pg.Pool,options:AlignmentOptions){
  const c=await pool.connect();try{
    await c.query(options.apply?'BEGIN ISOLATION LEVEL SERIALIZABLE':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const database=(await c.query('SELECT current_database() AS name')).rows[0].name;
    if(database!==options.database||!['aeco_production','aeco_world_alignment_20261022_test'].includes(database))throw new Error('Wrong database target');
    if(options.apply){
      if(options.approvedPlanSha!==WORLD_ALIGNMENT_PLAN_SHA||!options.checkpoint)throw new Error('Explicit plan approval and private checkpoint are required');
      if(!(await c.query('SELECT pg_try_advisory_xact_lock($1) AS ok',[LOCK_KEYS.sim])).rows[0].ok)throw new Error('Simulation writer is active; nothing changed');
      await c.query("SELECT pg_advisory_xact_lock(hashtext('agent-identity'))");
    }
    const meta=(await c.query('SELECT * FROM world_meta WHERE id=1')).rows[0];
    const snap=(await c.query('SELECT tick,state,state_hash FROM sim_snapshots ORDER BY tick DESC LIMIT 1')).rows[0];
    if(!snap)throw new Error('A verified existing snapshot is required');
    const original=JSON.parse(snap.state)as SimState;if(hashState(original)!==snap.state_hash)throw new Error('Snapshot integrity failed');
    if(meta.seed===APPROVED_WORLD_SEED&&original.syntheticCity?.profile===WORLD_ALIGNMENT_PROFILE){await c.query('COMMIT');return{alreadyApplied:true,database,planSha:WORLD_ALIGNMENT_PLAN_SHA};}
    if(meta.seed!==previousSeed||meta.generator_version!==1||original.worldSeed!==previousSeed)throw new Error('Unexpected persisted world');
    const counts=(await c.query(`SELECT (SELECT count(*) FROM launches)::int AS launches,(SELECT count(*) FROM communities)::int AS communities,
      (SELECT count(*) FROM agent_activations)::int AS activations,(SELECT count(*) FROM agent_names)::int AS names,
      (SELECT count(*) FROM sim_commands)::int AS commands,(SELECT count(*) FROM sim_command_inbox)::int AS inbox,
      (SELECT count(*) FROM task_receipts)::int AS receipts,(SELECT count(*) FROM treasury_entries)::int AS treasury,
      (SELECT count(*) FROM agent_actions)::int AS actions,(SELECT count(*) FROM reward_records)::int AS rewards`)).rows[0];
    if(Object.values(counts).some(n=>n!==0))throw new Error('Production acquired protected launch/identity/work state; stop for a new review');
    const leader=(await c.query('SELECT * FROM sim_leader WHERE id=1'+(options.apply?' FOR UPDATE':''))).rows[0];
    const lastTick=Number(leader.last_tick);if(lastTick<original.tick||lastTick-original.tick>200)throw new Error('Recovery gap is unsupported');
    const prior=new SimEngine(original,generateWorld(previousSeed));while(prior.tick<lastTick)prior.step();
    const next=alignedState(original,lastTick,-1);
    const report={alreadyApplied:false,database,planSha:WORLD_ALIGNMENT_PLAN_SHA,fromSeed:meta.seed,toSeed:next.layout.seed,
      fromWorldId:meta.world_id,toWorldId:next.layout.worldId,fromTick:lastTick,toTick:next.state.tick,
      syntheticAgents:9,syntheticGroups:3,commands:12,financialRowsCreated:0,protectedCounts:counts,applied:!!options.apply};
    if(options.apply){
      await options.checkpoint!({meta,state:original,hash:hashState(original),lastTick,planSha:WORLD_ALIGNMENT_PLAN_SHA});
      for(const logged of next.commands){
        const cmd=logged.command,id=(await c.query('INSERT INTO sim_command_inbox(dedupe_key,command,wallet,community_id,kind,applied_seq,applied_tick) VALUES($1,$2,NULL,$3,$4,$5,$6) RETURNING id',
          [`${WORLD_ALIGNMENT_PROFILE}:${logged.seq}`,JSON.stringify(cmd),'communityId'in cmd?cmd.communityId:null,cmd.type,logged.seq,logged.tick])).rows[0].id;
        await c.query('INSERT INTO sim_commands(seq,tick,command) VALUES($1,$2,$3)',[logged.seq,logged.tick,JSON.stringify(cmd)]);
        if(cmd.type==='agent.create_house')await c.query("INSERT INTO agent_names(name,agent_id,kind,requested_by,inbox_id) VALUES($1,$2,'house','system:synthetic-city',$3)",[cmd.syntheticName,cmd.agentId,id]);
      }
      const json=JSON.stringify(next.state);
      await c.query('INSERT INTO sim_snapshots(tick,state,state_hash) VALUES($1,$2,$3)',[next.state.tick,json,hashState(next.state)]);
      await c.query('UPDATE world_meta SET world_id=$1,seed=$2 WHERE id=1',[next.layout.worldId,next.layout.seed]);
      const epoch=Number(leader.epoch)+1;
      await c.query('UPDATE sim_leader SET epoch=$1,last_tick=$2,holder=NULL,acquired_at=NULL,heartbeat_at=NULL WHERE id=1',[epoch,next.state.tick]);
      await c.query('INSERT INTO sim_view(id,tick,epoch,state_gz) VALUES(1,$1,$2,$3) ON CONFLICT(id) DO UPDATE SET tick=excluded.tick,epoch=excluded.epoch,state_gz=excluded.state_gz,updated_at=now()',[next.state.tick,epoch,gzipSync(json)]);
    }
    await c.query('COMMIT');return report;
  }catch(e){await c.query('ROLLBACK').catch(()=>undefined);throw e;}finally{c.release();}
}
