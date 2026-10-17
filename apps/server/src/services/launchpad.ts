import { createHash, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DraftFields, DraftImage, DraftReview, IpfsAsset, SavedLaunchDraft, type DraftFields as Fields } from '@agentic-economy/shared';
import type { AppConfig } from '../config.js';
import type { LaunchpadStore } from '../store/launchpad.js';
import { AppError } from '../util/errors.js';
import type { z } from 'zod';
export interface Pinning { pin(bytes:Uint8Array,mime:string,name:string):Promise<z.infer<typeof IpfsAsset>>; }
export class PinataPinning implements Pinning {
 constructor(private config:AppConfig['pinata']){}
 async pin(bytes:Uint8Array,mime:string,name:string){
  if(!this.config.jwt)throw new AppError('feature_disabled','IPFS uploads are not configured for this deployment');
  const form=new FormData();form.set('network','public');form.set('file',new Blob([Uint8Array.from(bytes)],{type:mime}),name);form.set('name',name);
  let response:Response;try{response=await fetch('https://uploads.pinata.cloud/v3/files',{method:'POST',headers:{Authorization:`Bearer ${this.config.jwt}`},body:form,signal:AbortSignal.timeout(45000)});}catch{throw new AppError('unavailable','Pinata upload interrupted or timed out. Retry safely.');}
  if(!response.ok)throw new AppError('unavailable','Pinata could not accept this upload. Please retry later.');
  try{const {data}=await response.json() as {data:{cid:string}};const gateway=new URL(this.config.gateway);if(gateway.protocol!=='https:'||gateway.username||gateway.password)throw new Error();return IpfsAsset.parse({cid:data.cid,ipfsUri:`ipfs://${data.cid}`,gatewayUrl:`${gateway.origin}/ipfs/${data.cid}`});}catch{throw new AppError('unavailable','Pinata returned an invalid upload receipt');}
 }
}
const required=DraftFields.refine(f=>!!f.name&&!!f.symbol,'Token name and symbol are required');
const digest=(v:unknown)=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(v)).digest('hex');
export class LaunchpadService {
 private decoding=0;
 constructor(readonly store:LaunchpadStore,private config:AppConfig,private pinning:Pinning=new PinataPinning(config.pinata)){}
 async operation<T>(wallet:string,key:string,kind:string,content:unknown,work:()=>Promise<T>):Promise<T>{const claim=await this.store.claim(wallet,key,kind,digest(content));if(claim.replayed)return claim.result as T;try{const out=await work();await this.store.finish(wallet,key,kind,out);return out;}catch(e){await this.store.finish(wallet,key,kind,null,true);throw e;}}
 create(wallet:string,key:string,fields:Fields){return this.operation(wallet,key,'create',fields,async()=>{
  // Deterministic operation identity also survives a crash between insertion and receipt persistence.
  const h=digest(`${wallet}:${key}`),id=`${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
  const at=new Date().toISOString();await this.store.create(SavedLaunchDraft.parse({id,wallet,version:0,fields,image:null,metadata:null,createdAt:at,updatedAt:at}));return this.store.get(wallet,id);
 });}
 async update(wallet:string,id:string,version:number,fields:Fields){const d=await this.store.get(wallet,id);if(d.version!==version)throw new AppError('conflict','Draft changed. Reload before saving.');const next={...d,fields,metadata:null,version:d.version+1,updatedAt:new Date().toISOString()};await this.store.save(next,version);return next;}
 async image(wallet:string,id:string,version:number,key:string,bytes:Buffer){
  await this.store.get(wallet,id);
  if(!bytes.length||bytes.length>this.config.pinata.maxBytes)throw new AppError('bad_request','Image must be non-empty and within the configured size limit');
  return this.operation(wallet,key,'image',{id,version,sha256:digest(bytes.toString('base64'))},async()=>{
   const d=await this.store.get(wallet,id);if(d.version!==version)throw new AppError('conflict','Draft changed. Reload before uploading.');
   if(!this.config.pinata.jwt)throw new AppError('feature_disabled','IPFS uploads are not configured for this deployment');
   if(this.decoding>=2)throw new AppError('unavailable','Image processing is busy. Retry shortly.');this.decoding++;
   let clean:Buffer,width:number,height:number,mime:'image/png'|'image/jpeg'|'image/webp';
   try{
    const png=[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
    const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
    const webp=bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
    if(!png&&!jpeg&&!webp)throw new Error();
    const image=sharp(bytes,{limitInputPixels:this.config.pinata.maxPixels,failOn:'warning',animated:false});const info=await image.metadata();
    if(!['png','jpeg','webp'].includes(info.format??'')||(info.pages??1)>1||!info.width||!info.height||info.width*info.height>this.config.pinata.maxPixels)throw new Error();
    // Decode and re-encode, dropping metadata/trailing polyglot content. Never upload untrusted originals.
    mime=`image/${info.format}` as typeof mime;width=info.width;height=info.height;
    const decoded=await image.rotate().toFormat(info.format as 'png'|'jpeg'|'webp').toBuffer({resolveWithObject:true});clean=decoded.data;width=decoded.info.width;height=decoded.info.height;
    if(clean.length>this.config.pinata.maxBytes)throw new Error();
   }catch{throw new AppError('bad_request','Invalid, corrupted, animated or oversized image. Choose a PNG, JPEG or WebP.');}finally{this.decoding--;}
   const ref=await this.pinning.pin(clean,mime,`logo-${id}.${mime.split('/')[1]}`);
   const image=DraftImage.parse({...ref,uploadId:randomUUID(),status:'verified',mime,width,height});
   const next={...d,image,metadata:null,version:d.version+1,updatedAt:new Date().toISOString()};await this.store.save(next,version);return next;
  });
 }
 async metadata(wallet:string,id:string,version:number,key:string){
  await this.store.get(wallet,id);
  return this.operation(wallet,key,'metadata',{id,version},async()=>{
   const d=await this.store.get(wallet,id);if(d.version!==version)throw new AppError('conflict','Draft changed. Reload before preparing metadata.');
   required.parse(d.fields);if(!d.image)throw new AppError('bad_request','A backend-verified logo is required');
   const {name,symbol,description,website,twitter,telegram}=d.fields;
   const json={name,symbol,description,image:d.image.ipfsUri,showName:true,createdOn:new URL(this.config.auth.uri).origin,...(website?{website}:{}),...(twitter?{twitter}:{}),...(telegram?{telegram}:{})};
   const metadata=await this.pinning.pin(new TextEncoder().encode(JSON.stringify(json)),'application/json',`metadata-${id}.json`);
   const next={...d,metadata,version:d.version+1,updatedAt:new Date().toISOString()};await this.store.save(next,version);return next;
  });
 }
 async review(wallet:string,id:string){const draft=await this.store.get(wallet,id),issues:string[]=[];if(!draft.fields.name||!draft.fields.symbol)issues.push('Token name and symbol are required');if(!draft.image)issues.push('Upload a verified logo');if(!draft.metadata)issues.push('Generate metadata for the latest saved details');return DraftReview.parse({draft,issues,readyForNextMilestone:!issues.length,launchEnabled:false,launchChargeSol:'0.05'});}
}
