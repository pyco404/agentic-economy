import { DEV_BUY_MAX_BPS, PUMP_NAME_MAX, PUMP_SYMBOL_MAX } from './constants.js';

/**
 * Token detail rules shared by the browser and the server.
 *
 * Protocol limits (verified on a local validator using the public-devnet Pump program, 2026-10-20): name ≤ 32, symbol ≤ 13 and
 * metadata URI ≤ 200 **UTF-8 bytes** (NameTooLong 6043, SymbolTooLong 6044, UriTooLong 6045). The program accepts
 * empty values, surrounding whitespace and control characters; the rules below that go further are this
 * application's, and are labeled as such. Values are never trimmed or truncated: invalid input is reported.
 */
export type TokenField = 'name' | 'symbol' | 'description' | 'devBuyBps' | 'devBuySol';
export interface TokenFieldIssue { field: TokenField; code: string; message: string }

export const utf8Length = (value: string) => new TextEncoder().encode(value).length;
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F-\u009F]/;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_LINES = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;
/** Application rule (not a protocol limit): tickers use letters, digits and $ _ . - */
export const SYMBOL_PATTERN = /^[A-Za-z0-9$_.-]*$/;
export const DESCRIPTION_MAX = 1000;

function text(field: 'name' | 'symbol', label: string, value: string, max: number, launch: boolean): TokenFieldIssue[] {
  const issues: TokenFieldIssue[] = [];
  if (LONE_SURROGATE.test(value)) issues.push({ field, code: 'malformed_unicode', message: `${label} contains malformed Unicode.` });
  if (CONTROL.test(value)) issues.push({ field, code: 'control_character', message: `${label} contains an unsupported control character.` });
  const bytes = utf8Length(value);
  if (bytes > max) issues.push({ field, code: 'too_long', message: `${label} is ${bytes}/${max} bytes. Accented letters and emoji use more than one byte each.` });
  if (field === 'symbol' && !SYMBOL_PATTERN.test(value)) issues.push({ field, code: 'unsupported_character', message: 'Symbol may contain letters, digits and $ _ . - only.' });
  if (launch) {
    if (!value.trim()) issues.push({ field, code: 'required', message: `Enter a token ${label.toLowerCase()}.` });
    else if (value !== value.trim()) issues.push({ field, code: 'surrounding_whitespace', message: `Remove spaces at the start or end of the ${label.toLowerCase()}.` });
  }
  return issues;
}

/**
 * `launch: false` → rules every saved draft must satisfy (incomplete drafts may be empty).
 * `launch: true`  → additionally required before any upload, metadata or transaction preparation.
 */
export function tokenFieldIssues(fields: { name: string; symbol: string; description: string; devBuyBps?: number; devBuySol?: string }, launch: boolean): TokenFieldIssue[] {
  const issues = [...text('name', 'Name', fields.name, PUMP_NAME_MAX, launch), ...text('symbol', 'Symbol', fields.symbol, PUMP_SYMBOL_MAX, launch)];
  if (LONE_SURROGATE.test(fields.description)) issues.push({ field: 'description', code: 'malformed_unicode', message: 'Description contains malformed Unicode.' });
  if (CONTROL_EXCEPT_LINES.test(fields.description)) issues.push({ field: 'description', code: 'control_character', message: 'Description contains an unsupported control character.' });
  if (fields.description.length > DESCRIPTION_MAX) issues.push({ field: 'description', code: 'too_long', message: `Description is ${fields.description.length}/${DESCRIPTION_MAX} characters.` });
  const bps = fields.devBuyBps ?? 0;
  if (!Number.isInteger(bps) || bps < 0 || bps > DEV_BUY_MAX_BPS) issues.push({ field: 'devBuyBps', code: 'out_of_range', message: `Developer Buy must be between 0% and ${DEV_BUY_MAX_BPS / 100}% of total supply.` });
  if (fields.devBuySol !== undefined && solBudgetLamports(fields.devBuySol) === null) issues.push({field:'devBuySol',code:'invalid_amount',message:'Enter a positive SOL amount with up to nine decimal places, or leave blank.'});
  if (fields.devBuySol && bps !== 0) issues.push({field:'devBuySol',code:'conflicting_amount',message:'Choose a SOL budget without a legacy percentage allocation.'});
  return issues;
}

/** Exact token base units for an allocation of `bps` basis points of `totalSupply` (floor). */
export function devBuyTokenAmount(totalSupply: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > DEV_BUY_MAX_BPS) throw new Error('Developer Buy allocation out of range');
  return (totalSupply * BigInt(bps)) / 10_000n;
}

/** Empty means no buy. Never parse a monetary budget through floating point. */
export function solBudgetLamports(input: string): bigint | null {
  if (input === '') return 0n;
  const m = /^(0|[1-9][0-9]{0,9})(?:\.([0-9]{1,9}))?$/.exec(input);
  if (!m) return null;
  const amount = BigInt(m[1]!) * 1_000_000_000n + BigInt((m[2] ?? '').padEnd(9, '0'));
  return amount > 0n && amount <= 18_446_744_073_709_551_615n ? amount : null;
}
export function solFromLamports(amount: bigint): string {
  const fraction = (amount % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return `${amount / 1_000_000_000n}${fraction ? '.' + fraction : ''}`;
}
