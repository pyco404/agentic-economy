import {TreasuryEntry,WRAPPED_SOL_MINT} from '@agentic-economy/shared';
/** Called under a per-receipt database transaction lock, or synchronously in memory.
 * The same source can change finality, never amount, asset, destination or provenance.
 */
export function nextTreasuryEntry(input:TreasuryEntry,history:TreasuryEntry[]):TreasuryEntry|null{
 const e=TreasuryEntry.parse(input);
 if(e.stream==='launch_fee'&&(e.account!=='platform'||e.assetMint!==WRAPPED_SOL_MINT||e.assetSymbol!=='SOL'||e.direction!=='credit'||e.decimals!==9||e.amount!=='50000000'))throw new Error('Launch fees must be exactly 0.05 SOL to the platform treasury');
 const same=history.filter(p=>p.signature===e.signature&&p.instructionIndex===e.instructionIndex&&p.account===e.account&&p.stream===e.stream);
 if(same.some(p=>p.accountAddress!==e.accountAddress||p.assetMint!==e.assetMint||p.assetSymbol!==e.assetSymbol||p.decimals!==e.decimals||p.amount!==e.amount||p.direction!==e.direction||p.tokenMint!==e.tokenMint||p.launchId!==e.launchId||p.evidence?.network!==e.evidence?.network||p.evidence?.source!==e.evidence?.source||p.evidence?.version!==e.evidence?.version||p.evidence?.distributed!==e.evidence?.distributed||p.evidence?.distributedDust!==e.evidence?.distributedDust))throw new Error('Receipt evidence conflicts with immutable accounting history');
 if(same.some(p=>p.finality===e.finality))return null;
 const superseded=new Set(same.map(p=>p.supersedes));const prior=same.find(p=>!superseded.has(p.id));
 if(!prior){if(e.supersedes||e.finality==='reversed')throw new Error('Status receipt has no source');return e;}
 if(prior.finality==='finalized'||e.finality==='pending')return null;
 if(e.supersedes&&e.supersedes!==prior.id)return null;
 return {...e,supersedes:prior.id};
}
