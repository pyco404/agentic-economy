import {afterEach,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {SavedLaunchDraft} from '@agentic-economy/shared';
import {makeEnv,newWallet,type TestEnv} from './helpers.js';
import {loadConfig} from '../src/config.js';
import {LaunchpadStore} from '../src/store/launchpad.js';
import {LaunchpadService} from '../src/services/launchpad.js';
const origin='http://localhost:5173';
let env:TestEnv|undefined;
afterEach(async()=>{await env?.close();env=undefined;});
it('ignores the legacy USDC enable flag and rejects direct API create/edit requests',async()=>{
 env=await makeEnv({USDC_LAUNCH_ENABLED:'true'});
 expect(env.ctx.config.pumpLaunch.usdcEnabled).toBe(false);
 // Even a stale in-process toggle must not change the public product policy.
 env.ctx.config.pumpLaunch.usdcEnabled=true;
 expect((await env.app.inject('/api/v1/launchpad/capabilities')).json().quotes.USDC).toBe('planned');
 const w=newWallet(),ch=(await env.app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{wallet:w.wallet}})).json();
 const signed=await env.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin},payload:{wallet:w.wallet,nonce:ch.nonce,signature:w.sign(ch.message)}});
 const headers={origin,cookie:signed.headers['set-cookie']!.toString().split(';')[0]!,'idempotency-key':'sol-policy-create'};
 for(const quoteAsset of ['USDC','AECO','BTC'])expect((await env.app.inject({method:'POST',url:'/api/v1/launchpad/drafts',headers,payload:{name:'Home',symbol:'HOME',quoteAsset}})).statusCode).toBe(400);
 const created=await env.app.inject({method:'POST',url:'/api/v1/launchpad/drafts',headers,payload:{name:'Home',symbol:'HOME'}});
 expect(created.statusCode).toBe(200);const draft=created.json();expect(draft.fields.quoteAsset).toBe('SOL');
 expect((await env.app.inject({method:'PATCH',url:`/api/v1/launchpad/drafts/${draft.id}`,headers,payload:{version:0,fields:{...draft.fields,quoteAsset:'USDC'}}})).statusCode).toBe(400);
 expect((await env.app.inject({method:'GET',url:`/api/v1/launchpad/drafts/${draft.id}`,headers})).json().fields.quoteAsset).toBe('SOL');
 expect(await env.ctx.store.allTreasuryEntries()).toEqual([]);
});
it('retains historical USDC drafts but blocks pinning before any upload',async()=>{
 const store=new LaunchpadStore(),pin=vi.fn(),wallet=newWallet().wallet,at=new Date().toISOString();
 const draft=SavedLaunchDraft.parse({id:randomUUID(),wallet,version:0,fields:{name:'Historical',symbol:'OLD',quoteAsset:'USDC'},image:null,metadata:null,createdAt:at,updatedAt:at});
 await store.create(draft);
 const service=new LaunchpadService(store,loadConfig({MODE:'demo'}),{pin});
 expect((await store.get(wallet,draft.id)).fields.quoteAsset).toBe('USDC');
 expect(await service.launchIssues(draft.fields)).toEqual([expect.objectContaining({field:'quoteAsset',code:'quote_unavailable'})]);
 await expect(service.image(wallet,draft.id,0,'old-image-key',Buffer.from('unused'))).rejects.toThrow('Only SOL');
 expect(pin).not.toHaveBeenCalled();expect((await store.get(wallet,draft.id)).fields.quoteAsset).toBe('USDC');
});
it('rejects service-level USDC preparation even with legacy configuration enabled',async()=>{
 env=await makeEnv({USDC_LAUNCH_ENABLED:'true'});env.ctx.config.pumpLaunch.usdcEnabled=true;
 const build=vi.spyOn(env.chain,'buildLaunchTransaction');
 await expect(env.ctx.launches.prepare(newWallet().wallet,{name:'Old',symbol:'OLD',description:'',metadataUri:'ipfs://old',imageUri:null,website:null,twitter:null,telegram:null},undefined,{asset:'USDC',mint:env.ctx.config.pumpLaunch.usdcMint})).rejects.toThrow('Only SOL');
 expect(build).not.toHaveBeenCalled();
});
