import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const example = JSON.parse(readFileSync(new URL("../../../packages/shared/fixtures/treasury-entries.json", import.meta.url), "utf8")).items[0];

for (const width of [1440, 820, 390]) test(`receipt ledger keeps headings, precision and independent scrolling at ${width}px`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 },
    hasTouch: width < 1000, isMobile: width < 1000, deviceScaleFactor: .5, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    let socket: import("@playwright/test").WebSocketRoute | undefined;
    // Browser-only network fixtures; no receipts are written to the demo backend.
    await page.route("**/api/v1/treasury", async (route) => {
      const response = await route.fetch(), data = await response.json();
      data.recentEntries = Array.from({ length: 45 }, (_, i) => ({ ...example, id: `scroll_receipt_${i}`, seq: 45 - i,
        assetSymbol: i % 2 ? "USDC" : "SOL", decimals: i % 2 ? 6 : 9, amount: i % 2 ? "123456789012345678" : "987654321012345678" }));
      await route.fulfill({ response, json: data });
    });
    await page.routeWebSocket("**/api/v1/ws", (client) => {
      socket = client; const server = client.connectToServer();
      client.onMessage((message) => server.send(message)); server.onMessage((message) => client.send(message));
    });
    await page.goto("/?source=backend#treasury");
    const panel = page.getByRole("region", { name: "Public receipt ledger", exact: true });
    const rows = page.getByRole("region", { name: "Public receipt rows", exact: true });
    await expect(rows.locator("tbody tr")).toHaveCount(45);
    await panel.scrollIntoViewIfNeeded();
    const city = page.getByTestId("city-canvas");
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 90000 }).toBeGreaterThan(100);
    const camera = await city.getAttribute("data-camera"), height = (await panel.boundingBox())!.height;
    expect(height).toBeGreaterThanOrEqual(width > 1000 ? 460 : 320);
    expect(height).toBeLessThanOrEqual(width > 1000 ? 500 : 400);
    await expect(rows).toContainText("987654321.012345678 SOL");
    await expect(rows).toContainText("123456789012.345678 USDC");
    const header = panel.locator(".surface-title"), before = (await header.boundingBox())!;
    const box = (await rows.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 100); await page.mouse.wheel(0, 240.5);
    await expect.poll(() => rows.evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
    expect((await header.boundingBox())!.y).toBe(before.y);
    expect((await rows.locator("th").first().boundingBox())!.y).toBeCloseTo((await rows.boundingBox())!.y, 0);
    await rows.focus(); await expect(rows).toBeFocused();
    if (width > 1000) {
      await page.keyboard.press("Home");
      await expect.poll(() => rows.evaluate((node) => node.scrollTop)).toBe(0);
      await page.keyboard.press("PageDown"); await expect.poll(() => rows.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
    }
    if (width < 1000) {
      const client = await context.newCDPSession(page), r = (await rows.boundingBox())!;
      const x = r.x + r.width / 2, y = r.y + 180;
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      const scroll = await rows.evaluate((node) => node.scrollTop);
      for (let i = 1; i <= 6; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * 18, id: 1 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect.poll(() => rows.evaluate((node) => node.scrollTop)).toBeGreaterThan(scroll);
      await client.detach();
      expect(await rows.evaluate((node) => node.scrollWidth > node.clientWidth)).toBe(true);
    }
    expect(await city.getAttribute("data-camera")).toBe(camera);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/receipt-ledger-long-${width}.png` });
    // Keep the existing reducer's receipt-history policy; inject one local event
    // through the actual WS adapter to verify rerendering retains panel height.
    const seq = Number(await page.locator(".app").getAttribute("data-stream-seq"));
    socket!.send(JSON.stringify({ v: 1, type: "treasury.updated", seq: seq + 1000000, tick: 1, ts: new Date().toISOString(),
      data: { entry: { ...example, id: "scroll_live_receipt", seq: 100, amount: "1122334455", decimals: 9, assetSymbol: "SOL" } } }));
    await expect(rows).toContainText("1.122334455 SOL");
    expect((await panel.boundingBox())!.height).toBe(height);
    await rows.evaluate((node) => {
      node.querySelectorAll<HTMLElement>("tbody tr").forEach((row, i) => { if (i > 1) row.style.display = "none"; }); node.scrollTop = 0;
      const range = document.createRange(); range.selectNodeContents(node.querySelector("td")!);
      getSelection()?.removeAllRanges(); getSelection()?.addRange(range);
    });
    expect(await rows.evaluate((node) => getComputedStyle(node.querySelector("td")!).userSelect)).toBe("text");
    expect(await page.evaluate(() => getSelection()?.toString().length)).toBeGreaterThan(0);
    expect(await rows.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
    await page.screenshot({ path: `artifacts/receipt-ledger-short-${width}.png` });
    expect(await page.locator(".page-main").evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
  } finally { await context.close(); }
});
