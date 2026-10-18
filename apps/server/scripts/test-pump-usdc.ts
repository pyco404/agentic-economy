/** Explicit local/public-devnet protocol audit. No application quote flag is enabled. */
import {readFile,writeFile} from 'node:fs/promises';
import {AddressLookupTableProgram,Connection,Keypair,PublicKey,Transaction,VersionedTransaction,sendAndConfirmTransaction} from '@solana/web3.js';
import {buildPumpLaunch,pumpLaunchInstructions,validateSignedPumpLaunch} from '../src/chain/pump-builder.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
import sdk from '../src/chain/pump-sdk.cjs';
const {PUMP_SDK,GLOBAL_PDA,bondingCurvePda}=sdk;
const devnet=process.env.AECO_RUN_DEVNET_PROTOCOL==='true';
const rpc=devnet?'https://api.devnet.solana.com':process.env.AECO_LOCAL_TEST_RPC,expected=devnet?'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG':process.env.PUMP_LOCAL_GENESIS_HASH;
if(!rpc||!expected||(!devnet&&process.env.AECO_RUN_LOCAL_PROTOCOL!=='true')||(devnet&&process.env.AECO_RUN_LOCAL_PROTOCOL==='true'))throw Error('Explicit single safe-network protocol opt-in required');
const address=new URL(rpc);
if((!devnet&&!['localhost','127.0.0.1','[::1]'].includes(address.hostname))||address.username||address.password)throw Error('Loopback RPC required');
const c=new Connection(rpc,'confirmed'),genesis=await c.getGenesisHash();
if(genesis!==expected||(!devnet&&['EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG','5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'].includes(genesis)))throw Error('Wrong or public genesis');
const quoteMint=new PublicKey('4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'),creator=devnet?Keypair.fromSecretKey(Uint8Array.from(JSON.parse(await readFile(process.env.AECO_DEVNET_TEST_WALLET_FILE!,'utf8')))):Keypair.generate(),mint=Keypair.generate(),platform=Keypair.generate().publicKey,agent=Keypair.generate().publicKey;
const report:Record<string,unknown>={mint:mint.publicKey.toBase58(),creator:creator.publicKey.toBase58(),platformTreasury:platform.toBase58(),network:devnet?'public-devnet':'isolated-localnet',source:'official public-devnet programs and USDC account',genesis,quoteAsset:'USDC',quoteMint:quoteMint.toBase58(),financialScope:'test funds only; API quote remains disabled'};
try{
 const globalAccount=await c.getAccountInfo(GLOBAL_PDA);if(!globalAccount)throw Error('Missing cloned Global');
 const global=PUMP_SDK.decodeGlobal(globalAccount);
 if(!global.whitelistedQuoteMints.some((m:PublicKey)=>m.equals(quoteMint)))throw Error('USDC mint is not in the actual cloned Global allowlist');
 const quote=await c.getParsedAccountInfo(quoteMint);if(!quote.value||quote.value.owner.toBase58()!=='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'||!('parsed' in quote.value.data)||quote.value.data.parsed.info.decimals!==6)throw Error('Invalid cloned USDC mint');
 if(devnet){if(creator.publicKey.toBase58()!==process.env.AECO_DEVNET_TEST_WALLET_PUBLIC||await c.getBalance(creator.publicKey)<150_000_000)throw Error('Explicit funded devnet test wallet required');}else{const funded=await c.requestAirdrop(creator.publicKey,2_000_000_000);if((await c.confirmTransaction(funded,'confirmed')).value.err)throw Error('Local funding failed');}
 const input={launcherWallet:creator.publicKey.toBase58(),mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:'AECO Staging Check',symbol:'AECOTEST',uri:'ipfs://bafkreigck6kpvc45g7cso5kirqjd6ogpfrv5vjpdlsboc5dgs3gr4rgro4',platformTreasury:platform.toBase58(),agentRewardsTreasury:agent.toBase58(),quoteAsset:'USDC' as const,quoteMint:quoteMint.toBase58()};
 const instructions=await pumpLaunchInstructions(input),keys=[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 const [create,lookupAddress]=AddressLookupTableProgram.createLookupTable({authority:creator.publicKey,payer:creator.publicKey,recentSlot:await c.getSlot('finalized')});
 for(let n=0;n<keys.length;n+=20){const tx=new Transaction();if(!n)tx.add(create);tx.add(AddressLookupTableProgram.extendLookupTable({authority:creator.publicKey,payer:creator.publicKey,lookupTable:lookupAddress,addresses:keys.slice(n,n+20)}));await sendAndConfirmTransaction(c,tx,[creator],{commitment:'confirmed'});}
 const lookup=(await c.getAddressLookupTable(lookupAddress)).value!;
 const deadline=Date.now()+15000;while(await c.getSlot('confirmed')<=lookup.state.lastExtendedSlot){if(Date.now()>deadline)throw Error('Lookup table activation timeout');await new Promise(r=>setTimeout(r,100));}
 const recent=await c.getLatestBlockhash('confirmed'),built=await buildPumpLaunch(input,recent.blockhash,[lookup]),tx=VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'));tx.sign([creator]);
 await validateSignedPumpLaunch(built.transaction,Buffer.from(tx.serialize()).toString('base64'));
 const simulation=await c.simulateTransaction(tx,{sigVerify:true,commitment:'confirmed'});report.simulation={error:simulation.value.err,unitsConsumed:simulation.value.unitsConsumed,logs:simulation.value.logs};if(simulation.value.err)throw Error('USDC protocol simulation failed');
 report.packetBytes=built.bytes;report.lastValidBlockHeight=recent.lastValidBlockHeight;
 const signature=await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:10});report.signature=signature;if((await c.confirmTransaction({...recent,signature},'confirmed')).value.err)throw Error('USDC creation failed');
 const curveAccount=await c.getAccountInfo(bondingCurvePda(mint.publicKey));if(!curveAccount)throw Error('Curve missing');const curve=PUMP_SDK.decodeBondingCurve(curveAccount);
 if(!curve.quoteMint.equals(quoteMint))throw Error('On-chain curve has the wrong quote');
 const chain=new SolanaRpcChain(rpc),routing=await chain.getFeeRoutingState(mint.publicKey.toBase58()),observed=await chain.getTransaction(signature);
 if(!observed||observed.err||observed.genesisHash!==genesis)throw Error('Missing successful transaction evidence');
 if(!routing.sharingConfig?.adminRevoked||routing.sharingConfig.shareholders.length!==2||!routing.sharingConfig.shareholders.some(s=>s.address===agent.toBase58()&&s.shareBps===6000)||!routing.sharingConfig.shareholders.some(s=>s.address===platform.toBase58()&&s.shareBps===4000))throw Error('Incorrect locked USDC routing');
 const quoteAta=instructions[2]!.keys[17]!.pubkey,balance=await c.getTokenAccountBalance(quoteAta);
 if(balance.value.amount!=='0'||balance.value.decimals!==6)throw Error('Unexpected quote vault');
 if(await c.getBalance(platform)!==50_000_000)throw Error('Incorrect separate SOL platform charge');
 const parsed=await c.getParsedAccountInfo(mint.publicKey);if(!parsed.value||!('parsed' in parsed.value.data))throw Error('Mint missing');const info=parsed.value.data.parsed.info;
 if(info.decimals!==6||!info.isInitialized||info.extensions?.find((e:{extension:string})=>e.extension==='tokenMetadata')?.state.uri!==input.uri)throw Error('Mint metadata mismatch');
 try{if(await c.sendRawTransaction(tx.serialize(),{skipPreflight:false,maxRetries:2})!==signature)throw Error('Duplicate signature mismatch');}catch(e){if(!(e instanceof Error)||!/already been processed/.test(e.message))throw e;}
 if(await c.getBalance(platform)!==50_000_000)throw Error('Duplicate charge');
 Object.assign(report,{result:'passed',signature,mint:mint.publicKey.toBase58(),creator:creator.publicKey.toBase58(),metadataUri:input.uri,curveQuoteMint:curve.quoteMint.toBase58(),quoteVault:quoteAta.toBase58(),quoteVaultBalance:balance.value,routing,platformTreasury:platform.toBase58(),platformLamports:'50000000',packetBytes:built.bytes,notVerified:['USDC trading','graduation','earned creator-fee collection','application USDC acceptance','actual Phantom approval']});
 console.log(JSON.stringify({result:report.result,signature,mint:report.mint,quoteMint:report.quoteMint}));
}catch(e){report.result='failed';report.error=e instanceof Error?e.message:String(e);console.error(report.error);process.exitCode=1;}
finally{if(process.env.AECO_LOCAL_TEST_EVIDENCE)await writeFile(process.env.AECO_LOCAL_TEST_EVIDENCE,JSON.stringify(report,null,2));}
