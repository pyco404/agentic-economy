import {z} from 'zod';
const Envelope=z.object({wallet:z.string(),id:z.string(),mint:z.string(),network:z.enum(['devnet','localnet']),signature:z.string().min(64).max(88),transaction:z.string().min(1).max(1644),createdAt:z.number()});
type Binding={wallet:string;id:string;mint:string;network:'devnet'|'localnet'};
export const SIGNED_PAYLOAD_TTL=24*60*60*1000;
const key=(origin:string,b:Binding)=>`aeco:signed:${origin}:${b.wallet}:${b.id}`;
/** A short-lived, tab-scoped recovery copy. Never stores private keys or logs transaction bytes. */
export function saveSignedLaunch(storage:Storage,origin:string,input:Binding&{signature:string;transaction:string},now=Date.now()){
 const record=Envelope.parse({...input,createdAt:now});storage.setItem(key(origin,input),JSON.stringify(record));
}
export function readSignedLaunch(storage:Storage,origin:string,b:Binding,now=Date.now()){
 const k=key(origin,b);let record;
 try{record=Envelope.parse(JSON.parse(storage.getItem(k)??'null'));}catch{storage.removeItem(k);return null;}
 if(record.wallet!==b.wallet||record.id!==b.id||record.mint!==b.mint||record.network!==b.network||record.createdAt>now||record.createdAt+SIGNED_PAYLOAD_TTL<=now){storage.removeItem(k);return null;}
 return record;
}
export function eraseSignedLaunch(storage:Storage,origin:string,b:Binding){storage.removeItem(key(origin,b));}
