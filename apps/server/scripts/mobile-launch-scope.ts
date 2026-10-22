/** Single owner-approved mobile acceptance transaction. Never imported by production. */
import {createHash} from 'node:crypto';
import {open,readFile,rename} from 'node:fs/promises';
import {VersionedTransaction} from '@solana/web3.js';
import type {AppContext} from '../src/context.js';
import type {BuildLaunchInput,BuiltLaunchTransaction} from '../src/chain/types.js';
export const MOBILE_LAUNCH={wallet:'Aziw8URxK23irkF6VZQrq28HoyyMagxA66jpotBPiiYe',name:'Fold6 Mobile Test',symbol:'FOLD6',bps:200,tokens:'20000000000000',platform:'GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp',agent:'D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs',genesis:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',ceiling:'71000000',network:'10000',rent:'15082520',buy:'5769233',maxBuy:'5826926'} as const;
type Journal={approval:'fold6-mobile-2026-10-22';draftId:string;launchId?:string;mint?:string;messageHash?:string;signedHash?:string};
function fail():never{throw Error('This request differs from the single approved FOLD6 test. Stop for operator review; nothing new is authorized.');}
const digest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export function validateMobileBuild(input:BuildLaunchInput){
 const p=MOBILE_LAUNCH;
 if(input.launcherWallet!==p.wallet||input.name!==p.name||input.symbol!==p.symbol||(input.quoteAsset??'SOL')!=='SOL'||input.quoteMint||input.platformTreasury!==p.platform||input.agentRewardsTreasury!==p.agent||input.devBuy?.tokenAmount.toString()!==p.tokens||input.devBuy.maxQuoteCost.toString()!==p.maxBuy)fail();
}
export function validateMobileCosts(b:BuiltLaunchTransaction){
 const p=MOBILE_LAUNCH;
 if(b.demo||b.genesisHash!==p.genesis||b.estimatedNetworkFeesLamports!==p.network||b.estimatedAccountRentLamports!==p.rent||b.devBuy?.tokenAmount!==p.tokens||b.devBuy.quoteSpent!==p.buy)fail();
 const max=50_000_000n+BigInt(b.estimatedNetworkFeesLamports)+BigInt(b.estimatedAccountRentLamports)+BigInt(p.maxBuy);
 if(max>BigInt(p.ceiling))fail();return max;
}
export async function installMobileLaunchScope(ctx:AppContext,path:string){
 const p=MOBILE_LAUNCH;const state=JSON.parse(await readFile(path,'utf8')) as Journal;
 if(state.approval!=='fold6-mobile-2026-10-22'||!/^[-a-f0-9]{36}$/.test(state.draftId)||ctx.config.solana.cluster!=='devnet'||ctx.config.treasuries.platform!==p.platform||ctx.config.treasuries.agentRewards!==p.agent)fail();
 const save=async()=>{const temp=path+'.next';const f=await open(temp,'w',0o600);try{await f.writeFile(JSON.stringify(state));await f.sync();}finally{await f.close();}await rename(temp,path);};
 let preparing=false;
 const prepare=ctx.launches.prepare.bind(ctx.launches);
 ctx.launches.prepare=async(wallet,draft,owned,quote)=>{
  if(wallet!==p.wallet||draft.name!==p.name||draft.symbol!==p.symbol||owned?.id!==state.draftId||owned.devBuyBps!==p.bps||(quote?.asset??'SOL')!=='SOL'||(state.launchId&&state.launchId!==owned.launchId)||preparing)fail();
  preparing=true;try{state.launchId=owned.launchId;await save();return await prepare(wallet,draft,owned,quote);}finally{preparing=false;}
 };
 const build=ctx.chain.buildLaunchTransaction.bind(ctx.chain);
 ctx.chain.buildLaunchTransaction=async input=>{
  validateMobileBuild(input);if(!state.launchId||(state.mint&&state.mint!==input.mint))fail();
  state.mint=input.mint;await save();const built=await build(input);validateMobileCosts(built);
  const messageHash=digest(VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64')).message.serialize());
  if(state.messageHash&&state.messageHash!==messageHash)fail();state.messageHash=messageHash;await save();return built;
 };
 if(!ctx.chain.submitLaunchTransaction)fail();const submit=ctx.chain.submitLaunchTransaction!.bind(ctx.chain);
 ctx.chain.submitLaunchTransaction=async signed=>{
  const bytes=Buffer.from(signed,'base64'),message=digest(VersionedTransaction.deserialize(bytes).message.serialize()),signedHash=digest(bytes);
  if(!state.messageHash||state.messageHash!==message||(state.signedHash&&state.signedHash!==signedHash))fail();
  state.signedHash=signedHash;await save();return submit(signed);
 };
 return {draftId:state.draftId};
}
