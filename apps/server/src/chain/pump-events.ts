import { PUMP_PROGRAM_ID } from '@agentic-economy/shared';
import { PublicKey } from '@solana/web3.js';
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
  /** Pump protocol fee charged on this trade, and the part of it routed to buyback (not an additional charge). */
  protocolFee: string;
  buybackFee: string;
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
    const trade = decodeTrade(Buffer.from(line.slice('Program data: '.length), 'base64'), mint);
    if (trade) trades.push(trade);
  }
  return { trades, complete: true };
}

/** TradeEvent payload (discriminator + body) for `mint`, or null. */
function decodeTrade(data: Buffer, mint: string): PumpTrade | null {
  if (data.length <= 8 || !data.subarray(0, 8).equals(TRADE_EVENT)) return null;
  let e;
  try { e = sdk.PUMP_SDK.decodeTradeEventBc(data.subarray(8)); } catch { return null; }
  if (e.mint.toBase58() !== mint) return null;
  const quoteMint = e.quoteMint?.toBase58?.() ?? NATIVE_MINT;
  const nonNative = quoteMint !== NATIVE_MINT && quoteMint !== '11111111111111111111111111111111';
  return {
    side: e.isBuy ? 'buy' : 'sell',
    user: e.user.toBase58(),
    tokenAmount: e.tokenAmount.toString(),
    quoteAmount: (nonNative ? e.quoteAmount : e.solAmount).toString(),
    quoteMint: nonNative ? quoteMint : NATIVE_MINT,
    creatorFee: e.creatorFee.toString(),
    protocolFee: e.fee.toString(),
    buybackFee: (e.buybackFee ?? 0).toString(),
    timestamp: Number(e.timestamp.toString()),
  };
}

const EVENT_IX_TAG = Buffer.from('e445a52e51cb9a1d', 'hex');
const EVENT_AUTHORITY = PublicKey.findProgramAddressSync([Buffer.from('__event_authority')], new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
/**
 * Trades for `mint` from a transaction's inner instructions: Pump's self-CPI event instruction, authenticated by
 * Pump's event-authority PDA as its signer account (no other program can produce it), under `parentIndex` only.
 */
export function pumpTradesFromInner(inner: ReadonlyArray<{ parentIndex: number; programId: string; accounts: string[]; dataBase64: string }>, mint: string, parentIndex: number): PumpTrade[] {
  return inner.flatMap((i) => {
    if (i.parentIndex !== parentIndex || i.programId !== PUMP_PROGRAM_ID || i.accounts[0] !== EVENT_AUTHORITY) return [];
    const data = Buffer.from(i.dataBase64, 'base64');
    if (!data.subarray(0, 8).equals(EVENT_IX_TAG)) return [];
    const trade = decodeTrade(data.subarray(8), mint);
    return trade ? [trade] : [];
  });
}

/** Prefer authenticated self-CPI events when creation exhausts the runtime log budget. */
export function pumpTradesFromEvidence(logs: readonly string[], inner: Parameters<typeof pumpTradesFromInner>[0], mint: string) {
  const events = [...new Set(inner.map(i => i.parentIndex))].flatMap(index => pumpTradesFromInner(inner, mint, index));
  return events.length ? {trades:events,complete:true} : pumpTradesFromLogs(logs,mint);
}
