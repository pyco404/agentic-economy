import {describe,it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
import {AddressLookupTableAccount,Keypair,VersionedTransaction} from '@solana/web3.js';
import bs58 from 'bs58';
import sdk from '../src/chain/pump-sdk.cjs';
import {ServerMintSigner,officialServerMintSigner} from '../src/chain/server-mint.js';
import {buildUnsignedPumpLaunch,unsignedPumpLaunchInstructions,validateSignedPumpLaunch} from '../src/chain/pump-builder.js';
import {mintMessageHash,DEVNET_SIGNING_GENESIS,PLANNED_AECO_MINT,type MintSigningReview} from '../src/chain/offline-mint.js';
import {loadConfig} from '../src/config.js';
import {OFFICIAL_TREASURIES}from'@agentic-economy/shared';
afterEach(()=>vi.unstubAllEnvs());
async function fixture(buy=false){
 const [mint,user,platform,rewards]=Array.from({length:4},()=>Keypair.generate()) as [Keypair,Keypair,Keypair,Keypair];
 const captured=JSON.parse(readFileSync(new URL('./fixtures/pump-global-devnet.json',import.meta.url),'utf8'));
 const global=sdk.PUMP_SDK.decodeGlobal({data:Buffer.from(captured.global.dataBase64,'base64')} as never);
 const policy={network:'devnet' as const,mint:mint.publicKey.toBase58(),deployer:user.publicKey.toBase58(),platform:platform.publicKey.toBase58(),rewards:rewards.publicKey.toBase58()};
 const devBuy=buy?{tokenAmount:BigInt(global.tokenTotalSupply.toString())*200n/10000n,maxQuoteCost:1000000000n}:undefined;
 const recipients=buy?{feeRecipient:global.feeRecipient.toBase58(),buybackFeeRecipient:global.buybackFeeRecipients[0]!.toBase58()}:undefined;
 const input={mint:policy.mint,launcherWallet:policy.deployer,platformTreasury:policy.platform,agentRewardsTreasury:policy.rewards,name:'Disposable signing',symbol:'SIGN',uri:'https://example.invalid/disposable.json',...(devBuy?{devBuy}:{})};
 const instructions=await unsignedPumpLaunchInstructions(input,global,recipients),addresses=[...new Map(instructions.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()];
 const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses}}),blockhash=Keypair.generate().publicKey.toBase58();
 const built=await buildUnsignedPumpLaunch(input,blockhash,[table],global,recipients);
 const review:MintSigningReview={version:1,launchId:'lch_DisposableAutomatic',network:'devnet',genesisHash:DEVNET_SIGNING_GENESIS,mint:input.mint,launcherWallet:input.launcherWallet,platformTreasury:input.platformTreasury,agentRewardsTreasury:input.agentRewardsTreasury,name:input.name,symbol:input.symbol,uri:input.uri,
  ...(devBuy?{devBuy:{tokenAmount:devBuy.tokenAmount.toString(),maxQuoteCost:devBuy.maxQuoteCost.toString()},globalAccountBase64:captured.global.dataBase64,protocolFeeRecipients:recipients}:{}),
  recentBlockhash:blockhash,lastValidBlockHeight:100,maxTotalDebitLamports:'1100000000',messageSha256:mintMessageHash(VersionedTransaction.deserialize(Buffer.from(built.transaction,'base64'))),unsignedTransaction:built.transaction,lookupTables:[{key:table.key.toBase58(),addresses:addresses.map(k=>k.toBase58())}]};
 return{mint,user,policy,review,built};
}
describe('automatic mint-only co-signing (disposable Devnet identities; no network/broadcast)',()=>{
 it.each([false,true])('keeps the exact current Pump transaction and requires exactly one separate wallet signature, Developer Buy %s',async buy=>{
  const f=await fixture(buy),signer=new ServerMintSigner(f.policy,()=>bs58.encode(f.mint.secretKey));
  const first=await signer.sign(f.review,f.policy.deployer),again=await signer.sign(f.review,f.policy.deployer);expect(again).toEqual(first);
  const tx=VersionedTransaction.deserialize(Buffer.from(first.transaction,'base64'));expect(tx.signatures[0]!.every(b=>b===0)).toBe(true);expect(tx.signatures[1]!.some(b=>b!==0)).toBe(true);
  await expect(validateSignedPumpLaunch(f.built.transaction,first.transaction)).rejects.toThrow('signature');
  const wallet=vi.fn(()=>tx.sign([f.user]));wallet();expect(wallet).toHaveBeenCalledTimes(1);
  await expect(validateSignedPumpLaunch(f.built.transaction,Buffer.from(tx.serialize()).toString('base64'))).resolves.toBeDefined();
  expect(first.transaction).not.toContain(bs58.encode(f.mint.secretKey));expect(first).not.toHaveProperty('secretKey');
 });
 it('accepts the owner-operated JSON keypair format and never returns private bytes',async()=>{
  const f=await fixture(),secret=JSON.stringify(Array.from(f.mint.secretKey));const signed=await new ServerMintSigner(f.policy,()=>secret).sign(f.review,f.policy.deployer);expect(JSON.stringify(signed)).not.toContain(secret);expect(Object.keys(signed).sort()).toEqual(['launchId','messageSha256','mint','transaction']);
 });
 it('rejects unauthorized wallets without consulting the signing key',async()=>{
  const f=await fixture(),read=vi.fn(()=>bs58.encode(f.mint.secretKey)),signer=new ServerMintSigner(f.policy,read);
  await expect(signer.sign(f.review,Keypair.generate().publicKey.toBase58())).rejects.toMatchObject({code:'forbidden'});expect(read).not.toHaveBeenCalled();
 });
 it('rejects substituted mint, payer, treasury, message, network or fee before key access',async()=>{
  const f=await fixture(),read=vi.fn(()=>bs58.encode(f.mint.secretKey)),signer=new ServerMintSigner(f.policy,read);
  for(const change of [{mint:PLANNED_AECO_MINT},{launcherWallet:Keypair.generate().publicKey.toBase58()},{platformTreasury:Keypair.generate().publicKey.toBase58()},{messageSha256:'0'.repeat(64)},{network:'mainnet-beta'}])await expect(signer.sign({...f.review,...change},f.policy.deployer)).rejects.toMatchObject({code:'unavailable'});
  const tx=VersionedTransaction.deserialize(Buffer.from(f.built.transaction,'base64'));tx.message.recentBlockhash=Keypair.generate().publicKey.toBase58();await expect(signer.sign({...f.review,unsignedTransaction:Buffer.from(tx.serialize()).toString('base64')},f.policy.deployer)).rejects.toMatchObject({code:'unavailable'});expect(read).not.toHaveBeenCalled();
  const changed=VersionedTransaction.deserialize(Buffer.from(f.built.transaction,'base64'));
  const transfer=changed.message.compiledInstructions.at(-1)!;const data=Buffer.from(transfer.data);data.writeBigUInt64LE(1n,4);transfer.data=data;
  await expect(signer.sign({...f.review,unsignedTransaction:Buffer.from(changed.serialize()).toString('base64'),messageSha256:mintMessageHash(changed)},f.policy.deployer)).rejects.toMatchObject({code:'unavailable'});expect(read).not.toHaveBeenCalled();
 });
 it('fails closed on absent, malformed or wrong-mint secrets without leaking parser/key text',async()=>{
  const f=await fixture();
  for(const secret of [undefined,'[private-sentinel-invalid-json',JSON.stringify([1,2]),bs58.encode(Keypair.generate().secretKey)]){
   try{await new ServerMintSigner(f.policy,()=>secret).sign(f.review,f.policy.deployer);throw new Error('Unexpected signature');}catch(error){expect(error).toMatchObject({code:'unavailable'});expect(String(error)).not.toContain('private-sentinel');expect(String(error)).not.toContain(secret??'undefined');}
  }
 });
 it('never enables the production special signer in demo/Devnet, and fixes its Mainnet mint/deployer policy',async()=>{
  expect(officialServerMintSigner(loadConfig({MODE:'demo'}))).toBeUndefined();
  const config=loadConfig({MODE:'production',DATABASE_URL:'postgres://not-connected',SOLANA_CLUSTER:'mainnet-beta',SOLANA_RPC_URL:'https://rpc.invalid',PLATFORM_TREASURY:OFFICIAL_TREASURIES.platform,AGENT_REWARDS_TREASURY:OFFICIAL_TREASURIES.agentRewards});
  const f=await fixture();vi.stubEnv('AECO_VANITY_MINT_SECRET','private-sentinel');const signer=officialServerMintSigner(config)!;expect(signer.configured()).toBe(true);
  await expect(signer.sign(f.review,f.policy.deployer)).rejects.toMatchObject({code:'forbidden'});
  await expect(signer.sign(f.review,OFFICIAL_TREASURIES.aecoDeployer)).rejects.toMatchObject({code:'unavailable'});
 });
});
