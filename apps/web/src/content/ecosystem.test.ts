import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { agentClasses, ecosystemFaq, futureFeePolicies, roadmap } from "./ecosystem";
import { LAUNCH_FEE_LAMPORTS, AGENT_TREASURY_CREATOR_FEE_BPS, PLATFORM_TREASURY_CREATOR_FEE_BPS } from "../api/shared";
import { LaunchOriginTag } from "../components/LaunchOriginTag";

describe("ecosystem editorial boundary", () => {
  it("publishes exactly the eight official phases with truthful status and outstanding work", () => {
    expect(roadmap.map((p) => p.phase)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(roadmap[1].title).toBe("Token Launchpad");
    expect(roadmap[0].status).toContain("Core milestones verified");
    expect(roadmap[1].status).toContain("current development phase");
    expect(roadmap[0].built.length).toBeGreaterThan(0);
    expect(roadmap[0].pending.length).toBeGreaterThan(0);
    expect(roadmap.slice(2).every((p) => p.status === "Planned" && p.built.length === 0)).toBe(true);
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
