import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { solBudgetLamports, DEV_BUY_MAX_BPS, OFFICIAL_TREASURIES, DevBuyQuoteQuery, DevBuyQuote, NewLaunchDraftFields, SavedLaunchDraft, VerifyRequest, TokenLaunch, TxSignature, launchpadPaths } from '@agentic-economy/shared';
import { ChainFeatureUnavailable } from '../chain/types.js';
import type { AppContext } from '../context.js';
import { hashToken } from '../services/auth.js';
import { assertLaunchWalletAllowed, launchWalletAllowed, preparedMintPreparationAllowed } from '../services/launch-permission.js';
import { LaunchpadService } from '../services/launchpad.js';
import { LaunchpadStore } from '../store/launchpad.js';
import { PostgresStore } from '../store/postgres.js';
import { AppError } from '../util/errors.js';
const version=z.object({version:z.number().int().nonnegative()}).strict();
const idOf=(req:FastifyRequest)=>z.object({id:z.string().uuid()}).parse(req.params).id;
/** Cookie-only browser API. Explicit Origin on all mutations provides CSRF protection across allowed sibling origins. */
export async function registerLaunchpad(app:FastifyInstance,ctx:AppContext){
 const executionEnabled=async()=>{if(!ctx.config.pumpLaunch.enabled)return false;try{await ctx.chain.assertLaunchSubmissionAllowed?.();return true;}catch{return false;}};
 const devBuySupport=async(preparationOnly=false)=>{
  if(ctx.config.mode==='demo'||(!preparationOnly&&!await executionEnabled())||!ctx.chain.devBuySupport)return{available:false,reason:'Developer Buy is available only where coin creation is enabled on a verified test network'};
  try{return await ctx.chain.devBuySupport(preparationOnly);}catch{return{available:false,reason:'Developer Buy availability could not be checked. Try again shortly.'};}
 };
 // Network-dependent readiness, checked before any upload: the selected pair and an optional Developer Buy.
 const readiness=async(f:{quoteAsset:'SOL'|'USDC';devBuyBps:number;devBuySol?:string})=>{
  const out:{field:'quoteAsset'|'devBuyBps';code:string;message:string}[]=[];
  if(f.devBuyBps>0||!!f.devBuySol){
   if(f.quoteAsset!=='SOL')out.push({field:'devBuyBps',code:'dev_buy_unavailable',message:'Developer Buy is available for SOL pairs only.'});
   else{const s=await devBuySupport(preparedMintPreparationAllowed(ctx.config,OFFICIAL_TREASURIES.aecoDeployer));if(!s.available)out.push({field:'devBuyBps',code:'dev_buy_unavailable',message:s.reason??'Developer Buy is unavailable on this network.'});
    else if(f.devBuySol){try{const budget=solBudgetLamports(f.devBuySol);if(budget===null||budget===0n||!ctx.chain.quoteDevBuy)throw new Error('Invalid Developer Buy amount');const q=await ctx.chain.quoteDevBuy(0,budget);
      if(q.maxQuoteCost!==budget||q.estimatedQuoteCost>budget||q.tokenAmount<=0n||q.tokenAmount*10_000n>q.totalSupply*BigInt(DEV_BUY_MAX_BPS))throw new Error('Developer Buy exceeds the SOL budget or 3.5% allocation limit');
     }catch(e){out.push({field:'devBuyBps',code:'dev_buy_unavailable',message:e instanceof ChainFeatureUnavailable?e.message:'Developer Buy pricing could not be verified. Try again before uploading.'});}}
   }
  }
  return out;
 };
 const service=new LaunchpadService(new LaunchpadStore(ctx.store instanceof PostgresStore?ctx.store.pool:undefined),ctx.config,undefined,readiness);
 const quoteCache=new Map<string,{at:number;value:DevBuyQuote}>();
 const secure=ctx.config.mode!=='demo'||new URL(ctx.config.auth.uri).protocol==='https:';
 const cookieName=secure?'__Host-aeco_session':'aeco_session';
 const token=(req:FastifyRequest)=>new RegExp(`(?:^|;\\s*)${cookieName}=([A-Za-z0-9_-]{20,200})(?:;|$)`).exec(req.headers.cookie??'')?.[1];
 const cookie=(value:string,seconds:number)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure?'; Secure':''}`;
 const csrf=(req:FastifyRequest)=>{if(!req.headers.origin||!ctx.config.corsOrigins.includes(req.headers.origin))throw new AppError('forbidden','This browser origin is not authorized');};
 const wallet=async(req:FastifyRequest)=>(await ctx.auth.authenticate(`Bearer ${token(req)??''}`)).wallet;
 const key=(req:FastifyRequest)=>z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/).parse(req.headers['idempotency-key']);
 let uploadsInFlight=0;const uploading=new WeakSet<FastifyRequest>();const release=(req:FastifyRequest)=>{if(uploading.delete(req))uploadsInFlight--;};
 let preparationsInFlight=0;const preparing=new WeakSet<FastifyRequest>();
 const releasePreparation=(req:FastifyRequest)=>{if(preparing.delete(req))preparationsInFlight--;};
 app.addHook('onResponse',async(req)=>releasePreparation(req));
 app.addHook('onRequestAbort',async(req)=>{release(req);releasePreparation(req);});
 const hits=new Map<string,{n:number;until:number}>();
 const rate=(req:FastifyRequest,owner:string)=>{const k=`${owner}:${req.routeOptions.url}`,now=Date.now(),r=hits.get(k);if(!r||r.until<now){if(hits.size>10000)for(const [k,v]of hits)if(v.until<now)hits.delete(k);hits.set(k,{n:1,until:now+60000});}else if(++r.n>20)throw new AppError('forbidden','Too many requests. Retry in a minute.');};
 // Infrastructure backpressure is global to this API process, never a wallet quota/cooldown.
 const mutation=async(req:FastifyRequest,reply:FastifyReply)=>{csrf(req);const owner=await wallet(req);if(preparationsInFlight>=ctx.config.launchpadPreparationConcurrency){reply.header('Retry-After','1');throw new AppError('unavailable','Preparation is busy. Retry the same request shortly.',{retryable:true,retryAfterSeconds:1});}preparationsInFlight++;preparing.add(req);return owner;};
 // Match the published launch policy: no per-wallet launch count/cooldown.
 // Bound concurrent execution work while retaining CSRF, wallet ownership,
 // exact-message signatures, server-side idempotency and default-off gates.
 let executionsInFlight=0;
 const executionOwner=async(req:FastifyRequest)=>{csrf(req);const owner=await wallet(req);assertLaunchWalletAllowed(ctx.config,owner);return owner;};
 const execution=async<T>(work:()=>Promise<T>)=>{if(executionsInFlight>=4)throw new AppError('unavailable','Launch processing is busy. Retry the same attempt shortly.');executionsInFlight++;try{return await work();}finally{executionsInFlight--;}};
 app.get(launchpadPaths.capabilities,async(req,reply)=>{reply.header('Cache-Control','no-store');let owner:string|undefined;if(token(req)){try{owner=await wallet(req);}catch{/* Anonymous capabilities never confer launch permission. */}}const permitted=launchWalletAllowed(ctx.config,owner);const preparationEnabled=preparedMintPreparationAllowed(ctx.config,owner);const dev=permitted?await devBuySupport(preparationEnabled):{available:false,reason:'Public coin creation is not open yet.'};return{version:1,authentication:'cookie',uploads:permitted&&!!ctx.config.pinata.jwt,maxBytes:ctx.config.pinata.maxBytes,maxPixels:ctx.config.pinata.maxPixels,storage:ctx.store.kind,launchEnabled:permitted&&await executionEnabled(),preparationEnabled:preparationEnabled||(permitted&&await executionEnabled()),automaticMintSigning:ctx.launches.automaticMintSigningAvailable(owner),quotes:{SOL:'draft',USDC:'planned',AECO:'future'},
  devBuy:{status:dev.available?'available':'unavailable',maxBps:DEV_BUY_MAX_BPS,quoteAssets:['SOL'],reason:dev.reason}};});
 // Public estimate for the form; the transaction itself is re-quoted and simulated at preparation.
 app.get(launchpadPaths.devBuyQuote,async(req,reply)=>{
  reply.header('Cache-Control','no-store');rate(req,req.ip);
  const input=DevBuyQuoteQuery.parse(req.query);
  const bps=input.bps??0,budget=input.sol!==undefined?solBudgetLamports(input.sol)!:undefined,cacheKey=budget===undefined?`bps:${bps}`:`sol:${budget}`;
  const budgetField=budget===undefined?{}:{budgetLamports:budget.toString()};
  let owner:string|undefined;try{owner=await wallet(req);}catch{/* Anonymous price checks never grant preparation rights. */}
  const support=await devBuySupport(preparedMintPreparationAllowed(ctx.config,owner));
  if(!support.available||!ctx.chain.quoteDevBuy)return DevBuyQuote.parse({status:'unavailable',bps,...budgetField,reason:support.reason??'Developer Buy is unavailable on this network'});
  const cached=quoteCache.get(cacheKey);if(cached&&Date.now()-cached.at<15_000)return cached.value;
  let q;try{q=await ctx.chain.quoteDevBuy(bps,budget);}catch(e){return DevBuyQuote.parse({status:'unavailable',bps,...budgetField,reason:e instanceof ChainFeatureUnavailable?e.message:'Developer Buy pricing is temporarily unavailable.'});}
  const value=DevBuyQuote.parse({status:'available',bps,...budgetField,...(q.maxAllowedQuoteCost===undefined?{}:{maxAllowedQuoteCost:q.maxAllowedQuoteCost.toString()}),quoteAsset:'SOL',network:ctx.config.solana.cluster,totalSupply:q.totalSupply.toString(),tokenDecimals:6,tokenAmount:q.tokenAmount.toString(),capTokenAmount:q.capTokenAmount.toString(),
   estimatedQuoteCost:q.estimatedQuoteCost.toString(),pumpFees:q.pumpFees.toString(),maxQuoteCost:q.maxQuoteCost.toString(),priceImpactBps:q.priceImpactBps,slot:q.slot});
  if(quoteCache.size>400)quoteCache.clear();quoteCache.set(cacheKey,{at:Date.now(),value});return value;
 });
 app.post(launchpadPaths.verify,async(req,reply)=>{csrf(req);rate(req,req.ip);const input=VerifyRequest.parse(req.body);const verified=await ctx.auth.verify(input.wallet,input.nonce,input.signature,req.headers.origin);reply.header('Cache-Control','no-store').header('Set-Cookie',cookie(verified.token,ctx.config.auth.sessionTtlSeconds));return verified.identity;});
 app.get(launchpadPaths.session,async(req,reply)=>{reply.header('Cache-Control','no-store');return ctx.auth.authenticate(`Bearer ${token(req)??''}`);});
 app.post(launchpadPaths.logout,async(req,reply)=>{csrf(req);if(token(req))await ctx.store.revokeSession(hashToken(token(req)!));reply.header('Set-Cookie',cookie('',0)).header('Cache-Control','no-store');return{ok:true};});
 app.get(launchpadPaths.drafts,async(req,reply)=>{reply.header('Cache-Control','no-store');return{items:await service.store.list(await wallet(req))};});
 app.post(launchpadPaths.drafts,async(req,reply)=>service.create(await mutation(req,reply),key(req),NewLaunchDraftFields.parse(req.body)));
 const path=launchpadPaths.drafts+'/:id';
 app.get(path,async(req,reply)=>{reply.header('Cache-Control','no-store');return service.store.get(await wallet(req),idOf(req));});
 app.patch(path,async(req,reply)=>{const owner=await mutation(req,reply),body=z.object({version:version.shape.version,fields:NewLaunchDraftFields}).strict().parse(req.body);return service.update(owner,idOf(req),body.version,body.fields);});
 app.delete(path,async(req,reply)=>{const owner=await mutation(req,reply),body=version.parse(req.body);await service.store.remove(owner,idOf(req),body.version);return{ok:true};});
 app.delete(path+'/logo',async(req,reply)=>{const owner=await mutation(req,reply),body=version.parse(req.body);const draft=await service.store.get(owner,idOf(req));const next={...draft,image:null,metadata:null,version:draft.version+1,updatedAt:new Date().toISOString()};await service.store.save(next,body.version);return next;});
 app.post(path+'/metadata',async(req,reply)=>{const owner=await mutation(req,reply);assertLaunchWalletAllowed(ctx.config,owner);const body=version.parse(req.body);return SavedLaunchDraft.parse(await service.metadata(owner,idOf(req),body.version,key(req)));});
 app.get(path+'/review',async(req,reply)=>{reply.header('Cache-Control','no-store');const owner=await wallet(req),review=await service.review(owner,idOf(req));const quoteEnabled=launchWalletAllowed(ctx.config,owner)&&review.draft.fields.quoteAsset==='SOL'&&await executionEnabled();return {...review,launchEnabled:quoteEnabled&&review.readyForNextMilestone,preparationEnabled:(quoteEnabled||preparedMintPreparationAllowed(ctx.config,owner,idOf(req)))&&review.readyForNextMilestone};});
 // Execution consumes only a server-owned, latest-version draft and its pinned assets.
 app.post(path+'/launch',async(req)=>{
  const owner=await executionOwner(req),body=version.parse(req.body),id=idOf(req),requestKey=key(req);
  if(!ctx.config.pumpLaunch.enabled&&!preparedMintPreparationAllowed(ctx.config,owner,id))throw new AppError('feature_disabled','Safe-network launches are disabled');
  const result=await execution(()=>service.operation(owner,requestKey,'launch',{id,version:body.version},async()=>{
   const review=await service.review(owner,id),d=review.draft;
   if(d.version!==body.version)throw new AppError('conflict','Draft changed. Review it again before launching.');
   if(!review.readyForNextMilestone||!d.image||!d.metadata)throw new AppError('bad_request','Save and prepare the token logo and metadata before launching');
   // The quote comes only from the server-owned draft; its mint only from server configuration.
   if(d.fields.quoteAsset!=='SOL')throw new AppError('feature_disabled','Only SOL is supported for new launches');
   const quote={asset:'SOL' as const};
   const launchId='lch_'+createHash('sha256').update(`${owner}:${requestKey}`).digest('hex').slice(0,24);
   return ctx.launches.prepare(owner,{name:d.fields.name,symbol:d.fields.symbol,description:d.fields.description,metadataUri:d.metadata.ipfsUri,imageUri:d.image.gatewayUrl,website:d.fields.website,twitter:d.fields.twitter,telegram:d.fields.telegram},{id,version:d.version,launchId,devBuyBps:d.fields.devBuyBps,devBuySol:d.fields.devBuySol},quote);
  }));
  await ctx.launches.assertPreparedMintAllowed(owner,result.launch.id);
  return result;
 });
 const launchPath='/api/v1/launchpad/launches/:launchId';
 const launchId=(req:FastifyRequest)=>z.object({launchId:z.string().regex(/^lch_[A-Za-z0-9]+$/)}).parse(req.params).launchId;
 app.get(launchPath,async(req,reply)=>{reply.header('Cache-Control','no-store');const owner=await wallet(req),id=launchId(req),query=z.object({signature:TxSignature.optional()}).strict().parse(req.query);return{launch:TokenLaunch.parse(await ctx.launches.refresh(owner,id)),recovery:await ctx.launches.recovery(owner,id),expiredReview:await ctx.launches.expiredReview(owner,id,query.signature)};});
 app.post(launchPath+'/refresh-transaction',async(req,reply)=>{reply.header('Cache-Control','no-store');const owner=await executionOwner(req),body=z.object({messageSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);return execution(()=>ctx.launches.refreshTransaction(owner,launchId(req),body.messageSha256));});
 app.post(launchPath+'/wallet-transaction',async(req,reply)=>{reply.header('Cache-Control','no-store');const owner=await executionOwner(req),body=z.object({messageSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);return execution(()=>ctx.launches.walletTransaction(owner,launchId(req),body.messageSha256));});
 app.get(launchPath+'/signing-window',async(req,reply)=>{reply.header('Cache-Control','no-store');return ctx.launches.signingWindow(await wallet(req),launchId(req));});
 app.get(launchPath+'/mint-review',async(req,reply)=>{reply.header('Cache-Control','no-store');return ctx.launches.localMintReview(await wallet(req),launchId(req));});
 app.post(launchPath+'/mint-review/renew',async(req)=>{const owner=await executionOwner(req),body=z.object({messageSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(req.body);return execution(()=>ctx.launches.renewLocalMintReview(owner,launchId(req),body.messageSha256));});
 app.post(launchPath+'/mint-signature/automatic',async(req,reply)=>{reply.header('Cache-Control','no-store');const owner=await executionOwner(req);z.object({}).strict().parse(req.body);return execution(()=>ctx.launches.automaticMintSignature(owner,launchId(req)));});
 app.post(launchPath+'/mint-signature',async(req)=>{const owner=await executionOwner(req);return execution(()=>ctx.launches.importLocalMintSignature(owner,launchId(req),req.body));});
 app.post(launchPath+'/submit',async(req)=>{const owner=await executionOwner(req),id=launchId(req),body=z.object({transaction:z.string().min(1).max(1644)}).strict().parse(req.body);return{launch:TokenLaunch.parse(await execution(()=>ctx.launches.submit(owner,id,body.transaction))),expiredReview:await ctx.launches.expiredReview(owner,id)};});
 app.post(launchPath+'/resume',async(req)=>{const owner=await executionOwner(req),body=z.object({transaction:z.string().min(1).max(1644).optional()}).strict().parse(req.body);return{launch:TokenLaunch.parse(await execution(()=>ctx.launches.resume(owner,launchId(req),body.transaction)))};});
 // The parser is scoped to image/octet-stream uploads. Authenticate before buffering any body.
 app.addContentTypeParser('application/octet-stream',{parseAs:'buffer',bodyLimit:ctx.config.pinata.maxBytes},(_req,body,done)=>done(null,body));
 app.route({method:'POST',url:path+'/logo',bodyLimit:ctx.config.pinata.maxBytes,
  onRequest:async(req,reply)=>{const owner=await mutation(req,reply);assertLaunchWalletAllowed(ctx.config,owner);if(uploadsInFlight>=2)throw new AppError('unavailable','Uploads are busy. Retry shortly.');uploadsInFlight++;uploading.add(req);},
  onResponse:async(req)=>release(req),
  handler:async(req)=>{const owner=await wallet(req),query=version.parse({version:Number((req.query as {version?:string}).version)});if(!Buffer.isBuffer(req.body))throw new AppError('bad_request','Send a binary image');return SavedLaunchDraft.parse(await service.image(owner,idOf(req),query.version,key(req),req.body));}});
}
