import { expect, test } from "@playwright/test";
test("isometric orbit, pan, zoom, reset and single-line labels", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/?source=backend");
  await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
  const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
  const polar = async () => { const p = JSON.parse((await city.getAttribute("data-camera"))!);
    const d = p.position.map((v: number, i: number) => v - p.target[i]); return Math.acos(d[1] / Math.hypot(...d)); };
  await expect.poll(polar).toBeCloseTo(Math.acos(90 / Math.hypot(100, 90, 100)), 2);
  await expect(page.getByRole("button", { name: "Toggle skyline view" })).toHaveCount(0);
  const rect = (await canvas.boundingBox())!, x = rect.width * 0.48, y = rect.y + rect.height * 0.65;
  for (const [dx, dy] of [[0, -300], [0, 300], [-300, 0], [300, 0]]) {
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx!, y + dy!, { steps: 8 }); await page.mouse.up();
    await expect.poll(polar).toBeLessThanOrEqual(1.20001); expect(await polar()).toBeGreaterThanOrEqual(0.24999);
  }
  await page.mouse.move(x, y); await page.mouse.down({ button: "right" });
  await page.mouse.move(x + 60, y + 20, { steps: 5 }); await page.mouse.up({ button: "right" });
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -150); await page.mouse.wheel(0, 150); }
  await canvas.focus(); await page.keyboard.press("v"); await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Reset camera" }).click();
  await expect.poll(polar).toBeCloseTo(Math.acos(90 / Math.hypot(100, 90, 100)), 2);
  await page.screenshot({ path: "artifacts/isometric-restored-desktop.png" });
  await expect.poll(async () => Number(await city.getAttribute("data-agent-labels"))).toBeGreaterThan(0);
  for (const label of await page.locator(".agent-world-label:visible").all()) {
    await expect(label.locator("small")).toHaveCount(0);
    expect(await label.innerText()).toMatch(/^[A-Z][A-Za-z]+_\d{3}$/);
  }
  await page.getByRole("button", { name: "Explore buildings" }).click();
  await page.locator(".building-list button").first().click();
  await expect(page.getByRole("complementary", { name: "Building details", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close building details" }).click();
  await page.getByRole("button", { name: "Reset camera" }).press("Enter");
  await expect.poll(() => page.locator(".agent-world-label:visible").count()).toBeGreaterThan(0);
  await page.locator(".agent-world-label:visible").first().press("Enter");
  await expect(page.getByRole("complementary", { name: "Agent details", exact: true })).toBeVisible();
  await expect(page.getByTestId("agent-canonical-id")).toContainText("agt_");
});
for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`original two-finger orbit and pinch work at ${viewport.width}px`, async ({ browser }) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?source=backend");
    await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
    const city = page.getByTestId("city-canvas");
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
    const camera = async () => JSON.parse((await city.getAttribute("data-camera"))!);
    const initial = await camera();
    const client = await context.newCDPSession(page);
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd", points: {x: number; y: number; id: number}[]) =>
      client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
    const x = viewport.width * .38, y = viewport.height * .54;
    // Translation of a two-finger gesture rotates; widening it also zooms.
    // This is the original DOLLY_ROTATE mapping, not the experimental DOLLY_PAN.
    await touch("touchStart", [{ x: x - 50, y, id: 1 }, { x: x + 50, y, id: 2 }]);
    for (let step = 1; step <= 8; step++) await touch("touchMove", [
      { x: x - 50 + step * 3, y: y - step * 7, id: 1 },
      { x: x + 50 + step * 9, y: y - step * 7, id: 2 },
    ]);
    await touch("touchEnd", []);
    await expect.poll(async () => (await camera()).zoom).toBeGreaterThan(initial.zoom);
    await expect.poll(async () => (await camera()).position[0]).not.toBe(initial.position[0]);
    expect((await camera()).target).toEqual(initial.target);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
    const p = await camera(), d = p.position.map((v: number, i: number) => v - p.target[i]);
    expect(Math.acos(d[1] / Math.hypot(...d))).toBeLessThanOrEqual(1.20001);
    expect(Math.acos(d[1] / Math.hypot(...d))).toBeGreaterThanOrEqual(.24999);
    await page.getByRole("button", { name: "Reset camera" }).press("Enter");
    await expect.poll(async () => Math.hypot(...(await camera()).target.map((v: number, i: number) => v - initial.target[i]))).toBeLessThan(.05);
    await expect.poll(async () => (await camera()).zoom).toBe(initial.zoom);
    const reset = await camera(), delta = reset.position.map((v: number, i: number) => v - reset.target[i]);
    await expect.poll(async () => {
      const c = await camera(), diff = c.position.map((v: number, i: number) => v - c.target[i]);
      return Math.acos(diff[1] / Math.hypot(...diff));
    }).toBeCloseTo(Math.acos(90 / Math.hypot(100, 90, 100)), 2);
    expect(delta.every(Number.isFinite)).toBe(true);
    await page.screenshot({ path: `artifacts/restored-world-${viewport.width}.png` });
    expect(errors).toEqual([]);
    await context.close();
  });
}
