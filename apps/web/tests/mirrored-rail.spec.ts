import { expect, test, type Page } from "@playwright/test";
const state = async (page: Page) => JSON.parse(await page.getByTestId("city-canvas").getAttribute("data-rail-service") ?? "{}");
async function review(page: Page, detail: { time?: number; rate?: number; focus?: { x: number; z: number; zoom: number; reverse?: boolean } }) {
  const city = page.getByTestId("city-canvas"), before = await city.getAttribute("data-frame-number");
  await city.evaluate((node, value) => node.dispatchEvent(new CustomEvent("city-rail-review", { detail: value })), detail);
  await expect.poll(() => city.getAttribute("data-frame-number"), { timeout: 45000 }).not.toBe(before);
}
for (const viewport of [{ width: 1440, height: 1000 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`two matching railways and independent trains at ${viewport.width}px`, async ({ page, request }) => {
    test.setTimeout(300000); await page.setViewportSize(viewport);
    const geometry = async () => (await (await request.get("http://127.0.0.1:8787/api/v1/world/chunks?x=1&y=1&radius=4")).json()).chunks
      .flatMap((c: any) => c.buildings.map((b: any) => [b.id, b.origin, b.params.width, b.params.depth])).sort((a: any, b: any) => a[0].localeCompare(b[0]));
    const before = await geometry(), writes: string[] = [], errors: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/v1/") && r.method() !== "GET") writes.push(r.url()); });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?source=backend&railReview=1");
    const city = page.getByTestId("city-canvas");
    await expect.poll(async () => JSON.parse(await city.getAttribute("data-mirrored-railway") ?? "{}").mode, { timeout: 90000 }).toBe("mirrored");
    const report = JSON.parse((await city.getAttribute("data-railway"))!), mirror = JSON.parse((await city.getAttribute("data-mirrored-railway"))!);
    expect(report.issues).toEqual([]); expect(mirror.issues).toEqual([]);
    expect(mirror.visibleLength).toBe(report.visibleLength); expect(mirror.offset).toBeLessThanOrEqual(8);
    expect(JSON.parse((await city.getAttribute("data-ambient-actors"))!).train).toBe(2);
    await page.screenshot({ path: `artifacts/mirrored-rail-default-${viewport.width}.png` });
    await page.getByRole("button", { name: "Enter immersive mode" }).press("Enter");
    const base = await state(page);
    await review(page, { time: base.period - 30, rate: 0, focus: { x: 72, z: mirror.centerZ, zoom: viewport.width < 600 ? .85 : 1.3 } });
    await expect.poll(async () => (await state(page)).cars.filter((c: any) => c.visible).length).toBe(3);
    expect((await state(page)).mirrored.cars.filter((c: any) => c.visible)).toHaveLength(3);
    await page.screenshot({ path: `artifacts/mirrored-rail-aerial-${viewport.width}.png` });
    if (viewport.width === 1440) {
      // Four orbit views: real drag controls, no default camera changes.
      const canvas = page.locator("canvas"), rect = (await canvas.boundingBox())!;
      for (let i = 0; i < 4; i++) {
        await page.mouse.move(rect.x + rect.width * .52, rect.y + rect.height * .55);
        await page.mouse.down(); await page.mouse.move(rect.x + rect.width * .52 + 220, rect.y + rect.height * .55, { steps: 8 }); await page.mouse.up();
        await page.screenshot({ path: `artifacts/mirrored-rail-orbit-${i}.png` });
      }
      for (const [offset, expected] of [[base.hiddenAt + 1, "underground"], [base.emergesAt + .5, "emerging-tunnel"], [base.emergesAt + 8, "surface"]] as const) {
        await review(page, { time: (offset - base.mirrored.phaseSeconds + base.period) % base.period, rate: 0,
          focus: { x: expected === "underground" ? 20 : 148, z: base.mirrored.reflectionZ - (expected === "underground" ? -7 : 1), zoom: 4 } });
        await expect.poll(async () => (await state(page)).mirrored.state).toBe(expected);
        expect((await state(page)).mirrored.hiddenSeconds).toBe(120);
        expect((await state(page)).mirrored.trackVisible).toBe(true);
        await page.screenshot({ path: `artifacts/mirrored-rail-${expected}.png` });
      }
      await review(page, { time: 0, rate: 60 });
      await expect.poll(async () => Number(await city.getAttribute("data-rail-seconds")), { timeout: 45000 }).toBeGreaterThan(base.period * 2);
    }
    expect((await state(page)).trackVisible).toBe(true); expect((await state(page)).mirrored.trackVisible).toBe(true);
    expect(await geometry()).toEqual(before); expect(writes).toEqual([]); expect(errors).toEqual([]);
  });
}
