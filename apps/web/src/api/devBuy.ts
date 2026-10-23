import { useEffect, useState } from 'react';
import { DEV_BUY_MAX_BPS, solBudgetLamports, DevBuyQuote, launchpadPaths } from './shared';
import { launchpadRequest } from './walletSession';

/** "3.5" → 350 basis points, exactly (no floating point). Null for anything that is not 0–3.5 with at most two decimals. */
export function bpsFromPercent(input: string): number | null {
  const m = /^\s*(\d{1,2})(?:\.(\d{0,2}))?\s*$/.exec(input);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0'));
  return bps <= DEV_BUY_MAX_BPS ? bps : null;
}
export const percentFromBps = (bps: number) => (bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2);

/** Integer base units → grouped decimal string, exact (BigInt), trailing zeros trimmed. */
export function formatUnits(value: string, decimals: number, maxFraction = decimals): string {
  const v = BigInt(value), base = 10n ** BigInt(decimals), whole = (v / base).toLocaleString('en-US');
  const fraction = (v % base).toString().padStart(decimals, '0').slice(0, maxFraction).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
}
/**
 * A prepared Developer Buy needs explicit acceptance unless the creator already saw a maximum at least this high in
 * the form, or already accepted this exact maximum. Never silently raise what the creator agreed to spend.
 */
export function devBuyNeedsAcceptance(preparedMax: string | null, reviewedMax: string | null, acceptedMax: string | null): boolean {
  if (preparedMax === null || acceptedMax === preparedMax) return false;
  return reviewedMax === null || BigInt(preparedMax) > BigInt(reviewedMax);
}
export const formatSol = (lamports: string) => `${formatUnits(lamports, 9)} SOL`;
export const formatTokens = (baseUnits: string) => formatUnits(baseUnits, 6);

/** Debounced server estimate for the form. The transaction is re-quoted and simulated when it is prepared. */
export function useDevBuyQuote(sol: string, enabled: boolean) {
  const [state, setState] = useState<{ quote: DevBuyQuote | null; loading: boolean; error: string }>({ quote: null, loading: false, error: '' });
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{if(!enabled||!sol)return;const timer=setInterval(()=>setRefresh(n=>n+1),15_000);return()=>clearInterval(timer);},[sol,enabled]);
  useEffect(() => {
    const amount=solBudgetLamports(sol);
    if (!enabled || amount===null || amount===0n) { setState({ quote: null, loading: false, error: '' }); return; }
    const abort = new AbortController();
    setState({ quote: null, loading: true, error: '' });
    const timer = setTimeout(() => {
      launchpadRequest(`${launchpadPaths.devBuyQuote}?sol=${encodeURIComponent(sol)}`, DevBuyQuote, { signal: abort.signal })
        .then((quote) => {if(!abort.signal.aborted)setState({ quote, loading: false, error: '' });})
        .catch(() => { if (!abort.signal.aborted) setState({ quote: null, loading: false, error: 'The estimate is unavailable right now. It is recalculated when you create the coin.' }); });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [sol, enabled,refresh]);
  return state;
}

/** Browser checks exact units too; no rounded display percentage can authorize a purchase. */
export function budgetQuoteValid(quote: DevBuyQuote | null, sol: string): boolean {
 const budget=solBudgetLamports(sol);
 return budget!==null&&budget>0n&&quote?.status==='available'&&quote.budgetLamports===budget.toString()
  &&BigInt(quote.totalSupply)>0n&&BigInt(quote.tokenAmount)>0n
  &&BigInt(quote.tokenAmount)*10_000n<=BigInt(quote.totalSupply)*BigInt(DEV_BUY_MAX_BPS)
  &&BigInt(quote.tokenAmount)<=BigInt(quote.capTokenAmount)
  &&BigInt(quote.estimatedQuoteCost)<=budget&&BigInt(quote.maxQuoteCost)===budget
  &&quote.maxAllowedQuoteCost!==undefined&&budget<=BigInt(quote.maxAllowedQuoteCost);
}
export function allocationPercent(tokens:string,supply:string):string {
 const scaled=BigInt(tokens)*100_000_000n/BigInt(supply);
 return scaled===0n&&BigInt(tokens)>0n?'<0.000001':formatUnits(scaled.toString(),6);
}
