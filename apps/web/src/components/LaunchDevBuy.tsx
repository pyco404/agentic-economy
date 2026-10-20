import { useEffect, useState } from 'react';
import { DEV_BUY_MAX_BPS, type DevBuyQuote } from '../api/shared';
import { bpsFromPercent, formatSol, formatTokens, percentFromBps } from '../api/devBuy';
import '../launch-dev-buy.css';

export interface DevBuyAvailability { status: 'available' | 'unavailable'; reason: string | null }

/** Optional Developer Buy: off by default, at most 3.5% of total supply, SOL pairs only. */
export function LaunchDevBuy({ bps, onChange, availability, quoteAsset, symbol, quote, loading, error, disabled, onValidityChange }: {
  bps: number; onChange: (bps: number) => void; availability: DevBuyAvailability | null; quoteAsset: string; symbol: string;
  quote: DevBuyQuote | null; loading: boolean; error: string; disabled?: boolean; onValidityChange?: (valid: boolean) => void;
}) {
  const [text, setText] = useState(percentFromBps(bps));
  useEffect(() => { if (bpsFromPercent(text) !== bps) setText(percentFromBps(bps)); }, [bps]); // eslint-disable-line react-hooks/exhaustive-deps
  const solPair = quoteAsset === 'SOL', available = availability?.status === 'available' && solPair, on = bps > 0;
  const reason = !solPair ? 'Developer Buy is available for SOL pairs only.' : availability?.status === 'unavailable' ? availability.reason ?? 'Developer Buy is unavailable on this network.' : null;
  const invalid = on && bpsFromPercent(text) === null;
  useEffect(() => { onValidityChange?.(!invalid); }, [invalid, onValidityChange]);
  const set = (value: string) => { setText(value); const next = bpsFromPercent(value); if (next !== null) onChange(next); };
  const ticker = symbol.trim() || 'tokens';
  return <fieldset className="launch-dev-buy" aria-describedby="dev-buy-help" disabled={disabled}>
    <legend>Developer Buy <span className="launch-dev-buy-optional">Optional</span></legend>
    <p id="dev-buy-help" className="small muted">Buy part of your coin in the same transaction that creates it, up to {DEV_BUY_MAX_BPS / 100}% of total supply. Off by default.</p>
    <label className="launch-dev-buy-toggle">
      <input type="checkbox" role="switch" checked={on} disabled={!available && !on} aria-describedby={reason ? 'dev-buy-reason' : undefined}
        onChange={(e) => { const next = e.target.checked ? 100 : 0; setText(percentFromBps(next)); onChange(next); }}/>
      <span>{on ? 'Developer Buy on' : 'Developer Buy off'}</span>
    </label>
    {reason && <p id="dev-buy-reason" className="small launch-dev-buy-reason" role="note">{reason}{on && ' Turn it off to continue.'}</p>}
    {on && <div className="launch-dev-buy-amount">
      <div className="launch-dev-buy-inputs">
        <label>Share of total supply
          <span className="launch-dev-buy-percent"><input inputMode="decimal" value={text} aria-invalid={invalid} aria-describedby="dev-buy-range" onChange={(e) => set(e.target.value)}/><span aria-hidden="true">%</span></span>
        </label>
        <input type="range" min={0} max={DEV_BUY_MAX_BPS} step={10} value={bps} aria-label="Developer Buy share of total supply" aria-valuetext={`${percentFromBps(bps)}%`}
          onChange={(e) => set(percentFromBps(Number(e.target.value)))}/>
        <p id="dev-buy-range" className={invalid ? 'launch-field-error' : 'small muted'} role={invalid ? 'alert' : undefined}>
          {invalid ? `Enter a value from 0% to ${DEV_BUY_MAX_BPS / 100}% (up to two decimals).` : `Live: ${percentFromBps(bps)}% of supply · maximum ${DEV_BUY_MAX_BPS / 100}%`}
        </p>
      </div>
      <dl className="fee-list launch-dev-buy-estimate" aria-live="polite" aria-busy={loading}>
        {quote?.status === 'available' ? <>
          <div><dt>Estimated {ticker} received</dt><dd>{formatTokens(quote.tokenAmount)} of {formatTokens(quote.totalSupply)}</dd></div>
          <div><dt>Estimated cost</dt><dd>{formatSol(quote.estimatedQuoteCost)}</dd></div>
          <div><dt>Includes Pump.fun fees</dt><dd>{formatSol(quote.pumpFees)}</dd></div>
          <div><dt>Maximum cost</dt><dd>{formatSol(quote.maxQuoteCost)}</dd></div>
          <div><dt>Price impact</dt><dd>{(quote.priceImpactBps / 100).toFixed(2)}%</dd></div>
        </> : <div><dt>Estimate</dt><dd>{loading ? 'Calculating…' : error || (quote?.status === 'unavailable' ? quote.reason : 'Shown when Developer Buy is available')}</dd></div>}
      </dl>
      <p className="small muted">Exactly this many tokens are bought, or the whole transaction fails. The final cost is recalculated and shown for approval before you sign. This limit applies to the launch only; it does not restrict later purchases.</p>
    </div>}
  </fieldset>;
}
