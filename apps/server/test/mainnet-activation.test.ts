import {afterEach,describe,expect,it,vi} from 'vitest';
import {Connection,PublicKey,Keypair,AddressLookupTableAccount,AddressLookupTableProgram} from '@solana/web3.js';
import {OFFICIAL_TREASURIES} from '@agentic-economy/shared';
import {loadConfig} from '../src/config.js';
import {MAINNET_GENESIS,MAINNET_PROGRAMS,assertReviewedMainnetPrograms} from '../src/chain/mainnet-policy.js';
import {SolanaRpcChain} from '../src/chain/solana.js';
const config={MODE:'production',DATABASE_URL:'postgres://never-connected',SOLANA_RPC_URL:'https://rpc.invalid',SOLANA_CLUSTER:'mainnet-beta',PLATFORM_TREASURY:OFFICIAL_TREASURIES.platform,AGENT_REWARDS_TREASURY:OFFICIAL_TREASURIES.agentRewards,FEE_ROUTING_VERIFIED:'true',PUMP_LAUNCH_ENABLED:'true',PUMP_LAUNCH_LOOKUP_TABLE:'33wnSGm8hPBd9omoa252NAY8JX5PWJngkTNJgzdvdEZr',AUTH_URI:'https://useaeco.xyz',CORS_ORIGINS:'https://useaeco.xyz,https://www.useaeco.xyz'};
const loader=new PublicKey('BPFLoaderUpgradeab1e11111111111111111111111');
const fixtures=()=>MAINNET_PROGRAMS.flatMap(p=>{const program=Buffer.alloc(36),data=Buffer.alloc(45);program.writeUInt32LE(2);new PublicKey(p.data).toBuffer().copy(program,4);data.writeUInt32LE(3);data.writeBigUInt64LE(p.slot,4);data[12]=1;new PublicKey('7gZufwwAo17y5kg8FMyJy2phgpvv9RSdzWtdXiWHjFr8').toBuffer().copy(data,13);return [{data:program,owner:loader,executable:true,lamports:1,rentEpoch:0},{data,owner:loader,executable:false,lamports:1,rentEpoch:0}];});
afterEach(()=>vi.restoreAllMocks());
describe('separately approved Mainnet release',()=>{
 it('keeps demo/staging and legacy verification flags disabled, requires all approval prerequisites',()=>{
  expect(loadConfig(config).pumpLaunch.enabled).toBe(false);
  expect(loadConfig({...config,MAINNET_LAUNCH_APPROVED:'false'}).financialFeaturesEnabled).toBe(false);
  const approved={...config,MAINNET_LAUNCH_APPROVED:'true'};
  expect(loadConfig(approved)).toMatchObject({financialFeaturesEnabled:true,pumpLaunch:{enabled:true,mainnetApproved:true},launchRegistrationCommitment:'finalized'});
  for(const change of [{MODE:'demo'},{MODE:'devnet'},{SOLANA_CLUSTER:'devnet'},{PUMP_LAUNCH_LOOKUP_TABLE:''},{AUTH_URI:'http://useaeco.xyz'},{CORS_ORIGINS:'*'},{FEE_ROUTING_VERIFIED:'false'},{PUMP_LAUNCH_ENABLED:'false'},{PLATFORM_TREASURY:OFFICIAL_TREASURIES.aecoDeployer}])expect(()=>loadConfig({...approved,...change})).toThrow();
 });
 it('rejects changed owner, program pointer, deployment slot, authority or missing accounts',async()=>{
  const conn=new Connection('https://rpc.invalid'),mock=vi.spyOn(Connection.prototype,'getMultipleAccountsInfo');
  mock.mockResolvedValue(fixtures());await expect(assertReviewedMainnetPrograms(conn)).resolves.toBeUndefined();
  for(const mutate of [(a:ReturnType<typeof fixtures>)=>{a[0]!.owner=Keypair.generate().publicKey},(a:ReturnType<typeof fixtures>)=>{a[0]!.data[5]=a[0]!.data[5]!^1},(a:ReturnType<typeof fixtures>)=>{a[1]!.data.writeBigUInt64LE(999n,4)},(a:ReturnType<typeof fixtures>)=>{a[1]!.data[13]=a[1]!.data[13]!^1}]){const a=fixtures();mutate(a);mock.mockResolvedValue(a);await expect(assertReviewedMainnetPrograms(conn)).rejects.toThrow(/review/);}
  mock.mockResolvedValue(MAINNET_PROGRAMS.flatMap(()=>[null,null]));await expect(assertReviewedMainnetPrograms(conn)).rejects.toThrow();
 });
 it('requires both explicit approval and correct live Mainnet genesis with a frozen table',async()=>{
  const options={enabled:true,lookupTable:config.PUMP_LAUNCH_LOOKUP_TABLE,cluster:'mainnet-beta' as const,localGenesisHash:null};
  const send=vi.spyOn(Connection.prototype,'sendRawTransaction');
  await expect(new SolanaRpcChain('https://rpc.invalid',options).assertLaunchSubmissionAllowed()).rejects.toMatchObject({code:'mainnet_approval_required'});
  vi.spyOn(Connection.prototype,'getGenesisHash').mockResolvedValue('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG');
  const chain=new SolanaRpcChain('https://rpc.invalid',{...options,mainnetApproved:true});await expect(chain.assertLaunchSubmissionAllowed()).rejects.toMatchObject({code:'unsafe_launch_network'});
  vi.mocked(Connection.prototype.getGenesisHash).mockResolvedValue(MAINNET_GENESIS);vi.spyOn(Connection.prototype,'getMultipleAccountsInfo').mockResolvedValue(fixtures());
  vi.spyOn(Connection.prototype,'getAccountInfo').mockResolvedValue({data:Buffer.alloc(0),owner:AddressLookupTableProgram.programId,lamports:1,executable:false,rentEpoch:0});
  const table=(authority?:PublicKey)=>new AddressLookupTableAccount({key:new PublicKey(options.lookupTable),state:{deactivationSlot:2n**64n-1n,lastExtendedSlot:0,lastExtendedSlotStartIndex:0,addresses:[],authority}});
  const read=vi.spyOn(Connection.prototype,'getAddressLookupTable').mockResolvedValue({context:{slot:1},value:table(Keypair.generate().publicKey)});
  await expect(chain.assertLaunchSubmissionAllowed()).rejects.toMatchObject({code:'invalid_lookup_table'});read.mockResolvedValue({context:{slot:1},value:table()});await expect(chain.assertLaunchSubmissionAllowed()).resolves.toBeUndefined();expect(send).not.toHaveBeenCalled();
 });
});
