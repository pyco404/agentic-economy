import { afterEach, expect, it, vi } from 'vitest';
import { demoDashboard, HttpAdapter } from './adapter';
afterEach(()=>vi.unstubAllGlobals());
it('presents authoritative geometry independently of unavailable dashboard services and shares concurrent geometry requests',async()=>{
 const d=demoDashboard(), calls:string[]=[];
 d.bootstrap={...d.bootstrap,chunks:[]};
 let rejectTreasury!:(error:Error)=>void;
 const treasury=new Promise((_,reject)=>{rejectTreasury=reject;});
 const payloads:Record<string,unknown>={
  '/api/v1/world/bootstrap':d.bootstrap,'/api/v1/world/chunks':{mode:d.mode,chunks:[]},
  '/api/v1/world/stats':d.stats,'/api/v1/world/agents':{mode:d.mode,tick:d.stats.tick,agents:d.agents},
  '/api/v1/communities':{mode:d.mode,items:d.communities,nextCursor:null},'/api/v1/markets':d.markets,
  '/api/v1/tasks/receipts':{mode:d.mode,items:[],nextCursor:null},
  '/api/v1/tasks':{mode:d.mode,items:d.tasks,nextCursor:null},'/api/v1/activities':{mode:d.mode,items:d.activities,nextCursor:null},
 };
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  const path=new URL(url).pathname;calls.push(path);
  if(path==='/api/v1/treasury')await treasury;
  return{ok:true,json:async()=>payloads[path]};
 }));
 const api=new HttpAdapter('http://localhost:3001'), signal=new AbortController().signal;
 const presentation=api.loadWorld(signal),dashboard=api.load(signal);
 const failure=expect(dashboard).rejects.toThrow('Treasury unavailable');
 expect(await presentation).toEqual({bootstrap:d.bootstrap,chunks:[],worldChunks:[]});
 expect(calls.filter(p=>p==='/api/v1/world/bootstrap')).toHaveLength(1);
 expect(calls.filter(p=>p==='/api/v1/world/chunks')).toHaveLength(1);
 rejectTreasury(new Error('Treasury unavailable'));await failure;
});
it('preserves caller cancellation when applying the network timeout',async()=>{
 const controller=new AbortController();let requestSignal:AbortSignal|undefined;
 vi.stubGlobal('fetch',vi.fn((_url:string,options:RequestInit)=>{
  requestSignal=options.signal as AbortSignal;
  return new Promise((_,reject)=>requestSignal!.addEventListener('abort',()=>reject(requestSignal!.reason),{once:true}));
 }));
 const pending=new HttpAdapter('http://localhost:3001').loadWorld(controller.signal);
 const failure=expect(pending).rejects.toThrow();controller.abort();await failure;
 expect(requestSignal?.aborted).toBe(true);
});

it.each([true,false])('resolves advertised chunks outside the initial radius and fails clearly if absent: %s',async(available)=>{
 const bootstrap={...demoDashboard().bootstrap,chunks:[{cx:20,cy:0}]};
 const chunk={coord:{cx:20,cy:0},size:32,version:1,terrain:'g'.repeat(1024),elevation:'0'.repeat(1024),buildings:[],props:[]};
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
  const u=new URL(url);return{ok:true,json:async()=>u.pathname.endsWith('/bootstrap')?bootstrap:{mode:'demo',chunks:available&&u.searchParams.get('radius')==='0'?[chunk]:[]}};
 }));
 const promise=new HttpAdapter('http://localhost:3001').loadWorld();
 if(available)expect((await promise).worldChunks).toEqual([chunk]);
 else await expect(promise).rejects.toThrow('World geometry unavailable for 20:0');
});
