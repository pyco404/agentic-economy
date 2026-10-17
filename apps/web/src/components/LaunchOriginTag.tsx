import "../ecosystem.css";
/** No current backend field establishes PLATFORM/HUMAN/SUPER-AGENT provenance.
 * The prepared styles are dormant until a shared, verified provenance contract
 * is published. Neither wallet presence nor token names determine an origin.
 */
export function LaunchOriginTag({ demo }: { demo: boolean }) {
  return <span className="launch-origin-tag" data-origin="unknown" data-demo={demo}>
    {demo ? "Demo · origin unverified" : "Origin unverified"}
  </span>;
}
