import { expect, test } from "@playwright/test";
for (const width of [1440, 390]) test(`financial surfaces and reduced motion remain readable at ${width}px`, async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/?source=backend#treasury");
  await expect(page.getByRole("heading", { name: "Every stream, accounted for." })).toBeVisible();
  const contrast = await page.locator(".notice").first().evaluate((node) => {
    const style = getComputedStyle(node);
    const luminance = (rgb: string) => {
      const c = rgb.match(/[\d.]+/g)!.slice(0, 3).map((s) => Number(s) / 255)
        .map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
      return c[0]! * .2126 + c[1]! * .7152 + c[2]! * .0722;
    };
    return (luminance(style.backgroundColor) + .05) / (luminance(style.color) + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  expect(await page.locator(".world-atmosphere").evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  expect(await page.locator(".page-content").evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
  await page.screenshot({ path: `artifacts/global-${width}-treasury.png` });
  if (width === 390) await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Launch", exact: true }).click();
  await expect(page.getByLabel("Token name")).toBeVisible();
  await page.screenshot({ path: `artifacts/global-${width}-launchpad.png` });
});
