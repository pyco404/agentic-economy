import { describe, expect, it } from 'vitest';
import { bpsFromPercent, devBuyNeedsAcceptance, formatSol, formatTokens, formatUnits, percentFromBps } from './devBuy';

describe('Developer Buy input and formatting', () => {
  it('parses percentages to exact basis points, 0–3.5% with at most two decimals', () => {
    expect([bpsFromPercent('0'), bpsFromPercent('1'), bpsFromPercent('3.5'), bpsFromPercent('3.50'), bpsFromPercent('0.01'), bpsFromPercent(' 2.3 ')]).toEqual([0, 100, 350, 350, 1, 230]);
    for (const bad of ['3.51', '4', '-1', '1.234', 'abc', '', '1e2', '0x1']) expect(bpsFromPercent(bad), bad).toBeNull();
    expect([percentFromBps(350), percentFromBps(300), percentFromBps(1), percentFromBps(0)]).toEqual(['3.5', '3', '0.01', '0']);
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
