/** Read-only public snapshot inspection. No signing, uploads, RPC or submission. */
import {readFileSync,writeFileSync} from 'node:fs';
import {AddressLookupTableAccount,AddressLookupTableProgram,PublicKey,Keypair} from '@solana/web3.js';
import {OFFICIAL_TREASURIES,devBuyTokenAmount} from '@agentic-economy/shared';
import sdk from '../src/chain/pump-sdk.cjs';
import {buildUnsignedPumpLaunch,unsignedPumpLaunchInstructions} from '../src/chain/pump-builder.js';
import {MAINNET_GENESIS,PLANNED_AECO_MINT} from '../src/chain/offline-mint.js';
const snapshot=JSON.parse(readFileSync(process.argv[2]!,'utf8'));
if(snapshot.genesis!==MAINNET_GENESIS)throw Error('Wrong network snapshot');
const [g,f,t]=snapshot.accounts.value;
if(g.owner!==sdk.PUMP_PROGRAM_ID.toBase58()||f.owner!==sdk.PUMP_FEE_PROGRAM_ID.toBase58()||t.owner!==AddressLookupTableProgram.programId.toBase58())throw Error('Wrong account owners');
const global=sdk.PUMP_SDK.decodeGlobal({data:Buffer.from(g.data[0],'base64')} as never),feeConfig=sdk.PUMP_SDK.decodeFeeConfig({data:Buffer.from(f.data[0],'base64')} as never);
const table=new AddressLookupTableAccount({key:new PublicKey(snapshot.keys[2]),state:AddressLookupTableAccount.deserialize(Buffer.from(t.data[0],'base64'))});
if(!table.isActive()||table.state.authority)throw Error('Mainnet table must be active and frozen');
// Owner selected 1%; this calculation does not modify any draft or default.
const totalSupply=BigInt(global.tokenTotalSupply.toString()),tokens=devBuyTokenAmount(totalSupply,100),BN=global.tokenTotalSupply.constructor;
const cost=BigInt(sdk.getBuySolAmountFromTokenAmount({global,feeConfig,mintSupply:null,bondingCurve:null,amount:new BN(tokens.toString()),quoteMint:sdk.normalizeQuoteMint(undefined)}).toString());
const maximum=cost+(cost*100n+9999n)/10000n;
let capacity:{fits:boolean;bytes?:number;error?:string};
try{const built=await buildUnsignedPumpLaunch({mint:PLANNED_AECO_MINT,launcherWallet:OFFICIAL_TREASURIES.aecoDeployer,
 platformTreasury:OFFICIAL_TREASURIES.platform,agentRewardsTreasury:OFFICIAL_TREASURIES.agentRewards,name:'Agentic Economy',symbol:'AECO',
 // Capacity placeholder only: never pinned, saved to a draft or represented as final metadata.
 uri:'https://example.invalid/not-approved-aeco-metadata.json',devBuy:{tokenAmount:tokens,maxQuoteCost:maximum}},snapshot.latest.blockhash,[table],global);capacity={fits:true,bytes:built.bytes};}
catch(e){capacity={fits:false,error:(e as Error).message};}
const sample=async()=>{const a={mint:Keypair.generate().publicKey.toBase58(),launcherWallet:Keypair.generate().publicKey.toBase58(),platformTreasury:Keypair.generate().publicKey.toBase58(),agentRewardsTreasury:Keypair.generate().publicKey.toBase58(),name:'N'.repeat(32),symbol:'S'.repeat(13),uri:'ipfs://b'+'a'.repeat(58),devBuy:{tokenAmount:1n,maxQuoteCost:1n}};return unsignedPumpLaunchInstructions(a,global);};
const a=await sample(),b=await sample(),all=(ix:typeof a)=>new Set(ix.flatMap(i=>i.keys.map(k=>k.pubkey.toBase58()))),bk=all(b),programs=new Set([...a,...b].map(i=>i.programId.toBase58()));
const protocolRecipients=[global.feeRecipient,...global.feeRecipients,...(global.buybackFeeRecipients??[])].map((k:PublicKey)=>k.toBase58()).filter((k:string)=>k!=='11111111111111111111111111111111');
const required=new Set([...[...all(a)].filter(k=>bk.has(k)&&!programs.has(k)),...protocolRecipients]),present=new Set(table.state.addresses.map(k=>k.toBase58())),missing=[...required].filter(k=>!present.has(k));
const out={checkedAt:new Date().toISOString(),snapshotAt:snapshot.checkedAt,slot:snapshot.accounts.context.slot,network:'mainnet-beta',mint:PLANNED_AECO_MINT,
 publicSnapshotOnly:true,tokenProgram:'Token-2022',protocolTokenSupplyRaw:totalSupply.toString(),protocolDecimals:6,ownerSupplyApproval:false,
 developerBuyBps:100,developerBuyTokensRaw:tokens.toString(),estimatedBuyLamportsIncludingProtocolFees:cost.toString(),maxBuyLamports:maximum.toString(),
 platformChargeLamports:'50000000',totalWalletDebit:null,totalDebitReason:'Final owner-entered metadata, funded-payer simulation and rent/network fees still required',
 lookupTable:table.key.toBase58(),existingDevBuyCoverageGuardPasses:missing.length===0,missingRequiredLookupAccounts:missing,capacity,placeholderMetadataOnly:true,userDraftsModified:0,transactionsSigned:0,transactionsBroadcast:0};
if(process.argv[3])writeFileSync(process.argv[3],JSON.stringify(out,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(out,null,2));
