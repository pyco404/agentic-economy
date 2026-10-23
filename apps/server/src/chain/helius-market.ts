import { type HeliusReader, HELIUS_GENESIS } from './helius.js';
import { SolanaRpcChain } from './solana.js';
import type { ChainGateway } from './types.js';

/** Only Explore reads use this view. Launch preparation/submission/recovery and fee ingestion
 * retain the original gateway. A fallback is accepted only after its network is verified.
 */
export function heliusMarketChain(original: ChainGateway, reader: HeliusReader): ChainGateway {
  const indexed = new SolanaRpcChain('https://read-only.helius.invalid', undefined, { fetch: reader.fetch });
  const preferred = new Set(['getGenesisHash', 'getCurveProgress', 'getBlockTime', 'getFeeRoutingState', 'getTransaction', 'verifyMarketPool', 'getMarketState', 'getMarketTradePage']);
  const fallback = async (method: keyof ChainGateway, args: unknown[]) => {
    if (await original.getGenesisHash?.() !== HELIUS_GENESIS[reader.network]) throw new Error('Fallback read network could not be verified');
    const fn = original[method];
    if (typeof fn !== 'function') throw new Error('Fallback read unavailable');
    return (fn as (...values: unknown[]) => unknown).apply(original, args);
  };
  return new Proxy(original, {
    get(target, property) {
      if (property === 'getHolderCount') return async (mint: string) => { try { return await reader.holderCount(mint); } catch { return fallback('getHolderCount', [mint]); } };
      if (property === 'getIndexedMetadata') return (mint: string) => reader.metadata(mint);
      if (preferred.has(String(property))) return async (...args: unknown[]) => {
        // Routine polling uses the existing RPC; preserve scarce Helius credits for holders and agent observation.
        try { const value=await fallback(property as keyof ChainGateway, args);if(value!==null)return value; }
        catch { /* Retry failed or pruned reads through the independently verified provider. */ }
        return (indexed[property as keyof SolanaRpcChain] as (...values: unknown[]) => unknown).apply(indexed, args);
      };
      const value = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
