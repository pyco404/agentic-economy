import {expect,it} from 'vitest';
import {eraseSignedLaunch,readSignedLaunch,saveSignedLaunch,SIGNED_PAYLOAD_TTL} from './signedLaunch';
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
