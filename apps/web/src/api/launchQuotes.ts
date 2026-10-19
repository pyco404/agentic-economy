/** Draft quote choices, not transaction capabilities. SOL is always available; USDC only
 * when the backend reports `quotes.USDC === "draft"` (enabled on its safe testing network);
 * AECO remains a future phase. No price, mint or financial permission is inferred.
 */
export type LaunchQuoteAsset = "SOL" | "USDC" | "AECO";
type LaunchQuoteOption = { asset: LaunchQuoteAsset; label: string; description: string;
  draftAvailable: boolean; status: string; requirement: string };

export function launchQuoteOptions(usdcEnabled = false): readonly LaunchQuoteOption[] {
  return [
    { asset: "SOL", label: "SOL", description: "Trade against Solana’s native currency.",
      draftAvailable: true, status: "Default",
      requirement: "SOL is the default trading pair. Execution is available only on enabled testing networks; mainnet launches remain disabled." },
    usdcEnabled
      ? { asset: "USDC", label: "USDC", description: "Trade against USD Coin.",
        draftAvailable: true, status: "Testing network",
        requirement: "The 0.05 SOL launch charge is still paid in SOL. Your wallet also pays rent for two USDC fee-vault accounts. Mainnet launches remain disabled." }
      : { asset: "USDC", label: "USDC", description: "Trade against USD Coin.",
        draftAvailable: false, status: "Not enabled here",
        requirement: "USDC launches are not enabled on this network. Choose SOL, or save the draft and launch where USDC is enabled." },
    { asset: "AECO", label: "$AECO", description: "Trade within the Agentic Economy ecosystem.",
      draftAvailable: false, status: "Coming soon",
      requirement: "A configured AECO mint, Pump.fun eligibility, and quote-specific fee routing must be verified by the backend first." },
  ];
}
/** Options when USDC is not enabled (the default for every deployment). */
export const LAUNCH_QUOTE_OPTIONS = launchQuoteOptions(false);

export function launchQuote(value: unknown, usdcEnabled = false) {
  return launchQuoteOptions(usdcEnabled).find((option) => option.asset === value) ?? null;
}
export function tradingPair(symbol: string, quote: LaunchQuoteAsset) {
  return `${symbol.trim() || "TOKEN"}/${quote}`;
}
/** Preserve a saved unsupported choice; require an explicit change, never silently use SOL. */
export function launchQuoteError(value: unknown, usdcEnabled = false): string | null {
  const option = launchQuote(value, usdcEnabled);
  if (!option) return "The saved quote asset is not recognized. Choose a trading pair explicitly before reviewing.";
  if (!option.draftAvailable) return `${option.label} pairing is unavailable. ${option.requirement} Choose an available pair explicitly to continue; SOL is never substituted silently.`;
  return null;
}
