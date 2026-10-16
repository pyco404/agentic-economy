import { expect, test } from "@playwright/test";

test("live agent labels identify citizens, reduce clutter and open actual agent inspection", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?source=backend");
  await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
  const city = page.getByTestId("city-canvas");
  await expect.poll(async () => Number(await city.getAttribute("data-agent-labels"))).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause city animation" }).click();
  const label = page.locator(".agent-world-label:visible").first();
  const title = await label.getAttribute("title");
  expect(title).toContain("backend:");
  const name = (await label.getAttribute("data-display-name"))!;
  expect(await label.evaluate((node) => getComputedStyle(node).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: "artifacts/agent-labels-overview.png" });
  await label.click();
  const inspector = page.getByRole("complementary", { name: "Agent details", exact: true });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByRole("heading", { name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Zoom out", exact: true }).evaluate((button) => {
    for (let i = 0; i < 12; i++) (button as HTMLButtonElement).click();
  });
  await expect.poll(async () => Number(await city.getAttribute("data-agent-labels"))).toBeLessThanOrEqual(4);
  await expect(page.locator('.agent-world-label[data-selected="true"]')).toBeVisible();
  await page.getByRole("button", { name: "Zoom in", exact: true }).evaluate((button) => {
    for (let i = 0; i < 9; i++) (button as HTMLButtonElement).click();
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "artifacts/agent-labels-close.png" });
  expect(errors).toEqual([]);
});

test("ambient actors stay decorative, toggle without recreating WebGL and respect motion preferences", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/?source=backend");
  const city = page.getByTestId("city-canvas");
  await expect.poll(async () => JSON.parse((await city.getAttribute("data-ambient-actors")) ?? "{}").cars).toBe(6);
  const counts = JSON.parse((await city.getAttribute("data-ambient-actors"))!);
  expect(counts).toEqual({ train: 1, cars: 6, plane: 1, helicopter: 1, balloon: 1 });
  await page.locator("canvas").evaluate((canvas) => { (window as any).__ambientCanvas = canvas; });
  await page.getByRole("button", { name: "Toggle ambient scenery" }).click();
  await page.waitForTimeout(100);
  const frozen = await city.getAttribute("data-ambient-time");
  await page.waitForTimeout(200);
  expect(await city.getAttribute("data-ambient-time")).toBe(frozen);
  await page.getByRole("button", { name: "Toggle ambient scenery" }).click();
  await expect.poll(async () => Number(await city.getAttribute("data-ambient-time"))).toBeGreaterThan(Number(frozen));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(100);
  const reduced = await city.getAttribute("data-ambient-time");
  await page.waitForTimeout(200);
  expect(await city.getAttribute("data-ambient-time")).toBe(reduced);
  expect(await page.locator("canvas").evaluate((canvas) => canvas === (window as any).__ambientCanvas)).toBe(true);
  await page.screenshot({ path: "artifacts/ambient-city-overview.png" });
});
