import {useState} from 'react';
import {ChevronDown,Globe,Send} from 'lucide-react';
import {NewLaunchDraftFields,type DraftFields} from '../api/shared';
import './launch-project-links.css';

const links=[
 {key:'website',label:'Website',placeholder:'https://yourproject.com',Icon:Globe},
 {key:'twitter',label:'X (Twitter)',placeholder:'https://x.com/yourproject',Icon:XIcon},
 {key:'telegram',label:'Telegram',placeholder:'https://t.me/yourproject',Icon:Send},
] as const;
function XIcon({size=18}:{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 3h4.5L20 21h-4.5L4 3Zm0 18L20 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>;
}
/** Only canonicalize complete, valid HTTPS links; never guess a host or upgrade an insecure URL. */
export function normalizeProjectLink(value:string){
 const trimmed=value.trim();
 if(!trimmed)return '';
 try{const canonical=new URL(trimmed).href;return NewLaunchDraftFields.shape.website.safeParse(canonical).success?canonical:value;}catch{return value;}
}
export function LaunchProjectLinks({fields,onChange}:{fields:DraftFields;onChange:(key:'website'|'twitter'|'telegram',value:string)=>void}){
 const [expanded,setExpanded]=useState<boolean|null>(null);
 const configured=links.filter(({key})=>!!fields[key]).length;
 const open=expanded??(configured>0);
 return <section className="launch-project-links" aria-labelledby="project-links-title">
  <h3 id="project-links-title">Project links <span>(Optional)</span></h3>
  <p id="project-links-help">Help people discover your token and connect with its community.</p>
  <button type="button" className="project-links-toggle" aria-expanded={open} aria-controls="project-links-fields" aria-describedby="project-links-help" onClick={()=>setExpanded(!open)}>
   <span>{open?'Hide project links':configured?'Edit project links':'Add project links'}</span>
   {configured>0&&<span className="project-links-count">{configured} {configured===1?'link':'links'} added</span>}
   <ChevronDown size={16} aria-hidden="true"/>
  </button>
  <div id="project-links-fields" className="project-links-fields" hidden={!open}>
   {links.map(({key,label,placeholder,Icon})=>{
    const value=fields[key]??'',invalid=!NewLaunchDraftFields.shape[key].safeParse(value||null).success;
    return <div key={key} className="project-link-field">
     <label htmlFor={`project-${key}`}><Icon size={18}/>{label}</label>
     <input id={`project-${key}`} type="url" inputMode="url" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder={placeholder} value={value}
      aria-invalid={invalid} aria-describedby={invalid?`project-${key}-error`:undefined}
      onInvalid={()=>setExpanded(true)} onChange={e=>onChange(key,e.target.value)} onBlur={()=>{const normalized=normalizeProjectLink(value);if(normalized!==value)onChange(key,normalized);}}/>
     {invalid&&<p id={`project-${key}-error`} className="launch-field-error" role="alert">Use a valid HTTPS URL without a username or password, up to 200 characters.</p>}
    </div>;
   })}
  </div>
 </section>;
}
