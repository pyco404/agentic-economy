/** Product roadmap copy only. This register never grants eligibility, signs a
 * transaction, changes fee math, or enables a backend capability.
 */
export const agentClasses = [
  { name: "Common Agents", status: "Planned · Phase 3", description: "Holder-access participants in the city economy, earning Credits through useful work.",
    points: ["One Common Agent for each qualifying token position, with a proposed minimum $20 eligible position in that token.",
      "$AECO holding is required for cross-token participation. The minimum AECO requirement is not finalized.",
      "Verified performance, holding duration, holding weight/value, and eligible token positions influence proposed progression and rewards.",
      "Credits may qualify for a funded, performance-based $AECO program. No fixed conversion rate, unlimited payouts, or guaranteed earnings."] },
  { name: "Super Agents", status: "Coming soon · Phase 5", description: "A separate advanced autonomous-agent class, rented by locking $AECO. They are not upgraded Common Agents.",
    points: ["Planned autonomous research, economic decisions, and higher-value tasks and services.",
      "Future controlled Solana wallets, supported-token trading, and authorized Agentic Economy token launches.",
      "Rental capabilities may reflect lock amount, duration, activity, and verified performance. Reputation and launch history persist.",
      "Rentals can be released or expire. Access and fee-claim rights end at expiry; higher financial performance is not guaranteed."] },
] as const;

export const roadmap = [
  { phase: 1, title: "Platform Stabilization", status: "Core milestones verified · ongoing stabilization", summary: "A persistent demo city connected to an authoritative economy.",
    built: ["Persistent procedural Three.js city, roads, rivers, railways, transport and complete-world cinematic readiness", "Persistent rule-based simulation, production, deliveries and City Credits", "Stable agent identities, wallet authentication infrastructure and typed HTTP/WebSocket integration", "Compatible main-branch Railway staging and PostgreSQL persistence"],
    pending: ["Ongoing reliability, performance and device testing"] },
  { phase: 2, title: "Token Launchpad", status: "In progress · current development phase", summary: "Intuitive token preparation and verified, explicitly approved launch execution.",
    built: ["Staging: Phantom authentication, owned drafts and real Pinata image/metadata integration", "Local artwork preview and one Create Coin preparation workflow with secure IPFS metadata", "Local validator: transaction, persistence and recovery tests", "Public devnet: Pump.fun SOL application launches, desktop Phantom signing and atomic 0.05 test-SOL charge", "Devnet protocol harness: USDC creation; application selection still disabled", "Explore discovery, verified launch provenance and source-attributed available market data", "Creator-fee ingestion, denomination-aware accounting and deterministic reconciliation tests"],
    pending: ["Real-device mobile wallet acceptance", "USDC application contract, quote-specific previews and recovery", "Earned creator-fee collection and graduation evidence", "Independent security review and authorized mainnet activation; staging remains demo"] },
  { phase: 3, title: "Common Agents and $AECO Utility", status: "Planned", summary: "Holder-based participation and funded rewards for verified work.", built: [],
    pending: ["$AECO ecosystem token integration", "One Common Agent per qualifying token position; proposed minimum $20 eligible holding, distinct from simulation/house agents", "Mandatory AECO holding for cross-token participation; minimum not finalized", "Holding-duration tracking, holding weight, and performance scoring", "Verified ownership, agent activation, lifecycle and useful economic participation", "Simulation Credits and potential rewards from a funded, capped AECO pool; no guaranteed conversion or earnings", "Anti-abuse and eligibility validation"] },
  { phase: 4, title: "$AECO Trading Pairs", status: "Planned", summary: "Optional TOKEN/AECO launches alongside SOL and USDC.", built: [],
    pending: ["AECO issuance first, followed by quote-token eligibility and liquidity verification", "Activate TOKEN/AECO only after protocol verification", "Preserve SOL/USDC options where supported; complete quote-specific fee and accounting support"] },
  { phase: 5, title: "Super Agents", status: "Planned", summary: "A distinct advanced class rented by locking $AECO.", built: [],
    pending: ["Autonomous reasoning and decision-making", "Controlled Solana execution wallets with defined permissions, limits and human oversight", "Advanced work and higher-value services", "Persistent agent identity and reputation; a separate class, not upgraded Common Agents", "AECO-lock rentals with capabilities influenced by lock amount, duration, activity, and verified performance"] },
  { phase: 6, title: "Autonomous Finance", status: "Planned", summary: "Policy-controlled financial capabilities with explicit authorization initially.", built: [],
    pending: ["Super-Agent payments and controlled trading of supported platform tokens", "External news and research analysis", "Agent-created token proposals and authorized autonomous launches", "Wallet spending policies, transaction limits, and audit trails", "Explicit authorization for financially consequential actions initially"] },
  { phase: 7, title: "Super-Agent Rental Marketplace", status: "Planned", summary: "Rent established agents while preserving their reputation and history.", built: [],
    pending: ["Super-Agent listings and auctions; bid by locking $AECO", "Highest valid bidders receive rental access", "Persistent portfolios and historical token-launch associations", "Rental expiry and release; time-limited claims during active rentals only", "Next renter receives future eligible portfolio fee entitlement, never historical entitlement", "Future verified eligible creator fees only: active rental 50% Agent Rewards / 40% Platform / 10% Current Renter; no active rental 60% Agent Rewards / 40% Platform", "Protocol trading fees and LP fees are excluded; no payouts enabled"] },
  { phase: 8, title: "Advanced Autonomous Economy", status: "Planned", summary: "A growing city built around useful, verifiable economic contributions.", built: [],
    pending: ["Agent-owned and operated businesses", "Multi-agent coordination and advanced economic services", "Contracts, service agreements, and resource and service markets", "Verified real-world economic integrations and Proof of Useful Work", "Business growth and expanded autonomous city participation driven by economic activity"] },
] as const;

/** Proposed editorial allocations, NOT executable treasury constants. */
export const futureFeePolicies = [
  { name: "Human-launched token", agentRewards: 60, platform: 40, renter: 0 },
  { name: "Super-Agent token · active rental", agentRewards: 50, platform: 40, renter: 10 },
  { name: "Super-Agent token · no active renter", agentRewards: 60, platform: 40, renter: 0 },
] as const;

export const ecosystemFaq = [
  { question: "What can I use today?", answer: "Explore the connected city, rule-based agent work, communities and economic records. Authenticate with Phantom and save owned drafts on staging; real Pinata preparation has been verified. The complete Create Coin flow is verified in a dedicated devnet environment. Demo staging keeps financial execution disabled. Offline fixtures and blockchain test records are labeled separately." },
  { question: "How do Common Agents qualify?", answer: "Under the planned model, hold $AECO and qualifying platform-launched tokens. Each qualifying position needs at least $20 worth of its token. The additional minimum AECO holding requirement is not finalized. These entitlements are not activated in production." },
  { question: "Can I participate with both agent classes?", answer: "Yes, the roadmap permits several Common-Agent positions while renting one or more Super Agents. They are distinct classes. This future model does not change current activation checks or make token holdings exclusive ownership." },
  { question: "Are Credits redeemable for $AECO today?", answer: "No. Current Credits are simulated and non-withdrawable. A future funded, performance-based program may support conversion under eligibility and funding limits. No conversion rate, APR, or payout is guaranteed." },
  { question: "Do I have to launch against $AECO?", answer: "No. AECO pairing is optional and planned for Phase 4. SOL and USDC launch support belongs to Phase 2 and requires backend and protocol verification before execution is enabled." },
  { question: "What happens when a Super-Agent rental expires?", answer: "Under the proposed policy, access and claim rights end. Unclaimed renter entitlements redirect to Agent Rewards. A new renter receives 10% of future eligible creator fees from the agent’s existing and new token portfolio, not historical entitlement. Rentals and claims are not live." },
] as const;
