/** Operator-run OFFLINE utility. Never run it against the owner's key on their behalf.
 * inspect: --review <public-review.json>
 * sign: additionally --sign --keypair <outside-repository-file> --state-dir <private-dir>
 *       --approved-message-sha256 <separately-reviewed-hash> --out <new-public-output.json>
 * It has no RPC/broadcast/client imports and never signs as the deployer.
 */
import { constants, closeSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { withMintReservation } from './lib/mint-reservation.js';
import { dirname, join, resolve } from 'node:path';
import { OFFICIAL_TREASURIES } from '@agentic-economy/shared';
import { coSignReviewedMint, inspectMintSigningReview, PLANNED_AECO_MINT } from '../src/chain/offline-mint.js';

const args = process.argv.slice(2);
const allowed = new Set(['--review','--sign','--keypair','--state-dir','--approved-message-sha256','--out']);
const options = new Map<string,string>();
for(let i=0;i<args.length;i++){
  const arg=args[i]!;
  if(!allowed.has(arg)||options.has(arg))throw new Error('Unknown or duplicate argument');
  if(arg==='--sign')options.set(arg,'true');
  else {const val=args[++i];if(!val||val.startsWith('--'))throw new Error('Missing argument');options.set(arg,val);}
}
const required=(name:string)=>{const v=options.get(name);if(!v)throw new Error(`Required: ${name}`);return v;};
const policy={mint:PLANNED_AECO_MINT,deployer:OFFICIAL_TREASURIES.aecoDeployer,platform:OFFICIAL_TREASURIES.platform,rewards:OFFICIAL_TREASURIES.agentRewards};
try {
  const reviewPath=required('--review');if(lstatSync(reviewPath).size>100_000)throw new Error('Review file too large');
  const value:unknown=JSON.parse(readFileSync(reviewPath,'utf8'));
  const {review}=await inspectMintSigningReview(value,policy);
  console.log(JSON.stringify({mode:'inspection',launchId:review.launchId,mint:review.mint,deployer:review.launcherWallet,messageSha256:review.messageSha256,
    maximumDebitClaimLamports:review.maxTotalDebitLamports,networkClaim:review.network,
    note:'Offline inspection does not attest chain, lookup-table contents, simulation, finality or owner approval. No transaction sent.'}));
  if(options.has('--sign')){
    const approved=required('--approved-message-sha256');if(approved!==review.messageSha256)throw new Error('Approved hash differs from review');
    // Refuse every enclosing Git worktree, including the preserved parent checkout.
    const outside=(p:string)=>{let dir=lstatSync(p).isDirectory()?realpathSync(p):dirname(realpathSync(p));while(true){if(existsSync(join(dir,'.git')))return false;const parent=dirname(dir);if(parent===dir)return true;dir=parent;}};
    const keyPath=required('--keypair'),state=resolve(required('--state-dir')),output=resolve(required('--out'));
    if(!outside(keyPath))throw new Error('Keypair must stay outside this repository');
    mkdirSync(state,{recursive:true,mode:0o700});const st=lstatSync(state);
    if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o077)!==0||st.uid!==process.getuid?.()||!outside(state))throw new Error('State directory must be private, user-owned and outside this repository');
    const fd=openSync(keyPath,constants.O_RDONLY|constants.O_NOFOLLOW);
    let secret:Uint8Array|undefined;
    try {
      const stat=fstatSync(fd);
      if(!stat.isFile()||stat.size>1024||(stat.mode&0o077)!==0||stat.uid!==process.getuid?.())throw new Error('Keypair must be a private, user-owned regular file');
      await withMintReservation(state,{launchId:review.launchId,mint:review.mint,messageSha256:approved},async()=>{
      const raw:unknown=JSON.parse(readFileSync(fd,'utf8'));
      if(!Array.isArray(raw)||raw.length!==64||!raw.every(n=>Number.isInteger(n)&&n>=0&&n<=255))throw new Error('Expected a local Solana keypair file');
      secret=Uint8Array.from(raw as number[]);
      const result=await coSignReviewedMint(value,policy,approved,secret);
      // Never overwrite an existing output; this file contains public signatures, never secret bytes.
      writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
      console.log('Mint-only signature saved. Phantom has not signed. Nothing was broadcast.');
      });
    }finally{secret?.fill(0);closeSync(fd);}
  } else if(['--keypair','--state-dir','--approved-message-sha256','--out'].some(k=>options.has(k)))throw new Error('Signing arguments require explicit --sign');
}catch{
  // Never echo upstream exceptions, file contents, key paths or private material.
  console.error('Offline mint review/signing stopped. No transaction was broadcast. Check public review/hash, fixed policy, file permissions and existing reservation. Do not delete a reservation or retry another message without reconciliation.');
  process.exitCode=1;
}
