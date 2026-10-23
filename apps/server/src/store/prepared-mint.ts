import {Keypair} from '@solana/web3.js';
import type pg from 'pg';
import {AppError} from '../util/errors.js';
/** Private custody of server-generated disposable mints only. Never the official vanity key.
 * Uses the existing private operations table; never included in a launch DTO or an HTTP result.
 * Retention is tied to the intent, so browser/server restarts cannot silently substitute a mint.
 */
export class PreparedMintStore {
 async erase(wallet:string,id:string){
  if(this.pool)await this.pool.query("DELETE FROM launchpad_operations WHERE wallet=$1 AND key=$2 AND kind='prepared_mint'",[wallet,id]);
  else this.records.delete(`${wallet}:${id}`);
 }
 private readonly records=new Map<string,string>();
 constructor(private readonly pool?:pg.Pool){}
 async getOrCreate(wallet:string,id:string,expectedMint?:string):Promise<Keypair>{
  const key=`${wallet}:${id}`;
  let seed=this.pool?(await this.pool.query("SELECT result->>'seed' AS seed FROM launchpad_operations WHERE wallet=$1 AND key=$2 AND kind='prepared_mint'",[wallet,id])).rows[0]?.seed:this.records.get(key);
  if(!seed){
   if(expectedMint)throw new AppError('unavailable','The saved mint signer is unavailable. Keep this launch for reconciliation; no replacement mint was generated.');
   const generated=Keypair.generate();seed=Buffer.from(generated.secretKey.subarray(0,32)).toString('base64');generated.secretKey.fill(0);
   if(this.pool){
    await this.pool.query("INSERT INTO launchpad_operations(wallet,key,kind,hash,status,result,lease_until) VALUES($1,$2,'prepared_mint','private','done',$3,now()) ON CONFLICT DO NOTHING",[wallet,id,{seed}]);
    seed=(await this.pool.query("SELECT result->>'seed' AS seed FROM launchpad_operations WHERE wallet=$1 AND key=$2 AND kind='prepared_mint'",[wallet,id])).rows[0]?.seed;
   }else this.records.set(key,seed);
  }
  let bytes:Buffer|undefined;
  try{bytes=Buffer.from(seed,'base64');if(bytes.length!==32)throw Error();const kp=Keypair.fromSeed(bytes);if(expectedMint&&kp.publicKey.toBase58()!==expectedMint){kp.secretKey.fill(0);throw Error();}return kp;}
  catch{throw new AppError('unavailable','The saved mint signer could not be validated. Nothing was signed.');}
  finally{bytes?.fill(0);}
 }
}
