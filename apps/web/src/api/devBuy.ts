import { useEffect, useState } from 'react';
import { DEV_BUY_MAX_BPS, DevBuyQuote, launchpadPaths } from './shared';
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
export function useDevBuyQuote(bps: number, enabled: boolean) {
  const [state, setState] = useState<{ quote: DevBuyQuote | null; loading: boolean; error: string }>({ quote: null, loading: false, error: '' });
  useEffect(() => {
    if (!enabled || bps <= 0) { setState({ quote: null, loading: false, error: '' }); return; }
    const abort = new AbortController();
    setState({ quote: null, loading: true, error: '' });
    const timer = setTimeout(() => {
      launchpadRequest(`${launchpadPaths.devBuyQuote}?bps=${bps}`, DevBuyQuote, { signal: abort.signal })
        .then((quote) => setState({ quote, loading: false, error: '' }))
        .catch(() => { if (!abort.signal.aborted) setState({ quote: null, loading: false, error: 'The estimate is unavailable right now. It is recalculated when you create the coin.' }); });
    }, 350);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [bps, enabled]);
  return state;
}
