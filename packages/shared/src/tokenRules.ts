import { DEV_BUY_MAX_BPS, PUMP_NAME_MAX, PUMP_SYMBOL_MAX } from './constants.js';

/**
 * Token detail rules shared by the browser and the server.
 *
 * Protocol limits (verified on a local validator using the public-devnet Pump program, 2026-10-20): name ≤ 32, symbol ≤ 13 and
 * metadata URI ≤ 200 **UTF-8 bytes** (NameTooLong 6043, SymbolTooLong 6044, UriTooLong 6045). The program accepts
 * empty values, surrounding whitespace and control characters; the rules below that go further are this
 * application's, and are labeled as such. Values are never trimmed or truncated: invalid input is reported.
 */
export type TokenField = 'name' | 'symbol' | 'description' | 'devBuyBps';
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
export function tokenFieldIssues(fields: { name: string; symbol: string; description: string; devBuyBps?: number }, launch: boolean): TokenFieldIssue[] {
  const issues = [...text('name', 'Name', fields.name, PUMP_NAME_MAX, launch), ...text('symbol', 'Symbol', fields.symbol, PUMP_SYMBOL_MAX, launch)];
  if (LONE_SURROGATE.test(fields.description)) issues.push({ field: 'description', code: 'malformed_unicode', message: 'Description contains malformed Unicode.' });
  if (CONTROL_EXCEPT_LINES.test(fields.description)) issues.push({ field: 'description', code: 'control_character', message: 'Description contains an unsupported control character.' });
  if (fields.description.length > DESCRIPTION_MAX) issues.push({ field: 'description', code: 'too_long', message: `Description is ${fields.description.length}/${DESCRIPTION_MAX} characters.` });
  const bps = fields.devBuyBps ?? 0;
  if (!Number.isInteger(bps) || bps < 0 || bps > DEV_BUY_MAX_BPS) issues.push({ field: 'devBuyBps', code: 'out_of_range', message: `Developer Buy must be between 0% and ${DEV_BUY_MAX_BPS / 100}% of total supply.` });
  return issues;
}

/** Exact token base units for an allocation of `bps` basis points of `totalSupply` (floor). */
export function devBuyTokenAmount(totalSupply: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > DEV_BUY_MAX_BPS) throw new Error('Developer Buy allocation out of range');
  return (totalSupply * BigInt(bps)) / 10_000n;
}
