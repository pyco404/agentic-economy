import {
  BPS_DENOMINATOR, LAMPORTS_PER_SOL, LAUNCH_FEE_LAMPORTS,
  AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS, LAUNCHER_CREATOR_FEE_BPS,
} from "../api/shared";

/** Editorial capability register, not a prediction or permission to enable actions.
 * Update here when verified implementation changes. Backend connection is reported
 * separately; a connected demo server does not enable financial operations.
 */
export const aboutStatus = [
  { id: "demo", title: "Live today", note: "Explore Agentic Economy on our official website.", items: [
    "A persistent shared city with connected neighborhoods and moving agents",
    "The official $AECO token, launched on Solana Mainnet through Agentic Economy",
    "One persistent Common Agent per qualifying $AECO holder wallet",
    "Verified token discovery, communities and available market data",
  ] },
  { id: "local", title: "Verified launch capabilities", note: "Delivered through our own Launchpad; public access awaits release approval.", items: [
    "TOKEN/SOL creation, artwork uploads and personal Phantom approval",
    "Optional Developer Buy with a strict 3.5% supply maximum",
    "A separate one-time 0.05 SOL platform launch charge",
    "Creator-fee collection and verified 60/40 treasury distribution on Mainnet",
    "Transaction refresh and recovery with duplicate-submission protections",
  ] },
  { id: "verification", title: "Before public launching", note: "Phase 2 remains in progress until the public release is approved and verified.", items: [
    "Final public-launch acceptance and release approval",
    "Physical mobile wallet connection and layouts verified; on-chain mobile launch acceptance remains deferred",
    "Treasury payouts remain disabled",
  ] },
  { id: "planned", title: "Planned for future phases", note: "Future capabilities are not promises of returns.", items: [
    "Advanced behavior, verified controls, economic services and eligibility-based rewards for existing Common Agents in Phase 3",
    "Optional TOKEN/AECO trading pairs in Phase 4",
    "Separate Super Agents, AECO-lock rentals and a rental marketplace",
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
    detail: "The shared city updates independently of this page. Launch access is permission-controlled; treasury payouts remain disabled." };
}
