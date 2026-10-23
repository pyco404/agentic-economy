import type {ChainTrade} from './types.js';
export interface MarketState{
 mint:string;slot:number;decimals:number;supplyRaw:string;totalSupplyRaw:string;
 venue:'bonding_curve'|'pumpswap'|'migration_pending';address:string;progressPct:number|null;
 baseReserveRaw:string;quoteReserveRaw:string;realBaseRaw:string;realQuoteRaw:string;
}
export interface MarketTrade extends ChainTrade{eventIndex:number;venue:'bonding_curve'|'pumpswap';pool:string}
export interface MarketPage{trades:MarketTrade[];signatures:string[];oldestTime:number|null;exhausted:boolean}
