import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pumpTradesFromLogs } from '../src/chain/pump-events.js';

/** A real public-devnet Pump buy, captured read-only with its trader's token-balance change. */
const fixture = JSON.parse(readFileSync(new URL('./fixtures/pump-trade-devnet.json', import.meta.url), 'utf8')) as {
  mint: string; logMessages: string[];
  expected: { side: 'buy' | 'sell'; user: string; tokenAmount: string; quoteAmount: string; quoteMint: string; creatorFee: string; timestamp: number; traderTokenBalanceDelta: string };
};
const PUMP = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const eventLine = fixture.logMessages.find((l) => l.startsWith('Program data: '))!;

describe('Pump trade events from transaction logs', () => {
  it('decodes a real devnet trade exactly as the chain recorded it', () => {
    const { trades, complete } = pumpTradesFromLogs(fixture.logMessages, fixture.mint);
    expect(complete).toBe(true);
    expect(trades).toHaveLength(1);
    const { traderTokenBalanceDelta, ...expected } = fixture.expected;
    expect(trades[0]).toEqual(expected);
    // Independent cross-check: the trader's actual token balance moved by exactly the event amount.
    expect(BigInt(traderTokenBalanceDelta)).toBe((trades[0]!.side === 'buy' ? 1n : -1n) * BigInt(trades[0]!.tokenAmount));
  });

  it('ignores trades for other mints', () => {
    expect(pumpTradesFromLogs(fixture.logMessages, 'So11111111111111111111111111111111111111112').trades).toEqual([]);
  });

  it('rejects an identical event printed by any program other than Pump', () => {
    const forger = 'Forger1111111111111111111111111111111111111';
    const forged = [`Program ${forger} invoke [1]`, eventLine, `Program ${forger} success`];
    expect(pumpTradesFromLogs(forged, fixture.mint).trades).toEqual([]);
    // Nor once Pump has returned and another program is executing.
    const after = [`Program ${PUMP} invoke [1]`, `Program ${PUMP} success`, `Program ${forger} invoke [1]`, eventLine, `Program ${forger} success`];
    expect(pumpTradesFromLogs(after, fixture.mint).trades).toEqual([]);
  });

  it('reports truncated logs as incomplete instead of guessing', () => {
    const truncated = [...fixture.logMessages.slice(0, fixture.logMessages.indexOf(eventLine)), 'Log truncated'];
    expect(pumpTradesFromLogs(truncated, fixture.mint)).toEqual({ trades: [], complete: false });
  });

  it('skips malformed event payloads', () => {
    const bad = [`Program ${PUMP} invoke [1]`, 'Program data: ' + Buffer.from(eventLine.slice(14), 'base64').subarray(0, 20).toString('base64'), `Program ${PUMP} success`];
    expect(pumpTradesFromLogs(bad, fixture.mint).trades).toEqual([]);
  });
});
