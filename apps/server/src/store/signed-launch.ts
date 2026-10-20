import {createHash} from 'node:crypto';
import type pg from 'pg';
import {z} from 'zod';
import {PublicKey,TxSignature} from '@agentic-economy/shared';
import {AppError} from '../util/errors.js';
const Receipt=z.object({wallet:PublicKey,launchId:z.string(),mint:PublicKey,genesisHash:PublicKey,signature:TxSignature,transaction:z.string().max(1644).optional(),createdAt:z.iso.datetime()});
export type SignedLaunchReceipt=z.infer<typeof Receipt>;
export const SIGNED_LAUNCH_RETENTION_MS=24*60*60*1000;
const kind='signed_launch';
/** Private recovery evidence in the existing operations table; never returned by the launch DTO.
 * Stores signed transactions, never wallet/mint private keys. The signature remains after payload erasure.
 */
export class SignedLaunchStore{
 private records=new Map<string,{hash:string;receipt:SignedLaunchReceipt}>();
 constructor(private pool?:pg.Pool,private now:()=>number=()=>Date.now()){}
 async put(input:Omit<SignedLaunchReceipt,'createdAt'> & {transaction:string}){
  const receipt=Receipt.parse({...input,createdAt:new Date(this.now()).toISOString()});
  const hash=createHash('sha256').update(JSON.stringify([input.wallet,input.launchId,input.mint,input.genesisHash,input.signature,input.transaction])).digest('hex');
  if(this.pool){
   await this.pool.query("INSERT INTO launchpad_operations(wallet,key,kind,hash,status,result,lease_until) VALUES($1,$2,$3,$4,'done',$5,now()) ON CONFLICT DO NOTHING",[input.wallet,input.launchId,kind,hash,receipt]);
   const existing=(await this.pool.query('SELECT hash FROM launchpad_operations WHERE wallet=$1 AND key=$2 AND kind=$3',[input.wallet,input.launchId,kind])).rows[0];
   if(existing?.hash!==hash)throw new AppError('conflict','A different signed transaction is already saved for this launch');
  }else{
   const key=`${input.wallet}:${input.launchId}`,existing=this.records.get(key);
   if(existing&&existing.hash!==hash)throw new AppError('conflict','A different signed transaction is already saved for this launch');
   if(!existing)this.records.set(key,{hash,receipt});
  }
 }
 async get(wallet:string,id:string):Promise<SignedLaunchReceipt|null>{
  const raw=this.pool?(await this.pool.query('SELECT result FROM launchpad_operations WHERE wallet=$1 AND key=$2 AND kind=$3',[wallet,id,kind])).rows[0]?.result:this.records.get(`${wallet}:${id}`)?.receipt;
  if(!raw)return null;const receipt=Receipt.parse(raw);
  if(receipt.wallet!==wallet||receipt.launchId!==id)throw new AppError('conflict','Signed launch evidence does not match its owner');
  if(receipt.transaction&&Date.parse(receipt.createdAt)+SIGNED_LAUNCH_RETENTION_MS<=this.now()){await this.erase(wallet,id);delete receipt.transaction;}
  return structuredClone(receipt);
 }
 async erase(wallet:string,id:string){
  if(this.pool)await this.pool.query("UPDATE launchpad_operations SET result=result-'transaction' WHERE wallet=$1 AND key=$2 AND kind=$3",[wallet,id,kind]);
  else{const r=this.records.get(`${wallet}:${id}`);if(r)delete r.receipt.transaction;}
 }
 /** Bounded startup cleanup; only recovery payloads are removed, never launch/fee records. */
 async prune(){
  if(this.pool)await this.pool.query("WITH old AS (SELECT wallet,key,kind FROM launchpad_operations WHERE kind=$1 AND created_at<$2 AND result ? 'transaction' LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE launchpad_operations o SET result=o.result-'transaction' FROM old WHERE o.wallet=old.wallet AND o.key=old.key AND o.kind=old.kind",[kind,new Date(this.now()-SIGNED_LAUNCH_RETENTION_MS)]);
  else for(const r of this.records.values())if(Date.parse(r.receipt.createdAt)+SIGNED_LAUNCH_RETENTION_MS<=this.now())delete r.receipt.transaction;
 }
}
