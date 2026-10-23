import { describe, expect, it } from "vitest";
import { aboutConnection, aboutFees, aboutStatus } from "./about";

describe("About connection and financial disclosures", () => {
  it("never presents fixture data as a connected backend", () => {
    expect(aboutConnection("demo", true, "production").label).toBe("Offline fixture preview");
    expect(aboutConnection("demo", false).detail).toContain("No live backend or blockchain activity");
  });
  it("discloses a lost backend connection without claiming a fixture fallback", () => {
    expect(aboutConnection("http", false, "demo").label).toBe("City connection unavailable");
    expect(aboutConnection("http", false).detail).toContain("no automatic fixture fallback");
  });
  it("keeps editorial copy separate from launch permissions and discloses disabled payouts", () => {
    expect(aboutConnection("http", true, "demo").label).toBe("Connected to the demo city");
    expect(aboutConnection("http", true, "production").detail).toContain("treasury payouts remain disabled");
    expect(aboutFees.financialActionsEnabled).toBe(false);
    const copy=JSON.stringify(aboutStatus);
    expect(copy).toContain("official $AECO token");
    expect(copy).toContain("60/40 treasury distribution on Mainnet");
    expect(copy).toContain("on-chain mobile launch acceptance remains deferred");
    expect(copy).not.toMatch(/Verified on staging|Awaiting external verification|Automatic .* in Phase 2;/);
  });
});
