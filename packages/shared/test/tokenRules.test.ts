import {describe,expect,it} from 'vitest';
import {DEV_BUY_MAX_BPS,PUMP_NAME_MAX,PUMP_SYMBOL_MAX} from '../src/constants.js';
import {DraftFields} from '../src/launchpad.js';
import {LaunchDraft} from '../src/launch.js';
import {devBuyTokenAmount,tokenFieldIssues,utf8Length} from '../src/tokenRules.js';

const codes=(f:Partial<{name:string;symbol:string;description:string;devBuyBps:number}>,launch=true)=>tokenFieldIssues({name:'Moss',symbol:'MOSS',description:'',...f},launch).map(i=>`${i.field}:${i.code}`);

describe('token detail rules (protocol limits in UTF-8 bytes, verified against devnet create_v2)',()=>{
 it('accepts the exact limits and rejects one byte over, however the bytes are spelled',()=>{
  expect([PUMP_NAME_MAX,PUMP_SYMBOL_MAX,DEV_BUY_MAX_BPS]).toEqual([32,13,350]);
  expect(codes({name:'A'.repeat(32),symbol:'ABCDEFGHIJKLM'})).toEqual([]);
  expect(codes({name:'A'.repeat(33)})).toEqual(['name:too_long']);
  expect(codes({symbol:'ABCDEFGHIJKLMN'})).toEqual(['symbol:too_long']);
  expect(utf8Length('é'.repeat(16))).toBe(32);expect(codes({name:'é'.repeat(16)})).toEqual([]);
  expect(codes({name:'é'.repeat(17)})).toEqual(['name:too_long']); // 17 characters, 34 bytes
  expect(codes({name:'😀'.repeat(8)})).toEqual([]);expect(codes({name:'😀'.repeat(9)})).toEqual(['name:too_long']);
 });
 it('separates saved-draft rules from launch-readiness rules',()=>{
  expect(codes({name:'',symbol:''},false)).toEqual([]);
  expect(codes({name:'',symbol:''})).toEqual(['name:required','symbol:required']);
  expect(codes({name:' Moss'},false)).toEqual([]);
  expect(codes({name:' Moss'})).toEqual(['name:surrounding_whitespace']);
  expect(codes({name:'   '})).toEqual(['name:required']);
  for(const launch of [false,true]){
   expect(codes({name:'Mo\u0007ss'},launch)).toEqual(['name:control_character']);
   expect(codes({name:'Moss\uDC00'},launch)).toEqual(['name:malformed_unicode']);
   expect(codes({symbol:'MO SS'},launch)).toEqual(['symbol:unsupported_character']);
  }
  expect(codes({description:'Line one\nLine two\ttab'})).toEqual([]);
  expect(codes({description:'x'.repeat(1001)})).toEqual(['description:too_long']);
 });
 it('bounds the Developer Buy to whole basis points from 0 to 3.5%',()=>{
  for(const ok of [0,1,100,349,350])expect(codes({devBuyBps:ok})).toEqual([]);
  for(const bad of [351,-1,1.5,Number.NaN])expect(codes({devBuyBps:bad})).toEqual(['devBuyBps:out_of_range']);
  expect(DraftFields.safeParse({devBuyBps:351}).success).toBe(false);
  expect(DraftFields.safeParse({devBuyBps:350}).success).toBe(true);
  expect(devBuyTokenAmount(1_000_000_000_000_000n,350)).toBe(35_000_000_000_000n);
 });
 it('enforces byte limits on legacy launch drafts too',()=>{
  const base={name:'Moss',symbol:'MOSS',metadataUri:'ipfs://bafkreid3pnqkevdah6inoproy2kxuyefqfurztyup5mxbkqu4rfyx5gzxu'};
  expect(LaunchDraft.safeParse(base).success).toBe(true);
  for(const name of [' Moss','Moss\u0000','Moss\uD800'])expect(LaunchDraft.safeParse({...base,name}).success).toBe(false);
  for(const metadataUri of ['javascript:alert(1)','https://user:password@example.com/token.json','ipfs://example\u0000'])expect(LaunchDraft.safeParse({...base,metadataUri}).success).toBe(false);
  expect(LaunchDraft.safeParse({...base,name:'é'.repeat(17)}).success).toBe(false);
  expect(LaunchDraft.safeParse({...base,metadataUri:'ipfs://'+'b'.repeat(194)}).success).toBe(false);
 });
});
