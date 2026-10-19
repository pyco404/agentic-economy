import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { makeEnv, newWallet, type TestEnv } from './helpers.js';
import { LaunchpadStore } from '../src/store/launchpad.js';
const origin='http://localhost:5173';
let env:TestEnv;
beforeEach(async()=>{env=await makeEnv({PINATA_JWT:'test-only-not-a-real-credential'});});
afterEach(async()=>{vi.unstubAllGlobals();await env.close();});
async function login(){const user=newWallet();const challenge=(await env.app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{wallet:user.wallet}})).json();const result=await env.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin},payload:{wallet:user.wallet,nonce:challenge.nonce,signature:user.sign(challenge.message)}});expect(result.statusCode).toBe(200);return{...user,cookie:result.headers['set-cookie']!.toString().split(';')[0]!,challenge};}
const request=(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,cookie:string,payload?:unknown,key='request-key-123')=>env.app.inject({method,url,headers:{origin,cookie,'idempotency-key':key},...(payload===undefined?{}:{payload:payload as object})});
const create=async(cookie:string,key='create-key-123')=>{const r=await request('POST','/api/v1/launchpad/drafts',cookie,{name:'Moss',symbol:'MOSS'},key);expect(r.statusCode).toBe(200);return r.json();};
const cid='bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
const png=()=>sharp({create:{width:12,height:12,channels:3,background:'#aabb88'}}).png().toBuffer();
function pinata(){const calls:FormData[]=[];vi.stubGlobal('fetch',vi.fn(async(_url:string,opts:RequestInit)=>{calls.push(opts.body as FormData);return{ok:true,json:async()=>({data:{cid}})};}));return calls;}
async function upload(cookie:string,id:string,version:number,bytes:Buffer,key='image-key-123'){return env.app.inject({method:'POST',url:`/api/v1/launchpad/drafts/${id}/logo?version=${version}`,headers:{origin,cookie,'content-type':'application/octet-stream','idempotency-key':key},payload:bytes});}
describe('browser session security',()=>{
 it('restores an HttpOnly session, consumes challenges once and revokes on logout',async()=>{const user=await login();const session=await request('GET','/api/v1/auth/browser/session',user.cookie);expect(session.json().wallet).toBe(user.wallet);expect(session.json().token).toBeUndefined();const replay=await request('POST','/api/v1/auth/browser/verify',user.cookie,{wallet:user.wallet,nonce:user.challenge.nonce,signature:user.sign(user.challenge.message)});expect(replay.statusCode).toBe(401);expect((await request('POST','/api/v1/auth/browser/logout',user.cookie,{})).statusCode).toBe(200);expect((await request('GET','/api/v1/auth/browser/session',user.cookie)).statusCode).toBe(401);});
 it('rejects unauthenticated calls and cross-origin mutations',async()=>{expect((await request('GET','/api/v1/launchpad/drafts','')).statusCode).toBe(401);const user=await login();const r=await env.app.inject({method:'POST',url:'/api/v1/launchpad/drafts',headers:{origin:'https://evil.example',cookie:user.cookie},payload:{name:'Bad'}});expect(r.statusCode).toBe(403);});
 it('sets secure host-only cookies for HTTPS without exposing session tokens in response bodies',async()=>{await env.close();env=await makeEnv({AUTH_URI:'https://staging.useaeco.xyz',CORS_ORIGINS:'https://staging.useaeco.xyz'});const u=newWallet(),ch=(await env.app.inject({method:'POST',url:'/api/v1/auth/challenge',payload:{wallet:u.wallet}})).json();const r=await env.app.inject({method:'POST',url:'/api/v1/auth/browser/verify',headers:{origin:'https://staging.useaeco.xyz'},payload:{wallet:u.wallet,nonce:ch.nonce,signature:u.sign(ch.message)}});expect(r.headers['set-cookie']).toContain('__Host-aeco_session=');expect(r.headers['set-cookie']).toContain('HttpOnly');expect(r.headers['set-cookie']).toContain('Secure');expect(r.headers['set-cookie']).toContain('SameSite=Strict');expect(r.json().token).toBeUndefined();});
});
describe('owned launch drafts and trusted media',()=>{
 it('creates idempotently, lists, edits with optimistic concurrency and deletes without exposing another wallet draft',async()=>{const a=await login(),b=await login(),d=await create(a.cookie);expect((await create(a.cookie)).id).toBe(d.id);expect((await request('GET','/api/v1/launchpad/drafts',a.cookie)).json().items).toHaveLength(1);expect((await request('GET',`/api/v1/launchpad/drafts/${d.id}`,b.cookie)).statusCode).toBe(404);expect((await request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,b.cookie,{version:0,fields:{name:'Stolen'}})).statusCode).toBe(404);const edits=await Promise.all([1,2].map(n=>request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,a.cookie,{version:0,fields:{name:`Moss ${n}`,symbol:'MOSS'}})));expect(edits.map(r=>r.statusCode).sort()).toEqual([200,409]);expect((await request('DELETE',`/api/v1/launchpad/drafts/${d.id}`,a.cookie,{version:1})).statusCode).toBe(200);expect((await request('GET',`/api/v1/launchpad/drafts/${d.id}`,a.cookie)).statusCode).toBe(404);});
 it('decodes and pins images, persists trusted references, pins latest metadata and invalidates it on edits',async()=>{const calls=pinata(),u=await login(),d=await create(u.cookie),bytes=await png();const first=await upload(u.cookie,d.id,0,bytes);expect(first.statusCode).toBe(200);const saved=first.json();expect(saved.image).toMatchObject({cid,ipfsUri:`ipfs://${cid}`,status:'verified',width:12,height:12});expect((await upload(u.cookie,d.id,0,bytes)).json()).toEqual(saved);expect(calls).toHaveLength(1);
 const meta=await request('POST',`/api/v1/launchpad/drafts/${d.id}/metadata`,u.cookie,{version:1},'metadata-key-123');expect(meta.statusCode).toBe(200);const json=JSON.parse(await (calls[1]!.get('file') as File).text());expect(json).toMatchObject({name:'Moss',symbol:'MOSS',image:`https://gateway.pinata.cloud/ipfs/${cid}`});expect(meta.json().metadata.ipfsUri).toBe(`ipfs://${cid}`);const review=(await request('GET',`/api/v1/launchpad/drafts/${d.id}/review`,u.cookie)).json();expect(review).toMatchObject({readyForNextMilestone:true,launchEnabled:false,launchChargeSol:'0.05'});const edit=await request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,u.cookie,{version:2,fields:{name:'Latest Moss',symbol:'MOSS'}});expect(edit.json().metadata).toBeNull();expect((await request('GET',`/api/v1/launchpad/drafts/${d.id}/review`,u.cookie)).json().readyForNextMilestone).toBe(false);expect((await env.ctx.store.allTreasuryEntries())).toEqual([]);});
 it('rejects malformed, SVG, oversized and unauthorized uploads without calling Pinata',async()=>{const calls=pinata(),u=await login(),d=await create(u.cookie);for(const bytes of [Buffer.from('<svg onload="alert(1)"></svg>'),Buffer.from([137,80,78,71,13,10,26,10])])expect((await upload(u.cookie,d.id,0,bytes,`invalid-${bytes.length}`)).statusCode).toBe(400);expect((await upload('',d.id,0,await png())).statusCode).toBe(401);expect((await upload(u.cookie,d.id,0,Buffer.alloc(5_000_001))).statusCode).toBe(413);expect(calls).toHaveLength(0);});
 it('handles unavailable Pinata safely, permits bounded retries and rejects client-supplied trusted references or quote assets',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:503})));const u=await login(),d=await create(u.cookie);expect((await upload(u.cookie,d.id,0,await png())).statusCode).toBe(503);expect((await request('GET',`/api/v1/launchpad/drafts/${d.id}`,u.cookie)).json().image).toBeNull();for(const fields of [{name:'Bad',quoteAsset:'AECO'},{name:'Bad',image:{cid}},{name:'Bad',metadataUri:'https://evil.example'}])expect((await request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,u.cookie,{version:0,fields})).statusCode).toBe(400);
  // USDC is a valid draft choice (contract 0.4.0) but cannot execute where USDC launches are disabled.
  expect((await request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,u.cookie,{version:0,fields:{name:'Usdc',quoteAsset:'USDC'}})).statusCode).toBe(200);
  expect((await env.app.inject('/api/v1/launchpad/capabilities')).json().quotes.USDC).toBe('planned');
  expect((await request('GET',`/api/v1/launchpad/drafts/${d.id}/review`,u.cookie)).json().launchEnabled).toBe(false);});
 it('enforces replica-safe operation leases, request fingerprints and upload quotas',async()=>{const store=new LaunchpadStore();expect(await store.claim('wallet','key','image','hash')).toEqual({replayed:false});await expect(store.claim('wallet','key','image','hash')).rejects.toThrow('in progress');await expect(store.claim('wallet','key','image','different')).rejects.toThrow('different content');await store.finish('wallet','key','image',{cid});expect(await store.claim('wallet','key','image','hash')).toMatchObject({replayed:true,result:{cid}});for(let i=1;i<20;i++)await store.claim('wallet',`key${i}`,'image','hash');await expect(store.claim('wallet','over','image','hash')).rejects.toThrow('quota');});
});
it('supports JPEG/WebP, rejects excessive dimensions, validates metadata and enforces HTTP mutation limits',async()=>{
 const calls=pinata(),u=await login(),d=await create(u.cookie);
 for(const [n,format]of ['jpeg','webp'].entries()){
  const image=await sharp({create:{width:8,height:9,channels:3,background:'#aacccc'}}).toFormat(format as 'jpeg'|'webp').toBuffer();
  const result=await upload(u.cookie,d.id,n,image,`valid-format-${format}`);expect(result.statusCode).toBe(200);expect(result.json().image.mime).toBe(`image/${format}`);
 }
 const large=await sharp({create:{width:5000,height:4000,channels:3,background:'#ffffff'}}).png().toBuffer();expect((await upload(u.cookie,d.id,2,large,'oversized-pixels')).statusCode).toBe(400);
 const blank=await create(u.cookie,'blank-fields-key');expect((await request('POST',`/api/v1/launchpad/drafts/${blank.id}/metadata`,u.cookie,{version:0},'no-logo-metadata')).statusCode).toBe(400);
 let limited=0;for(let n=0;n<24;n++){const r=await request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,u.cookie,{version:2,fields:{name:'Moss',symbol:'MOSS'}});if(r.statusCode===403)limited++;}expect(limited).toBeGreaterThan(0);expect(calls).toHaveLength(2);
});
it('keeps durable operations unavailable without credentials and rejects other owners for logo, metadata and delete',async()=>{
 await env.close();env=await makeEnv();const a=await login(),b=await login(),d=await create(a.cookie);
 expect((await env.app.inject('/api/v1/launchpad/capabilities')).json()).toMatchObject({uploads:false,launchEnabled:false});expect((await upload(a.cookie,d.id,0,await png())).statusCode).toBe(503);
 expect((await upload(b.cookie,d.id,0,await png())).statusCode).toBe(404);expect((await request('POST',`/api/v1/launchpad/drafts/${d.id}/metadata`,b.cookie,{version:0})).statusCode).toBe(404);expect((await request('DELETE',`/api/v1/launchpad/drafts/${d.id}`,b.cookie,{version:0})).statusCode).toBe(404);
});

it('pins protocol-readable metadata with the current social links and HTTPS image while retaining the canonical IPFS reference',async()=>{
 const calls=pinata(),u=await login(),d=await create(u.cookie);
 const fields={name:'Moss',symbol:'MOSS',description:'A community',website:'https://moss.example',twitter:'https://x.com/moss',telegram:'https://t.me/moss'};
 expect((await request('PATCH',`/api/v1/launchpad/drafts/${d.id}`,u.cookie,{version:0,fields})).statusCode).toBe(200);
 expect((await upload(u.cookie,d.id,1,await png())).statusCode).toBe(200);
 const result=await request('POST',`/api/v1/launchpad/drafts/${d.id}/metadata`,u.cookie,{version:2},'social-metadata-key');
 expect(result.statusCode).toBe(200);
 const metadata=JSON.parse(await (calls[1]!.get('file') as File).text());
 expect(metadata).toEqual({...fields,image:`https://gateway.pinata.cloud/ipfs/${cid}`,showName:true,createdOn:'http://localhost:5173'});
 expect(result.json().image.ipfsUri).toBe(`ipfs://${cid}`);
 expect(result.json().metadata.ipfsUri).toBe(`ipfs://${cid}`);
});
