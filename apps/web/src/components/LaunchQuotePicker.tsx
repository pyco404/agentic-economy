import { launchQuote, launchQuoteError, launchQuoteOptions, tradingPair, type LaunchQuoteAsset } from "../api/launchQuotes";
import "../launch-quotes.css";

export function LaunchQuotePicker({ value, symbol, onChange, usdcEnabled = false }: {
  value: string; symbol: string; onChange: (quote: LaunchQuoteAsset) => void;
  /** From the backend's capabilities (`quotes.USDC === "draft"`), never assumed. */
  usdcEnabled?: boolean;
}) {
  const options = launchQuoteOptions(usdcEnabled);
  const selected = launchQuote(value, usdcEnabled), error = launchQuoteError(value, usdcEnabled);
  return <fieldset className="launch-quotes" aria-describedby="launch-quote-help">
    <legend>Choose Trading Pair</legend>
    <p id="launch-quote-help" className="small muted">Your quote asset determines what the token trades against. $AECO pairing is optional.</p>
    <div className="launch-quote-options">
      {options.map((option) => <label key={option.asset} className="launch-quote-card"
        data-selected={value === option.asset} data-available={option.draftAvailable}>
        <span className="launch-quote-heading"><input type="radio" name="launch-quote" value={option.asset}
          checked={value === option.asset} disabled={!option.draftAvailable}
          aria-label={option.label} aria-describedby={`quote-requirement-${option.asset}`}
          onChange={() => onChange(option.asset)}/><strong>{option.label}</strong></span>
        <span className="launch-quote-description">{option.description}</span>
        <span className="launch-quote-pair">{tradingPair(symbol, option.asset)}</span>
        <span className="launch-quote-status">{option.status}</span>
        <span className="launch-quote-requirement" id={`quote-requirement-${option.asset}`}>{option.requirement}</span>
      </label>)}
    </div>
    <div className="launch-pair-preview" role="status" aria-live="polite" aria-label="Trading pair preview">
      <span>Trading pair</span><b>{selected ? tradingPair(symbol, selected.asset) : "Choose a quote asset"}</b>
    </div>
    {error && <p role="alert" className="launch-quote-error">{error}</p>}
    <p className="small muted">Draft preview only. No wallet approval, token creation, purchase, or payment occurs here.</p>
  </fieldset>;
}
