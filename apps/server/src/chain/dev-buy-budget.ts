/** Invert the protocol's fee-inclusive exact-token quote without floating point.
 * Reject oversized budgets rather than silently clamping them to the supply cap. */
export function quoteTokenBudget(budget: bigint, cap: bigint, cost: (tokens: bigint) => bigint) {
  if (budget <= 0n || cap <= 0n) throw new Error('Developer Buy budget must be positive');
  const maxBudget = cost(cap + 1n) - 1n;
  if (budget > maxBudget) return {tokenAmount: 0n, maxBudget, overCap: true};
  let low = 0n, high = cap;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (cost(mid) <= budget) low = mid; else high = mid - 1n;
  }
  return {tokenAmount: low, maxBudget, overCap: false};
}
