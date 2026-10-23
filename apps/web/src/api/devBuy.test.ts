import { DraftFields, solBudgetLamports, solFromLamports } from './shared';
import { describe, expect, it } from 'vitest';
import { allocationPercent, budgetQuoteValid, bpsFromPercent, devBuyNeedsAcceptance, formatSol, formatTokens, formatUnits, percentFromBps } from './devBuy';

describe('Developer Buy input and formatting', () => {
  it('parses percentages to exact basis points, 0–3.5% with at most two decimals', () => {
    expect([bpsFromPercent('0'), bpsFromPercent('1'), bpsFromPercent('3.5'), bpsFromPercent('3.50'), bpsFromPercent('0.01'), bpsFromPercent(' 2.3 ')]).toEqual([0, 100, 350, 350, 1, 230]);
    for (const bad of ['3.51', '4', '-1', '1.234', 'abc', '', '1e2', '0x1']) expect(bpsFromPercent(bad), bad).toBeNull();
    expect([percentFromBps(350), percentFromBps(300), percentFromBps(1), percentFromBps(0)]).toEqual(['3.5', '3', '0.01', '0']);
  });
  it('accepts exactly the same 351 basis-point choices as the shared backend draft schema', () => {
    expect(DraftFields.parse({}).devBuyBps).toBe(0);
    for (let bps=0; bps<=350; bps++) {
      expect(bpsFromPercent(percentFromBps(bps))).toBe(bps);
      expect(DraftFields.parse({devBuyBps:bps}).devBuyBps).toBe(bps);
    }
    for (const bps of [-1,351,0.5,Number.NaN]) expect(DraftFields.safeParse({devBuyBps:bps}).success).toBe(false);
  });
  it('formats base units exactly, without floating point', () => {
    expect(formatTokens('35000000000000')).toBe('35,000,000');
    expect(formatTokens('1000000000000000')).toBe('1,000,000,000');
    expect(formatTokens('3497882795867')).toBe('3,497,882.795867');
    expect(formatSol('10242053')).toBe('0.010242053 SOL');
    expect(formatUnits('9007199254740993123', 9)).toBe('9,007,199,254.740993123');
  });
  it('requires renewed acceptance when the prepared maximum exceeds what the creator saw', () => {
    expect(devBuyNeedsAcceptance(null, null, null)).toBe(false); // no Developer Buy
    expect(devBuyNeedsAcceptance('10344474', '10344474', null)).toBe(false); // unchanged
    expect(devBuyNeedsAcceptance('10300000', '10344474', null)).toBe(false); // cheaper than shown
    expect(devBuyNeedsAcceptance('10344475', '10344474', null)).toBe(true); // one lamport more
    expect(devBuyNeedsAcceptance('10344474', null, null)).toBe(true); // never shown an estimate
    expect(devBuyNeedsAcceptance('10344475', '10344474', '10344475')).toBe(false); // accepted this exact amount
    expect(devBuyNeedsAcceptance('10400000', '10344474', '10344475')).toBe(true); // raised again after acceptance
  });
});

describe('SOL budget input',()=>{
 it('parses exact lamports, empty/off, tiny amounts and all nine decimals',()=>{
  expect(solBudgetLamports('')).toBe(0n);expect(solBudgetLamports('0.000000001')).toBe(1n);
  expect(solBudgetLamports('0.123456789')).toBe(123456789n);
  expect(solBudgetLamports('1.000000001')).toBe(1000000001n);
  expect(solFromLamports(123456789n)).toBe('0.123456789');
  for(const bad of ['0','0.0','-1','1e-3','0x1',' 0.1','0.1234567890','NaN','Infinity','1.','01'])expect(solBudgetLamports(bad),bad).toBeNull();
 });
 it('persists only valid budgets and rejects conflicting legacy percentages',()=>{
  expect(DraftFields.parse({devBuySol:'0.012345678'}).devBuySol).toBe('0.012345678');
  expect(DraftFields.parse({devBuySol:''}).devBuyBps).toBe(0);
  for(const fields of [{devBuySol:'-1'},{devBuySol:'0.1',devBuyBps:1}])expect(DraftFields.safeParse(fields).success).toBe(false);
 });
 it('independently rejects over-cap tokens, excessive costs, stale budget identity and missing limits',()=>{
  const q={status:'available' as const,bps:0,quoteAsset:'SOL' as const,network:'devnet' as const,totalSupply:'1000000000000000',tokenDecimals:6 as const,tokenAmount:'35000000000000',capTokenAmount:'35000000000000',estimatedQuoteCost:'10000000',pumpFees:'10000',maxQuoteCost:'11000000',budgetLamports:'11000000',maxAllowedQuoteCost:'12000000',priceImpactBps:1,slot:1};
  expect(budgetQuoteValid(q,'0.011')).toBe(true);
  for(const patch of [{tokenAmount:'35000000000001'},{estimatedQuoteCost:'11000001'},{maxQuoteCost:'11000001'},{budgetLamports:'10000000'},{maxAllowedQuoteCost:undefined},{maxAllowedQuoteCost:'10999999'}])expect(budgetQuoteValid({...q,...patch},'0.011')).toBe(false);
  expect(allocationPercent('35000000000000',q.totalSupply)).toBe('3.5');
  expect(allocationPercent('1','100000000')).toBe('0.000001');
 });
});
