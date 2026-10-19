import { PUMP_PROGRAM_ID } from '@agentic-economy/shared';
import sdk from './pump-sdk.cjs';

/** Bonding-curve trade decoded from Pump's own TradeEvent; amounts are raw base units as decimal strings. */
export interface PumpTrade {
  side: 'buy' | 'sell';
  user: string;
  tokenAmount: string;
  /** Quote paid or received: lamports for SOL curves, quote-mint base units otherwise (fees excluded by the protocol event). */
  quoteAmount: string;
  quoteMint: string;
  /** Creator fee charged on this trade, in the quote's base units. */
  creatorFee: string;
  /** Unix seconds reported by the program. */
  timestamp: number;
}

const NATIVE_MINT = 'So11111111111111111111111111111111111111112';
const TRADE_EVENT = Buffer.from(sdk.pumpIdl.events.find((e: { name: string }) => e.name === 'TradeEvent')!.discriminator);
const INVOKE = /^Program (\S+) invoke \[\d+\]$/, EXIT = /^Program (\S+) (success|failed.*)$/;

/**
 * Extracts Pump bonding-curve trades for `mint` from a transaction's log messages, the way the official
 * SDK does (`Program data:` + TradeEvent discriminator), but only for events logged while the Pump program
 * itself is executing: any program can print a `Program data:` line, so attribution follows the invoke stack.
 * Returns `complete: false` when the runtime truncated the logs (some events may be missing).
 */
export function pumpTradesFromLogs(logs: readonly string[], mint: string): { trades: PumpTrade[]; complete: boolean } {
  const stack: string[] = [], trades: PumpTrade[] = [];
  for (const line of logs) {
    if (line === 'Log truncated') return { trades, complete: false };
    const invoked = INVOKE.exec(line);
    if (invoked) { stack.push(invoked[1]!); continue; }
    const exited = EXIT.exec(line);
    if (exited && stack.at(-1) === exited[1]) { stack.pop(); continue; }
    if (!line.startsWith('Program data: ') || stack.at(-1) !== PUMP_PROGRAM_ID) continue;
    const data = Buffer.from(line.slice('Program data: '.length), 'base64');
    if (data.length <= 8 || !data.subarray(0, 8).equals(TRADE_EVENT)) continue;
    let e;
    try { e = sdk.PUMP_SDK.decodeTradeEventBc(data.subarray(8)); } catch { continue; }
    if (e.mint.toBase58() !== mint) continue;
    const quoteMint = e.quoteMint?.toBase58?.() ?? NATIVE_MINT;
    const nonNative = quoteMint !== NATIVE_MINT && quoteMint !== '11111111111111111111111111111111';
    trades.push({
      side: e.isBuy ? 'buy' : 'sell',
      user: e.user.toBase58(),
      tokenAmount: e.tokenAmount.toString(),
      quoteAmount: (nonNative ? e.quoteAmount : e.solAmount).toString(),
      quoteMint: nonNative ? quoteMint : NATIVE_MINT,
      creatorFee: e.creatorFee.toString(),
      timestamp: Number(e.timestamp.toString()),
    });
  }
  return { trades, complete: true };
}
