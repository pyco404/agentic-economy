/** Restrictions for the explicit manual verification entrypoint, never normal app config. */
import {timingSafeEqual} from 'node:crypto';
import {PublicKey} from '@solana/web3.js';
import type {FastifyInstance} from 'fastify';
import {OFFICIAL_TREASURIES,launchpadPaths} from '@agentic-economy/shared';
export function mobileVerificationPolicy(env:Record<string,string|undefined>){
 const origin=env.AECO_MOBILE_ORIGIN??'http://localhost:5187';
 if(origin==='http://localhost:5187')return {origin,mobile:false as const};
 const url=new URL(origin),wallet=env.AECO_MOBILE_WALLET,token=env.AECO_VERIFICATION_GATEWAY_TOKEN;
 if(env.AECO_MOBILE_VERIFICATION!=='true'||url.protocol!=='https:'||url.origin!==origin||url.username||url.password)throw Error('Explicit exact HTTPS mobile verification origin required');
 if(!wallet||(Object.values(OFFICIAL_TREASURIES) as string[]).includes(wallet)||new PublicKey(wallet).toBase58()!==wallet)throw Error('A dedicated non-production test wallet is required');
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw Error('A 256-bit gateway token is required');
 return {origin,mobile:true as const,wallet,token};
}
export function restrictMobileVerification(app:FastifyInstance,policy:ReturnType<typeof mobileVerificationPolicy>,authenticate?:(authorization:string)=>Promise<{wallet:string}>){
 if(!policy.mobile)return;
 if(!authenticate)throw Error('Mobile wallet session enforcement is required');
 app.addHook('onRequest',async(req,reply)=>{
  const token=req.headers['x-aeco-verification-gateway'];
  if(typeof token!=='string'||Buffer.byteLength(token)!==Buffer.byteLength(policy.token)||!timingSafeEqual(Buffer.from(token),Buffer.from(policy.token)))return reply.code(403).send({error:{code:'forbidden',message:'Private verification gateway required'}});
 });
 app.addHook('preValidation',async(req,reply)=>{
  const cookie=/(?:^|;\s*)__Host-aeco_session=([A-Za-z0-9_-]{20,200})(?:;|$)/.exec(req.headers.cookie??'')?.[1];
  const authorization=req.headers.authorization??(cookie?'Bearer '+cookie:undefined);
  const authPaths=['/api/v1/auth/challenge','/api/v1/auth/verify',launchpadPaths.verify];
  const path=req.routeOptions.url??'';
  // A stale cookie must not prevent fresh authentication or clearing a session.
  if(authorization&&!authPaths.includes(path)&&path!==launchpadPaths.logout){try{if((await authenticate(authorization)).wallet!==policy.wallet)return reply.code(403).send({error:{code:'forbidden',message:'Only the dedicated mobile test wallet is permitted'}});}catch{return reply.code(401).send({error:{code:'unauthorized',message:'Invalid verification session'}});}}
  if(req.method==='POST'&&authPaths.includes(path)){
   if((req.body as {wallet?:string}|null)?.wallet!==policy.wallet)return reply.code(403).send({error:{code:'forbidden',message:'Only the dedicated mobile test wallet is permitted'}});
  }
 });
}
