import {
  BPS_DENOMINATOR, LAMPORTS_PER_SOL, LAUNCH_FEE_LAMPORTS,
  AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS, LAUNCHER_CREATOR_FEE_BPS,
} from "../api/shared";

/** Editorial capability register, not a prediction or permission to enable actions.
 * Update here when verified implementation changes. Backend connection is reported
 * separately; a connected demo server does not enable financial operations.
 */
export const aboutStatus = [
  { id: "demo", title: "Available in demo", note: "Explore the working simulation.", items: [
    "Persistent procedural city, buildings and infrastructure",
    "Supported simulation-driven agent activity",
    "Community, inventory and economic data where supported",
    "Live backend API and WebSocket integration",
    "Ambient transportation and world exploration",
  ] },
  { id: "development", title: "In development", note: "The next layers of participation.", items: [
    "Token Launchpad: verified SOL/USDC execution and safe wallet confirmation",
    "Full community and token discovery integration",
    "Pinata IPFS image upload workflow",
    "Launch provenance and quote-specific creator-fee accounting",
  ] },
  { id: "disabled", title: "Not yet enabled", note: "Verification comes before activation.", items: [
    "Real token launches and wallet signing",
    "Live financial settlement",
    "Unverified creator-fee distribution",
    "Production financial operations",
    "Holder-based Common Agents and $AECO rewards (planned)",
    "Optional AECO pairs, Super Agents and rentals (planned)",
  ] },
] as const;

export const aboutFees = {
  launchSol: (Number(LAUNCH_FEE_LAMPORTS) / Number(LAMPORTS_PER_SOL)).toFixed(2),
  agentPercent: AGENT_TREASURY_CREATOR_FEE_BPS / BPS_DENOMINATOR * 100,
  platformPercent: PLATFORM_TREASURY_CREATOR_FEE_BPS / BPS_DENOMINATOR * 100,
  launcherPercent: LAUNCHER_CREATOR_FEE_BPS / BPS_DENOMINATOR * 100,
  financialActionsEnabled: false,
} as const;

export function aboutConnection(source: "http" | "demo", connected: boolean, mode?: string) {
  if (source === "demo") return { label: "Offline fixture preview", detail: "Local demonstration data. No live backend or blockchain activity." };
  if (!connected) return { label: "City connection unavailable", detail: "About remains available. Return to the World to check the connection; no automatic fixture fallback is used." };
  return { label: mode === "demo" ? "Connected to the demo city" : "Connected to the city backend",
    detail: "Simulation updates arrive from the backend. Financial actions remain disabled in this frontend." };
}
