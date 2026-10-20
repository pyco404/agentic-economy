/** New launches are SOL-only. Other symbols remain in types solely for historical display. */
export type LaunchQuoteAsset='SOL'|'USDC'|'AECO';
type LaunchQuoteOption={asset:LaunchQuoteAsset;label:string;description:string;draftAvailable:boolean;status:string;requirement:string};
export function launchQuoteOptions():readonly LaunchQuoteOption[]{return [{asset:'SOL',label:'SOL',description:'Trade against Solana’s native currency.',draftAvailable:true,status:'Supported',requirement:'SOL is the only current launch pair. Execution requires an enabled testing network; mainnet remains disabled.'}];}
export const LAUNCH_QUOTE_OPTIONS=launchQuoteOptions();
export function launchQuote(value:unknown){return launchQuoteOptions().find(option=>option.asset===value)??null;}
export function tradingPair(symbol:string,quote:LaunchQuoteAsset){return `${symbol.trim()||'TOKEN'}/${quote}`;}
/** Do not rewrite an old draft/launch or pretend a different quote was selected. */
export function launchQuoteError(value:unknown):string|null{return value==='SOL'?null:'Only SOL is supported for new launches. This saved draft has not been changed. Select SOL explicitly to continue.';}
