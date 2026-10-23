import bs58 from 'bs58';
import {type Connection,PublicKey} from '@solana/web3.js';
import {PUMP_PROGRAM_ID,PUMP_AMM_PROGRAM_ID,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {bondingCurvePda} from './pump.js';
import sdk from './pump-sdk.cjs';
import {pumpTradesFromInner} from './pump-events.js';
import type {MarketState,MarketTrade,MarketPage} from './market-types.js';

const TOKEN_PROGRAMS=new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA','TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
const EVENT_TAG=Buffer.from('e445a52e51cb9a1d','hex');
const positive=(v:bigint)=>{if(v<0n)throw Error('Invalid market reserves');return v.toString();};
/** Read-only canonical curve/AMM discovery. Provider pool listings never establish identity. */
export class MarketReader{
 constructor(private conn:Connection){}
 async state(mint:string):Promise<MarketState>{
  const key=new PublicKey(mint),curveAddress=bondingCurvePda(mint),poolAddress=sdk.canonicalPumpPoolPda(key);
  const {context,value:[mintAccount,curve,global,pool]}=await this.conn.getMultipleAccountsInfoAndContext([key,new PublicKey(curveAddress),sdk.GLOBAL_PDA,poolAddress],'finalized');
  if(!mintAccount||!TOKEN_PROGRAMS.has(mintAccount.owner.toBase58())||mintAccount.data.length<82||mintAccount.data[45]!==1)throw Error('Invalid market mint');
  const supply=mintAccount.data.readBigUInt64LE(36),decimals=mintAccount.data[44]!;
  if(!curve||curve.owner.toBase58()!==PUMP_PROGRAM_ID||!global||global.owner.toBase58()!==PUMP_PROGRAM_ID)throw Error('Canonical curve unavailable');
  const c=sdk.PUMP_SDK.decodeBondingCurve(curve),g=sdk.PUMP_SDK.decodeGlobal(global);
  if(sdk.normalizeQuoteMint(c.quoteMint).toBase58()!==WRAPPED_SOL_MINT)throw Error('Unsupported market quote');
  const total=BigInt(c.tokenTotalSupply.toString()),initial=BigInt(g.initialRealTokenReserves.toString()),remaining=BigInt(c.realTokenReserves.toString());
  const progress=c.complete?100:initial>0n?Number((initial-(remaining>initial?initial:remaining))*10000n/initial)/100:null;
  const common={mint,slot:context.slot,decimals,supplyRaw:supply.toString(),totalSupplyRaw:total.toString(),progressPct:progress};
  if(!c.complete)return {...common,venue:'bonding_curve',address:curveAddress,baseReserveRaw:positive(BigInt(c.virtualTokenReserves.toString())),quoteReserveRaw:positive(BigInt(c.virtualQuoteReserves.toString())),realBaseRaw:positive(remaining),realQuoteRaw:positive(BigInt(c.realQuoteReserves.toString()))};
  if(!pool)return {...common,venue:'migration_pending',address:curveAddress,baseReserveRaw:'0',quoteReserveRaw:'0',realBaseRaw:'0',realQuoteRaw:'0'};
  if(pool.owner.toBase58()!==PUMP_AMM_PROGRAM_ID||pool.data.length<243)throw Error('Invalid canonical pool');
  // Added fixed-width fields are zero for pre-extension pools. Never truncate a new layout.
  const amm=sdk.getPumpAmmProgram(this.conn),p=amm.coder.accounts.decode('pool',Buffer.concat([pool.data,Buffer.alloc(Math.max(0,400-pool.data.length))]));
  if(!p.baseMint.equals(key)||p.quoteMint.toBase58()!==WRAPPED_SOL_MINT||p.index!==0||!p.creator.equals(sdk.pumpPoolAuthorityPda(key)))throw Error('Canonical pool identity mismatch');
  // Read pool and both vaults together so reserves never mix observations across a trade.
  const aligned=await this.conn.getMultipleAccountsInfoAndContext([poolAddress,p.poolBaseTokenAccount,p.poolQuoteTokenAccount],'finalized');
  const [alignedPool,base,quote]=aligned.value;
  if(!alignedPool||alignedPool.owner.toBase58()!==PUMP_AMM_PROGRAM_ID||!base||!quote)throw Error('Pool vaults unavailable');
  const current=amm.coder.accounts.decode('pool',Buffer.concat([alignedPool.data,Buffer.alloc(Math.max(0,400-alignedPool.data.length))]));
  if(!current.baseMint.equals(key)||current.quoteMint.toBase58()!==WRAPPED_SOL_MINT||!current.poolBaseTokenAccount.equals(p.poolBaseTokenAccount)||!current.poolQuoteTokenAccount.equals(p.poolQuoteTokenAccount))throw Error('Pool changed during read');
  for(const [account,expected] of [[base,key],[quote,new PublicKey(WRAPPED_SOL_MINT)]] as const){if(!TOKEN_PROGRAMS.has(account.owner.toBase58())||account.data.length<165||!new PublicKey(account.data.subarray(0,32)).equals(expected)||!new PublicKey(account.data.subarray(32,64)).equals(poolAddress)||![1,2].includes(account.data[108]!))throw Error('Invalid pool vault');}
  const b=base.data.readBigUInt64LE(64),q=quote.data.readBigUInt64LE(64),effective=q+BigInt(current.virtualQuoteReserves.toString());
  return {...common,slot:aligned.context.slot,venue:'pumpswap',address:poolAddress.toBase58(),baseReserveRaw:positive(b),quoteReserveRaw:positive(effective),realBaseRaw:positive(b),realQuoteRaw:positive(q)};
 }
 async page(mint:string,address:string,before?:string,until?:string,limit=8):Promise<MarketPage>{
  const allowed=[bondingCurvePda(mint),sdk.canonicalPumpPoolPda(new PublicKey(mint)).toBase58()];
  if(!allowed.includes(address))throw Error('Unverified market address');
  const sigs=await this.conn.getSignaturesForAddress(new PublicKey(address),{before,until,limit:Math.min(20,Math.max(1,limit))},'finalized');
  const trades:MarketTrade[]=[];
  for(const sig of sigs){
   if(sig.err)continue;
   const tx=await this.conn.getTransaction(sig.signature,{maxSupportedTransactionVersion:0,commitment:'finalized'});
   if(!tx?.meta||tx.meta.err)throw Error('Finalized trade evidence unavailable; cursor retained');
   if(tx.blockTime==null)throw Error('Trade time unavailable; cursor retained');
   const message=tx.transaction.message,keys=message.getAccountKeys({accountKeysFromLookups:tx.meta.loadedAddresses});
   const beforeEvents=trades.length;
   const instructions=[...message.compiledInstructions,...(tx.meta.innerInstructions??[]).flatMap(g=>g.instructions).map(i=>({programIdIndex:i.programIdIndex,accountKeyIndexes:i.accounts,data:Buffer.from(bs58.decode(i.data))}))];
   const marketProgram=address===allowed[0]?PUMP_PROGRAM_ID:PUMP_AMM_PROGRAM_ID;
   const idl=marketProgram===PUMP_PROGRAM_ID?sdk.pumpIdl:sdk.getPumpAmmProgram(this.conn).idl;
   const discriminators=new Set(idl.instructions.filter((i:{name:string})=>/^(buy|sell)/i.test(i.name)).map((i:{discriminator:number[]})=>Buffer.from(i.discriminator).toString('hex')));
   const expectedTrades=instructions.filter(i=>keys.get(i.programIdIndex)?.toBase58()===marketProgram&&Array.from(i.accountKeyIndexes).some(index=>keys.get(index)?.toBase58()===address)&&discriminators.has(Buffer.from(i.data).subarray(0,8).toString('hex'))).length;
   let eventIndex=0;
   for(const group of tx.meta.innerInstructions??[])for(const ix of group.instructions){
    const program=keys.get(ix.programIdIndex)!.toBase58(),accounts=ix.accounts.map(i=>keys.get(i)!.toBase58());
    const data=Buffer.from(bs58.decode(ix.data));const index=eventIndex++;
    if(program===PUMP_PROGRAM_ID){
     const event=pumpTradesFromInner([{parentIndex:group.index,programId:program,accounts,dataBase64:data.toString('base64')}],mint,group.index)[0];
     if(address===allowed[0]&&event&&event.quoteMint===WRAPPED_SOL_MINT)trades.push({...event,eventIndex:index,venue:'bonding_curve',pool:allowed[0]!,signature:sig.signature,slot:tx.slot,blockTime:tx.blockTime});
    }else if(program===PUMP_AMM_PROGRAM_ID&&accounts[0]===sdk.PUMP_AMM_EVENT_AUTHORITY_PDA.toBase58()&&data.subarray(0,8).equals(EVENT_TAG)){
     const coder=sdk.getPumpAmmProgram(this.conn).coder.events,event=coder.decode(data.subarray(8).toString('base64'));
     if(!event||!['buyEvent','sellEvent'].includes(event.name))continue;
     const e=event.data;
     if(address!==allowed[1]||e.pool.toBase58()!==allowed[1])continue;
     const buy=event.name==='buyEvent';
     trades.push({eventIndex:index,venue:'pumpswap',pool:allowed[1]!,signature:sig.signature,slot:tx.slot,blockTime:tx.blockTime,side:buy?'buy':'sell',user:e.user.toBase58(),tokenAmount:(buy?e.baseAmountOut:e.baseAmountIn).toString(),quoteAmount:(buy?e.quoteAmountIn:e.quoteAmountOut).toString(),quoteMint:WRAPPED_SOL_MINT,creatorFee:e.coinCreatorFee.toString(),protocolFee:e.protocolFee.toString(),buybackFee:(e.buybackFee??0).toString(),timestamp:tx.blockTime});
    }
   }
   if(trades.length-beforeEvents<expectedTrades)throw Error('Trade event missing or unsupported; cursor retained');
  }
  return {trades,signatures:sigs.map(s=>s.signature),oldestTime:sigs.length?Math.min(...sigs.map(s=>s.blockTime??Infinity)):null,exhausted:sigs.length<Math.min(20,Math.max(1,limit))};
 }
}
