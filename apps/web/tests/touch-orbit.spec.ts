import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }]) {
  test(`one-finger orbit and explicit pan preserve the camera preset at ${viewport.width}px`, async ({ browser }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ viewport, isMobile: true, hasTouch: true, deviceScaleFactor: .5, reducedMotion: "reduce" });
    try {
      const page = await context.newPage(), errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/?source=backend");
      const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
      await expect(city).toHaveAttribute("data-reveal-stage", "complete", { timeout: 120000 });
      const read = async () => JSON.parse((await city.getAttribute("data-camera"))!);
      const angles = (camera: any) => {
        const d = camera.position.map((v: number, i: number) => v - camera.target[i]);
        return { yaw: Math.atan2(d[0], d[2]), polar: Math.acos(d[1] / Math.hypot(...d)) };
      };
      const initial = await read();
      const pan = page.getByRole("button", { name: "Pan with one finger", exact: true });
      await expect(pan).toBeVisible(); await expect(pan).toHaveAttribute("aria-pressed", "false");
      const client = await context.newCDPSession(page);
      const drag = async (dx: number, dy: number) => {
        const start = await canvas.evaluate((node) => {
          for (const fy of [.54, .64, .44, .74]) for (const fx of [.42, .54, .32, .62]) {
            const x = innerWidth * fx, y = innerHeight * fy;
            if ([-6, 0, 6].every((dx) => [-6, 0, 6].every((dy) => document.elementFromPoint(x + dx, y + dy) === node))) return { x, y };
          }
          throw new Error("No uncovered canvas target");
        });
        await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ ...start, id: 1 }] });
        for (let i = 1; i <= 8; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove",
          touchPoints: [{ x: start.x + dx * i / 8, y: start.y + dy * i / 8, id: 1 }] });
        await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      };
      const reset = async () => {
        await page.getByRole("button", { name: "Reset camera", exact: true }).tap();
        await expect.poll(async () => (await read()).zoom).toBe(initial.zoom);
        await expect.poll(async () => angles(await read()).polar).toBeCloseTo(angles(initial).polar, 3);
        await expect.poll(async () => angles(await read()).yaw).toBeCloseTo(angles(initial).yaw, 3);
      };
      for (const [dx, dy] of [[45, 0], [0, 35], [-40, -30]]) {
        await reset(); const before = await read(), a = angles(before);
        await drag(dx!, dy!);
        if (dx) await expect.poll(async () => Math.abs(angles(await read()).yaw - a.yaw)).toBeGreaterThan(.02);
        if (dy) await expect.poll(async () => Math.abs(angles(await read()).polar - a.polar)).toBeGreaterThan(.02);
        const after = await read(); expect(after.target).toEqual(before.target); expect(after.zoom).toBe(before.zoom);
        expect(angles(after).polar).toBeGreaterThanOrEqual(.25); expect(angles(after).polar).toBeLessThanOrEqual(1.2);
      }
      await reset(); await pan.tap(); await expect(pan).toHaveAttribute("aria-pressed", "true");
      const beforePan = await read(); await drag(45, 25);
      await expect.poll(async () => Math.hypot(...(await read()).target.map((v: number, i: number) => v - beforePan.target[i]))).toBeGreaterThan(.1);
      const afterPan = angles(await read()); expect(afterPan.yaw).toBeCloseTo(angles(beforePan).yaw, 5); expect(afterPan.polar).toBeCloseTo(angles(beforePan).polar, 5);
      await pan.tap(); await expect(pan).toHaveAttribute("aria-pressed", "false"); await reset();
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await page.evaluate(() => getSelection()?.toString() ?? "")).toBe("");
      await page.screenshot({ path: `artifacts/one-finger-orbit-${viewport.width}.png` });
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
