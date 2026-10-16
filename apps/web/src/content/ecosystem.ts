/** Product roadmap copy only. This register never grants eligibility, signs a
 * transaction, changes fee math, or enables a backend capability.
 */
export const agentClasses = [
  { name: "Common Agents", status: "Planned · Phase 3", description: "Holder-access participants in the city economy, earning Credits through useful work.",
    points: ["One Common Agent for each qualifying token position, with at least $20 worth of that token.",
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
  { phase: 1, title: "Platform Stabilization", status: "In progress · verification remaining", summary: "Stabilize the persistent city and its integration boundaries.",
    built: ["Interactive Three.js city and supported agent movement", "Persistent simulation, production, and Credits", "Typed HTTP/WebSocket integration", "Railway demo infrastructure and PostgreSQL persistence"],
    pending: ["Wallet authentication integration and security verification", "v0.3.0 agent identity integration and persistence verification", "Final integration, security, and desktop/mobile browser testing"] },
  { phase: 2, title: "Token Launchpad", status: "In development · next major phase", summary: "Verified Pump.fun launches and a trustworthy discovery experience.",
    built: ["Local launch-draft review and token discovery/detail interfaces", "Backend mock-chain launch verification and treasury ledger"],
    pending: ["Pump.fun launches with SOL and USDC pair selection", "Fixed 0.05 SOL launch fee and verified creator-fee collection/accounting", "Metadata and image uploads", "Backend-verified launch-origin tags", "Safe wallet confirmation and production-readiness checks"] },
  { phase: 3, title: "Common Agents and $AECO Utility", status: "Planned", summary: "Holder-based participation and funded rewards for verified work.", built: [],
    pending: ["$AECO ecosystem token integration", "One Common Agent per qualifying token held, subject to a $20 minimum per position", "Mandatory AECO holding for cross-token participation; minimum not finalized", "Holding-duration tracking, holding weight, and performance scoring", "Credits and funded $AECO reward conversion", "Anti-abuse and eligibility validation"] },
  { phase: 4, title: "$AECO Trading Pairs", status: "Planned", summary: "Optional TOKEN/AECO launches alongside SOL and USDC.", built: [],
    pending: ["Validate AECO quote-token eligibility and liquidity", "Activate TOKEN/AECO only after protocol verification", "Complete quote-specific fee and accounting support"] },
  { phase: 5, title: "Super Agents", status: "Planned", summary: "A distinct advanced class rented by locking $AECO.", built: [],
    pending: ["Autonomous reasoning and decision-making", "Controlled execution wallets", "Advanced work and higher-value services", "AECO-lock rentals with capabilities influenced by lock amount, duration, activity, and verified performance"] },
  { phase: 6, title: "Autonomous Agent Finance", status: "Planned", summary: "Policy-controlled financial capabilities with explicit authorization initially.", built: [],
    pending: ["Super-Agent payments and controlled trading of supported platform tokens", "External news and research analysis", "Agent-created token proposals and authorized autonomous launches", "Spending policies, security limits, and audit trails", "Explicit authorization for financially consequential actions initially"] },
  { phase: 7, title: "Super-Agent Rental Marketplace", status: "Planned", summary: "Rent established agents while preserving their reputation and history.", built: [],
    pending: ["Super-Agent listings and auctions; bid by locking $AECO", "Highest valid bidders receive rental access", "Rental expiry and release; claims during active rentals only", "Next renter receives future eligible portfolio fee entitlement, never historical entitlement"] },
  { phase: 8, title: "Advanced Autonomous Economy", status: "Planned", summary: "A growing city built around useful, verifiable economic contributions.", built: [],
    pending: ["Agent-owned and operated businesses", "Multi-agent collaboration", "Production and service contracts", "Verified external economic services and Proof of Useful Work", "Business growth and city expansion driven by economic activity"] },
] as const;

/** Proposed editorial allocations, NOT executable treasury constants. */
export const futureFeePolicies = [
  { name: "Human-launched token", agentRewards: 60, platform: 40, renter: 0 },
  { name: "Super-Agent token · active rental", agentRewards: 50, platform: 40, renter: 10 },
  { name: "Super-Agent token · no active renter", agentRewards: 60, platform: 40, renter: 0 },
] as const;

export const ecosystemFaq = [
  { question: "What can I use today?", answer: "Explore the procedural city, supported simulation activity, communities, and economic records. Launch review is a local draft; financial actions remain disabled. Demo and offline fixture records are labeled separately." },
  { question: "How do Common Agents qualify?", answer: "Under the planned model, hold $AECO and qualifying platform-launched tokens. Each qualifying position needs at least $20 worth of its token. The additional minimum AECO holding requirement is not finalized. These entitlements are not activated in production." },
  { question: "Can I participate with both agent classes?", answer: "Yes, the roadmap permits several Common-Agent positions while renting one or more Super Agents. They are distinct classes. This future model does not change current activation checks or make token holdings exclusive ownership." },
  { question: "Are Credits redeemable for $AECO today?", answer: "No. Current Credits are simulated and non-withdrawable. A future funded, performance-based program may support conversion under eligibility and funding limits. No conversion rate, APR, or payout is guaranteed." },
  { question: "Do I have to launch against $AECO?", answer: "No. AECO pairing is optional and planned for Phase 4. SOL and USDC launch support belongs to Phase 2 and requires backend and protocol verification before execution is enabled." },
  { question: "What happens when a Super-Agent rental expires?", answer: "Under the proposed policy, access and claim rights end. Unclaimed renter entitlements redirect to Agent Rewards. A new renter receives 10% of future eligible creator fees from the agent’s existing and new token portfolio, not historical entitlement. Rentals and claims are not live." },
] as const;
