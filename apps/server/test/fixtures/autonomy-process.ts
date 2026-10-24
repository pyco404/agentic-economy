import { join } from 'node:path';
import { loadConfig } from '../../src/config.js';
import { createContext } from '../../src/context.js';
import { MemoryStore } from '../../src/store/memory.js';
import { LocalAutonomyCoordinator } from '../../src/ops/local-autonomy-store.js';
import { alignmentCommands } from '../../src/ops/world-alignment.js';
import { AutonomousWorker, MockModelProvider } from '../../src/services/autonomy.js';
import { hashState } from '../../src/sim/engine.js';
const [dir,mode]=process.argv.slice(2);if(!dir?.startsWith('/tmp/'))throw Error('Disposable local fixture required');
const config=loadConfig({MODE:'demo',HOST:'127.0.0.1',SOLANA_CLUSTER:'localnet',LOCAL_AUTONOMY_ENABLED:'true',SIM_AUTOSTART:'false',LOG_LEVEL:'silent'});
const store=new MemoryStore(),coord=new LocalAutonomyCoordinator(store,join(dir,'checkpoint.json'));await coord.restore();const ctx=await createContext(config,{store,coord});
if(mode==='create'){
 for(const [index,command]of alignmentCommands().entries())await coord.enqueueCommand(command,`seed:${index}`);
 await coord.enqueueCommand({type:'autonomy.configure',participants:Array.from({length:5},(_,i)=>`agt_synthetic${i+1}`)},'cohort');await ctx.runtime.tickOnce();
 const worker=new AutonomousWorker(new MockModelProvider(0),()=>ctx.runtime.state,ctx.runtime.sim!.engine!.nav,(c,k)=>coord.enqueueCommand(c,k));
 for(let i=0;i<60;i++){await worker.pulse();await ctx.runtime.tickOnce();}await worker.stop();
}
const state=ctx.runtime.state,events=await store.listEvents(null,300),out={hash:hashState(state),tick:state.tick,participants:state.autonomy?.participants,memories:Object.values(state.autonomy?.profiles??{}).reduce((n,p)=>n+p.memories.length,0),socialEvents:events.items.filter(e=>e.type.startsWith('social.')).length};
await ctx.close();console.log(JSON.stringify(out));
