import { expect, test, type Page } from "@playwright/test";

// AgenticPad-style camera: drag orbits (yaw + elevation) about a fixed target, two fingers pan and
// pinch, motion eases by time without overshoot. Touch is driven through CDP touch events.
type Cam = { yaw: number; polar: number; target: number[]; zoom: number };
const camera = async (page: Page): Promise<Cam> => {
  const p = JSON.parse((await page.getByTestId("city-canvas").getAttribute("data-camera"))!);
  const d = p.position.map((v: number, i: number) => v - p.target[i]);
  return { yaw: Math.atan2(d[0], d[2]), polar: Math.acos(d[1] / Math.hypot(...d)), target: p.target, zoom: p.zoom };
};
const angle = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const moved = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));
/** Waits until the eased camera stops moving, recording yaw on the way to check there is no overshoot. */
async function settle(page: Page) {
  // Software-rendered WebGL can take longer than 400 ms per frame, so "settled" means unchanged for 1.5 s.
  const yaws: number[] = [];
  let last = await camera(page), still = 0;
  for (let i = 0; i < 300; i++) {
    await page.waitForTimeout(50);
    const next = await camera(page);
    yaws.push(next.yaw);
    const same = Math.abs(angle(last.yaw, next.yaw)) < 1e-5 && Math.abs(next.polar - last.polar) < 1e-5 && moved(last.target, next.target) < 1e-4;
    still = same ? still + 1 : 0;
    if (still >= 30) return { cam: next, yaws };
    last = next;
  }
  throw new Error("camera did not settle within 15 s");
}
// Camera behaviour does not depend on live data: the explicit offline fixtures render the same city.
async function ready(page: Page) {
  await page.goto("/?source=fixtures");
  await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(40); // fixture city: ~66
  return (await settle(page)).cam;
}
const noSelection = async (page: Page) => {
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
};

for (const [name, viewport] of [["phone portrait", { width: 390, height: 844 }], ["phone landscape", { width: 844, height: 390 }], ["tablet", { width: 820, height: 1180 }]] as const) {
  test(`touch: one finger orbits, two fingers pan and pinch (${name})`, async ({ browser }) => {
    test.setTimeout(360000); // CPU-rendered WebGL is slow on large viewports
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const start = await ready(page);
    const client = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: Array<{ x: number; y: number; id: number }>) => client.send("Input.dispatchTouchEvent", { type, touchPoints });
    const cx = viewport.width / 2, cy = viewport.height * 0.55;
    const drag = async (points: (t: number) => Array<{ x: number; y: number; id: number }>) => {
      await touch("touchStart", points(0));
      for (let i = 1; i <= 10; i++) await touch("touchMove", points(i / 10));
      await touch("touchEnd", []);
    };

    // One finger, horizontally: the view turns to another side of the city; the target stays put.
    await drag((t) => [{ x: cx - 80 + 160 * t, y: cy, id: 1 }]);
    const turned = await settle(page);
    expect(Math.abs(angle(start.yaw, turned.cam.yaw))).toBeGreaterThan(0.5); // ~160 px · 0.006 rad/px ≈ 0.96 rad
    expect(moved(start.target, turned.cam.target)).toBeLessThan(0.01);
    // Eased, never reversing: every sample moves the same way as the total.
    const total = angle(start.yaw, turned.cam.yaw);
    for (let i = 1; i < turned.yaws.length; i++) expect(angle(turned.yaws[i - 1]!, turned.yaws[i]!) * Math.sign(total)).toBeGreaterThanOrEqual(-1e-6);

    // One finger, vertically: elevation changes within the existing limits (no extreme side profile).
    await drag((t) => [{ x: cx, y: cy - 60 + 120 * t, id: 1 }]);
    const tilted = (await settle(page)).cam;
    expect(Math.abs(tilted.polar - turned.cam.polar)).toBeGreaterThan(0.05);
    expect(tilted.polar).toBeGreaterThanOrEqual(0.24999);
    expect(tilted.polar).toBeLessThanOrEqual(1.20001);
    expect(moved(turned.cam.target, tilted.target)).toBeLessThan(0.01);

    // Two fingers moving together: the camera pans; the viewing direction does not turn.
    await drag((t) => [{ x: cx - 50, y: cy - 60 * t, id: 1 }, { x: cx + 50, y: cy - 60 * t, id: 2 }]);
    const panned = (await settle(page)).cam;
    expect(moved(tilted.target, panned.target)).toBeGreaterThan(0.5);
    expect(Math.abs(angle(tilted.yaw, panned.yaw))).toBeLessThan(0.02);

    // Pinch out: zoom in.
    await drag((t) => [{ x: cx - 40 - 60 * t, y: cy, id: 1 }, { x: cx + 40 + 60 * t, y: cy, id: 2 }]);
    const zoomed = (await settle(page)).cam;
    expect(zoomed.zoom).toBeGreaterThan(panned.zoom * 1.2);

    await noSelection(page);
    await expect(page.locator(".building-panel, [data-testid='building-panel']")).toHaveCount(0); // no gesture selected anything
    await page.screenshot({ path: `artifacts/camera-gestures-${name.replace(" ", "-")}.png` });
    await context.close();
  });
}

test("mouse: left-drag orbits, right-drag pans, wheel zooms, all eased", async ({ page }) => {
  test.setTimeout(360000); // CPU-rendered WebGL is slow on large viewports
  const start = await ready(page);
  const box = (await page.locator("canvas").first().boundingBox())!;
  const x = box.x + box.width * 0.5, y = box.y + box.height * 0.6;

  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 200, y, { steps: 10 }); await page.mouse.up();
  const orbit = (await settle(page)).cam;
  expect(Math.abs(angle(start.yaw, orbit.yaw))).toBeGreaterThan(0.6); // ~200 px · 0.006 rad/px ≈ 1.2 rad
  expect(moved(start.target, orbit.target)).toBeLessThan(0.01);

  await page.mouse.move(x, y); await page.mouse.down({ button: "right" }); await page.mouse.move(x + 80, y + 30, { steps: 8 }); await page.mouse.up({ button: "right" });
  const pan = (await settle(page)).cam;
  expect(moved(orbit.target, pan.target)).toBeGreaterThan(0.5);
  expect(Math.abs(angle(orbit.yaw, pan.yaw))).toBeLessThan(0.02);

  await page.mouse.wheel(0, -300);
  const zoom = (await settle(page)).cam;
  expect(zoom.zoom).toBeGreaterThan(pan.zoom);
  await noSelection(page);
  await page.screenshot({ path: "artifacts/camera-gestures-desktop.png" });
});
