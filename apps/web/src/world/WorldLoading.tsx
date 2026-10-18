import './worldReadiness.css';
/** Shared API/scene loading surface; no image request can delay this emblem. */
export function WorldLoading({active=true}:{active?:boolean}){
 return <div className="world-loading" data-testid="world-loading" data-active={active}
  role="status" aria-live="polite" aria-hidden={!active}>
  <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><path d="m6 24 18 10 18-10M6 32l18 10 18-10M6 16 24 6l18 10-18 10Z" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/></svg>
  <p>Preparing your world…</p><span className="world-loading-track" aria-hidden="true"/>
 </div>;
}
