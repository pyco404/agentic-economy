import {useEffect,useState} from 'react';
import type {DraftFields} from '../api/shared';
import './launch-token-preview.css';
/** Local artwork is a blob URL only; rendering this card never prepares remote assets. */
export function LaunchTokenPreview({fields,file,imageUrl}:{fields:DraftFields;file:File|null;imageUrl:string}){
 const [local,setLocal]=useState('');
 useEffect(()=>{if(!file){setLocal('');return;}const url=URL.createObjectURL(file);setLocal(url);return()=>URL.revokeObjectURL(url);},[file]);
 const symbol=fields.symbol.trim()||'TOKEN',name=fields.name.trim()||'Your coin name';
 return <section className="surface launch-token-preview" aria-label="Live token preview">
  <h2>Live preview</h2><p className="small muted">Your token, as you create it.</p>
  <div className="launch-preview-identity"><div className="launch-preview-art">{local||imageUrl?<img src={local||imageUrl} alt="Live token artwork"/>:<span aria-hidden="true">{symbol.slice(0,2)}</span>}</div><div><h3>{name}</h3><p className="launch-preview-symbol">{symbol}</p></div></div>
  <p className="launch-preview-description">{fields.description.trim()||'Your description will appear here.'}</p>
  <div className="launch-preview-pair"><span>Trading pair</span><strong>{symbol}/{fields.quoteAsset}</strong></div>
  <p className="small muted">Preview only. New images stay on this device until you choose Create Coin.</p>
 </section>;
}
