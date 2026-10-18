/** Explicit, opt-in protocol integration test. Never uses an existing wallet or remote RPC.
 * Start a validator with the official Pump/Pump Fees/Pump AMM dependencies first.
 * AECO_LOCAL_TEST_RPC=http://127.0.0.1:18999 PUMP_LOCAL_GENESIS_HASH=<validator genesis>
 * pnpm --filter @agentic-economy/server exec tsx --conditions=@agentic-economy/source scripts/test-pump-local.ts
 */
import {writeFile} from 'node:fs/promises';
import {AddressLookupTableProgram,Connection,Keypair,Transaction,VersionedTransaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {pumpLaunchInstructions,validateSignedPumpLaunch,PUMP_DOCS_COMMIT,PUMP_SDK_VERSION} from '../src/chain/pump-builder.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
import {sharingConfigPda} from '../src/chain/pump.js';
import {verifyLaunch} from '../src/chain/verify.js';
const url=process.env.AECO_LOCAL_TEST_RPC,expected=process.env.PUMP_LOCAL_GENESIS_HASH;
if(!url||!expected)throw new Error('Explicit local RPC and expected local genesis are required');
const address=new URL(url);
if(!['localhost','127.0.0.1','[::1]'].includes(address.hostname)||address.username||address.password)throw new Error('Only an isolated localhost validator is permitted');
const conn=new Connection(url,'confirmed'),genesis=await conn.getGenesisHash();
if(genesis!==expected||genesis==='EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'||genesis==='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw new Error('This is not the specified isolated local genesis');
const creator=Keypair.generate(),mint=Keypair.generate(),platform=Keypair.generate().publicKey,agent=Keypair.generate().publicKey;
const input={launcherWallet:creator.publicKey.toBase58(),mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:'AECO Local Verification',symbol:'AECOTEST',uri:'https://example.com/isolated-protocol-test.json',platformTreasury:platform.toBase58(),agentRewardsTreasury:agent.toBase58()};
const evidence:Record<string,unknown>={network:'isolated-localnet',genesis,officialDocsCommit:PUMP_DOCS_COMMIT,sdk:PUMP_SDK_VERSION,creator:input.launcherWallet,mint:input.mint,platformTreasury:input.platformTreasury,agentTreasury:input.agentRewardsTreasury,metadata:'test-only HTTPS placeholder; not a real Pinata receipt'};
try{
 const faucet=await conn.requestAirdrop(creator.publicKey,2_000_000_000);await conn.confirmTransaction(faucet,'confirmed');
 const instructions=await pumpLaunchInstructions(input),keys=[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 const [create,lookupAddress]=AddressLookupTableProgram.createLookupTable({authority:creator.publicKey,payer:creator.publicKey,recentSlot:await conn.getSlot('finalized')});
 const lookupSignatures:string[]=[];
 for(let n=0;n<keys.length;n+=20){const tx=new Transaction();if(n===0)tx.add(create);tx.add(AddressLookupTableProgram.extendLookupTable({authority:creator.publicKey,payer:creator.publicKey,lookupTable:lookupAddress,addresses:keys.slice(n,n+20)}));lookupSignatures.push(await sendAndConfirmTransaction(conn,tx,[creator],{commitment:'confirmed'}));}
 const lookup=(await conn.getAddressLookupTable(lookupAddress)).value;if(!lookup)throw new Error('Local lookup table is missing');
 for(let n=0;n<30&&(await conn.getSlot())<=lookup.state.lastExtendedSlot;n++)await new Promise(r=>setTimeout(r,100));
 const gateway=new SolanaRpcChain(url,{enabled:true,lookupTable:lookupAddress.toBase58(),localGenesisHash:genesis,cluster:'localnet'});
 const built=await gateway.buildLaunchTransaction(input);
 const signed=VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'));signed.sign([creator]);await validateSignedPumpLaunch(built.transaction,Buffer.from(signed.serialize()).toString('base64'));
 const simulation=await conn.simulateTransaction(signed,{sigVerify:true,commitment:'confirmed'});evidence.simulation={err:simulation.value.err,unitsConsumed:simulation.value.unitsConsumed};
 if(simulation.value.err)throw new Error('Local program simulation failed; nothing submitted');
 const signature=await conn.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:20});evidence.signature=signature;
 const confirmation=await conn.confirmTransaction({blockhash:signed.message.recentBlockhash,lastValidBlockHeight:built.lastValidBlockHeight!,signature},'confirmed');if(confirmation.value.err)throw new Error('Local launch failed on-chain');
 const chain=new SolanaRpcChain(url);let observed=await chain.getTransaction(signature);
 for(let n=0;n<20&&!observed;n++){await new Promise(r=>setTimeout(r,100));observed=await chain.getTransaction(signature);}
 const routing=await chain.getFeeRoutingState(input.mint);
 const verification=verifyLaunch({launcherWallet:input.launcherWallet,mint:input.mint,platformTreasury:input.platformTreasury,agentRewardsTreasury:input.agentRewardsTreasury,sharingConfig:sharingConfigPda(input.mint),preparedMessageBase64:Buffer.from(signed.message.serialize()).toString("base64"),draft:{name:input.name,symbol:input.symbol,metadataUri:input.uri}},observed,routing);
 evidence.verification=verification;evidence.observed=observed;evidence.routing=routing;evidence.lookupSignatures=lookupSignatures;evidence.packetBytes=Buffer.from(built.transaction,'base64').length;
 const mintAccount=await conn.getAccountInfo(mint.publicKey);evidence.mintOwner=mintAccount?.owner.toBase58();
 if(verification.outcome!=='confirmed'||mintAccount?.owner.toBase58()!=='TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb')throw new Error('Authoritative local token verification failed');
 try{const duplicate=await conn.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:2});if(duplicate!==signature)throw new Error('Duplicate broadcast changed the signature');evidence.duplicate='same signature';}catch(error){if(error instanceof Error&&/already been processed/.test(error.message))evidence.duplicate='RPC rejected already-processed transaction';else throw error;}
 evidence.platformBalance=await conn.getBalance(platform);
 if(evidence.platformBalance!==50_000_000)throw new Error('Platform charge is not exactly 0.05 local SOL');
 evidence.result='passed';console.log(JSON.stringify({network:evidence.network,signature,mint:input.mint,verification:verification.outcome,packetBytes:evidence.packetBytes,platformBalance:evidence.platformBalance}));
}catch(error){evidence.result='failed';evidence.error=error instanceof Error?error.message:String(error);console.error(evidence.error);process.exitCode=1;}
finally{const path=process.env.AECO_LOCAL_TEST_EVIDENCE;if(path)await writeFile(path,JSON.stringify(evidence,(_key,value)=>typeof value==='bigint'?value.toString():value,2),{mode:0o600});}
