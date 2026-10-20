import "../ecosystem.css";
import type {Community} from '../api/shared';
/** Only confirmed, server-verified token records supply provenance. */
export function LaunchOriginTag({demo,provenance}:{demo:boolean;provenance?:Community['provenance']}){
 return <span className="launch-origin-tag" data-origin={provenance?'HUMAN':'unknown'} data-demo={demo}>
  {provenance?`Verified platform launch · ${provenance.network}`:demo?'Demo · origin unverified':'Origin unverified'}
 </span>;
}
