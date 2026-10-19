import { expect, test } from "@playwright/test";

const expectSameCamera = (actual: string | null, before: string | null) => {
  const a = JSON.parse(actual!), b = JSON.parse(before!);
  expect(a.zoom).toBeCloseTo(b.zoom, 9);
  for (const field of ["position", "target"]) a[field].forEach((value: number, i: number) => expect(value).toBeCloseTo(b[field][i], 8));
};

for (const width of [1440, 820, 390]) test(`one activity scroller and bottom Show page dock at ${width}px`, async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto("/?source=backend#about");
  await expect(page.getByTestId("connection-status")).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
  const reopen = page.getByRole("button", { name: "Show page", exact: true });
  const panel = page.getByRole("complementary", { name: "City activity panel", exact: true });
  const expand = page.getByRole("button", { name: "Expand city activity" });
  if (width === 390) await expand.click({ timeout: 120000 });
  else if (await expand.isVisible()) await expand.press("Enter");
  await expect.poll(() => panel.locator(".feed-item").count(), { timeout: 30000 }).toBeGreaterThan(5);
  const initial = (await reopen.boundingBox())!;
  expect((width === 390 ? 844 : 1000) - initial.y - initial.height).toBeCloseTo(width === 390 ? 84 : 20, 0);
  if (width === 390) {
    const stats = (await page.locator(".world-bottom").boundingBox())!;
    expect(stats.height).toBe(48);
    expect(initial.height).toBe(44);
    expect(initial.y + initial.height).toBeLessThanOrEqual(stats.y - 8);
  }
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  for (const selector of [".world-bottom", ".camera-tools", ".world-view-toggle", ".world-footer"]) {
    const other = (await page.locator(selector).boundingBox())!;
    expect(overlaps(initial, other), selector).toBe(false);
  }
  expect(await panel.locator(".feed").evaluate((node) => ({ overflow: getComputedStyle(node).overflowY,
    nested: node.scrollHeight > node.clientHeight + 1 }))).toEqual({ overflow: "visible", nested: false });
  const camera = await page.getByTestId("city-canvas").getAttribute("data-camera");
  const bounds = (await panel.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + Math.min(200, bounds.height - 30));
  await page.mouse.wheel(0, 240);
  await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
  const firstScroll = await panel.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, 72.5); // fractional wheel deltas use the same native path as a trackpad
  await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(firstScroll);
  for (const selector of [".surface-title", ".activity-filters"]) {
    const sticky = (await panel.locator(selector).boundingBox())!;
    expect(sticky.y).toBeGreaterThanOrEqual(bounds.y - 1);
    expect(sticky.y + sticky.height).toBeLessThan(bounds.y + bounds.height);
  }
  expect(await reopen.boundingBox()).toEqual(initial);
  const beforeHome = await panel.evaluate((node) => node.scrollTop);
  await panel.focus(); await page.keyboard.press("Home");
  // Live events can arrive during native keyboard-scroll animation; assert
  // movement toward the beginning rather than a permanently frozen zero.
  await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeLessThan(beforeHome - 40);
  await page.keyboard.press("PageDown");
  await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(0);
  expectSameCamera(await page.getByTestId("city-canvas").getAttribute("data-camera"), camera);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.getByRole("button", { name: "Collapse city activity" }).press("Enter");
  expect(await reopen.boundingBox()).toEqual(initial);
  await page.getByRole("button", { name: "Expand city activity" }).press("Enter");
  await page.getByLabel("Filter city activity").selectOption("production.completed");
  await expect.poll(() => panel.locator('.feed-icon:not([data-kind="production.completed"])').count()).toBe(0);
  await page.getByLabel("Filter city activity").selectOption("all");
  await page.getByRole("button", { name: "Explore buildings" }).press("Enter");
  expect(await panel.locator(".building-list").evaluate((node) => getComputedStyle(node).overflowY)).toBe("visible");
  await page.getByRole("button", { name: "Show activity" }).press("Enter");
  await page.getByRole("button", { name: "Enter immersive mode" }).press("Enter");
  await expect(panel).not.toBeVisible(); expect(await reopen.boundingBox()).toEqual(initial);
  await page.getByRole("button", { name: "Exit immersive mode" }).press("Enter");
  await reopen.press("Enter"); await expect(page.locator("#about-title")).toBeVisible();
});

test("native touch scrolling stays within the activity panel", async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
    isMobile: true, deviceScaleFactor: .5 });
  try {
    const page = await context.newPage(); await page.goto("/?source=backend");
    const panel = page.getByRole("complementary", { name: "City activity panel", exact: true });
    await page.getByRole("button", { name: "Expand city activity" }).press("Enter");
    await expect.poll(() => panel.locator(".feed-item").count()).toBeGreaterThan(5);
    const camera = await page.getByTestId("city-canvas").getAttribute("data-camera");
    const client = await context.newCDPSession(page), rect = (await panel.boundingBox())!;
    const x = rect.x + rect.width / 2, y = rect.y + Math.min(rect.height - 20, 250);
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    for (let i = 1; i <= 6; i++) await client.send("Input.dispatchTouchEvent", {
      type: "touchMove", touchPoints: [{ x, y: y - i * 20, id: 1 }] });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => panel.evaluate((node) => node.scrollTop)).toBeGreaterThan(20);
    expectSameCamera(await page.getByTestId("city-canvas").getAttribute("data-camera"), camera);
  } finally { await context.close(); }
});

test("new retained events keep the reader's visible event anchored", async ({ page }) => {
  await page.goto("/?source=fixtures");
  const panel = page.getByRole("complementary", { name: "City activity panel", exact: true });
  await page.getByRole("button", { name: "Pause city animation" }).press("Enter");
  await expect.poll(() => panel.locator(".feed-item").count()).toBeGreaterThanOrEqual(12);
  // Layout-only insertion tests native anchoring with stable existing nodes.
  const result = await panel.evaluate(async (node) => {
    node.scrollTop = 160;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const item = node.querySelectorAll(".feed-item")[4]!, before = item.getBoundingClientRect().y;
    const extra = node.querySelector(".feed-item")!.cloneNode(true) as HTMLElement;
    extra.removeAttribute("data-event-id"); node.querySelector(".feed")!.prepend(extra);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return { before, after: item.getBoundingClientRect().y };
  });
  expect(Math.abs(result.after - result.before)).toBeLessThan(2);
});

test("mobile starts collapsed and stays expanded after the user opens it", async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true,
    isMobile: true, deviceScaleFactor: .5 });
  try {
    const page = await context.newPage(); await page.goto("/?source=backend");
    const expand = page.getByRole("button", { name: "Expand city activity" });
    const content = page.locator("#world-activity-content");
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#world-activity-panel")).toBeHidden();
    const control = (await expand.boundingBox())!;
    expect(control.x).toBeGreaterThan(300); expect(control.y).toBeLessThan(130);
    await expect(content).toBeHidden();
    await expand.tap({ force: true });
    const collapse = page.getByRole("button", { name: "Collapse city activity" });
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(content).toBeVisible();
    const heading = page.getByRole("heading", { name: "City activity", exact: true });
    await expect(heading.locator("button")).toHaveCount(0);
    await heading.click();
    await expect(content).toBeVisible();
    const sequence = Number(await page.locator(".app").getAttribute("data-stream-seq"));
    await expect.poll(async () => Number(await page.locator(".app").getAttribute("data-stream-seq")), { timeout: 30000 }).toBeGreaterThan(sequence);
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await collapse.tap({ force: true });
    await expect(page.locator("#world-activity-panel")).toBeHidden();
    await expand.tap({ force: true });
    await page.getByRole("link", { name: "About Agentic Economy" }).press("Enter");
    await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await page.reload();
    await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
    await expect(expand).toHaveAttribute("aria-expanded", "false");
    await expect(content).toBeHidden();
  } finally { await context.close(); }
});
