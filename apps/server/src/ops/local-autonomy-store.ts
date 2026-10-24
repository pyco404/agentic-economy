import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Recovery, TickCommit } from '../coord/types.js';
import { MemoryCoordinator } from '../coord/memory.js';
import type { MemoryStore } from '../store/memory.js';
import { hashState } from '../sim/engine.js';
import type { AgentAction } from '@agentic-economy/shared';

/** Local demonstration only. One process, bounded atomic checkpoint, no database or credentials. */
export class LocalAutonomyCoordinator extends MemoryCoordinator {
  private initial:Recovery|null=null;
  private actions:AgentAction[]=[];
  constructor(private localStore:MemoryStore,private file:string){super(localStore);}
  async restore(){
    if(!existsSync(this.file))return;
    const raw=readFileSync(this.file,'utf8');if(raw.length>32_000_000)throw Error('Prototype checkpoint exceeds limit');
    const packet=JSON.parse(raw);if(packet.format!=='aeco-local-autonomy-v1')throw Error('Unrecognized local checkpoint');
    this.initial=packet.recovery;
    this.actions=packet.actions;
    const snapshot=this.initial?.snapshot;if(snapshot&&hashState(JSON.parse(snapshot.state))!==snapshot.hash)throw Error('Prototype checkpoint hash mismatch');
    await this.localStore.appendSimOutputs({events:packet.events,actions:packet.actions,receipts:[],rewards:[]});
  }
  override recovery():Recovery{
    const current=super.recovery();if(!this.initial)return current;
    const snapshot=current.snapshot&&current.snapshot.tick>=(this.initial.snapshot?.tick??0)?current.snapshot:this.initial.snapshot;
    return{snapshot,log:[...this.initial.log,...current.log].filter(c=>c.tick>=(snapshot?.tick??0)),lastTick:Math.max(this.initial.lastTick,current.lastTick),maxSeq:Math.max(this.initial.maxSeq,current.maxSeq)};
  }
  override async commit(epoch:number,c:TickCommit){
    const seq=await super.commit(epoch,c);
    this.actions.push(...c.actions);this.actions=this.actions.slice(-1000);
    const events=await this.localStore.listEvents(null,300);
    const packet={format:'aeco-local-autonomy-v1',recovery:this.recovery(),events:events.items.slice().reverse(),actions:this.actions};
    mkdirSync(dirname(this.file),{recursive:true,mode:0o700});
    const temp=this.file+'.tmp';writeFileSync(temp,JSON.stringify(packet),{mode:0o600});const fd=openSync(temp,'r');try{fsyncSync(fd);}finally{closeSync(fd);}renameSync(temp,this.file);
    const directory=openSync(dirname(this.file),'r');try{fsyncSync(directory);}finally{closeSync(directory);}
    return seq;
  }
}
