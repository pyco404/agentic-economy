import {z} from 'zod';
import {AmountString,PublicKey,TxSignature} from './primitives.js';
const value=z.number().finite().nonnegative().nullable();
/** Null means unavailable, never zero. fetchedAt is retrieval time, not trade time. */
export const TokenMarket=z.object({
 mint:PublicKey,status:z.enum(['available','unavailable','stale']),reason:z.string().nullable(),
 network:z.enum(['mainnet-beta','devnet','localnet','demo']),fetchedAt:z.iso.datetime().nullable(),sourceAsOf:z.iso.datetime().nullable(),
 source:z.literal('dexscreener').nullable(),sourceUrl:z.string().url().nullable(),pairAddress:PublicKey.nullable(),quoteAsset:z.enum(['SOL','USDC']).nullable(),
 priceUsd:value,volume24hUsd:value,marketCapUsd:value,liquidityUsd:value,priceChange24h:z.number().finite().nullable(),
 holderIndex:z.object({source:z.literal('helius_das'),indexedSlot:z.number().int().nonnegative(),fetchedAt:z.iso.datetime(),complete:z.boolean(),scannedAccounts:z.number().int().nonnegative(),owners:z.array(z.object({address:PublicKey,amount:AmountString})).max(25),reason:z.string().nullable()}).optional(),
 indexedMetadata:z.object({source:z.literal('helius_das'),mint:PublicKey,name:z.string().nullable(),symbol:z.string().nullable(),fetchedAt:z.iso.datetime()}).nullable().optional(),
 holders:z.number().int().nonnegative().nullable(),buys24h:z.number().int().nonnegative().nullable(),sells24h:z.number().int().nonnegative().nullable(),
 graduation:z.enum(['unknown','bonding_curve','curve_complete','graduated']),graduationProgress:z.number().finite().min(0).max(100).nullable(),
 /** True when `holders` is only a minimum (the RPC could not enumerate every holder). */
 holdersLowerBound:z.boolean().default(false),
 /** Attribution for on-chain fields (holders, graduation): read directly from Solana at `slot`; asOf is that slot's block time. */
 chain:z.object({source:z.literal('solana_rpc'),network:z.enum(['mainnet-beta','devnet','localnet']),slot:z.number().int().nonnegative(),asOf:z.iso.datetime().nullable(),fetchedAt:z.iso.datetime()}).nullable().default(null),
}).meta({id:'TokenMarket'});
export type TokenMarket=z.infer<typeof TokenMarket>;
export const TokenHistory=z.object({mint:PublicKey,pairAddress:PublicKey.nullable(),source:z.literal('geckoterminal'),fetchedAt:z.iso.datetime().nullable(),reason:z.string().nullable(),candles:z.array(z.object({time:z.number().int().nonnegative(),open:value,high:value,low:value,close:value,volume:value})).max(48)}).meta({id:'TokenHistory'});
export type TokenHistory=z.infer<typeof TokenHistory>;
/** A bonding-curve trade decoded from Pump's own TradeEvent. Amounts are raw base units; never estimated. */
export const TokenTrade=z.object({signature:TxSignature,slot:z.number().int().nonnegative(),blockTime:z.iso.datetime().nullable(),side:z.enum(['buy','sell']),user:PublicKey,
 tokenAmount:AmountString,tokenDecimals:z.literal(6),quoteAmount:AmountString,quoteAsset:z.enum(['SOL','USDC']),quoteDecimals:z.union([z.literal(9),z.literal(6)]),creatorFee:AmountString}).meta({id:'TokenTrade'});
export type TokenTrade=z.infer<typeof TokenTrade>;
/** Recent trades read from Solana. `complete: false` means some transactions or logs could not be read; trades shown are still verified. */
export const TokenTrades=z.object({mint:PublicKey,network:z.enum(['mainnet-beta','devnet','localnet','demo']),status:z.enum(['available','unavailable','stale']),reason:z.string().nullable(),
 source:z.literal('solana_rpc').nullable(),slot:z.number().int().nonnegative().nullable(),complete:z.boolean(),fetchedAt:z.iso.datetime().nullable(),trades:z.array(TokenTrade).max(50)}).meta({id:'TokenTrades'});
export type TokenTrades=z.infer<typeof TokenTrades>;
