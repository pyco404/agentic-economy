import {describe,expect,it} from 'vitest';
import {launchQuote,launchQuoteError,tradingPair,LAUNCH_QUOTE_OPTIONS} from './launchQuotes';
describe('SOL-only launch policy',()=>{
 it('offers only SOL without claiming financial execution is enabled',()=>{
  expect(LAUNCH_QUOTE_OPTIONS.map(o=>o.asset)).toEqual(['SOL']);
  expect(launchQuote('SOL')?.draftAvailable).toBe(true);
  expect(launchQuoteError('SOL')).toBeNull();
  expect(tradingPair('', 'SOL')).toBe('TOKEN/SOL');
  expect(LAUNCH_QUOTE_OPTIONS.every(o=>!('mint' in o)&&!('liveEnabled' in o))).toBe(true);
 });
 it('preserves historical pair labels without permitting new launches',()=>{
  for(const asset of ['USDC','AECO'] as const){
   expect(tradingPair(' HOME ',asset)).toBe(`HOME/${asset}`);
   expect(launchQuote(asset)).toBeNull();
   expect(launchQuoteError(asset)).toContain('Select SOL explicitly');
  }
 });
 it('rejects arbitrary mints and malformed choices',()=>{
  for(const value of ['', 'sol','BTC','__proto__',null,1,{asset:'SOL'},'So11111111111111111111111111111111111111112']){
   expect(launchQuote(value)).toBeNull();expect(launchQuoteError(value)).not.toBeNull();
  }
 });
});
