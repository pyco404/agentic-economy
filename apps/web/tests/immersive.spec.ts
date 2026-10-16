import { expect, test } from "@playwright/test";

for (const viewport of [{ name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 820, height: 1180 }, { name: "mobile", width: 390, height: 844 }]) {
  test(`immersive world, inspection and floating controls at ${viewport.name}`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?source=backend");
    await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
    const city = page.getByTestId("city-canvas");
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
    await page.locator("canvas").evaluate((node) => { (window as any).__originalWorldCanvas = node; });
    const dimensions = await page.locator("canvas").evaluate((node) => {
      const bounds = node.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
        scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
        viewportWidth: innerWidth, viewportHeight: innerHeight };
    });
    expect(dimensions.x).toBe(0);
    expect(dimensions.width).toBe(viewport.width);
    expect(dimensions.height + dimensions.y).toBe(viewport.height);
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(viewport.height);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "Pause city animation" }).click();
    await page.screenshot({ path: `artifacts/world-${viewport.name}-default.png` });
    const collapse = page.getByRole("button", { name: "Collapse city activity" });
    if (await collapse.isVisible()) await collapse.click();
    await expect(page.getByRole("button", { name: "Expand city activity" })).toHaveAttribute("aria-expanded", "false");
    await page.screenshot({ path: `artifacts/world-${viewport.name}-collapsed.png` });
    await page.getByRole("button", { name: "Enter immersive mode" }).click();
    await expect(page.getByRole("heading", { name: "A city in motion." })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Exit immersive mode" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zoom in", exact: true })).toBeVisible();
    await page.screenshot({ path: `artifacts/world-${viewport.name}-immersive.png` });
    await page.getByRole("button", { name: "Rotate camera" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
    await page.getByRole("button", { name: "Reset camera" }).click();
    await page.getByRole("button", { name: "Explore buildings" }).click();
    await page.locator(".building-list button").first().click();
    await expect(page.getByRole("complementary", { name: "Building details", exact: true })).toBeVisible();
    await expect.poll(async () => JSON.parse((await city.getAttribute("data-camera"))!).zoom).toBe(6);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `artifacts/world-${viewport.name}-inspection.png` });
    await page.getByRole("button", { name: "Close building details" }).click();
    await page.getByRole("button", { name: "Reset camera" }).click();
    await page.getByRole("button", { name: "Zoom out", exact: true }).evaluate((button) => {
      for (let i = 0; i < 12; i++) (button as HTMLButtonElement).click();
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `artifacts/world-${viewport.name}-wide.png` });
    expect(await page.locator("canvas").evaluate((node) => node === (window as any).__originalWorldCanvas)).toBe(true);
    expect(errors).toEqual([]);
  });
}
