import { useEffect } from 'react';
import { solBudgetLamports, type DevBuyQuote } from '../api/shared';
import { allocationPercent, budgetQuoteValid, formatSol, formatTokens, percentFromBps } from '../api/devBuy';
import '../launch-dev-buy.css';
export interface DevBuyAvailability { status: 'available' | 'unavailable'; reason: string | null }
/** User-selected maximum spend only. Never derives or pre-fills a purchase choice. */
export function LaunchDevBuy({ amount, legacyBps=0, onChange, availability, quoteAsset, symbol, quote, loading, error, disabled, onValidityChange }: {
 amount:string; legacyBps?:number; onChange:(amount:string)=>void; availability:DevBuyAvailability|null; quoteAsset:string; symbol:string;
 quote:DevBuyQuote|null; loading:boolean; error:string; disabled?:boolean; onValidityChange?:(valid:boolean)=>void;
}) {
 const available=availability?.status==='available'&&quoteAsset==='SOL';
 const invalid=solBudgetLamports(amount)===null;
 useEffect(()=>{onValidityChange?.(!invalid&&legacyBps===0);},[invalid,legacyBps,onValidityChange]);
 const active=budgetQuoteValid(quote,amount)&&quote?.status==='available'?quote:null;
 const quoteError=available&&!loading&&amount&&!active?(error||(quote?.status==='unavailable'?quote.reason:quote?.status==='available'?'This estimate does not meet your budget or the 3.5% limit. Refresh before continuing.':'')):'';
 return <fieldset className="launch-dev-buy" disabled={disabled} aria-describedby="dev-buy-help">
  <legend>Developer Buy <span className="launch-dev-buy-optional">Optional</span></legend>
  <p id="dev-buy-help" className="small muted">Enter how much SOL you want to spend on your token during launch.</p>
  <div className="launch-dev-buy-amount">
   {legacyBps>0&&<p className="small" role="note">This draft has a saved {percentFromBps(legacyBps)}% purchase. Enter a SOL budget to replace it. Existing launch attempts keep their original terms. <button type="button" onClick={()=>onChange('')}>Skip purchase</button></p>}
   <label htmlFor="dev-buy-sol">Amount in SOL</label>
   <div className="launch-dev-buy-sol"><input id="dev-buy-sol" type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} aria-invalid={invalid||!!quoteError} aria-describedby={amount?'dev-buy-range dev-buy-budget-help':'dev-buy-range'} onChange={e=>onChange(e.target.value)}/><span aria-hidden="true">SOL</span></div>
   <p id="dev-buy-range" className={invalid?'launch-field-error':'small muted'} role={invalid?'alert':undefined}>{invalid?'Enter a positive SOL amount with up to nine decimal places.':'Leave blank to skip. Maximum allocation: 3.5% of supply.'}</p>
   {!!amount&&<p id="dev-buy-budget-help" className="small muted">Maximum spend includes buy-side fees. Platform charge, rent and network fees are separate.</p>}
   {available&&!!amount&&!invalid&&<div aria-live="polite" aria-busy={loading}>{active?<dl className="fee-list launch-dev-buy-estimate">
    <div><dt>Estimated tokens received</dt><dd>{formatTokens(active.tokenAmount)} {symbol.trim()||'tokens'}</dd></div>
    <div><dt>Estimated share of supply</dt><dd>{allocationPercent(active.tokenAmount,active.totalSupply)}%</dd></div>
    <div><dt>Estimated Developer Buy cost</dt><dd>{formatSol(active.estimatedQuoteCost)}</dd></div>
   </dl>:<p className={quoteError?'launch-field-error':'small muted'} role={quoteError?'alert':undefined}>{loading?'Calculating…':quoteError||'Waiting for a current estimate…'}</p>}</div>}
  </div>
 </fieldset>;
}
