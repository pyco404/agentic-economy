import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Treasury } from "../components/Pages";
import { demoDashboard } from "./adapter";
import { TreasurySummary, WRAPPED_SOL_MINT } from "./shared";

describe("multi-asset treasury presentation (demo fixtures only)", () => {
  it("renders each received asset with its own decimals without adding or converting them", () => {
    const data = demoDashboard();
    data.treasury.recentEntries = [
      { assetMint: WRAPPED_SOL_MINT, assetSymbol: "SOL", decimals: 9, amount: "60000000" },
      { assetMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", assetSymbol: "USDC", decimals: 6, amount: "12000000" },
      // Explicit synthetic test asset, not a configured or verified AECO mint.
      { assetMint: "11111111111111111111111111111111", assetSymbol: "AECO", decimals: 6, amount: "42000000" },
    ].map((a, i) => ({ ...a, id: `test_receipt_${i}`, seq: i, stream: "creator_fee", account: "agent_rewards",
      accountAddress: "11111111111111111111111111111111", direction: "credit", signature: "1".repeat(88),
      instructionIndex: i, slot: 1, finality: "finalized", tokenMint: null, launchId: null, supersedes: null,
      recordedAt: "2026-10-16T00:00:00Z" }));
    TreasurySummary.parse(data.treasury);
    const html = renderToStaticMarkup(createElement(Treasury, { data }));
    for (const amount of ["0.06 SOL", "12 USDC", "42 AECO"]) expect(html).toContain(amount);
    expect(html).not.toContain("12 SOL"); expect(html).not.toContain("42 SOL");
    expect(html).toContain("payouts disabled"); expect(html).toContain("simulated receipts");
    expect(data.treasury.feeRouting.verified).toBe(false);
  });
});
