import { describe, expect, it } from "vitest";
import { baseUnits, explorerTx } from "./tokenMarkets";

describe("on-chain amount formatting", () => {
  it("converts raw base units exactly, without floating-point rounding", () => {
    expect(baseUnits("3497882795867", 6)).toBe(`${(3497882).toLocaleString()}.795867`);
    expect(baseUnits("981171", 9)).toBe("0.000981171");
    expect(baseUnits("2500000", 6)).toBe("2.5");
    expect(baseUnits("0", 9)).toBe("0");
    expect(baseUnits("18446744073709551615", 9)).toBe(`${(18446744073n).toLocaleString()}.709551615`);
  });
  it("links transactions to the explorer for the token's own network", () => {
    expect(explorerTx("sig", "devnet")).toBe("https://explorer.solana.com/tx/sig?cluster=devnet");
    expect(explorerTx("sig", "mainnet-beta")).toBe("https://explorer.solana.com/tx/sig");
  });
});
