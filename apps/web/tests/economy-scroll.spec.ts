import { expect, test } from "@playwright/test";

for (const width of [1440, 820, 390]) test(`bounded Economy panels scroll independently at ${width}px`, async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 },
    hasTouch: width < 1000, isMobile: width < 1000, deviceScaleFactor: .5, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?source=backend#economy");
    const market = page.getByRole("region", { name: "Resource market rows", exact: true });
    const queue = page.getByRole("region", { name: "Useful work entries", exact: true });
    await expect(market.locator("tbody tr").first()).toBeVisible();
    await expect(queue.locator(".task-row").first()).toBeVisible();
    const city = page.getByTestId("city-canvas");
    await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 90000 }).toBeGreaterThan(100);
    const panels = await page.locator(".economy-panel").evaluateAll((nodes) => nodes.map((node) => {
      const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, height: r.height };
    }));
    expect(panels[0]!.height).toBe(panels[1]!.height);
    expect(panels[0]!.height).toBeGreaterThanOrEqual(width > 1000 ? 440 : 320);
    expect(panels[0]!.height).toBeLessThanOrEqual(width > 1000 ? 480 : 400);
    if (width > 1000) expect(panels[0]!.y).toBe(panels[1]!.y);
    else expect(panels[1]!.y).toBeGreaterThan(panels[0]!.y + panels[0]!.height);

    // Stress the native layout with local DOM-only long-content fixtures. These
    // never enter application state or pretend to be authoritative market data.
    await market.locator("tbody").evaluate((tbody) => {
      const row = tbody.firstElementChild!;
      for (let i = 0; i < 35; i++) { const clone = row.cloneNode(true) as HTMLElement; clone.dataset.scrollFixture = "true"; tbody.append(clone); }
    });
    await queue.evaluate((node) => {
      const row = node.firstElementChild!;
      for (let i = 0; i < 35; i++) { const clone = row.cloneNode(true) as HTMLElement; clone.dataset.scrollFixture = "true"; node.append(clone); }
    });
    const camera = await city.getAttribute("data-camera");
    for (const content of [market, queue]) {
      await content.scrollIntoViewIfNeeded();
      const panel = content.locator("..");
      const headingY = (await panel.locator("h2").boundingBox())!.y;
      const box = (await content.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(100, box.height / 2));
      await page.mouse.wheel(0, 190.5);
      await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(30);
      expect((await panel.locator("h2").boundingBox())!.y).toBeCloseTo(headingY, 0);
      if (content === market) {
        const header = (await market.locator("th").first().boundingBox())!;
        expect(header.y).toBeCloseTo((await market.boundingBox())!.y, 0);
        expect(await queue.evaluate((node) => node.scrollTop)).toBe(0);
      }
      await content.focus(); await expect(content).toBeFocused();
      // Chromium's mobile emulation does not dispatch desktop Home/End scroll
      // defaults. Check keyboard scrolling on desktop and real touch below.
      if (width > 1000) {
        await page.keyboard.press("Home");
        await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBe(0);
        await page.keyboard.press("End");
        await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
      }
      if (width < 1000) {
        await content.evaluate((node) => { node.scrollTop = 0; });
        const client = await context.newCDPSession(page), rect = (await content.boundingBox())!;
        const x = rect.x + rect.width / 2, y = rect.y + Math.min(160, rect.height - 20);
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
        for (let i = 1; i <= 6; i++) await client.send("Input.dispatchTouchEvent", {
          type: "touchMove", touchPoints: [{ x, y: y - i * 16, id: 1 }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
        await expect.poll(() => content.evaluate((node) => node.scrollTop)).toBeGreaterThan(10);
        await client.detach();
      }
    }
    const after = JSON.parse((await city.getAttribute("data-camera"))!), before = JSON.parse(camera!);
    expect(after.zoom).toBe(before.zoom);
    for (const key of ["position", "target"]) after[key].forEach((v: number, i: number) => expect(v).toBeCloseTo(before[key][i], 8));
    // Authoritative task counts can change during this test; all stress rows
    // must remain present independently of those legitimate live changes.
    await expect(market.locator("[data-scroll-fixture]")).toHaveCount(35);
    await expect(queue.locator("[data-scroll-fixture]")).toHaveCount(35);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `artifacts/economy-panels-long-${width}.png` });
    // Short-content fixture: neither scroll container reserves a visible scrollbar.
    for (const content of [market, queue]) await content.evaluate((node) => {
      node.querySelectorAll("[data-scroll-fixture]").forEach((row) => row.remove());
      const rows = node.querySelectorAll<HTMLElement>("tbody tr, .task-row");
      rows.forEach((row, i) => { if (i >= 2) row.style.display = "none"; });
      node.scrollTop = 0;
    });
    for (const content of [market, queue]) expect(await content.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);
    await market.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `artifacts/economy-panels-short-${width}.png` });
    const outer = page.locator(".page-main");
    await outer.evaluate((node) => { node.scrollTop = node.scrollHeight; });
    expect(await outer.evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
