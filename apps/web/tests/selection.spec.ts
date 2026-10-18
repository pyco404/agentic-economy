import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/?source=fixtures");
  await expect.poll(async () => Number(await page.getByTestId("city-canvas").getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(0);
}
const selected = (page: Page) => page.evaluate(() => window.getSelection()?.toString() ?? "");
const camera = (page: Page) => page.getByTestId("city-canvas").getAttribute("data-camera");
async function drag(page: Page, button: "left" | "right" = "left") {
  const box = (await page.locator("canvas").boundingBox())!;
  const x = box.x + box.width * 0.48, y = box.y + box.height * 0.7;
  await page.mouse.move(x, y); await page.mouse.down({ button });
  await page.mouse.move(x - 100, y - 70, { steps: 8 }); await page.mouse.up({ button });
}

test("world chrome cannot be highlighted while orbiting, panning or zooming", async ({ page }) => {
  await ready(page);
  for (const selector of [".world-header h1", ".topbar nav", ".activity-panel", ".world-bottom", ".camera-tools button", "canvas", ".agent-world-labels"]) {
    expect(await page.locator(selector).first().evaluate((node) => getComputedStyle(node).userSelect)).toBe("none");
  }
  // Reproduce a selection left over from the old UI before a city gesture.
  await page.locator(".world-header h1").selectText();
  // Chromium omits user-select:none text from Selection.toString(), even
  // when a programmatic range exists. Check and then clear the range itself.
  expect(await page.evaluate(() => window.getSelection()?.rangeCount)).toBe(1);
  const initial = await camera(page);
  await drag(page); await expect.poll(() => camera(page)).not.toBe(initial);
  expect(await selected(page)).toBe("");
  expect(await page.evaluate(() => window.getSelection()?.rangeCount)).toBe(0);
  const orbit = await camera(page);
  await drag(page, "right"); await expect.poll(() => camera(page)).not.toBe(orbit);
  expect(await selected(page)).toBe("");
  const pan = await camera(page);
  await page.mouse.wheel(0, -250); await expect.poll(() => camera(page)).not.toBe(pan);
  // Start on the pointer-transparent hero text, then cross the world surface.
  const heading = (await page.locator(".world-header h1").boundingBox())!;
  await page.mouse.move(heading.x + 20, heading.y + 20); await page.mouse.down();
  await page.mouse.move(heading.x + 240, heading.y + 160, { steps: 10 }); await page.mouse.up();
  expect(await selected(page)).toBe("");
  const filter = page.locator(".activity-panel select");
  await filter.focus(); await page.keyboard.press("End"); await page.keyboard.press("Enter");
  await expect(filter).toBeFocused();
  await page.getByRole("button", { name: "Reset camera" }).click();
  await page.screenshot({ path: "artifacts/world-selection-desktop.png" });
});

test("copyable addresses, code, editable fields and reading content retain selection", async ({ page }) => {
  await ready(page);
  // Exercise explicit opt-ins inside the otherwise protected World overlay.
  // This DOM-only test fixture does not add an agent or change backend data.
  await page.locator(".world-main").evaluate((root) => {
    const probe = document.createElement("section"); probe.id = "selection-probe";
    probe.style.cssText = "position:fixed;top:100px;right:25px;width:230px;z-index:1000;background:ivory;pointer-events:auto";
    probe.innerHTML = '<span class="ui-select-text">CMYx...6Wec</span><span class="mint">VerifiedMintAddress</span><span class="agent-identity-value">agt_canonical_id</span><pre><code>copyable code</code></pre><div contenteditable="true">Editable text</div><input value="Editable input"><textarea>Editable textarea</textarea><span data-selectable>Copy this value</span>';
    root.append(probe);
  });
  for (const selector of [".ui-select-text", ".mint", ".agent-identity-value", "code", "[contenteditable]", "[data-selectable]"]) {
    const node = page.locator(`#selection-probe ${selector}`);
    expect(await node.evaluate((element) => getComputedStyle(element).userSelect)).toBe("text");
    await node.selectText(); const text = await selected(page); expect(text.length).toBeGreaterThan(0);
    await drag(page); expect(await selected(page)).toBe(text);
  }
  for (const tag of ["input", "textarea"]) {
    const field = page.locator(`#selection-probe ${tag}`);
    expect(await field.evaluate((element) => getComputedStyle(element).userSelect)).toBe("text");
    await field.evaluate((element) => { const input = element as HTMLInputElement; input.focus(); input.select(); });
    await drag(page);
    expect(await field.evaluate((element) => { const input = element as HTMLInputElement; return input.selectionEnd! - input.selectionStart!; })).toBeGreaterThan(0);
  }
  await page.locator("#selection-probe").evaluate((node) => node.remove());
  await page.getByRole("link", { name: "Launch", exact: true }).click();
  const name = page.getByPlaceholder("Your community name");
  await name.fill("Selectable community"); await name.press("ControlOrMeta+a");
  expect(await name.evaluate((node) => (node as HTMLInputElement).selectionEnd)).toBe(20);
  await page.getByRole("link", { name: "About the world", exact: true }).click();
  const paragraph = page.locator(".about-shell p").first();
  await paragraph.selectText(); expect((await selected(page)).length).toBeGreaterThan(10);
  expect(await paragraph.evaluate((node) => getComputedStyle(node).userSelect)).not.toBe("none");
});

test("mobile pan, pinch and menu work without selecting world text", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 0.5 });
  try {
    const page = await context.newPage(); await ready(page);
    const client = await context.newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", touchPoints: { x: number; y: number; id: number }[]) => client.send("Input.dispatchTouchEvent", { type, touchPoints });
    await page.locator(".world-header h1").selectText();
    const initial = await camera(page);
    // District labels move with the camera; find genuine exposed canvas rather
    // than letting an overlay silently consume a synthetic gesture.
    const origin = await page.evaluate(() => {
      for (const y of [550, 650, 350, 300, 500]) for (const x of [250, 200, 300]) {
        if ([-50, 0, 50].every((dx) => document.elementFromPoint(x + dx, y)?.tagName === "CANVAS")) return { x, y };
      }
      return null;
    });
    expect(origin).not.toBeNull();
    const { x, y } = origin!;
    await touch("touchStart", [{ x, y, id: 1 }]);
    for (let step = 1; step <= 6; step++) {
      await touch("touchMove", [{ x: x + step * 5, y: y - step * 10, id: 1 }]);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await touch("touchEnd", []);
    await expect.poll(() => camera(page)).not.toBe(initial); expect(await selected(page)).toBe("");
    const panned = await camera(page);
    await touch("touchStart", [{ x: x - 50, y, id: 1 }, { x: x + 50, y, id: 2 }]);
    for (let step = 1; step <= 6; step++) {
      await touch("touchMove", [{ x: x - 50 - step * 5, y: y - step * 3, id: 1 }, { x: x + 50 + step * 5, y: y + step * 3, id: 2 }]);
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await touch("touchEnd", []);
    await expect.poll(() => camera(page)).not.toBe(panned); expect(await selected(page)).toBe("");
    await page.screenshot({ path: "artifacts/world-selection-mobile.png" });
    await page.getByRole("button", { name: "Toggle navigation" }).tap();
    const menu = page.getByRole("dialog", { name: "Navigation", exact: true });
    expect(await menu.evaluate((node) => getComputedStyle(node).userSelect)).toBe("none");
    await menu.getByRole("link", { name: "Launch", exact: true }).tap();
    const name = page.getByPlaceholder("Your community name");
    await name.fill("Mobile community"); await expect(name).toHaveValue("Mobile community");
    expect(await name.evaluate((node) => getComputedStyle(node).userSelect)).toBe("text");
  } finally { await context.close(); }
});
