import {launchQuoteError,tradingPair,type LaunchQuoteAsset} from '../api/launchQuotes';
import '../launch-quotes.css';
/** Current product policy is SOL only. Historical choices are shown honestly, never silently converted. */
export function LaunchQuotePicker({value,symbol,onChange}:{value:string;symbol:string;onChange:(quote:LaunchQuoteAsset)=>void}){
 const error=launchQuoteError(value);
 return <fieldset className="launch-quotes" aria-describedby="launch-quote-help">
  <legend>Trading pair</legend>
  <div className="launch-pair-preview" role="status" aria-live="polite" aria-label="Trading pair preview"><span>Trading pair</span><b>{value==='SOL'||value==='USDC'||value==='AECO'?tradingPair(symbol,value):'Trading pair unavailable'}</b></div>
  <p id="launch-quote-help" className="small muted">New coins trade against SOL. The platform launch charge is 0.05 SOL.</p>
  {error&&<><p role="alert" className="launch-quote-error">{error}</p><button className="secondary" type="button" onClick={()=>onChange('SOL')}>Use SOL for this draft</button></>}
 </fieldset>;
}
