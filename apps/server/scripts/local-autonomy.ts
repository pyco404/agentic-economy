import { join, resolve } from 'node:path';
import { mkdirSync, openSync, closeSync, unlinkSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { MemoryStore } from '../src/store/memory.js';
import { LocalAutonomyCoordinator } from '../src/ops/local-autonomy-store.js';
import { alignmentCommands } from '../src/ops/world-alignment.js';
import { buildApp } from '../src/http/app.js';
import { AutonomousWorker, MockModelProvider } from '../src/services/autonomy.js';

// Intentionally do not load .env or pass process.env to configuration. No chain/provider calls.
const stateDir=resolve(process.argv[2]??'/tmp/aeco-autonomy-m1');
if(!stateDir.startsWith('/tmp/'))throw Error('Use a dedicated prototype directory under /tmp');
mkdirSync(stateDir,{recursive:true,mode:0o700});
const lock=join(stateDir,'process.lock');
let fd:number;
try{fd=openSync(lock,'wx',0o600);}catch{
  const saved=JSON.parse(readFileSync(lock,'utf8'));if(!Number.isSafeInteger(saved.pid)||saved.pid<=0)throw Error('Invalid prototype process lock; inspect it before restarting');
  let alive=true;try{process.kill(saved.pid,0);}catch(error){if((error as NodeJS.ErrnoException).code==='ESRCH')alive=false;else throw error;}
  if(alive)throw Error('This prototype checkpoint is already in use by a running process');
  unlinkSync(lock);fd=openSync(lock,'wx',0o600);
}
writeFileSync(fd,JSON.stringify({pid:process.pid}));
const config=loadConfig({MODE:'demo',ROLE:'all',HOST:'127.0.0.1',PORT:'8831',SOLANA_CLUSTER:'localnet',LOCAL_AUTONOMY_ENABLED:'true',SOCIAL_SIMULATION_ENABLED:'false',SIM_AUTOSTART:'false',WORLD_SEED:'agentic-economy-genesis',LOG_LEVEL:'warn',CORS_ORIGINS:'http://127.0.0.1:5186,http://localhost:5186',AUTH_DOMAIN:'127.0.0.1:5186',AUTH_URI:'http://127.0.0.1:5186'});
const store=new MemoryStore(),coord=new LocalAutonomyCoordinator(store,join(stateDir,'checkpoint.json'));
await coord.restore();
const ctx=await createContext(config,{store,coord});
if(!ctx.runtime.state.autonomy){
 for(const [index,command]of alignmentCommands().entries())await coord.enqueueCommand(command,`prototype:seed:${index}`);
 await coord.enqueueCommand({type:'autonomy.configure',participants:['agt_synthetic1','agt_synthetic2','agt_synthetic3','agt_synthetic4','agt_synthetic5']},'prototype:cohort');
 await ctx.runtime.tickOnce();
}
const worker=new AutonomousWorker(new MockModelProvider(),()=>ctx.runtime.state,ctx.runtime.sim!.engine!.nav,(command,key)=>coord.enqueueCommand(command,key));
const app=await buildApp(ctx);await app.listen({host:config.host,port:config.port});
console.log(JSON.stringify({api:'http://127.0.0.1:8831',provider:'mock',globalSocial:false,stateDir,agents:ctx.runtime.state.autonomy!.participants.map(id=>({id,name:ctx.runtime.state.agents[id]!.displayName}))}));
let stopping=false;let timer:ReturnType<typeof setTimeout>|undefined;let ticking:Promise<void>|null=null;
const tick=()=>{if(stopping)return;ticking=(async()=>{await ctx.runtime.tickOnce();void worker.pulse().catch(()=>{console.error('Local mock worker could not enqueue a decision');});})().then(()=>{if(!stopping)timer=setTimeout(tick,500);}).catch(()=>{console.error('Local prototype tick/checkpoint failed; stopping without further actions');void close();});};
async function close(){if(stopping)return;stopping=true;if(timer)clearTimeout(timer);await worker.stop();await app.close();await ctx.close();closeSync(fd);unlinkSync(lock);}
for(const sig of ['SIGINT','SIGTERM']as const)process.on(sig,()=>{void(async()=>{if(ticking)await ticking.catch(()=>{});await close();process.exit(0);})();});
// Fail early if the checkpoint is no longer readable; never silently reset a saved world.
JSON.parse(readFileSync(join(stateDir,'checkpoint.json'),'utf8'));tick();
