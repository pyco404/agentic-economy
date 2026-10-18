import { expect, test, type Page } from "@playwright/test";

const key = "agentic-economy:form-draft:v1:launchpad:quoteAsset";
async function openLaunchpad(page: Page) {
  // Exercise the legacy offline draft form independently of authenticated workspace capabilities.
  await page.route("**/api/v1/launchpad/capabilities", route => route.fulfill({status:404,contentType:"application/json",body:"{}"}));
  await page.goto("/?source=backend#launchpad");
  // The connection HUD belongs to World and is not rendered on an open page.
  await expect(page.locator(".app")).toHaveAttribute("data-source", "backend");
  await expect.poll(async () => Number(await page.locator(".app").getAttribute("data-stream-seq")), { timeout: 60000 }).toBeGreaterThan(0);
  await expect(page.getByRole("group", { name: "Choose Trading Pair" })).toBeVisible();
}
for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`safe SOL quote draft, persistence and layout at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize(viewport);
    const writes: string[] = [], errors: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(r.url()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await openLaunchpad(page);
    const sol = page.getByRole("radio", { name: "SOL", exact: true });
    await expect(sol).toBeChecked(); await expect(sol).toBeEnabled();
    await sol.focus(); await page.keyboard.press("ArrowRight");
    await expect(sol).toBeChecked();
    await expect(page.getByRole("radio", { name: "USDC", exact: true })).toBeDisabled();
    await expect(page.getByRole("radio", { name: "$AECO", exact: true })).toBeDisabled();
    await expect(page.getByText("Coming soon", { exact: true })).toBeVisible();
    await page.getByLabel("Token name", { exact: true }).fill("Example Coin");
    await page.getByLabel("Symbol", { exact: true }).fill("EXAMPLE");
    await expect(page.getByRole("status", { name: "Trading pair preview" })).toContainText("EXAMPLE/SOL");
    await page.locator("form").getByRole("button", { name: "Connect wallet", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("Connect your wallet");
    await page.getByRole("button", { name: "Close wallet selection" }).click();
    const review = page.getByRole("region", { name: "Launch draft review" });
    await expect(review).toHaveCount(0);
    await expect(page.getByText("0.05 SOL", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Wallet signing unavailable" })).toBeDisabled();
    await page.getByLabel("Symbol", { exact: true }).fill("NEW");
    await expect(review).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Trading pair preview" })).toContainText("NEW/SOL");
    await page.getByRole("button", { name: "Close page and view city", exact: true }).click();
    await page.getByRole("button", { name: "Show page", exact: true }).click();
    await expect(sol).toBeChecked();
    // Leaving the route unmounts this form; the same draft must be restored.
    await page.getByRole("link", { name: "About Agentic Economy", exact: true }).click();
    if (viewport.width <= 850) await page.getByRole("button", { name: "Toggle navigation" }).click();
    await page.getByRole("link", { name: "Launchpad", exact: true }).click();
    await expect(sol).toBeChecked();
    await expect(page.getByLabel("Symbol", { exact: true })).toHaveValue("NEW");
    await page.reload();
    await expect(page.getByRole("group", { name: "Choose Trading Pair" })).toBeVisible({ timeout: 60000 });
    await expect(sol).toBeChecked();
    await expect(page.getByLabel("Symbol", { exact: true })).toHaveValue("NEW");
    await expect(review).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const card of await page.locator(".launch-quote-card").all()) {
      const box = (await card.boundingBox())!;
      expect(box.width).toBeGreaterThan(44); expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.getByRole("group", { name: "Choose Trading Pair" }).screenshot({ path: `artifacts/launch-quotes-${viewport.width}.png` });
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });
}
for (const saved of ["USDC", "AECO", "unverified-mint"]) {
  test(`saved ${saved} preference cannot silently become a SOL launch`, async ({ page }) => {
    test.setTimeout(120000);
    await page.addInitScript(({ key, saved }) => sessionStorage.setItem(key, JSON.stringify(saved)), { key, saved });
    await openLaunchpad(page);
    if (saved === "USDC" || saved === "AECO") {
      await expect(page.getByRole("radio", { name: saved === "AECO" ? "$AECO" : saved, exact: true })).toBeChecked();
      await expect(page.getByRole("status", { name: "Trading pair preview" })).toContainText(`TOKEN/${saved}`);
    } else await expect(page.getByRole("status", { name: "Trading pair preview" })).toContainText("Choose a quote asset");
    await expect(page.getByRole("radio", { name: "SOL", exact: true })).not.toBeChecked();
    await expect(page.locator("form").getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
    await expect(page.getByRole("alert")).toBeVisible();
    // Connection remains available, but submitting never reviews an unauthenticated draft.
    await page.getByLabel("Token name", { exact: true }).fill("Invalid quote");
    await page.getByLabel("Symbol", { exact: true }).fill("BAD");
    await page.locator("form").evaluate((form) => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await expect(page.getByRole("region", { name: "Launch draft review" })).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Close wallet selection" }).click();
    await page.getByRole("radio", { name: "SOL", exact: true }).check();
    await expect(page.locator("form").getByRole("button", { name: "Connect wallet", exact: true })).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    expect(await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)!), key)).toBe("SOL");
    await expect(page.getByText("0.05 SOL", { exact: true })).toBeVisible();
  });
}

test("Explore never guesses quote assets on records without verified pair data", async ({ page }) => {
  test.setTimeout(180000);
  // Explicit recorded demo fixtures, not simulated live market data.
  await page.goto("/?source=fixtures#explore");
  await expect(page.getByRole("combobox", { name: "Filter quote asset" })).toBeDisabled();
  await expect(page.locator("#quote-data-note")).toContainText("unavailable");
  const card = page.locator(".discovery-card").first();
  await expect(card).toContainText("Trading pair unavailable");
  expect(await card.innerText()).not.toMatch(/\/(SOL|USDC|AECO)\b/);
  await card.click();
  await expect(page.locator(".token-header")).toContainText("launch record contains no verified quote asset");
  await expect(page.locator(".market-metrics")).toContainText("Unavailable");
  await expect(page.locator(".token-header")).toContainText("MOCK-CHAIN CONFIRMED");
});
