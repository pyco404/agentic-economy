/** Controlled staging upload check. Fresh ephemeral signer for message auth ONLY; no chain wallet transaction. */
import {writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import sharp from 'sharp';
import {z} from 'zod';
import {HealthResponse,LaunchpadCapabilities,ChallengeResponse,WalletIdentity,SavedLaunchDraft} from '@agentic-economy/shared';
const site='https://staging.useaeco.xyz',base='https://api-staging.useaeco.xyz';
const signer=nacl.sign.keyPair(),wallet=bs58.encode(signer.publicKey);let cookie='',draftId='',version=0;
const evidence:Record<string,unknown>={checkedAt:new Date().toISOString(),environment:'Railway staging',authentication:'generated ephemeral message signer, not physical Phantom',financialExecution:'not requested',wallet};
async function request(path:string,method='GET',body?:unknown,key?:string){
 const bytes=Buffer.isBuffer(body);
 const response=await fetch(base+path,{method,headers:{Origin:site,...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':bytes?'application/octet-stream':'application/json'}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:bytes?body:JSON.stringify(body),signal:AbortSignal.timeout(30_000)});
 const cookies=response.headers.getSetCookie();if(cookies.length)cookie=cookies.map(v=>v.split(';')[0]).join('; ');
 if(!response.ok)throw Error('Staging request failed: HTTP '+response.status+' for '+method+' '+path.replace(/\?.*/,''));
 return response.json();
}
try{
 const health=HealthResponse.parse(await request('/healthz'));assert.equal(health.mode,'demo');assert.equal(health.financialFeaturesEnabled,false);
 const caps=LaunchpadCapabilities.parse(await request('/api/v1/launchpad/capabilities'));assert.equal(caps.launchEnabled,false);assert.equal(caps.uploads,true);
 const challenge=ChallengeResponse.parse(await request('/api/v1/auth/challenge','POST',{wallet}));assert(challenge.message.startsWith(new URL(site).host+' wants you to sign in'));
 await request('/api/v1/auth/browser/verify','POST',{wallet,nonce:challenge.nonce,signature:bs58.encode(nacl.sign.detached(new TextEncoder().encode(challenge.message),signer.secretKey))});
 assert.equal(WalletIdentity.parse(await request('/api/v1/auth/browser/session')).wallet,wallet);
 const draft=SavedLaunchDraft.parse(await request('/api/v1/launchpad/drafts','POST',{name:'Phase2Verification',symbol:'AECOCHK',description:'Controlled staging upload verification. Not a launched token.',quoteAsset:'SOL',devBuyBps:0},randomUUID()));draftId=draft.id;version=draft.version;
 const image=await sharp({create:{width:16,height:16,channels:4,background:{r:47,g:80,b:61,alpha:0.75}}}).png().toBuffer();
 const uploadKey=randomUUID(),uploaded=SavedLaunchDraft.parse(await request(`/api/v1/launchpad/drafts/${draftId}/logo?version=${version}`,'POST',image,uploadKey));
 const replay=SavedLaunchDraft.parse(await request(`/api/v1/launchpad/drafts/${draftId}/logo?version=${version}`,'POST',image,uploadKey));assert(replay.image&&uploaded.image);assert.equal(replay.image.cid,uploaded.image.cid);version=uploaded.version;
 evidence.image=uploaded.image;evidence.duplicateImageRequestReusedResult=true;
 const metaKey=randomUUID(),prepared=SavedLaunchDraft.parse(await request(`/api/v1/launchpad/drafts/${draftId}/metadata`,'POST',{version},metaKey));
 const repeated=SavedLaunchDraft.parse(await request(`/api/v1/launchpad/drafts/${draftId}/metadata`,'POST',{version},metaKey));assert(repeated.metadata&&prepared.metadata);assert.equal(repeated.metadata.cid,prepared.metadata.cid);version=prepared.version;evidence.metadata=prepared.metadata;
 const reopened=SavedLaunchDraft.parse(await request(`/api/v1/launchpad/drafts/${draftId}`));assert(reopened.metadata);assert.equal(reopened.metadata.cid,prepared.metadata.cid);assert.equal(reopened.wallet,wallet);
 const review=z.object({readyForNextMilestone:z.boolean(),launchEnabled:z.boolean()}).parse(await request(`/api/v1/launchpad/drafts/${draftId}/review`));assert.equal(review.readyForNextMilestone,true);assert.equal(review.launchEnabled,false);
 evidence.draftPersistenceVerified=true;evidence.reviewVerified=true;evidence.duplicateMetadataRequestReusedResult=true;
 const metadata=await fetch(prepared.metadata.gatewayUrl,{signal:AbortSignal.timeout(30_000)});evidence.metadataGatewayStatus=metadata.status;
 if(metadata.ok){const content=z.object({image:z.string(),name:z.string()}).parse(await metadata.json());assert.equal(content.image,uploaded.image.gatewayUrl);assert.equal(content.name,'Phase2Verification');evidence.metadataArtworkReferenceVerified=true;}
 const artwork=await fetch(uploaded.image.gatewayUrl,{signal:AbortSignal.timeout(30_000)});evidence.imageGatewayStatus=artwork.status;
 if(artwork.ok)assert((await artwork.arrayBuffer()).byteLength>0);
 evidence.result='Actual staging image and metadata upload confirmed; gateway statuses reported separately';
}catch(e){evidence.result='verification incomplete';evidence.error=e instanceof Error?e.message.replace(/https?:\/\/[^\s]+/g,'[URL]'):'Verification failed';}
finally{
 if(draftId)try{await request(`/api/v1/launchpad/drafts/${draftId}`,'DELETE',{version});evidence.testDraftCleanup='Only this newly created test draft deleted';}catch{evidence.testDraftCleanup='Test draft retained after failed cleanup; no other drafts modified';}
 if(cookie)try{await request('/api/v1/auth/browser/logout','POST',{});}catch{ /* Reported verification remains conservative. */ }
 await writeFile(new URL('../docs/evidence/pinata-staging-2026-10-22.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence,null,2));
}
