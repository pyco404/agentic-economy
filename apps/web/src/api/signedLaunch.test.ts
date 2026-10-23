import {expect,it} from 'vitest';
import {archiveExpiredSignedLaunch,eraseSignedLaunch,readSignedLaunch,saveSignedLaunch,SIGNED_PAYLOAD_TTL} from './signedLaunch';
const fakeStorage=()=>{const data=new Map<string,string>();return {getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);},removeItem:(k:string)=>{data.delete(k);}} as Storage;};
const binding={wallet:'owner',id:'lch_test',mint:'mint',network:'devnet' as const};
const signed={...binding,signature:'s'.repeat(88),transaction:'signed-bytes'};
it('restores exact signed bytes only for the same API, wallet, mint and network',()=>{
 const s=fakeStorage();saveSignedLaunch(s,'https://api.test',signed,100);
 expect(readSignedLaunch(s,'https://api.test',binding,101)).toMatchObject(signed);
 expect(readSignedLaunch(s,'https://other.test',binding,101)).toBeNull();
 expect(readSignedLaunch(s,'https://api.test',{...binding,wallet:'other'},101)).toBeNull();
 expect(readSignedLaunch(s,'https://api.test',{...binding,network:'localnet'},101)).toBeNull();
});
it('erases terminal and expired payloads and does not silently accept failed persistence',()=>{
 const s=fakeStorage();saveSignedLaunch(s,'api',signed,100);expect(readSignedLaunch(s,'api',binding,100+SIGNED_PAYLOAD_TTL)).toBeNull();
 saveSignedLaunch(s,'api',signed,100);eraseSignedLaunch(s,'api',binding);expect(readSignedLaunch(s,'api',binding,101)).toBeNull();
 expect(()=>saveSignedLaunch({...s,setItem:()=>{throw Error('quota');}},'api',signed)).toThrow('quota');
});

it('keeps Mainnet signed recovery isolated from test networks',()=>{
 const s=fakeStorage(),mainnet={...binding,network:'mainnet-beta' as const};
 saveSignedLaunch(s,'https://api.useaeco.xyz',{...signed,...mainnet},100);
 expect(readSignedLaunch(s,'https://api.useaeco.xyz',mainnet,101)).toMatchObject(mainnet);
 expect(readSignedLaunch(s,'https://api.useaeco.xyz',binding,101)).toBeNull();
});
it('archives expired approval evidence separately before clearing the active recovery copy',()=>{
 const s=fakeStorage(),hash='a'.repeat(64);saveSignedLaunch(s,'api',signed);
 archiveExpiredSignedLaunch(s,'api',binding,hash);
 expect(JSON.parse(s.getItem(`aeco:signed:api:owner:lch_test:expired:${hash}`)!)).toMatchObject(signed);
 expect(readSignedLaunch(s,'api',binding)).toBeNull();
});
it('retains active recovery evidence if the archive cannot be persisted',()=>{
 const s=fakeStorage();saveSignedLaunch(s,'api',signed);
 expect(()=>archiveExpiredSignedLaunch({...s,setItem:()=>{throw Error('quota');}},'api',binding,'a'.repeat(64))).toThrow('quota');
 expect(readSignedLaunch(s,'api',binding)).toMatchObject(signed);
});
