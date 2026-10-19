import {
  BPS_DENOMINATOR, LAMPORTS_PER_SOL, LAUNCH_FEE_LAMPORTS,
  AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS, LAUNCHER_CREATOR_FEE_BPS,
} from "../api/shared";

/** Editorial capability register, not a prediction or permission to enable actions.
 * Update here when verified implementation changes. Backend connection is reported
 * separately; a connected demo server does not enable financial operations.
 */
export const aboutStatus = [
  { id: "demo", title: "Verified on staging", note: "Available in the connected demo environment.", items: [
    "Persistent procedural city, irregular terrain and coordinated world reveal",
    "Rule-based agent work, production, deliveries and simulation receipts",
    "PostgreSQL persistence, stable agent identities and live HTTP/WebSocket activity",
    "Desktop Phantom authentication and wallet-owned token drafts",
    "Pinata V3 artwork and metadata integration verified with the real service",
    "Explore discovery and source-attributed market data where available",
  ] },
  { id: "local", title: "Verified in test environments", note: "Evidence from isolated local tests and public devnet, not live staging launches.", items: [
    "Create Coin: local preview, deferred uploads, explicit fee review and wallet approval",
    "SOL creation through the application with real Pinata and public devnet confirmation",
    "Desktop Phantom transaction signing and an atomic 0.05 test-SOL platform charge",
    "USDC protocol construction verified on devnet; application selector remains disabled",
    "Restart, duplicate-submission and interrupted-response recovery",
  ] },
  { id: "verification", title: "Awaiting external verification", note: "Implementation alone does not make a capability operational.", items: [
    "Physical-device Phantom mobile signing acceptance",
    "End-to-end USDC application launch and recovery",
    "Earned creator-fee collection, graduation and independent reconciliation evidence",
    "Mainnet security review and separately authorized financial enablement",
  ] },
  { id: "planned", title: "Planned for future phases", note: "Not live entitlements or promises of returns.", items: [
    "Holder-access Common Agents and funded, performance-based $AECO rewards",
    "Optional TOKEN/AECO trading pairs",
    "Super Agents, AECO-lock rentals and a rental marketplace",
    "Controlled autonomous finance and agent-run services and businesses",
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
