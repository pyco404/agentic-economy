import { expect, test } from "@playwright/test";
for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`roadmap and proposed ecosystem policies over the same world at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(300000); await page.setViewportSize(viewport);
    const writes: string[] = [], errors: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(r.url()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?source=backend",{waitUntil:"domcontentloaded"});
    await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
    const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
    await expect(city).toHaveAttribute("data-world-state","FULLY_ACTIVE",{timeout:120000});
    const camera = JSON.parse((await city.getAttribute("data-camera"))!);
    await canvas.evaluate((node) => { (window as any).__ecosystemCanvas = node; });
    await expect(page.locator(".world-header")).toContainText("A World That Works");
    await expect(page.locator(".world-header").getByRole("heading", { name: "A city in motion." })).toBeVisible();
    await page.screenshot({ path: `artifacts/ecosystem-world-${viewport.width}.png` });
    const roadmapLink = page.locator(".topbar .nav").getByRole("link", { name: "Roadmap", exact: true });
    if (await roadmapLink.isVisible()) await roadmapLink.press("Enter");
    else {
      await page.getByRole("button", { name: "Toggle navigation" }).click();
      await page.getByRole("dialog", { name: "Navigation", exact: true }).getByRole("link", { name: "Roadmap", exact: true }).click();
    }
    const roadmap = page.getByRole("region", { name: "Eight development phases" });
    await expect(roadmap).toBeVisible();
    await expect(roadmap.locator("summary")).toHaveCount(8);
    await expect(roadmap.locator("details").nth(1)).toHaveAttribute("open", "");
    await expect(roadmap.locator("details").nth(1)).toContainText("Outstanding / in development");
    await roadmap.locator("summary").first().click();
    await page.locator("#roadmap-title").scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/ecosystem-roadmap-${viewport.width}.png` });
    // Phase 2 is already expanded as the current development phase.
    await expect(roadmap.locator("details").nth(1)).toHaveAttribute("open", "");
    await expect(roadmap.locator("details").nth(1)).toContainText("Real-device mobile wallet acceptance");
    await page.getByRole("link", { name: "About Agentic Economy", exact: true }).press("Enter");
    await expect(page.locator(".about-page .roadmap-phases")).toHaveCount(0);
    await page.locator("#about-agents").scrollIntoViewIfNeeded();
    await expect(page.getByRole("heading", { name: "Common Agents", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Super Agents", exact: true })).toBeVisible();
    await expect(page.locator("#about-agents")).toContainText("not upgraded Common Agents");
    await expect(page.locator("#about-agents")).toContainText("minimum AECO requirement is not finalized");
    await page.locator("#about-agents").screenshot({ path: `artifacts/ecosystem-agents-${viewport.width}.png` });
    await page.locator("#about-economic-model").scrollIntoViewIfNeeded();
    const fees = page.getByRole("region", { name: "Proposed creator-fee policies", exact: true });
    await expect(fees).toContainText("Super-Agent allocations planned");
    const active = fees.getByRole("row", { name: /Super-Agent token · active rental/ });
    await expect(active).toContainText("50%"); await expect(active).toContainText("40%"); await expect(active).toContainText("10%");
    await fees.getByText("Rental fee claims and expiry — proposed", { exact: true }).click();
    await expect(fees).toContainText("Historical fee entitlement does not transfer");
    await page.locator("#about-faq").scrollIntoViewIfNeeded();
    await page.getByText("Are Credits redeemable for $AECO today?", { exact: true }).click();
    await expect(page.locator("#about-faq")).toContainText("No. Current Credits are simulated");
    await page.locator("#about-direction-title").scrollIntoViewIfNeeded();
    await expect(page.getByRole("link", { name: "Explore Our Roadmap" })).toBeVisible();

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const broken = await page.locator(".about-page [aria-labelledby]").evaluateAll((nodes) => nodes.flatMap((node) =>
      node.getAttribute("aria-labelledby")!.split(" ").filter((id) => !document.getElementById(id))));
    expect(broken).toEqual([]);
    await page.getByRole("button", { name: "Close page and view city", exact: true }).press("Enter");
    const after = JSON.parse((await city.getAttribute("data-camera"))!);
    expect(after.zoom).toBe(camera.zoom);
    for (const key of ["position", "target"]) after[key].forEach((value: number, i: number) => expect(value).toBeCloseTo(camera[key][i], 8));
    expect(await canvas.evaluate((node) => node === (window as any).__ecosystemCanvas)).toBe(true);
    await page.getByRole("button", { name: "Show page", exact: true }).press("Enter");
    await expect(page.locator("#about-title")).toBeVisible();
    expect(writes).toEqual([]); expect(errors).toEqual([]);
  });
}
test("origin tags remain unverified for demo launches and cannot assert Super-Agent provenance", async ({ page }) => {
  await page.goto("/?source=fixtures#explore");
  const card = page.locator(".discovery-card").first();
  await expect(card.locator(".launch-origin-tag")).toHaveText("Demo · origin unverified");
  await expect(card.locator(".launch-origin-tag")).toHaveAttribute("data-origin", "unknown");
  await card.click();
  await expect(page.locator(".token-header .launch-origin-tag")).toHaveText("Demo · origin unverified");
  expect(await page.locator('.launch-origin-tag[data-origin="SUPER-AGENT"]').count()).toBe(0);
});
