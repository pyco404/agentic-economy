import './worldReadiness.css';
/** One application-wide loading surface, also used before React mounts. */
export function WorldLoading({active=true,status,onContinue}:{active?:boolean;status?:string;onContinue?:()=>void}){
 return <div className="world-loading" data-testid="world-loading" data-active={active}
  role="status" aria-live="polite" aria-hidden={!active} inert={!active}>
  <img className="startup-brand" src="/aeco-website-logo.png" alt="" width="96" height="96" />
  <p>Bringing Agentic Economy to life…</p><span className="world-loading-track" aria-hidden="true"/>
  {status && <span className="startup-status">{status}</span>}
  {onContinue && <button className="secondary startup-continue" onClick={onContinue}>Taking longer than expected. Continue without 3D</button>}
 </div>;
}
