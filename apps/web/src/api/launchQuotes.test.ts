import { describe, expect, it } from "vitest";
import { launchQuote, launchQuoteError, tradingPair, LAUNCH_QUOTE_OPTIONS } from "./launchQuotes";

describe("launch quote boundary", () => {
  it("retains the existing SOL draft without enabling financial execution", () => {
    expect(launchQuote("SOL")?.draftAvailable).toBe(true);
    expect(launchQuoteError("SOL")).toBeNull();
    expect(tradingPair("", "SOL")).toBe("TOKEN/SOL");
    expect(tradingPair(" Example ", "SOL")).toBe("Example/SOL");
  });
  it("does not silently substitute SOL for saved USDC or AECO choices", () => {
    for (const asset of ["USDC", "AECO"] as const) {
      expect(launchQuote(asset)?.asset).toBe(asset);
      expect(tradingPair("EXAMPLE", asset)).toBe(`EXAMPLE/${asset}`);
      expect(launchQuote(asset)?.draftAvailable).toBe(false);
      expect(launchQuoteError(asset)).toContain("unavailable");
      expect(launchQuoteError(asset)).toContain("explicitly");
    }
  });
  it("offers USDC only when the backend reports it enabled, and AECO never", () => {
    expect(launchQuote("USDC", true)?.draftAvailable).toBe(true);
    expect(launchQuoteError("USDC", true)).toBeNull();
    expect(launchQuote("USDC", true)?.requirement).toContain("0.05 SOL launch charge is still paid in SOL");
    expect(launchQuote("AECO", true)?.draftAvailable).toBe(false);
    expect(launchQuoteError("AECO", true)).toContain("explicitly");
  });
  it("rejects arbitrary mints, malformed preferences and unknown discriminants", () => {
    for (const invalid of ["", "sol", "BTC", "__proto__", null, 1, { asset: "SOL" },
      "So11111111111111111111111111111111111111112", "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"]) {
      expect(launchQuote(invalid)).toBeNull();
      expect(launchQuoteError(invalid)).not.toBeNull();
    }
  });
  it("never publishes frontend-selected mints as protocol eligibility", () => {
    expect(LAUNCH_QUOTE_OPTIONS.map((o) => o.asset)).toEqual(["SOL", "USDC", "AECO"]);
    expect(LAUNCH_QUOTE_OPTIONS.find((o) => o.asset === "AECO")?.status).toBe("Coming soon");
    expect(LAUNCH_QUOTE_OPTIONS.every((o) => !("mint" in o) && !("liveEnabled" in o))).toBe(true);
  });
});
