import {afterEach,expect,it,vi}from'vitest';
import {BackgroundRpc,retryAfterMs,type RpcReadOptions}from'../src/chain/background-rpc.js';
const options:RpcReadOptions={intervalMs:0,concurrency:2,methodLimit:8,queueLimit:32,deadlineMs:30000,attempts:3};
const request=(rpc:BackgroundRpc,lane:'live'|'history'|'treasury'|'holders'='live',method='getBalance')=>rpc.fetch(lane)('https://rpc.invalid',{body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]})});
afterEach(()=>vi.useRealTimers());
it('parses numeric/date Retry-After without inventing a short cooldown',()=>{
 expect(retryAfterMs('2',1000)).toBe(2000);expect(retryAfterMs(new Date(60000).toUTCString(),1000)).toBe(59000);expect(retryAfterMs('bad',1000)).toBe(0);expect(retryAfterMs('-1',1000)).toBe(0);
});
it('recovers after429 with Retry-After, preserving sanitized method diagnostics',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn().mockResolvedValueOnce(new Response('secret URL',{status:429,headers:{'Retry-After':'2'}})).mockImplementation(async()=>Response.json({result:7}));const diagnostics=vi.fn();
 const rpc=new BackgroundRpc(options,fetcher,()=>Date.now(),()=>0.5,diagnostics);
 try{const job=request(rpc);await vi.advanceTimersByTimeAsync(1900);expect(fetcher).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(200);expect(await(await job).json()).toEqual({result:7});expect(rpc.metrics).toMatchObject({requests:2,retries:1,rateLimited:1,failures:0});expect(diagnostics).toHaveBeenCalledWith('getBalance','rate_limited');}finally{rpc.close();}
});
it('honors a long cooldown rather than retrying early and bounds queue time',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async()=>new Response('hidden',{status:429,headers:{'Retry-After':'120'}}));const rpc=new BackgroundRpc({...options,deadlineMs:1000},fetcher,()=>Date.now(),()=>0);
 try{await expect(request(rpc)).rejects.toMatchObject({code:'rate_limited'});expect(rpc.cooldownMs).toBe(120000);const next=request(rpc);const checked=expect(next).rejects.toMatchObject({code:'deadline'});await vi.advanceTimersByTimeAsync(1100);await checked;expect(fetcher).toHaveBeenCalledTimes(1);}finally{rpc.close();}
});
it('enforces a shared per-method window across lanes while serving other methods',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async()=>Response.json({result:1})),rpc=new BackgroundRpc({...options,methodLimit:2},fetcher);
 try{const jobs=[request(rpc,'live'),request(rpc,'treasury'),request(rpc,'holders')];await vi.advanceTimersByTimeAsync(1);expect(fetcher).toHaveBeenCalledTimes(2);const slot=request(rpc,'live','getSlot');await vi.advanceTimersByTimeAsync(1);await slot;expect(fetcher).toHaveBeenCalledTimes(3);await vi.advanceTimersByTimeAsync(10000);await Promise.all(jobs);expect(fetcher).toHaveBeenCalledTimes(4);}finally{rpc.close();}
});
it('reserves a slot for live reads and schedules queued consumers fairly',async()=>{
 vi.useFakeTimers();let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});const order:string[]=[];
 const fetcher=vi.fn(async(_input:unknown,init?:RequestInit)=>{const b=JSON.parse(String(init?.body));order.push(b.method);if(b.method==='getTransaction')await gate;return Response.json({result:1});});const rpc=new BackgroundRpc(options,fetcher);
 try{const h1=request(rpc,'history','getTransaction'),h2=request(rpc,'history','getTransaction');const live=request(rpc,'live','getSlot'),treasury=request(rpc,'treasury','getBalance');await vi.advanceTimersByTimeAsync(1);await Promise.all([live,treasury]);expect(order).toEqual(['getTransaction','getSlot','getBalance']);expect(rpc.inFlight).toBe(1);release();await vi.advanceTimersByTimeAsync(1);await Promise.all([h1,h2]);expect(order.at(-1)).toBe('getTransaction');}finally{release();rpc.close();}
});
it('rejects writes, aborts queued work, and never logs provider URLs or errors',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async()=>Response.json({error:{code:-32015,message:'https://secret.invalid/?api-key=hidden'}})),rpc=new BackgroundRpc({...options,intervalMs:1000},fetcher);
 try{await expect(request(rpc,'live','sendTransaction')).rejects.toMatchObject({code:'invalid_request'});expect(fetcher).not.toHaveBeenCalled();const r=await request(rpc);expect(JSON.stringify(await r.json())).not.toContain('hidden');const controller=new AbortController();const queued=rpc.fetch('live')('https://rpc.invalid',{body:JSON.stringify({method:'getSlot'}),signal:controller.signal});const assertion=expect(queued).rejects.toMatchObject({code:'deadline'});controller.abort();await vi.advanceTimersByTimeAsync(100);await assertion;expect(fetcher).toHaveBeenCalledTimes(1);}finally{rpc.close();}
});
it('budgets every batch member and preserves JSON-RPC ids',async()=>{
 vi.useFakeTimers();const rpc=new BackgroundRpc(options,async(_url,init)=>Response.json({id:JSON.parse(String(init?.body)).id,result:1}));
 try{const response=await rpc.fetch('live')('https://rpc.invalid',{body:JSON.stringify([{id:1,method:'getSlot'},{id:2,method:'getSlot'}])});expect(((await response.json())as Array<{id:number}>).map(v=>v.id)).toEqual([1,2]);expect(rpc.metrics.requests).toBe(2);}finally{rpc.close();}
});
it('uses HTTP-date Retry-After and classifies JSON-RPC throttle errors',async()=>{
 vi.useFakeTimers({now:100000});const fetcher=vi.fn().mockResolvedValueOnce(Response.json({error:{code:-32029}},{headers:{'Retry-After':new Date(120000).toUTCString()}})).mockImplementation(async()=>Response.json({result:1}));const rpc=new BackgroundRpc(options,fetcher);
 try{const work=request(rpc);await vi.advanceTimersByTimeAsync(19000);expect(fetcher).toHaveBeenCalledTimes(1);await vi.advanceTimersByTimeAsync(1100);await work;expect(rpc.metrics.rateLimited).toBe(1);}finally{rpc.close();}
});
it('applies jittered exponential backoff to transient failures and never retries401',async()=>{
 vi.useFakeTimers({now:0});const times:number[]=[],random=vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1).mockReturnValue(0);
 const fetcher=vi.fn(async()=>{times.push(Date.now());return times.length<3?new Response('{}',{status:503}):Response.json({result:1});});const rpc=new BackgroundRpc(options,fetcher,()=>Date.now(),random);
 try{const work=request(rpc);await vi.advanceTimersByTimeAsync(2000);await work;expect(times[1]!-times[0]!).toBeGreaterThanOrEqual(250);expect(times[2]!-times[1]!).toBeGreaterThanOrEqual(1250);}finally{rpc.close();}
 const denied=vi.fn(async()=>new Response('private',{status:401})),second=new BackgroundRpc(options,denied);try{await expect(request(second)).rejects.toMatchObject({code:'unauthorized'});expect(denied).toHaveBeenCalledTimes(1);}finally{second.close();}
});
it('preserves status/cooldown for the externally credit-budgeted Helius adapter without retrying inside its budget',async()=>{
 vi.useFakeTimers();const fetcher=vi.fn(async()=>new Response('api-key=private',{status:429,headers:{'Retry-After':'2'}})),rpc=new BackgroundRpc(options,fetcher);
 try{const response=await rpc.fetch('holders',false)('https://rpc.invalid',{body:JSON.stringify({method:'getBalance'})});expect(response.status).toBe(429);expect(response.headers.get('retry-after')).toBe('2');expect(await response.text()).not.toContain('private');expect(fetcher).toHaveBeenCalledTimes(1);expect(rpc.metrics.retries).toBe(0);}finally{rpc.close();}
});
