import { expect, test } from "@playwright/test";
test("functional route interfaces survive unavailable WebGL", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: any[]) {
      if (type.includes("webgl")) return null;
      return original.call(this, type as any, ...args);
    } as typeof original;
  });
  await page.goto("/?source=fixtures");
  await expect(page.getByRole("alert")).toContainText("3D rendering is unavailable");
  await page.getByRole("link", { name: "Communities", exact: true }).click();
  await page.getByLabel("Search communities").fill("Moss");
  await expect(page.locator(".discovery-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Launchpad", exact: true }).click();
  await page.getByLabel("Token name").fill("Accessible City");
  await page.getByLabel("Symbol", { exact: true }).fill("CITY");
  await page.getByRole("button", { name: "Review draft" }).click();
  await expect(page.getByRole("button", { name: "Wallet signing unavailable" })).toBeDisabled();
});
