/** Explicit operator-started verification server; never imported by the deployment entrypoint. */
import pg from 'pg';
import {readdir,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ChainFeatureUnavailable} from '../src/chain/types.js';
import {Connection,PublicKey} from '@solana/web3.js';
import {loadConfig} from '../src/config.js';
import {createContext} from '../src/context.js';
import {buildApp} from '../src/http/app.js';
if(process.env.AECO_MANUAL_DEVNET_VERIFICATION!=='true')throw Error('Explicit manual devnet verification approval required');
const rpc='https://api.devnet.solana.com',genesis='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',origin='http://localhost:5187';
const lookup=process.env.AECO_DEVNET_VERIFICATION_LOOKUP_TABLE,platform=process.env.AECO_DEVNET_VERIFICATION_PLATFORM,agent=process.env.AECO_DEVNET_VERIFICATION_AGENT;
if(!lookup||!platform||!agent||!process.env.PINATA_JWT)throw Error('Dedicated devnet lookup, public test treasury addresses and server-only Pinata credential required');
if(new Set([lookup,platform,agent]).size!==3)throw Error('Test roles must be distinct');
const c=new Connection(rpc,'confirmed');if(await c.getGenesisHash()!==genesis)throw Error('Unexpected network; refusing to start');
const table=(await c.getAddressLookupTable(new PublicKey(lookup))).value;if(!table||table.state.deactivationSlot!==2n**64n-1n)throw Error('Active devnet lookup table required');
const database='postgres:///aeco_launch_execution_20261018_test?host=/var/run/postgresql';
const check=new pg.Pool({connectionString:database});try{
 await check.query('BEGIN READ ONLY');
 if((await check.query('SELECT current_database() AS name')).rows[0].name!=='aeco_launch_execution_20261018_test')throw Error('Unexpected disposable database');
 const applied=new Map((await check.query<{name:string;checksum:string|null}>('SELECT name,checksum FROM schema_migrations')).rows.map(r=>[r.name,r.checksum]));
 const migrations=new URL('../src/store/migrations/',import.meta.url);
 for(const name of (await readdir(migrations)).filter(n=>n.endsWith('.sql'))){
  const sum=createHash('sha256').update(await readFile(new URL(name,migrations))).digest('hex');
  if(applied.get(name)!==sum)throw Error('Test database requires a separately approved migration or checksum review; refusing startup');
 }
 await check.query('ROLLBACK');
}finally{await check.end();}
const config=loadConfig({DATABASE_URL:database,MODE:'devnet',ROLE:'all',SOLANA_RPC_URL:rpc,SOLANA_CLUSTER:'devnet',PUMP_LAUNCH_ENABLED:'true',FEE_ROUTING_VERIFIED:'true',PUMP_LAUNCH_LOOKUP_TABLE:lookup,PLATFORM_TREASURY:platform,AGENT_REWARDS_TREASURY:agent,PINATA_JWT:process.env.PINATA_JWT,AUTH_URI:origin,AUTH_DOMAIN:'localhost:5187',CORS_ORIGINS:origin,HOST:'127.0.0.1',PORT:'8797',WORLD_SEED:'local-launch-protocol-verification',SIM_AUTOSTART:'true',LOG_LEVEL:'silent'});
// The exact previously approved disposable database is fixed above; no database URL is inherited.
const ctx=await createContext(config);
// Preparation and simulations are allowed; broadcasting requires a distinct manual acceptance approval.
const broadcastsApproved=process.env.AECO_DEVNET_WALLET_TRANSACTIONS_APPROVED==='true';
if(!ctx.chain.submitLaunchTransaction)throw Error('Devnet transaction submission adapter is unavailable');
const submit=ctx.chain.submitLaunchTransaction.bind(ctx.chain);
ctx.chain.assertLaunchSubmissionAllowed=async()=>{if(!broadcastsApproved)throw new ChainFeatureUnavailable('verification_approval_required','Devnet wallet transaction approval is still pending. Nothing was broadcast.');};
ctx.chain.submitLaunchTransaction=async transaction=>{
 if(!broadcastsApproved)throw new ChainFeatureUnavailable('verification_approval_required','Devnet wallet transaction approval is still pending. Nothing was broadcast.');
 return submit(transaction);
};
const app=await buildApp(ctx);await app.listen({host:'127.0.0.1',port:8797});ctx.runtime.start();
console.log(JSON.stringify({verification:'public-devnet only',url:origin+'/launchpad',walletBroadcastsApproved:broadcastsApproved,developerBuy:await ctx.chain.devBuySupport?.(),database:'aeco_launch_execution_20261018_test',platformTreasury:platform,agentTreasury:agent,launchCharge:'0.05 DEVNET SOL',rpc}));
let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();await ctx.close();process.exit(0);};process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
