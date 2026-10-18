import {afterEach,describe,expect,it,vi} from 'vitest';
import {AddressLookupTableAccount,AddressLookupTableProgram,Connection,Keypair,PublicKey,type VersionedTransactionResponse} from '@solana/web3.js';
import {PUMP_PROGRAM_ID} from '@agentic-economy/shared';
import {pumpLaunchInstructions} from '../src/chain/pump-builder.js';
import {MockChain} from '../src/chain/mock.js';
import {verifyLaunch} from '../src/chain/verify.js';
import {sharingConfigPda} from '../src/chain/pump.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
 const mint=Keypair.generate(),input={launcherWallet:Keypair.generate().publicKey.toBase58(),mint:mint.publicKey.toBase58(),mintSecretKey:mint.secretKey,name:'Checked',symbol:'CHECK',uri:'https://example.com/checked.json',platformTreasury:Keypair.generate().publicKey.toBase58(),agentRewardsTreasury:Keypair.generate().publicKey.toBase58()};
 const chain=new MockChain(),signature=chain.simulateLaunch(input),tx=(await chain.getTransaction(signature))!,routing=await chain.getFeeRoutingState(input.mint),ix=await pumpLaunchInstructions(input);
 tx.instructions=ix.map((i,index)=>({ixIndex:index,programId:i.programId.toBase58(),discriminatorHex:i.data.length>=8?i.data.subarray(0,8).toString('hex'):null,accounts:i.keys.map(k=>k.pubkey.toBase58()),dataBase64:i.data.toString('base64')}));tx.systemTransfers[0]!.ixIndex=1;
 const exp={...input,sharingConfig:sharingConfigPda(input.mint),draft:{name:input.name,symbol:input.symbol,metadataUri:input.uri}};
 return{tx,routing,exp,input};
}
describe('authoritative launch verification',()=>{
 it('matches full creation metadata, creator and disabled mode flags, not just the mint account',async()=>{
  const f=await fixture();expect(verifyLaunch(f.exp,f.tx,f.routing).outcome).toBe('confirmed');
  expect(verifyLaunch({...f.exp,preparedMessageBase64:'server-template'},f.tx,f.routing).outcome).toBe('failed');
  expect(verifyLaunch({...f.exp,draft:{...f.exp.draft,metadataUri:'https://attacker.example/other.json'}},f.tx,f.routing).outcome).toBe('failed');
  const changed=structuredClone(f.tx),create=changed.instructions.find(i=>i.programId===PUMP_PROGRAM_ID)!;const bytes=Buffer.from(create.dataBase64!,'base64');bytes[bytes.length-1]=1;create.dataBase64=bytes.toString('base64');expect(verifyLaunch(f.exp,changed,f.routing).outcome).toBe('failed');
 });
 it('rejects duplicate charges, missing signatures and multiple token creations',async()=>{
  const f=await fixture();for(const mutate of [(t:typeof f.tx)=>{t.systemTransfers.push({...t.systemTransfers[0]!,lamports:1n,ixIndex:10});},(t:typeof f.tx)=>{t.signers=[f.input.launcherWallet];},(t:typeof f.tx)=>{t.instructions.push({...t.instructions[2]!,ixIndex:10});}]){const t=structuredClone(f.tx);mutate(t);expect(verifyLaunch(f.exp,t,f.routing).outcome).toBe('failed');}
 });
 it('rejects wrong program owners before decoding apparent fee-routing account data',async()=>{
  const f=await fixture();vi.spyOn(Connection.prototype,'getMultipleAccountsInfo').mockResolvedValue([{owner:PublicKey.default,data:Buffer.alloc(100),lamports:1,executable:false,rentEpoch:0},null]);
  await expect(new SolanaRpcChain('http://127.0.0.1:1').getFeeRoutingState(f.input.mint)).rejects.toThrow('program owner');
 });
 it('rejects mainnet genesis even when an operator turns on test execution',async()=>{
  const f=await fixture();vi.spyOn(Connection.prototype,'getGenesisHash').mockResolvedValue('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d');
  const chain=new SolanaRpcChain('https://api.mainnet-beta.solana.com',{enabled:true,lookupTable:Keypair.generate().publicKey.toBase58(),localGenesisHash:null,cluster:'devnet'});
  await expect(chain.buildLaunchTransaction(f.input)).rejects.toThrow('safe testing network');
  await expect(chain.submitLaunchTransaction('anything')).rejects.toThrow('safe testing network');
  const proxy=new SolanaRpcChain('http://127.0.0.1:1',{enabled:true,lookupTable:Keypair.generate().publicKey.toBase58(),localGenesisHash:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',cluster:'localnet'});
  await expect(proxy.submitLaunchTransaction('anything')).rejects.toThrow('safe testing network');
 });
});

describe('RPC evidence and simulation failure gates',()=>{
 it('keeps missing execution metadata or unconfirmed signature status pending',async()=>{
  const read=vi.spyOn(Connection.prototype,'getTransaction').mockResolvedValue({meta:null} as VersionedTransactionResponse);
  const status=vi.spyOn(Connection.prototype,'getSignatureStatuses');const chain=new SolanaRpcChain('http://127.0.0.1:1');
  expect(await chain.getTransaction('test-signature')).toBeNull();expect(status).not.toHaveBeenCalled();
  read.mockResolvedValue({meta:{err:null}} as VersionedTransactionResponse);
  for(const value of [null,{slot:1,confirmations:0,confirmationStatus:'processed',err:null}]){status.mockResolvedValue({context:{slot:1},value:[value]} as Awaited<ReturnType<Connection['getSignatureStatuses']>>);expect(await chain.getTransaction('test-signature')).toBeNull();}
 });
 it('rejects contradictory transaction/status errors instead of accepting RPC success',async()=>{
  vi.spyOn(Connection.prototype,'getTransaction').mockResolvedValue({meta:{err:null}} as VersionedTransactionResponse);
  vi.spyOn(Connection.prototype,'getSignatureStatuses').mockResolvedValue({context:{slot:1},value:[{slot:1,confirmations:1,confirmationStatus:'confirmed',err:{InstructionError:[0,'InvalidArgument']}}]} as Awaited<ReturnType<Connection['getSignatureStatuses']>>);
  await expect(new SolanaRpcChain('http://127.0.0.1:1').getTransaction('test-signature')).rejects.toThrow('contradicts');
 });
 it.each(['BlockhashNotFound','InsufficientFundsForRent',{InstructionError:[2,'InvalidInstructionData']}])('never broadcasts a failed simulation: %j',async err=>{
  const f=await fixture(),ix=await pumpLaunchInstructions(f.input);
  const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[...new Map(ix.flatMap(i=>[i.programId,...i.keys.filter(k=>!k.isSigner).map(k=>k.pubkey)]).map(k=>[k.toBase58(),k])).values()]}});
  vi.spyOn(Connection.prototype,'getGenesisHash').mockResolvedValue('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  vi.spyOn(Connection.prototype,'getAccountInfo').mockResolvedValue({owner:AddressLookupTableProgram.programId,data:Buffer.alloc(0),lamports:1,executable:false,rentEpoch:0});
  vi.spyOn(Connection.prototype,'getAddressLookupTable').mockResolvedValue({context:{slot:1},value:table});
  vi.spyOn(Connection.prototype,'getLatestBlockhash').mockResolvedValue({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100});
  vi.spyOn(Connection.prototype,'simulateTransaction').mockResolvedValue({context:{slot:1},value:{err,logs:[]}} as Awaited<ReturnType<Connection['simulateTransaction']>>);
  const send=vi.spyOn(Connection.prototype,'sendRawTransaction');
  const chain=new SolanaRpcChain('http://127.0.0.1:1',{enabled:true,lookupTable:table.key.toBase58(),localGenesisHash:null,cluster:'devnet'});
  await expect(chain.buildLaunchTransaction(f.input)).rejects.toMatchObject({code:'pump_simulation_failed'});expect(send).not.toHaveBeenCalled();
 });
});
