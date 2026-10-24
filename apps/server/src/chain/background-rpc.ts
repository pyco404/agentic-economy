/** Shared, bounded read-only transport. Never used for launch construction or submission. */
export type ReadLane = 'live' | 'history' | 'treasury' | 'holders' | 'monitor';
export type ReadFailure = 'rate_limited' | 'unavailable' | 'deadline' | 'queue_full' | 'invalid_request' | 'unauthorized';
export class BackgroundReadError extends Error {
 constructor(readonly method:string,readonly code:ReadFailure){super(`Background RPC ${method}: ${code}`);}
}
export function retryAfterMs(value:string|null,now:number):number {
 if(!value)return 0;
 const seconds=Number(value);if(Number.isFinite(seconds))return seconds>=0?seconds*1000:0;
 const date=Date.parse(value);return Number.isFinite(date)?Math.max(0,date-now):0;
}
const allowed=new Set(['getGenesisHash','getBalance','getSignaturesForAddress','getTransaction','getSignatureStatuses','getMultipleAccounts','getAccountInfo','getSlot','getBlockTime','getBlock','getTokenAccounts','getAsset','getProgramAccounts','getTokenSupply','getTokenAccountsByOwner']);
interface Task {lane:ReadLane;provider:string;method:string;methods:string[];run:()=>Promise<Response>;resolve:(r:Response)=>void;reject:(e:Error)=>void;deadline:number;attempt:number;retry:boolean;signal?:AbortSignal|null}
interface Provider {next:number;cooldown:number;methods:Map<string,number[]>}
export interface RpcReadOptions {intervalMs:number;concurrency:number;methodLimit:number;queueLimit:number;deadlineMs:number;attempts:number}
const defaults:RpcReadOptions={intervalMs:500,concurrency:2,methodLimit:8,queueLimit:64,deadlineMs:30000,attempts:3};
export class BackgroundRpc {
 readonly metrics={requests:0,retries:0,rateLimited:0,failures:0,timeouts:0,queueRejected:0,latencyMs:0,completed:0};
 readonly methodMetrics=new Map<string,{requests:number;retries:number;failures:number}>();
 private providers=new Map<string,Provider>();private queue:Task[]=[];private active=0;private historyActive=0;private lastLane:ReadLane='history';private timer:ReturnType<typeof setTimeout>|undefined;
 private closed=false;private shutdown=new AbortController();
 constructor(private options:RpcReadOptions=defaults,private request:typeof fetch=fetch,private now=()=>Date.now(),private random=()=>Math.random(),private diagnose:(method:string,code:ReadFailure)=>void=()=>{}){}
 get pending(){return this.queue.length;}get inFlight(){return this.active;}
 get cooldownMs(){return Math.max(0,...[...this.providers.values()].map(p=>p.cooldown-this.now()));}
 close(){this.closed=true;this.shutdown.abort();if(this.timer)clearTimeout(this.timer);for(const t of this.queue)t.reject(new BackgroundReadError(t.method,'unavailable'));this.queue=[];}
 fetch(lane:ReadLane,retry=true):typeof fetch{return async(input,init)=>{
  let body:{method:string;id?:unknown;params?:unknown}[];try{const parsed=JSON.parse(String(init?.body));body=Array.isArray(parsed)?parsed:[parsed];if(!body.length||body.length>20||body.some(b=>!allowed.has(b.method)))throw Error();}catch{throw new BackgroundReadError('invalid','invalid_request');}
  if(body.length>1){const responses=await Promise.all(body.map(b=>this.fetch(lane,retry)(input,{...init,body:JSON.stringify(b)})));return Response.json(await Promise.all(responses.map(r=>r.json())));}
  if(this.closed)throw new BackgroundReadError(body[0]!.method,'unavailable');
  if(this.queue.length+this.active>=this.options.queueLimit){this.metrics.queueRejected++;throw new BackgroundReadError(body[0]!.method,'queue_full');}
  const provider=input instanceof Request?input.url:String(input),method=body[0]!.method;
  return new Promise<Response>((resolve,reject)=>{
   const deadline=this.now()+this.options.deadlineMs;
   const task:Task={lane,provider,method,methods:body.map(b=>b.method),deadline,attempt:0,retry,resolve,reject,signal:init?.signal,
    run:()=>this.request(input,{...init,redirect:'error',signal:init?.signal?AbortSignal.any([this.shutdown.signal,init.signal,AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-this.now()))) ]):AbortSignal.any([this.shutdown.signal,AbortSignal.timeout(Math.max(1,Math.min(10000,deadline-this.now())))])})};
   this.queue.push(task);this.pump();
  });
 };}
 private provider(key:string){let p=this.providers.get(key);if(!p){p={next:0,cooldown:0,methods:new Map()};this.providers.set(key,p);}return p;}
 private eligible(t:Task){const p=this.provider(t.provider),now=this.now();if(now<Math.max(p.next,p.cooldown)||t.lane==='history'&&this.historyActive>=1)return false;
  return t.methods.every(m=>{const entries=(p.methods.get(m)??[]).filter(at=>now-at<10000);p.methods.set(m,entries);return entries.length+t.methods.filter(v=>v===m).length<=this.options.methodLimit;});}
 private pump(){
  if(this.timer)clearTimeout(this.timer);this.timer=undefined;if(this.closed)return;
  for(const t of [...this.queue])if(t.signal?.aborted||this.now()>=t.deadline){this.queue.splice(this.queue.indexOf(t),1);this.metrics.timeouts++;t.reject(new BackgroundReadError(t.method,'deadline'));}
  const lanes:ReadLane[]=['live','treasury','holders','monitor','history'];
  while(this.active<this.options.concurrency){
   let index=-1;for(let step=1;step<=lanes.length;step++){const lane=lanes[(lanes.indexOf(this.lastLane)+step)%lanes.length]!;index=this.queue.findIndex(t=>t.lane===lane&&this.eligible(t));if(index>=0)break;}
   if(index<0)break;
   const t=this.queue.splice(index,1)[0]!,p=this.provider(t.provider);this.lastLane=t.lane;p.next=this.now()+this.options.intervalMs;
   for(const m of t.methods){const values=p.methods.get(m)??[];values.push(this.now());p.methods.set(m,values);}
   this.active++;if(t.lane==='history')this.historyActive++;void this.execute(t).finally(()=>{this.active--;if(t.lane==='history')this.historyActive--;this.pump();});
  }
  if(this.queue.length)this.timer=setTimeout(()=>this.pump(),Math.min(100,Math.max(1,Math.min(...this.queue.map(t=>t.deadline-this.now())))));
 }
 private async execute(t:Task){
  const start=this.now();let failure:ReadFailure='unavailable',retryable=true,delay=0;let terminalResponse:Response|undefined;t.attempt++;this.metrics.requests++;
  let mm=this.methodMetrics.get(t.method);if(!mm){mm={requests:0,retries:0,failures:0};this.methodMetrics.set(t.method,mm);}mm.requests++;
  try{
   const response=await t.run();const text=await response.text();if(text.length>16000000)throw Error();
   let body:unknown;try{body=JSON.parse(text);}catch{body=null;}
   const replies=(Array.isArray(body)?body:[body])as Array<{error?:{code?:number;message?:string};result?:unknown}|null>;
   const throttled=response.status===429||replies.some(b=>b?.error?.code===-32029||b?.error?.code===429);
   if(!t.retry){const rpcCode=replies.find(b=>b?.error)?.error?.code;terminalResponse=Response.json({error:{code:rpcCode??response.status,message:'Background RPC read unavailable'}},{status:response.status,headers:response.headers.get('retry-after')?{'Retry-After':response.headers.get('retry-after')!}:{}});}
   if(response.status===401||response.status===403){failure='unauthorized';retryable=false;}
   else if(throttled){failure='rate_limited';this.metrics.rateLimited++;delay=retryAfterMs(response.headers.get('retry-after'),this.now());}
   else if(response.ok&&body!==null&&!replies.some(b=>[-32004,-32005,-32603].includes(b?.error?.code??0))){
    // Preserve RPC codes but never propagate provider exception messages/URLs into SDK logs.
    for(const b of replies)if(b?.error)b.error={code:b.error.code,message:'Background RPC response rejected'};
    if(replies.some(b=>b?.error)){this.metrics.failures++;mm.failures++;this.diagnose(t.method,'unavailable');}else this.metrics.completed++;
    t.resolve(Response.json(Array.isArray(body)?replies:replies[0]));return;
   }else retryable=response.status>=500||response.ok;
  }catch{failure=t.signal?.aborted||this.now()>=t.deadline?'deadline':'unavailable';}
  finally{this.metrics.latencyMs+=Math.max(0,this.now()-start);}
  this.diagnose(t.method,failure);
  delay=Math.max(delay,250+this.random()*Math.min(8000,500*2**(t.attempt-1)));
  const p=this.provider(t.provider);p.cooldown=Math.max(p.cooldown,this.now()+delay);
  if(!this.closed&&t.retry&&retryable&&t.attempt<this.options.attempts&&this.now()+delay<t.deadline&&!t.signal?.aborted){this.metrics.retries++;mm.retries++;this.queue.push(t);return;}
  this.metrics.failures++;mm.failures++;if(terminalResponse)t.resolve(terminalResponse);else t.reject(new BackgroundReadError(t.method,failure));
 }
}
