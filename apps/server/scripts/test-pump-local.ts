/** Explicit, opt-in protocol integration test. Never uses an existing wallet or remote RPC.
 * Start a validator with the official Pump/Pump Fees/Pump AMM dependencies first.
 * AECO_LOCAL_TEST_RPC=http://127.0.0.1:18999 PUMP_LOCAL_GENESIS_HASH=<validator genesis>
 * pnpm --filter @agentic-economy/server exec tsx --conditions=@agentic-economy/source scripts/test-pump-local.ts
 */
import {writeFile} from 'node:fs/promises';
import {AddressLookupTableProgram,Connection,Keypair,Transaction,TransactionMessage,VersionedTransaction,sendAndConfirmTransaction} from '@solana/web3.js';
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
const realMetadata=process.env.AECO_LOCAL_TEST_METADATA_URI;
const input={launcherWallet:creator.publicKey.toBase58(),mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:realMetadata?'AECO Staging Check':'AECO Local Verification',symbol:'AECOTEST',uri:realMetadata??'https://example.com/isolated-protocol-test.json',platformTreasury:platform.toBase58(),agentRewardsTreasury:agent.toBase58()};
const evidence:Record<string,unknown>={network:'isolated-localnet',genesis,officialDocsCommit:PUMP_DOCS_COMMIT,sdk:PUMP_SDK_VERSION,creator:input.launcherWallet,mint:input.mint,platformTreasury:input.platformTreasury,agentTreasury:input.agentRewardsTreasury,metadata:realMetadata??'test-only HTTPS placeholder; not a real Pinata receipt'};
try{
 if(realMetadata){
  if(!/^ipfs:\/\/[A-Za-z0-9]+$/.test(realMetadata))throw new Error('Controlled metadata must be a canonical IPFS URI');
  const response=await fetch(`https://gateway.pinata.cloud/ipfs/${realMetadata.slice(7)}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Controlled public metadata is unavailable');
  const metadata=await response.json() as {name:string;symbol:string;image:string};
  if(metadata.name!==input.name||metadata.symbol!==input.symbol||!metadata.image.startsWith('https://'))throw new Error('Controlled metadata does not match the test token');
  evidence.metadataRetrieved=true;
 }
 const faucet=await conn.requestAirdrop(creator.publicKey,2_000_000_000),funding=await conn.confirmTransaction(faucet,'confirmed');
 if(funding.value.err||await conn.getBalance(creator.publicKey)<2_000_000_000)throw new Error('Local faucet funding failed; no launch submitted');
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
 const parsed=await conn.getParsedAccountInfo(mint.publicKey,'confirmed');
 if(!parsed.value||!('parsed' in parsed.value.data))throw new Error('Mint parsing is unavailable');
 const mintInfo=parsed.value.data.parsed.info as {decimals:number;isInitialized:boolean;supply:string;extensions?:Array<{extension:string;state?:{name?:string;symbol?:string;uri?:string}}>};
 evidence.mintInfo=mintInfo;
 if(mintInfo.decimals!==6||!mintInfo.isInitialized||BigInt(mintInfo.supply)<=0n)throw new Error('Mint initialization or decimals are invalid');
 const metadata=mintInfo.extensions?.find(e=>e.extension==='tokenMetadata')?.state;
 if(metadata?.name!==input.name||metadata.symbol!==input.symbol||metadata.uri!==input.uri)throw new Error('On-chain token metadata differs from preparation');
 try{const duplicate=await conn.sendRawTransaction(signed.serialize(),{skipPreflight:false,maxRetries:2});if(duplicate!==signature)throw new Error('Duplicate broadcast changed the signature');evidence.duplicate='same signature';}catch(error){if(error instanceof Error&&/already been processed/.test(error.message))evidence.duplicate='RPC rejected already-processed transaction';else throw error;}
 evidence.platformBalance=await conn.getBalance(platform);
 if(evidence.platformBalance!==50_000_000)throw new Error('Platform charge is not exactly 0.05 local SOL');
 // Deliberately fail the LAST protocol instruction on this isolated validator.
 // Even though the transfer and create precede it, their state must roll back.
 const rejectedMint=Keypair.generate(),invalid=await pumpLaunchInstructions({...input,mint:rejectedMint.publicKey.toBase58(),mintSecretKey:rejectedMint.secretKey});
 invalid[4]!.data.writeUInt16LE(5999,44); // 5999 + 4000 != 10000: invalid final shares.
 const recent=await conn.getLatestBlockhash('confirmed');
 const bad=new VersionedTransaction(new TransactionMessage({payerKey:creator.publicKey,recentBlockhash:recent.blockhash,instructions:invalid}).compileToV0Message([lookup]));bad.sign([creator,rejectedMint]);
 const rejected=await conn.simulateTransaction(bad,{sigVerify:true,commitment:'confirmed'});
 const failure=rejected.value.err as {InstructionError?:[number,unknown]}|null;
 if(failure?.InstructionError?.[0]!==4)throw new Error('Atomic rollback fixture did not reach the intended final instruction');
 // skipPreflight is restricted to this guarded negative LOCAL execution test.
 const failedSignature=await conn.sendRawTransaction(bad.serialize(),{skipPreflight:true,maxRetries:2});
 const failed=await conn.confirmTransaction({...recent,signature:failedSignature},'confirmed');
 if(!failed.value.err||await conn.getAccountInfo(rejectedMint.publicKey)!==null||await conn.getBalance(platform)!==50_000_000)throw new Error('Failed atomic creation changed the mint or charged the platform');
 evidence.atomicRollback={signature:failedSignature,mint:rejectedMint.publicKey.toBase58(),error:failed.value.err,mintAbsent:true,platformBalanceUnchanged:true};
 evidence.result='passed';console.log(JSON.stringify({network:evidence.network,signature,mint:input.mint,verification:verification.outcome,packetBytes:evidence.packetBytes,platformBalance:evidence.platformBalance}));
}catch(error){evidence.result='failed';evidence.error=error instanceof Error?error.message:String(error);console.error(evidence.error);process.exitCode=1;}
finally{const path=process.env.AECO_LOCAL_TEST_EVIDENCE;if(path)await writeFile(path,JSON.stringify(evidence,(_key,value)=>typeof value==='bigint'?value.toString():value,2),{mode:0o600});}
