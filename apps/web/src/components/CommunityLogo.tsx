import {useState} from 'react';

/** Plain initials are an identity fallback, never fabricated token artwork. */
export function CommunityLogo({name,symbol,src}:{name:string;symbol:string;src:string|null}) {
  const [failed,setFailed] = useState<string|null>(null);
  return <div className="community-logo">
    {src && src !== failed ? <img src={src} alt={`${name} token logo`} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(src)}/>
      : <span role="img" aria-label={`${name} logo unavailable`}>{Array.from(symbol || name).slice(0,2).join('').toUpperCase()}</span>}
  </div>;
}
