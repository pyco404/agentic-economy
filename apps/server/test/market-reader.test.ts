import {Connection,PublicKey} from '@solana/web3.js';
import {expect,it,vi} from 'vitest';
import {PUMP_AMM_PROGRAM_ID,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
import {MarketReader} from '../src/chain/market-reader.js';
import sdk from '../src/chain/pump-sdk.cjs';
import captured from './fixtures/aeco-market-mainnet.json' with {type:'json'};
const mint=captured.keys[0]!,account=(i:number)=>{const a=captured.accounts.value[i]!;return {...a,owner:new PublicKey(a.owner),data:Buffer.from(a.data[0]!,'base64')};};
const conn=()=>new Connection('https://unit-test.invalid');
it('decodes real finalized AECO reserves and minted supply without a market-data provider',async()=>{
 const connection=conn();vi.spyOn(connection,'getMultipleAccountsInfoAndContext').mockResolvedValue({context:captured.accounts.context,value:[account(0),account(1),account(2),null]});
 const state=await new MarketReader(connection).state(mint);
 expect(state).toMatchObject({mint,venue:'bonding_curve',decimals:6,supplyRaw:'1000000000000000',baseReserveRaw:captured.expected.virtualTokenReserves,quoteReserveRaw:captured.expected.virtualQuoteReserves,realQuoteRaw:captured.expected.realQuoteReserves});
 expect(state.progressPct).toBeGreaterThan(0);expect(state.progressPct).toBeLessThan(100);
});
async function poolFixture(){
 const connection=conn(),key=new PublicKey(mint),address=sdk.canonicalPumpPoolPda(key),amm=sdk.getPumpAmmProgram(connection);
 const bn=sdk.PUMP_SDK.decodeBondingCurve(account(1)).virtualTokenReserves.constructor as new(v:string)=>unknown;
 const type=amm.idl.types!.find(t=>t.name==='pool')!;
 const fields=(type.type as {fields:Array<{name:string;type:string}>}).fields;
 const values=Object.fromEntries(fields.map(f=>[f.name,f.type==='pubkey'?PublicKey.default:f.type==='bool'?false:['u8','u16','u32'].includes(f.type)?0:new bn('0')]));
 const base=PublicKey.unique(),quote=PublicKey.unique();Object.assign(values,{baseMint:key,quoteMint:new PublicKey(WRAPPED_SOL_MINT),creator:sdk.pumpPoolAuthorityPda(key),poolBaseTokenAccount:base,poolQuoteTokenAccount:quote,virtualQuoteReserves:new bn('-500000000')});
 const pool={...account(1),owner:new PublicKey(PUMP_AMM_PROGRAM_ID),data:await amm.coder.accounts.encode('pool',values)};
 const curve=account(1);curve.data[48]=1;
 const vault=(vaultMint:PublicKey,amount:bigint)=>{const data=Buffer.alloc(165);vaultMint.toBuffer().copy(data,0);address.toBuffer().copy(data,32);data.writeBigUInt64LE(amount,64);data[108]=1;return {...account(0),data};};
 const baseVault=vault(key,1000000000000n),quoteVault=vault(new PublicKey(WRAPPED_SOL_MINT),1000000000n);
 vi.spyOn(connection,'getMultipleAccountsInfoAndContext').mockResolvedValueOnce({context:{slot:10},value:[account(0),curve,account(2),pool]}).mockResolvedValueOnce({context:{slot:11},value:[pool,baseVault,quoteVault]});
 return {connection,pool,baseVault,quoteVault,address};
}
it('discovers canonical PumpSwap after graduation and applies signed virtual reserves without inflating real liquidity',async()=>{
 const f=await poolFixture(),state=await new MarketReader(f.connection).state(mint);
 expect(state).toMatchObject({venue:'pumpswap',address:f.address.toBase58(),progressPct:100,baseReserveRaw:'1000000000000',quoteReserveRaw:'500000000',realQuoteRaw:'1000000000',slot:11});
});
it('rejects a substituted pool vault and a non-program-owned curve',async()=>{
 const f=await poolFixture();PublicKey.unique().toBuffer().copy(f.baseVault.data,0);await expect(new MarketReader(f.connection).state(mint)).rejects.toThrow(/vault/);
 const connection=conn(),curve=account(1);curve.owner=PublicKey.default;vi.spyOn(connection,'getMultipleAccountsInfoAndContext').mockResolvedValue({context:{slot:10},value:[account(0),curve,account(2),null]});await expect(new MarketReader(connection).state(mint)).rejects.toThrow(/curve/);
});
it('keeps completed-curve migration distinct from an available AMM',async()=>{
 const connection=conn(),curve=account(1);curve.data[48]=1;vi.spyOn(connection,'getMultipleAccountsInfoAndContext').mockResolvedValue({context:{slot:10},value:[account(0),curve,account(2),null]});
 expect(await new MarketReader(connection).state(mint)).toMatchObject({venue:'migration_pending',progressPct:100});
});

it('indexes authenticated PumpSwap events once by instruction, ignoring forged event authorities',async()=>{
 const {TransactionMessage,TransactionInstruction}=await import('@solana/web3.js'),{default:bs58}=await import('bs58');
 const connection=conn(),amm=sdk.getPumpAmmProgram(connection),pool=sdk.canonicalPumpPoolPda(new PublicKey(mint));
 const bn=sdk.PUMP_SDK.decodeBondingCurve(account(1)).virtualTokenReserves.constructor as new(v:string)=>unknown;
 const fields=(amm.idl.types!.find(t=>t.name==='buyEvent')!.type as {fields:Array<{name:string;type:string}>}).fields;
 const values=Object.fromEntries(fields.map(f=>[f.name,f.type==='pubkey'?PublicKey.default:f.type==='bool'?false:f.type==='string'?'buy':new bn('0')]));
 Object.assign(values,{pool,user:PublicKey.unique(),baseAmountOut:new bn('1000000'),quoteAmountIn:new bn('10000000')});
 const discriminator=amm.idl.events!.find(e=>e.name==='buyEvent')!.discriminator;
 const payload=Buffer.concat([Buffer.from('e445a52e51cb9a1d','hex'),Buffer.from(discriminator),amm.coder.types.encode('buyEvent',values)]);
 const authority=sdk.PUMP_AMM_EVENT_AUTHORITY_PDA,forger=PublicKey.unique(),program=new PublicKey(PUMP_AMM_PROGRAM_ID);
 const message=new TransactionMessage({payerKey:PublicKey.unique(),recentBlockhash:PublicKey.default.toBase58(),instructions:[new TransactionInstruction({programId:program,keys:[pool,authority,forger].map(pubkey=>({pubkey,isSigner:false,isWritable:false})),data:Buffer.alloc(8)})]}).compileToV0Message();
 const keys=message.staticAccountKeys,ix=(key:PublicKey)=>({programIdIndex:keys.findIndex(k=>k.equals(program)),accounts:[keys.findIndex(k=>k.equals(key))],data:bs58.encode(payload)});
 vi.spyOn(connection,'getSignaturesForAddress').mockResolvedValue([{signature:'unit-test-signature',slot:1,err:null,memo:null,blockTime:100}]);
 vi.spyOn(connection,'getTransaction').mockResolvedValue({slot:1,blockTime:100,transaction:{message,signatures:[]},meta:{err:null,innerInstructions:[{index:0,instructions:[ix(forger),ix(authority)]}]}} as never);
 const page=await new MarketReader(connection).page(mint,pool.toBase58());
 expect(page.trades).toHaveLength(1);expect(page.trades[0]).toMatchObject({venue:'pumpswap',eventIndex:1,tokenAmount:'1000000',quoteAmount:'10000000',side:'buy'});
});
