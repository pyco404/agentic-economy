import { createHash } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import type { AgentStrategy, LaunchDraft, Profession } from "@agentic-economy/shared";
import { MockChain } from "./chain/mock.js";
import type { AppContext } from "./context.js";
import { DEFAULT_STRATEGY } from "./sim/engine.js";

/** Deterministic demo wallets (public seeds — never real funds). */
export const demoWallet = (i: number) => Keypair.fromSeed(createHash("sha256").update(`agentic-economy-demo:wallet:${i}`).digest()).publicKey.toBase58();

const COMMUNITIES: Array<{ draft: LaunchDraft; agents: Array<[string, Profession, Partial<AgentStrategy>]> }> = [
  {
    draft: {
      name: "Demo Hearth Bakers",
      symbol: "DHEARTH",
      description: "DEMO MODE community. Bakers and couriers keeping the Genesis district fed.",
      metadataUri: "https://example.invalid/demo/hearth.json",
      imageUri: null,
      website: null,
      twitter: null,
      telegram: null,
    },
    agents: [
      ["Juniper Cart", "logistics_operator", { temperament: "cooperative", objective: "reliability" }],
      ["Rye Runner", "merchant", { preferredResources: ["bread"] }],
      ["Ovenkeeper", "manufacturer", { risk: "low" }],
    ],
  },
  {
    draft: {
      name: "Demo Riverside Guild",
      symbol: "DRIVER",
      description: "DEMO MODE community. Farmers and haulers along the river.",
      metadataUri: "https://example.invalid/demo/riverside.json",
      imageUri: null,
      website: null,
      twitter: null,
      telegram: null,
    },
    agents: [
      ["Millrace", "logistics_operator", { temperament: "competitive", risk: "high" }],
      ["Golden Furrow", "farmer", { objective: "reliability" }],
      ["Quay Trader", "merchant", { temperament: "competitive" }],
    ],
  },
  {
    draft: {
      name: "Demo Stonewright Co",
      symbol: "DSTONE",
      description: "DEMO MODE community. Builders keeping the city in good repair.",
      metadataUri: "https://example.invalid/demo/stonewright.json",
      imageUri: null,
      website: null,
      twitter: null,
      telegram: null,
    },
    agents: [
      ["Mortar & Pestle", "builder", { objective: "expansion" }],
      ["Lintel", "property_manager", { temperament: "cooperative" }],
      ["Gridline Haul", "logistics_operator", { objective: "profitability" }],
    ],
  },
];

/**
 * Populate an empty demo world by driving the REAL launch → confirm → agent activation code paths
 * against the mock chain, plus a few mock creator-fee distributions for the treasury view.
 */
export async function seedDemo(ctx: AppContext): Promise<boolean> {
  if (ctx.config.mode !== "demo" || !(ctx.chain instanceof MockChain)) return false;
  if ((await ctx.store.allCommunities()).length > 0) return false;
  const chain = ctx.chain;

  for (const [i, spec] of COMMUNITIES.entries()) {
    const launcher = demoWallet(i);
    const prepared = await ctx.launches.prepare(launcher, spec.draft);
    const sig = await ctx.launches.demoSign(launcher, prepared.launch.id, "success");
    const launch = await ctx.launches.confirm(launcher, prepared.launch.id, sig);
    if (launch.status !== "confirmed" || !launch.communityId) throw new Error(`demo launch failed: ${launch.status}`);

    for (const [j, [name, profession, strategy]] of spec.agents.entries()) {
      const holder = demoWallet(100 + i * 10 + j);
      chain.setTokenBalance(holder, launch.mint, 2_000_000_000n);
      await ctx.agents.create(holder, { communityId: launch.communityId, name, profession, strategy: { ...DEFAULT_STRATEGY, ...strategy } });
    }

    // Two simulated creator-fee distributions per community (exact 60/40 of a realized amount).
    for (const total of [12_345_678n, 3_000_001n]) {
      const agentShare = (total * 6000n) / 10000n;
      const txSig = chain.simulateCreatorFeeDistribution({
        mint: launch.mint,
        payouts: [
          { address: ctx.config.treasuries.agentRewards, lamports: agentShare },
          { address: ctx.config.treasuries.platform, lamports: total - agentShare },
        ],
      });
      const tx = await chain.getTransaction(txSig);
      await ctx.treasury.ingestCreatorFeeDistribution(tx!, await ctx.store.allCommunities());
    }
  }
  return true;
}
