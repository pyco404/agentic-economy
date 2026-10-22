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
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { if (bpsFromPercent(text) !== bps) setText(percentFromBps(bps)); }, [bps]); // eslint-disable-line react-hooks/exhaustive-deps
  const solPair = quoteAsset === 'SOL', available = availability?.status === 'available' && solPair, on = expanded || bps > 0;
  const reason = !solPair ? 'Developer Buy is available for SOL pairs only.' : availability?.status === 'unavailable' ? availability.reason ?? 'Developer Buy is unavailable on this network.' : null;
  const invalid = on && bpsFromPercent(text) === null;
  useEffect(() => { onValidityChange?.(!invalid); }, [invalid, onValidityChange]);
  const activeQuote = !invalid && quote?.status === 'available' && quote.bps === bps ? quote : null;
  const set = (value: string) => { setText(value); const next = bpsFromPercent(value); if (next !== null) onChange(next); };
  return <fieldset className="launch-dev-buy" aria-describedby="dev-buy-help" disabled={disabled}>
    <legend>Developer Buy <span className="launch-dev-buy-optional">Optional</span></legend>
    <p id="dev-buy-help" className="small muted">Optional. Buy part of your own token during launch, up to {DEV_BUY_MAX_BPS / 100}% of supply.</p>
    <label className="launch-dev-buy-toggle">
      <input type="checkbox" role="switch" checked={on} disabled={!available && !on} aria-describedby={reason ? 'dev-buy-reason' : undefined}
        onChange={(e) => { setExpanded(e.target.checked); if (!e.target.checked) { setText('0'); onChange(0); } }}/>
      <span>{on ? bps > 0 ? 'Developer Buy on' : 'Choose your allocation' : 'Developer Buy off'}</span>
    </label>
    {reason && <p id="dev-buy-reason" className="small launch-dev-buy-reason" role="note">{reason}{on && ' Turn it off to continue.'}</p>}
    {on && <div className="launch-dev-buy-amount">
      <div className="launch-dev-buy-inputs">
        <label>Share of total supply
          <span className="launch-dev-buy-percent"><input inputMode="decimal" value={text} aria-invalid={invalid} aria-describedby="dev-buy-range" onChange={(e) => set(e.target.value)}/><span aria-hidden="true">%</span></span>
        </label>
        <p id="dev-buy-range" className={invalid ? 'launch-field-error' : 'small muted'} role={invalid ? 'alert' : undefined}>
          {invalid ? `Enter a value from 0% to ${DEV_BUY_MAX_BPS / 100}% (up to two decimals).` : `${percentFromBps(bps)}% of supply · maximum ${DEV_BUY_MAX_BPS / 100}%`}
        </p>
      </div>
      <dl className="fee-list launch-dev-buy-estimate" aria-live="polite" aria-busy={loading}>
        {bps === 0 && !invalid ? <>
          <div><dt>Tokens received</dt><dd>0 {symbol.trim() || 'tokens'}</dd></div>
          <div><dt>Estimated cost</dt><dd>0 SOL</dd></div>
          <div><dt>Maximum cost</dt><dd>0 SOL</dd></div>
          <div><dt>Price impact</dt><dd>0%</dd></div>
        </> : activeQuote ? <>
          <div><dt>Tokens received</dt><dd>{formatTokens(activeQuote.tokenAmount)} {symbol.trim() || 'tokens'}</dd></div>
          <div><dt>Estimated cost</dt><dd>{formatSol(activeQuote.estimatedQuoteCost)}</dd></div>
          <div><dt>Maximum cost</dt><dd>{formatSol(activeQuote.maxQuoteCost)}</dd></div>
          <div><dt>Price impact</dt><dd>{(activeQuote.priceImpactBps / 100).toFixed(2)}%</dd></div>
        </> : <div><dt>Estimate</dt><dd>{loading ? 'Calculating…' : error || (quote?.status === 'unavailable' ? quote.reason : 'Shown when Developer Buy is available')}</dd></div>}
      </dl>
      <details className="small muted"><summary>How Developer Buy works</summary><p>Exactly this many tokens are bought, or the whole transaction fails. Final costs are shown before wallet approval. The limit applies to this launch only.</p>{activeQuote&&<p>Estimated cost includes {formatSol(activeQuote.pumpFees)} in protocol fees.</p>}</details>
    </div>}
  </fieldset>;
}
