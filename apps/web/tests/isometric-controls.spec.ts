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
});
test("touch pan and pinch retain isometric camera limits", async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage(); await page.goto("/?source=backend");
  const city = page.getByTestId("city-canvas");
  await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings"))).toBeGreaterThan(100);
  const client = await context.newCDPSession(page);
  const touch = async (type: "touchStart" | "touchMove" | "touchEnd", points: {x: number; y: number; id: number}[]) => client.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  await touch("touchStart", [{ x: 160, y: 430, id: 1 }]);
  await touch("touchMove", [{ x: 160, y: 250, id: 1 }]); await touch("touchEnd", []);
  await touch("touchStart", [{ x: 130, y: 420, id: 1 }, { x: 230, y: 420, id: 2 }]);
  await touch("touchMove", [{ x: 100, y: 400, id: 1 }, { x: 260, y: 440, id: 2 }]); await touch("touchEnd", []);
  await page.waitForTimeout(500);
  const p = JSON.parse((await city.getAttribute("data-camera"))!), d = p.position.map((v: number, i: number) => v - p.target[i]);
  expect(Math.acos(d[1] / Math.hypot(...d))).toBeLessThanOrEqual(1.20001);
  await page.getByRole("button", { name: "Reset camera" }).click();
  await page.screenshot({ path: "artifacts/isometric-restored-mobile.png" }); await context.close();
});
