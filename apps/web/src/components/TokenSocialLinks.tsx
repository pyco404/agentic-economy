/** User token links stay separate from the platform's official accounts. */
export function TokenSocialLinks({website,twitter,telegram}:{website?:string|null;twitter?:string|null;telegram?:string|null}){
 const links=[['Website',website],['X',twitter],['Telegram',telegram]].flatMap(([label,value])=>{
  try{const u=new URL(value??'');return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password?[{label,url:u.href}]:[];}catch{return [];}
 });
 return links.length?<nav className="token-links" aria-label="Token social links">{links.map(({label,url})=><a key={label} href={url} target="_blank" rel="noopener noreferrer">{label} ↗</a>)}</nav>:null;
}
