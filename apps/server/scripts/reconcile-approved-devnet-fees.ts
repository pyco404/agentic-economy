/** Read-only chain reconciliation plus idempotent receipts. No private-key access, signing or submission. */
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {Connection,PublicKey} from '@solana/web3.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
import {verifiedCreatorDistribution} from '../src/chain/creator-fees.js';
import {creatorVaultPda,sharingConfigPda} from '../src/chain/pump.js';
import {PostgresStore} from '../src/store/postgres.js';
import {TreasuryService} from '../src/services/treasury.js';
import {loadConfig} from '../src/config.js';
const mint='4PMot5KMVbwR1XE4waWGVoWhax3wXcAUv6E9xapPdy8p',payer='49Y2BZrtXmkKPTphcsx5riMDX4s4uqwC6yDmrprYaX3F';
const platform='GcQFWipjZvpuk2sdJAZ4BwyTMdWTDmfjxWSdw4bTVzvp',agent='D8p7CytykA5Q7vSDGGoCJC6mNyLKXVwiEXLboih2ZHJs';
const fundingSignature='4S4FsX1TWtPSRhF46CHevoH8NupzqhD5WbByR7EqL8LE6dsaTjaKUYYYQq9qkZahjMkDbzM944XeH2geDU4YGJSP';
const signature='CTppmQatgJYhGdbUqzh8xredAi6jNDHgTmJhjkJZZ9AUx5eXRPnpfjdnPC4GAEnY34KtTPsFAJBtTSqx128jFJS';
const rpc='https://api.devnet.solana.com',database='postgres:///aeco_launch_execution_20261018_test?host=/var/run/postgresql';
const connection=new Connection(rpc,'finalized'),chain=new SolanaRpcChain(rpc);
assert.equal(await connection.getGenesisHash(),'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
const funding=await chain.getTransaction(fundingSignature),tx=await chain.getTransaction(signature);assert(funding&&tx);assert.equal(funding.commitment,'finalized');assert.equal(tx.commitment,'finalized');assert.equal(funding.err,null);assert.equal(tx.err,null);
assert.deepEqual(funding.systemTransfers.map(t=>({from:t.from,to:t.to,lamports:t.lamports})),[{from:payer,to:agent,lamports:650240n}]);
const verified=verifiedCreatorDistribution(tx,platform,agent);assert.equal(verified.total,25886n);assert.equal(verified.dust,1n);assert(verified.dust!==null);assert.deepEqual(verified.payouts.map(p=>p.amount),[15532n,10354n]);
assert.equal(-(funding.lamportDeltas[payer]!+tx.lamportDeltas[payer]!),660240n);assert.equal(funding.feeLamports!+tx.feeLamports!,10000n);
const vault=creatorVaultPda(sharingConfigPda(mint)),vaultBalance=await connection.getBalance(new PublicKey(vault),'finalized'),reserve=await connection.getMinimumBalanceForRentExemption(0);
assert.equal(vaultBalance-reserve,1,'Retained vault dust differs from approved simulation');
const pool=new pg.Pool({connectionString:database});
try{
 assert.equal((await pool.query('SELECT current_database() AS n')).rows[0].n,'aeco_launch_execution_20261018_test');
 const applied=new Map((await pool.query('SELECT name,checksum FROM schema_migrations')).rows.map(r=>[r.name,r.checksum]));const dir=new URL('../src/store/migrations/',import.meta.url);
 for(const name of(await readdir(dir)).filter(n=>n.endsWith('.sql')))assert.equal(applied.get(name),createHash('sha256').update(await readFile(new URL(name,dir))).digest('hex'));
}finally{await pool.end();}
const config=loadConfig({MODE:'devnet',ROLE:'api',DATABASE_URL:database,SOLANA_RPC_URL:rpc,SOLANA_CLUSTER:'devnet',PLATFORM_TREASURY:platform,AGENT_REWARDS_TREASURY:agent,SIM_AUTOSTART:'false',LOG_LEVEL:'silent'});
let store=await PostgresStore.connect(database);let first,duplicates,persisted,summary;
try{
 const community=await store.getCommunityByMint(mint);assert(community);const treasury=new TreasuryService(store,config);
 first=await treasury.ingestCreatorFeeDistribution(tx,[community]);assert.equal(first.accepted,true);assert([0,2].includes(first.inserted.length));
 duplicates=await Promise.all([treasury.ingestCreatorFeeDistribution(tx,[community]),treasury.ingestCreatorFeeDistribution(tx,[community])]);assert(duplicates.every(r=>r.accepted&&r.inserted.length===0));
 summary=await treasury.summary(0);
}finally{await store.close();}
store=await PostgresStore.connect(database);
try{
 persisted=(await store.pool.query('SELECT doc FROM treasury_entries WHERE signature=$1 ORDER BY account',[signature])).rows.map(r=>r.doc);
 assert.equal(persisted.length,2);assert(persisted.every(e=>e.finality==='finalized'&&e.stream==='creator_fee'&&e.evidence.source==='solana_rpc'));
 assert.equal((await store.pool.query('SELECT count(*)::int AS n FROM treasury_entries WHERE signature=$1',[fundingSignature])).rows[0].n,0,'Funding must not become fee income');
}finally{await store.close();}
const report={network:'public-devnet',checkedAt:new Date().toISOString(),approval:'Owner approved these two transactions only',mint,payer,
 funding:{signature:fundingSignature,amountLamports:'650240',recipient:agent,classification:'test rent prefunding, excluded from all revenue'},
 distribution:{signature,slot:tx.slot,finality:tx.commitment,eligibleAccruedLamports:'25887',distributedLamports:verified.total.toString(),dustLamports:verified.dust.toString(),vaultBalanceLamports:vaultBalance.toString(),rentReserveLamports:reserve.toString(),payouts:verified.payouts.map(p=>({...p,amount:p.amount.toString()}))},
 totalPayerCostLamports:'660240',networkFeesLamports:'10000',platformLaunchCharge:'none',first,duplicates,persisted,reconciliation:summary.creatorFees.reconciliation,
 limits:'Existing pre-graduation SOL earned fees only. No new trade or token. Public post-graduation/sweep evidence remains separate. No Mainnet, Railway or production mutation. Runtime accounting was fixed and these original signatures reconciled without another transaction.'};
await writeFile(new URL('../docs/evidence/creator-fee-public-devnet-2026-10-22.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
