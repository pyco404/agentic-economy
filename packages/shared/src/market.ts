import {z} from 'zod';
import {PublicKey} from './primitives.js';
const value=z.number().finite().nonnegative().nullable();
/** Null means unavailable, never zero. fetchedAt is retrieval time, not trade time. */
export const TokenMarket=z.object({
 mint:PublicKey,status:z.enum(['available','unavailable','stale']),reason:z.string().nullable(),
 network:z.enum(['mainnet-beta','devnet','localnet','demo']),fetchedAt:z.iso.datetime().nullable(),sourceAsOf:z.iso.datetime().nullable(),
 source:z.literal('dexscreener').nullable(),sourceUrl:z.string().url().nullable(),pairAddress:PublicKey.nullable(),quoteAsset:z.enum(['SOL','USDC']).nullable(),
 priceUsd:value,volume24hUsd:value,marketCapUsd:value,liquidityUsd:value,priceChange24h:z.number().finite().nullable(),
 holders:z.number().int().nonnegative().nullable(),buys24h:z.number().int().nonnegative().nullable(),sells24h:z.number().int().nonnegative().nullable(),
 graduation:z.enum(['unknown','bonding_curve','curve_complete','graduated']),graduationProgress:z.number().finite().min(0).max(100).nullable(),
}).meta({id:'TokenMarket'});
export type TokenMarket=z.infer<typeof TokenMarket>;
export const TokenHistory=z.object({mint:PublicKey,pairAddress:PublicKey.nullable(),source:z.literal('geckoterminal'),fetchedAt:z.iso.datetime().nullable(),reason:z.string().nullable(),candles:z.array(z.object({time:z.number().int().nonnegative(),open:value,high:value,low:value,close:value,volume:value})).max(48)}).meta({id:'TokenHistory'});
export type TokenHistory=z.infer<typeof TokenHistory>;
