import {describe,it,expect} from 'vitest';
import Fastify from 'fastify';
import {Keypair} from '@solana/web3.js';
import {OFFICIAL_TREASURIES,launchpadPaths} from '@agentic-economy/shared';
import {mobileVerificationPolicy,restrictMobileVerification} from '../scripts/mobile-verification-policy.js';
const wallet=Keypair.generate().publicKey.toBase58(),secret='a'.repeat(64);
const env={AECO_MOBILE_VERIFICATION:'true',AECO_MOBILE_ORIGIN:'https://private.example.test',AECO_MOBILE_WALLET:wallet,AECO_VERIFICATION_GATEWAY_TOKEN:secret};
describe('isolated mobile verification policy',()=>{
 it('retains the existing localhost environment and requires explicit safe mobile settings',()=>{
  expect(mobileVerificationPolicy({})).toEqual({origin:'http://localhost:5187',mobile:false});
  for(const change of [{AECO_MOBILE_VERIFICATION:'false'},{AECO_MOBILE_ORIGIN:'http://private.example.test'},{AECO_MOBILE_ORIGIN:'https://private.example.test/path'},{AECO_MOBILE_WALLET:OFFICIAL_TREASURIES.aecoDeployer},{AECO_MOBILE_WALLET:OFFICIAL_TREASURIES.platform},{AECO_VERIFICATION_GATEWAY_TOKEN:'short'}])expect(()=>mobileVerificationPolicy({...env,...change})).toThrow();
 });
 it('rejects direct API requests and prevents another wallet authenticating through either API',async()=>{
  const app=Fastify();
  for(const url of ['/api/v1/auth/challenge','/api/v1/auth/verify',launchpadPaths.verify])app.post(url,async()=>({ok:true}));
  app.get('/api/v1/private',async()=>({ok:true}));
  restrictMobileVerification(app,mobileVerificationPolicy(env),async authorization=>{if(authorization==='Bearer expired')throw Error('expired');return {wallet:authorization==='Bearer allowed'?wallet:Keypair.generate().publicKey.toBase58()};});
  try{
   for(const url of ['/api/v1/auth/challenge','/api/v1/auth/verify',launchpadPaths.verify]){
    expect((await app.inject({method:'POST',url,payload:{wallet}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url,headers:{'x-aeco-verification-gateway':secret,authorization:'Bearer expired'},payload:{wallet}})).statusCode).toBe(200);
    expect((await app.inject({method:'POST',url,headers:{'x-aeco-verification-gateway':'é'.repeat(64)},payload:{wallet}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url:url+'?bypass=1',headers:{'x-aeco-verification-gateway':secret},payload:{wallet:Keypair.generate().publicKey.toBase58()}})).statusCode).toBe(403);
    expect((await app.inject({method:'POST',url,headers:{'x-aeco-verification-gateway':secret},payload:{wallet}})).statusCode).toBe(200);
   }
   expect((await app.inject({url:'/api/v1/private',headers:{'x-aeco-verification-gateway':secret,authorization:'Bearer other'}})).statusCode).toBe(403);
   expect((await app.inject({url:'/api/v1/private',headers:{'x-aeco-verification-gateway':secret,authorization:'Bearer expired'}})).statusCode).toBe(401);
   expect((await app.inject({url:'/api/v1/private',headers:{'x-aeco-verification-gateway':secret,authorization:'Bearer allowed'}})).statusCode).toBe(200);
  }finally{await app.close();}
 });
});
