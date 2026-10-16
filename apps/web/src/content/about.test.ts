import { describe, expect, it } from "vitest";
import { aboutConnection, aboutFees } from "./about";

describe("About connection and financial disclosures", () => {
  it("never presents fixture data as a connected backend", () => {
    expect(aboutConnection("demo", true, "production").label).toBe("Offline fixture preview");
    expect(aboutConnection("demo", false).detail).toContain("No live backend or blockchain activity");
  });
  it("discloses a lost backend connection without claiming a fixture fallback", () => {
    expect(aboutConnection("http", false, "demo").label).toBe("City connection unavailable");
    expect(aboutConnection("http", false).detail).toContain("no automatic fixture fallback");
  });
  it("keeps financial actions disabled regardless of the connected backend mode", () => {
    expect(aboutConnection("http", true, "demo").label).toBe("Connected to the demo city");
    expect(aboutConnection("http", true, "production").detail).toContain("Financial actions remain disabled");
    expect(aboutFees.financialActionsEnabled).toBe(false);
  });
});
