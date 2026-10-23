import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {AddressLookupTableAccount,Keypair,PublicKey,VersionedTransaction,type AccountInfo} from '@solana/web3.js';
import sdk from '../src/chain/pump-sdk.cjs';
import {quoteTokenBudget} from '../src/chain/dev-buy-budget.js';
import {buildPumpLaunch,buildUnsignedPumpLaunch,unsignedPumpLaunchInstructions,validateSignedPumpLaunch} from '../src/chain/pump-builder.js';
import {coSignReviewedMint,verifyMintSigningArtifact,mintMessageHash,DEVNET_SIGNING_GENESIS} from '../src/chain/offline-mint.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
const captured=JSON.parse(readFileSync(new URL('./fixtures/pump-global-devnet.json',import.meta.url),'utf8'));
const account=(a:{owner:string;dataBase64:string})=>({data:Buffer.from(a.dataBase64,'base64'),owner:new PublicKey(a.owner),executable:false,lamports:1,rentEpoch:0}) as AccountInfo<Buffer>;
const global=sdk.PUMP_SDK.decodeGlobal(account(captured.global)),feeConfig=sdk.PUMP_SDK.decodeFeeConfig(account(captured.feeConfig));
const cap=BigInt(global.tokenTotalSupply.toString())*350n/10000n,BN=global.tokenTotalSupply.constructor;
const cost=(n:bigint)=>n===0n?0n:BigInt(sdk.getBuySolAmountFromTokenAmount({global,feeConfig,mintSupply:null,bondingCurve:null,amount:new BN(n.toString()),quoteMint:sdk.normalizeQuoteMint(undefined)}).toString());
describe('fee-inclusive SOL budget inversion',()=>{
 it('finds the largest affordable allocation with exact protocol rounding',()=>{
  for(const budget of [1n,100n,100000n,1000000n,cost(cap+1n)-1n]){
   const q=quoteTokenBudget(budget,cap,cost);expect(q.overCap).toBe(false);expect(q.tokenAmount).toBeLessThanOrEqual(cap);
   expect(cost(q.tokenAmount)).toBeLessThanOrEqual(budget);expect(cost(q.tokenAmount+1n)).toBeGreaterThan(budget);
  }
 });
 it('rejects one lamport over the boundary, never silently reduces the requested budget',()=>{
  const q=quoteTokenBudget(cost(cap+1n),cap,cost);expect(q.overCap).toBe(true);expect(q.tokenAmount).toBe(0n);
  expect(()=>quoteTokenBudget(0n,cap,cost)).toThrow();
 });
 it('quotes through the real adapter using captured on-chain configuration, without network or transactions',async()=>{
  const a=vi.spyOn(sdk.OnlinePumpSdk.prototype,'fetchGlobal').mockResolvedValue(global),b=vi.spyOn(sdk.OnlinePumpSdk.prototype,'fetchFeeConfig').mockResolvedValue(feeConfig);
  const chain=new SolanaRpcChain('http://127.0.0.1:1');
  // The only connection read outside the two SDK account reads.
  const {Connection}=await import('@solana/web3.js');const slot=vi.spyOn(Connection.prototype,'getSlot').mockResolvedValue(123);
  try{
   const budget=1000000n,q=await chain.quoteDevBuy(0,budget);expect(q.maxQuoteCost).toBe(budget);expect(q.estimatedQuoteCost).toBe(cost(q.tokenAmount));
   expect(q.tokenAmount).toBe(quoteTokenBudget(budget,cap,cost).tokenAmount);expect(q.pumpFees).toBeGreaterThanOrEqual(0n);
   await expect(chain.quoteDevBuy(0,cost(cap+1n))).rejects.toThrow('Maximum permitted budget');
   await expect(chain.quoteDevBuy(0,1n)).rejects.toThrow('too small');
  }finally{a.mockRestore();b.mockRestore();slot.mockRestore();}
 });
 it('keeps a SOL-budget buy atomic through normal and owner-local mint signing with disposable keys',async()=>{
  const [mint,user,platform,rewards]=Array.from({length:4},()=>Keypair.generate());
  const budget=1000000n,allocation=quoteTokenBudget(budget,cap,cost).tokenAmount;
  expect(allocation%(BigInt(global.tokenTotalSupply.toString())/10000n)).not.toBe(0n);
  const input={mint:mint!.publicKey.toBase58(),launcherWallet:user!.publicKey.toBase58(),platformTreasury:platform!.publicKey.toBase58(),agentRewardsTreasury:rewards!.publicKey.toBase58(),name:'Budget signing',symbol:'BUDGET',uri:'https://example.invalid/metadata.json',devBuy:{tokenAmount:allocation,maxQuoteCost:budget}};
  const recipients={feeRecipient:global.feeRecipient.toBase58(),buybackFeeRecipient:global.buybackFeeRecipients[0]!.toBase58()};
  const ix=await unsignedPumpLaunchInstructions(input,global,recipients),addresses=[...new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
  const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses}}),blockhash=Keypair.generate().publicKey.toBase58();
  const normal=await buildPumpLaunch({...input,mintSecretKey:mint!.secretKey},blockhash,[table],global);
  const normalTx=VersionedTransaction.deserialize(Buffer.from(normal.transaction,'base64'));normalTx.sign([user!]);
  await expect(validateSignedPumpLaunch(normal.transaction,Buffer.from(normalTx.serialize()).toString('base64'))).resolves.toBeDefined();
  const built=await buildUnsignedPumpLaunch(input,blockhash,[table],global,recipients),tx=VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'));
  const review={version:1 as const,launchId:'sol-budget-offline-fixture',network:'devnet' as const,genesisHash:DEVNET_SIGNING_GENESIS,...input,devBuy:{tokenAmount:allocation.toString(),maxQuoteCost:budget.toString()},recentBlockhash:blockhash,lastValidBlockHeight:100,maxTotalDebitLamports:'80000000',messageSha256:mintMessageHash(tx),unsignedTransaction:built.transaction,globalAccountBase64:captured.global.dataBase64,protocolFeeRecipients:recipients,lookupTables:[{key:table.key.toBase58(),addresses:addresses.map(k=>k.toBase58())}]};
  const policy={mint:input.mint,deployer:input.launcherWallet,platform:input.platformTreasury,rewards:input.agentRewardsTreasury,network:'devnet' as const};
  const artifact=await coSignReviewedMint(review,policy,review.messageSha256,mint!.secretKey);
  await expect(verifyMintSigningArtifact(review,policy,artifact)).resolves.toEqual(artifact);
  const signed=VersionedTransaction.deserialize(Buffer.from(artifact.transaction,'base64'));expect(signed.signatures[0]!.every(b=>b===0)).toBe(true);signed.sign([user!]);
  await expect(validateSignedPumpLaunch(built.transaction,Buffer.from(signed.serialize()).toString('base64'))).resolves.toBeDefined();
 });

});
