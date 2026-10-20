import {useEffect,useState} from 'react';
import type {DevBuyQuote,DraftFields} from '../api/shared';
import {formatTokens,percentFromBps} from '../api/devBuy';
import './launch-token-preview.css';
import {TokenSocialLinks} from './TokenSocialLinks';
/** Local artwork is a blob URL only; rendering this card never prepares remote assets. */
export function LaunchTokenPreview({fields,file,imageUrl,devBuyQuote=null}:{fields:DraftFields;file:File|null;imageUrl:string;devBuyQuote?:DevBuyQuote|null}){
 const [local,setLocal]=useState('');
 useEffect(()=>{if(!file){setLocal('');return;}const url=URL.createObjectURL(file);setLocal(url);return()=>URL.revokeObjectURL(url);},[file]);
 const symbol=fields.symbol.trim()||'TOKEN',name=fields.name.trim()||'Your coin name';
 return <section className="surface launch-token-preview" aria-label="Live token preview">
  <h2>Live preview</h2><p className="small muted">Your Explore card, as you create it.</p>
  <div className="launch-preview-identity"><div className="launch-preview-art">{local||imageUrl?<img src={local||imageUrl} alt="Live token artwork"/>:<span aria-hidden="true">{symbol.slice(0,2)}</span>}</div><div><h3>{name}</h3><p className="launch-preview-symbol">{symbol}</p></div></div>
  <p className="launch-preview-description">{fields.description.trim()||'Your description will appear here.'}</p>
  <div className="launch-preview-pair"><span>Trading pair</span><strong>{symbol}/{fields.quoteAsset}</strong></div>
  {fields.devBuyBps>0&&<div className="launch-preview-dev-buy"><span>Developer Buy</span><strong>{percentFromBps(fields.devBuyBps)}% of supply{devBuyQuote?.status==='available'&&devBuyQuote.bps===fields.devBuyBps?` · ≈ ${formatTokens(devBuyQuote.tokenAmount)} ${symbol}`:''}</strong></div>}
  <TokenSocialLinks website={fields.website} twitter={fields.twitter} telegram={fields.telegram}/>
  <p className="small muted">Preview only. New images stay on this device until you choose Create Coin.</p>
 </section>;
}
