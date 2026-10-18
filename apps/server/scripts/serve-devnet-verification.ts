/** Explicit operator-started verification server; never imported by the deployment entrypoint. */
import pg from 'pg';
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
const check=new pg.Pool({connectionString:database});try{if((await check.query('SELECT current_database() AS name')).rows[0].name!=='aeco_launch_execution_20261018_test')throw Error('Unexpected disposable database');}finally{await check.end();}
const config=loadConfig({DATABASE_URL:database,MODE:'devnet',ROLE:'all',SOLANA_RPC_URL:rpc,SOLANA_CLUSTER:'devnet',PUMP_LAUNCH_ENABLED:'true',FEE_ROUTING_VERIFIED:'true',PUMP_LAUNCH_LOOKUP_TABLE:lookup,PLATFORM_TREASURY:platform,AGENT_REWARDS_TREASURY:agent,PINATA_JWT:process.env.PINATA_JWT,AUTH_URI:origin,AUTH_DOMAIN:'localhost:5187',CORS_ORIGINS:origin,HOST:'127.0.0.1',PORT:'8797',WORLD_SEED:'local-launch-protocol-verification',SIM_AUTOSTART:'true',LOG_LEVEL:'silent'});
// The exact previously approved disposable database is fixed above; no database URL is inherited.
const ctx=await createContext(config),app=await buildApp(ctx);await app.listen({host:'127.0.0.1',port:8797});ctx.runtime.start();
console.log(JSON.stringify({verification:'public-devnet only',url:origin+'/#launchpad',database:'aeco_launch_execution_20261018_test',platformTreasury:platform,agentTreasury:agent,launchCharge:'0.05 DEVNET SOL',rpc}));
let closing=false;const stop=async()=>{if(closing)return;closing=true;await app.close();await ctx.close();process.exit(0);};process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
