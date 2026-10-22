/** Executes ONLY the owner's two-transaction Devnet approval of 22 October 2026.
 * Fixed mint, disposable payer and test recipients. Never accesses treasury keypairs.
 * Public signature is journaled BEFORE send; an existing attempt blocks new signing.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import bs58 from 'bs58';
import {Connection,Keypair,PublicKey,SystemProgram,TransactionMessage,VersionedTransaction,ComputeBudgetProgram,type TransactionInstruction} from '@solana/web3.js';
import sdk from '../src/chain/pump-sdk.cjs';
import {SolanaRpcChain} from '../src/chain/solana.js';
import {creatorVaultPda,sharingConfigPda} from '../src/chain/pump.js';
import {verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import {PostgresStore} from '../src/store/postgres.js';
import {TreasuryService} from '../src/services/treasury.js';
import {loadConfig} from '../src/config.js';
assert.equal(process.env.AECO_APPROVED_CREATOR_FEE_TEST,'20261022-two-transactions','Explicit two-transaction approval required');
const mint='4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p',payer='49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F';
const platform='GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp',agent='D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs';
const rpc='https://api.devnet.solana.com',database='postgres:///aeco_launch_execution_20261018_test?host=/var/run/postgresql';
const journalPath=new URL('../../web/artifacts/approved-fee-collection-2026-10-22.json',import.meta.url);
const evidencePath=new URL('../docs/evidence/creator-fee-public-devnet-2026-10-22.json',import.meta.url);
const connection=new Connection(rpc,'finalized'),chain=new SolanaRpcChain(rpc);
assert.equal(await connection.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const pool=new pg.Pool({connectionString:database});
try{
 assert.equal((await pool.query('SELECT current_database() AS n')).rows[0].n,'aeco_launch_execution_20261018_test');
 const applied=new Map((await pool.query('SELECT name,checksum FROM schema_migrations')).rows.map(r=>[r.name,r.checksum]));
 const dir=new URL('../src/store/migrations/',import.meta.url);
 for(const name of(await readdir(dir)).filter(n=>n.endsWith('.sql')))assert.equal(applied.get(name),createHash('sha256').update(await readFile(new URL(name,dir))).digest('hex'),'Unapproved schema change');
}finally{await pool.end();}
const journal:Record<string,unknown>=JSON.parse(await readFile(journalPath,'utf8').catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;return '{}';}));
assert.equal(Object.keys(journal).length,0,'Existing submission journal: reconcile it read-only; do not sign another transaction');
const online=new sdk.OnlinePumpSdk(connection),routing=await chain.getFeeRoutingState(mint);
assert(routing.sharingConfig?.adminRevoked);assert.equal(routing.sharingConfig.shareholders.length,2);
assert(routing.sharingConfig.shareholders.some(h=>h.address===agent&&h.shareBps===6000));assert(routing.sharingConfig.shareholders.some(h=>h.address===platform&&h.shareBps===4000));
const minimum=await online.getMinimumDistributableFee(new PublicKey(mint),new PublicKey(payer),{payer:new PublicKey(payer)});
assert.equal(minimum.distributableFees.toString(10),'25887','Accrual changed; stop');
assert.equal(await connection.getMinimumBalanceForRentExemption(0),650240,'Funding amount changed');
assert.equal(await connection.getBalance(new PublicKey(agent),'finalized'),0,'Recipient already funded; stop rather than repeat transfer');
const keyPath='/home/pikoo/Desktop/agentic-economy/.backups/private-devnet-verification/.env.developer-buy-test-20261020.keypair.json';
assert.equal((await stat(keyPath)).mode&0o077,0,'Disposable test key permissions are too broad');
const signer=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(keyPath,'utf8'))));assert.equal(signer.publicKey.toBase58(),payer);
const initialBalance=await connection.getBalance(signer.publicKey,'finalized');assert(initialBalance>700000);
const emit=(stage:string,value:object)=>console.log(JSON.stringify({stage,...value}));
async function submit(label:string,instructions:TransactionInstruction[]){
 const latest=await connection.getLatestBlockhash('finalized');
 const message=new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:latest.blockhash,instructions}).compileToV0Message();
 assert.equal((await connection.getFeeForMessage(message,'finalized')).value,5000,'Network fee changed');
 const tx=new VersionedTransaction(message),sim=await connection.simulateTransaction(tx,{sigVerify:false,commitment:'finalized'});assert.equal(sim.value.err,null,'Simulation failed');
 tx.sign([signer]);const signature=bs58.encode(tx.signatures[0]!);
 journal[label]={signature,blockhash:latest.blockhash,lastValidBlockHeight:latest.lastValidBlockHeight,status:'signed-before-send'};
 await writeFile(journalPath,JSON.stringify(journal,null,2)+'\n',{mode:0o600});emit(label+'_prepared',{signature});
 const sent=await connection.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:0});assert.equal(sent,signature);
 emit(label+'_submitted',{signature});
 const confirmation=await connection.confirmTransaction({signature,...latest},'finalized');assert.equal(confirmation.value.err,null);
 journal[label]={signature,status:'finalized'};await writeFile(journalPath,JSON.stringify(journal,null,2)+'\n',{mode:0o600});return signature;
}
const fundingSignature=await submit('funding',[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:new PublicKey(agent),lamports:650240})]);
assert.equal(await connection.getBalance(new PublicKey(agent),'finalized'),650240);
const ready=await online.getMinimumDistributableFee(new PublicKey(mint),signer.publicKey,{payer:signer.publicKey});
assert(ready.canDistribute);assert.equal(ready.distributableFees.toString(10),'25887');
const distribution=await online.buildDistributeCreatorFeesInstructions(new PublicKey(mint),{payer:signer.publicKey});assert.equal(distribution.sweepCount,0);assert.equal(distribution.isGraduated,false);
const addresses=[agent,platform,creatorVaultPda(sharingConfigPda(mint)),payer];
const before=await connection.getMultipleAccountsInfo(addresses.map(a=>new PublicKey(a)),'finalized');
const latest=await connection.getLatestBlockhash('finalized');const ixs=[ComputeBudgetProgram.setComputeUnitLimit({units:500000}),...distribution.instructions];
const simulation=await connection.simulateTransaction(new VersionedTransaction(new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:latest.blockhash,instructions:ixs}).compileToV0Message()),{sigVerify:false,commitment:'finalized',accounts:{encoding:'base64',addresses}});
assert.equal(simulation.value.err,null);
assert.deepEqual(simulation.value.accounts!.map((a,i)=>a!.lamports-before[i]!.lamports),[15532,10354,-25886,-5000]);
const signature=await submit('distribution',ixs);
const observed=await chain.getTransaction(signature);assert(observed);assert.equal(observed.commitment,'finalized');
const verified=verifiedCreatorDistribution(observed,platform,agent);assert.equal(verified.total,25886n);assert.equal(verified.dust,1n);assert(verified.dust!==null);
const finalBalance=await connection.getBalance(signer.publicKey,'finalized');assert.equal(initialBalance-finalBalance,660240);assert(initialBalance-finalBalance<=700000);
const config=loadConfig({MODE:'devnet',ROLE:'api',DATABASE_URL:database,SOLANA_RPC_URL:rpc,SOLANA_CLUSTER:'devnet',PLATFORM_TREASURY:platform,AGENT_REWARDS_TREASURY:agent,SIM_AUTOSTART:'false',LOG_LEVEL:'silent'});
let store=await PostgresStore.connect(database);
let ingested:unknown,duplicates:unknown;
try{
 const community=await store.getCommunityByMint(mint);assert(community);
 const treasury=new TreasuryService(store,config);ingested=await treasury.ingestCreatorFeeDistribution(observed,[community]);
 assert.equal((ingested as {accepted:boolean}).accepted,true);assert.equal((ingested as {inserted:unknown[]}).inserted.length,2);
 duplicates=await Promise.all([treasury.ingestCreatorFeeDistribution(observed,[community]),treasury.ingestCreatorFeeDistribution(observed,[community])]);
 assert((duplicates as {inserted:unknown[]}[]).every(r=>r.inserted.length===0));
}finally{await store.close();}
store=await PostgresStore.connect(database);let persisted;
try{persisted=(await store.pool.query('SELECT stream,account,finality,doc FROM treasury_entries WHERE signature=$1 ORDER BY account',[signature])).rows;assert.equal(persisted.length,2);assert(persisted.every(r=>r.finality==='finalized'&&r.stream==='creator_fee'));}finally{await store.close();}
const report={network:'public-devnet',checkedAt:new Date().toISOString(),approval:'Owner approved these two transactions only',mint,payer,funding:{signature:fundingSignature,amountLamports:'650240',recipient:agent,classification:'test rent prefunding, excluded from creator-fee income'},distribution:{signature,slot:observed.slot,finality:observed.commitment,totalLamports:verified.total.toString(),dustLamports:verified.dust.toString(),payouts:verified.payouts.map(p=>({...p,amount:p.amount.toString()}))},totalPayerCostLamports:(initialBalance-finalBalance).toString(),networkFeesLamports:'10000',platformLaunchCharge:'none',ingested,duplicates,persisted,
 limits:'Existing pre-graduation SOL earned fees only; no new trade, launch, Mainnet, production or Railway change. Post-graduation/sweep public-network coverage is not established by this distribution.'};
await writeFile(evidencePath,JSON.stringify(report,null,2)+'\n');emit('verified',report);
