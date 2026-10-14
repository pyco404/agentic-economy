import type { LedgerState } from "./types.js";

/**
 * City Credit ledger (simulation-only, non-withdrawable, never convertible to SOL/tokens).
 *
 * Invariant (checked by tests): sum(balances) === issued - burned, and no balance is negative.
 * Credits enter ONLY via `issue` (bounded by a per-epoch cap) and leave ONLY via `burn`.
 * Everything else is a transfer between accounts.
 */

export const MINT_ACCOUNT = "mint";
export const CITY_ACCOUNT = "city";
export const RESIDENTS_ACCOUNT = "residents";
export const agentAccount = (agentId: string) => `agent:${agentId}`;
export const escrowAccount = (taskId: string) => `escrow:${taskId}`;

export class InsufficientCredits extends Error {
  constructor(
    readonly account: string,
    readonly needed: number,
    readonly available: number,
  ) {
    super(`insufficient credits in ${account}: need ${needed}, have ${available}`);
  }
}

function assertAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`invalid credit amount ${amount}`);
}

export const balanceOf = (l: LedgerState, account: string) => l.balances[account] ?? 0;

export function transfer(l: LedgerState, from: string, to: string, amount: number): void {
  assertAmount(amount);
  if (amount === 0 || from === to) return;
  const available = balanceOf(l, from);
  if (available < amount) throw new InsufficientCredits(from, amount, available);
  l.balances[from] = available - amount;
  l.balances[to] = balanceOf(l, to) + amount;
  if (l.balances[from] === 0 && from.startsWith("escrow:")) delete l.balances[from];
}

export function tryTransfer(l: LedgerState, from: string, to: string, amount: number): boolean {
  if (balanceOf(l, from) < amount) return false;
  transfer(l, from, to, amount);
  return true;
}

/** Issue new credits, never exceeding `capRemaining`. Returns the amount actually issued. */
export function issue(l: LedgerState, to: string, amount: number, cap: number): number {
  assertAmount(amount);
  const allowed = Math.max(0, Math.min(amount, cap - l.issuedThisEpoch));
  if (allowed === 0) return 0;
  l.balances[to] = balanceOf(l, to) + allowed;
  l.issued += allowed;
  l.issuedThisEpoch += allowed;
  return allowed;
}

/** Genesis issuance (outside the epoch cap) — used exactly once when a world is created. */
export function genesisIssue(l: LedgerState, to: string, amount: number): void {
  assertAmount(amount);
  l.balances[to] = balanceOf(l, to) + amount;
  l.issued += amount;
}

export function burn(l: LedgerState, from: string, amount: number): number {
  assertAmount(amount);
  const burnable = Math.min(amount, balanceOf(l, from));
  if (burnable === 0) return 0;
  l.balances[from] = balanceOf(l, from) - burnable;
  l.burned += burnable;
  return burnable;
}

export function circulating(l: LedgerState): number {
  let total = 0;
  for (const v of Object.values(l.balances)) total += v;
  return total;
}

export function checkLedgerInvariant(l: LedgerState): string | null {
  for (const [acct, v] of Object.entries(l.balances)) if (!Number.isSafeInteger(v) || v < 0) return `negative/invalid balance ${acct}=${v}`;
  const c = circulating(l);
  if (c !== l.issued - l.burned) return `circulating ${c} != issued ${l.issued} - burned ${l.burned}`;
  return null;
}
