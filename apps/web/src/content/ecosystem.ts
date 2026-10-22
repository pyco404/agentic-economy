/** Product roadmap copy only. This register never grants eligibility, signs a
 * transaction, changes fee math, or enables a backend capability.
 */
export const agentClasses = [
  { name: "Common Agents", status: "In preparation · Phase 2", description: "After the official $AECO launch, each qualifying holder wallet automatically receives one persistent Common Agent for basic simulated city activities.",
    points: ["Phase 2: one Common Agent per qualifying $AECO holder wallet, without registration, wallet connection or manual activation. Full exits make the agent inactive; returning holders restore the same identity.",
      "Phase 3 expands these same Common Agents with advanced behavior and separately verified economic eligibility. Future token-linked positions have a proposed minimum $20 eligible position in that token.",
      "$AECO holding is required for cross-token participation. The minimum AECO requirement is not finalized.",
      "Verified performance, holding duration, holding weight/value, and eligible token positions influence proposed progression and rewards.",
      "Credits may qualify for a funded, performance-based $AECO program. No fixed conversion rate, unlimited payouts, or guaranteed earnings."] },
  { name: "Super Agents", status: "Coming soon · Phase 5", description: "A separate advanced autonomous-agent class, rented by locking $AECO. They are not upgraded Common Agents.",
    points: ["Planned autonomous research, economic decisions, and higher-value tasks and services.",
      "Future controlled Solana wallets, supported-token trading, and authorized Agentic Economy token launches.",
      "Rental capabilities may reflect lock amount, duration, activity, and verified performance. Reputation and launch history persist.",
      "Rentals can be released or expire. Access and fee-claim rights end at expiry; higher financial performance is not guaranteed."] },
] as const;

/** Public product milestones. Engineering evidence belongs in repository documentation. */
export const roadmap = [
  { phase: 1, title: "Platform Foundation", status: "Completed milestone", summary: "We built the foundations of a living digital economy: a persistent 3D city populated by agents performing useful work.",
    milestones: ["Persistent, explorable 3D city", "Working agents and economic activities", "Connected neighborhoods and infrastructure", "Resource production and community systems"] },
  { phase: 2, title: "Token Launchpad", status: "In progress", summary: "Create, launch and discover Solana tokens. Phase 2 completes only after our official $AECO token launches through Agentic Economy on Solana Mainnet and is independently verified, with ownership indexed and automatic Common Agents moving in the city.",
    milestones: ["Simple token creation with live previews", "SOL-paired token launches", "Optional Developer Buy, capped at 3.5%", "Token discovery and creator-fee infrastructure", "Owner-approved native $AECO launch through our own TOKEN/SOL Launchpad", "Verified $AECO launch, automatic holder Common Agents and reconciled city population"] },
  { phase: 3, title: "Common Agents & $AECO Utility", status: "Blocked until $AECO launch", summary: "Expand the existing Common Agents with advanced behavior, verified owner controls and eligible economic services. Phase 3 begins only after the official $AECO Mainnet launch is independently verified and Phase 2 is complete.",
    milestones: ["Advanced behavior for existing Common Agents", "Authenticated controls and economic eligibility verification", "Agent participation in economic activities", "Future funded reward opportunities"] },
  { phase: 4, title: "$AECO Trading Pairs", status: "Planned", summary: "Expand the ecosystem with optional trading pairs using $AECO.",
    milestones: ["Supported TOKEN/AECO trading pairs", "Ecosystem liquidity integrations", "Additional token utility"] },
  { phase: 5, title: "Super Agents", status: "Planned", summary: "Introduce an advanced class of AI agents designed for more complex work, intelligent decision-making and economic services.",
    milestones: ["Advanced agent reasoning", "Distinct identities and capabilities, separate from Common Agents", "Access through planned $AECO locking", "Controlled wallets and permissions"] },
  { phase: 6, title: "Autonomous Finance", status: "Planned", summary: "Enable Super Agents to perform authorized financial and economic operations under controlled conditions.",
    milestones: ["Authorized payments with secure permissions and safeguards", "Research and decision-making", "Controlled token trading", "Agent-initiated token creation"] },
  { phase: 7, title: "Super Agent Rental Marketplace", status: "Planned", summary: "Build a marketplace where users can compete to rent persistent Super Agents and participate in their future economic activity.",
    milestones: ["$AECO-lock rental auctions", "Persistent agent reputations", "Agent token-launch portfolios", "Time-limited renter creator-fee participation"] },
  { phase: 8, title: "Advanced Autonomous Economy", status: "Planned", summary: "Expand Agentic Economy into a connected ecosystem of agent-operated services, businesses and collaborative economic activity.",
    milestones: ["Agent-operated businesses", "Multi-agent coordination", "Advanced service markets", "Broader economic integrations"] },
] as const;

/** Proposed editorial allocations, NOT executable treasury constants. */
export const futureFeePolicies = [
  { name: "Human-launched token", agentRewards: 60, platform: 40, renter: 0 },
  { name: "Super-Agent token · active rental", agentRewards: 50, platform: 40, renter: 10 },
  { name: "Super-Agent token · no active renter", agentRewards: 60, platform: 40, renter: 0 },
] as const;

export const ecosystemFaq = [
  { question: "What can I use today?", answer: "Explore the connected city, rule-based agent work, communities and economic records. Authenticate with Phantom and save owned drafts on staging; real Pinata preparation has been verified. The complete Create Coin flow is verified in a dedicated devnet environment. Demo staging keeps financial execution disabled. Offline fixtures and blockchain test records are labeled separately." },
  { question: "How do Common Agents qualify?", answer: "After the official $AECO launch, qualifying holder wallets receive one Common Agent automatically for basic simulated activity, without connecting a wallet. Phase 3 adds economic eligibility and owner verification to these existing identities. Future token-linked economic positions have a proposed $20 minimum; the additional minimum AECO requirement is not finalized. Economic entitlements are not activated in production." },
  { question: "Can I participate with both agent classes?", answer: "Yes, the roadmap permits several Common-Agent positions while renting one or more Super Agents. They are distinct classes. This future model does not change current activation checks or make token holdings exclusive ownership." },
  { question: "Are Credits redeemable for $AECO today?", answer: "No. Current Credits are simulated and non-withdrawable. A future funded, performance-based program may support conversion under eligibility and funding limits. No conversion rate, APR, or payout is guaranteed." },
  { question: "Do I have to launch against $AECO?", answer: "No. AECO pairing is optional and planned for Phase 4. Phase 2 supports TOKEN/SOL only. TOKEN/AECO remains reserved for Phase 4 and requires separate protocol verification and approval." },
  { question: "What happens when a Super-Agent rental expires?", answer: "Under the proposed policy, access and claim rights end. Unclaimed renter entitlements redirect to Agent Rewards. A new renter receives 10% of future eligible creator fees from the agent’s existing and new token portfolio, not historical entitlement. Rentals and claims are not live." },
] as const;
