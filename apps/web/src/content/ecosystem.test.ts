import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { agentClasses, ecosystemFaq, futureFeePolicies, roadmap } from "./ecosystem";
import { LAUNCH_FEE_LAMPORTS, AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS } from "../api/shared";
import { FutureFees } from "../components/Ecosystem";
import { LaunchOriginTag } from "../components/LaunchOriginTag";

describe("ecosystem editorial boundary", () => {
  it("publishes eight concise product phases with honest public statuses", () => {
    expect(roadmap.map((p) => p.phase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(roadmap[0].title).toBe("Platform Foundation");
    expect(roadmap[0].status).toBe("Completed milestone");
    expect(roadmap[1].title).toBe("Token Launchpad & Common Agents");
    expect(roadmap[1].status).toBe("In progress");
    expect(roadmap[2].status).toBe("Awaiting Phase 2 acceptance");
    expect(roadmap[1].summary).toContain("official $AECO token is live on Solana Mainnet");
    expect(roadmap[2].summary).toContain("Phase 2 is complete");
    expect(roadmap[1].summary).toContain("approved, activated and verified");
    expect(agentClasses[0].status).toBe("Live · Phase 2");
    expect(roadmap[1].milestones.join(" ")).toContain("treasury distribution");
    expect(roadmap.slice(3).every((p) => p.status === "Planned")).toBe(true);
    expect(roadmap.every((p) => p.milestones.length >= 3 && p.milestones.length <= (p.phase === 2 ? 6 : 4) && p.summary.length > 0)).toBe(true);
    const copy = JSON.stringify(roadmap);
    expect(copy).not.toMatch(/USDC|staging|devnet|validator|PostgreSQL|contract version|RPC|migration|harness|test count/i);
    expect(roadmap[1].milestones.join(" ")).toContain("SOL-paired");
    expect(roadmap[1].milestones.join(" ")).toContain("3.5%");
    expect(roadmap[4].milestones.join(" ")).toContain("separate from Common Agents");
  });
  it("keeps Common and Super Agents separate and avoids defining an AECO minimum", () => {
    expect(agentClasses.map((a) => a.name)).toEqual(["Common Agents", "Super Agents"]);
    expect(agentClasses[0].points.join(" ")).toContain("proposed minimum $20");
    expect(agentClasses[0].points.join(" ")).toContain("minimum AECO requirement is not finalized");
    expect(agentClasses[1].description).toContain("not upgraded Common Agents");
    expect(ecosystemFaq.find((f) => f.question.includes("both agent classes"))?.answer).toContain("several Common-Agent positions");
    expect(ecosystemFaq.find((f) => f.question.includes("redeemable"))?.answer).toContain("No.");
  });
  it("expresses future allocations without changing executable fee constants", () => {
    expect(futureFeePolicies.map((p) => [p.agentRewards, p.platform, p.renter])).toEqual([[60, 40, 0], [50, 40, 10], [60, 40, 0]]);
    expect(futureFeePolicies.every((p) => p.agentRewards + p.platform + p.renter === 100)).toBe(true);
    expect(LAUNCH_FEE_LAMPORTS).toBe(50000000n);
    expect(AGENT_TREASURY_CREATOR_FEE_BPS).toBe(6000);
    expect(PLATFORM_TREASURY_CREATOR_FEE_BPS).toBe(4000);
    const html=renderToStaticMarkup(createElement(FutureFees));
    expect(html).toContain("verified on Solana Mainnet");
    expect(html).toContain("treasury payouts remain disabled");
  });
  it("labels verified platform provenance without fabricating legacy provenance", () => {
    const html=renderToStaticMarkup(createElement(LaunchOriginTag,{demo:false,provenance:{platformOrigin:"PLATFORM",initiator:"HUMAN",network:"devnet",quoteAsset:"SOL"}}));
    expect(html).toContain("Verified platform launch");
    expect(html).toContain("devnet");
    expect(html).toContain('data-origin="HUMAN"');
  });
  it("cannot turn a missing provenance field into a claimed launch classification", () => {
    const demo = renderToStaticMarkup(createElement(LaunchOriginTag, { demo: true }));
    const real = renderToStaticMarkup(createElement(LaunchOriginTag, { demo: false }));
    expect(demo).toContain("Demo · origin unverified"); expect(real).toContain("Origin unverified");
    for (const tag of [demo, real]) {
      expect(tag).toContain('data-origin="unknown"');
      expect(tag).not.toMatch(/data-origin="(PLATFORM|HUMAN|SUPER-AGENT)"/);
    }
  });
});
