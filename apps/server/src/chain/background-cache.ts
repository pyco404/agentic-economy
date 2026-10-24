import type {ChainGateway,ObservedTransaction} from './types.js';
/** Per-background-gateway caches: never wrap the launch/recovery gateway or cache mutable accounts. */
export function cachedBackgroundChain(chain:ChainGateway,now=()=>Date.now()):ChainGateway {
 let genesis:{at:number;value:string}|undefined;let genesisJob:Promise<string>|undefined;
 const transactions=new Map<string,{at:number;value:ObservedTransaction;bytes:number}>(),jobs=new Map<string,Promise<ObservedTransaction|null>>();let bytes=0;
 return new Proxy(chain,{get(target,property){
  if(property==='getGenesisHash'&&target.getGenesisHash)return()=>{
   if(genesis&&now()-genesis.at<30000)return Promise.resolve(genesis.value);
   return genesisJob??=target.getGenesisHash!().then(value=>{genesis={at:now(),value};return value;}).finally(()=>{genesisJob=undefined;});
  };
  if(property==='getTransaction')return async(signature:string)=>{
   const old=transactions.get(signature);if(old&&now()-old.at<1800000)return structuredClone(old.value);
   const pending=jobs.get(signature);if(pending)return structuredClone(await pending);
   const job=target.getTransaction(signature).then(value=>{
    if(value?.commitment==='finalized'&&value.err===null&&value.signature===signature){
     const size=Buffer.byteLength(JSON.stringify(value,(_k,v)=>typeof v==='bigint'?v.toString():v));
     if(old){bytes-=old.bytes;transactions.delete(signature);}
     if(size<=2000000){while(transactions.size>=256||bytes+size>16000000){const key=transactions.keys().next().value;if(!key)break;bytes-=transactions.get(key)!.bytes;transactions.delete(key);}transactions.set(signature,{at:now(),value:structuredClone(value),bytes:size});bytes+=size;}
    }return value;
   }).finally(()=>jobs.delete(signature));jobs.set(signature,job);return structuredClone(await job);
  };
  const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
 }});
}
