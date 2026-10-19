/** Draft quote choices, not transaction capabilities. The authenticated workspace
 * supports SOL drafts only. USDC requires a verified quote-aware launch adapter;
 * AECO remains a future phase. No price, mint or financial permission is inferred.
 */
export type LaunchQuoteAsset = "SOL" | "USDC" | "AECO";
export const LAUNCH_QUOTE_OPTIONS = [
  { asset: "SOL", label: "SOL", description: "Trade against Solana’s native currency.",
    draftAvailable: true, status: "Default",
    requirement: "SOL is the default trading pair. Execution is available only on enabled testing networks; mainnet launches remain disabled." },
  { asset: "USDC", label: "USDC", description: "Trade against USD Coin.",
    draftAvailable: false, status: "Application integration pending",
    requirement: "USDC construction is verified on devnet. Application selection stays disabled pending quote-specific contracts and recovery." },
  { asset: "AECO", label: "$AECO", description: "Trade within the Agentic Economy ecosystem.",
    draftAvailable: false, status: "Coming soon",
    requirement: "A configured AECO mint, Pump.fun eligibility, and quote-specific fee routing must be verified by the backend first." },
] as const satisfies readonly { asset: LaunchQuoteAsset; label: string; description: string;
  draftAvailable: boolean; status: string; requirement: string }[];

export function launchQuote(value: unknown) {
  return LAUNCH_QUOTE_OPTIONS.find((option) => option.asset === value) ?? null;
}
export function tradingPair(symbol: string, quote: LaunchQuoteAsset) {
  return `${symbol.trim() || "TOKEN"}/${quote}`;
}
/** Preserve a saved unsupported choice; require an explicit change, never silently use SOL. */
export function launchQuoteError(value: unknown): string | null {
  const option = launchQuote(value);
  if (!option) return "The saved quote asset is not recognized. Choose a trading pair explicitly before reviewing.";
  if (!option.draftAvailable) return `${option.label} pairing is unavailable. ${option.requirement} Choose SOL explicitly to review an existing SOL draft.`;
  return null;
}
