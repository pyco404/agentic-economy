import { expandWorldControls } from "./world-controls";
import { test, expect } from "@playwright/test";
test("procedural city, navigation, selection, growth and draft boundaries", async ({
  page,
}) => {
  test.setTimeout(180000); // Full navigation journey on the headless software renderer.
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?source=fixtures");
  await expect(
    page.getByRole("heading", { name: "A city in motion." }),
  ).toBeVisible();
  await expect(page.getByText("Demo Mode")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: "artifacts/genesis-desktop.png" });
  await page.getByRole("button", { name: "Explore buildings" }).click();
  await page.locator(".building-list button").first().click();
  await expect(
    page.getByRole("complementary", { name: "Building details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close building details" }).click();
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expandWorldControls(page); await page.getByRole("button", { name: "Rotate camera" }).click();
  await expandWorldControls(page); await page.getByRole("button", { name: "Reset camera" }).click();
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  // Selecting a building keeps the explorer open for subsequent inspection.
  await expect(page.getByLabel("Search buildings")).toBeVisible();
  await page.getByLabel("Search buildings").fill("Windmill");
  await page
    .getByRole("button", { name: /Windmill/ })
    .first()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Building details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close building details" }).click();
  await page.getByRole("button", { name: "Preview population growth" }).click();
  await expect(page.getByText("Demo capacity preview")).toBeVisible();
  await page.getByRole("link", { name: "Communities", exact: true }).click();
  await page.getByLabel("Search communities").fill("Moss");
  await page.getByRole("button", { name: /Moss Collective/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close page and view city" }).click();
  await page.getByRole("link", { name: "Economy", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "From fields to front doors." }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("link", { name: "Treasury", exact: true }).click();
  await expect(page.getByText("No confirmed receipts")).toBeVisible();
  await page.getByRole("link", { name: "Launch", exact: true }).click();
  await page.getByLabel("Token name").fill("Test Community");
  await page.getByLabel("Symbol", { exact: true }).fill("TEST");
  await page.getByRole("button", { name: "Review draft" }).click();
  await expect(page.getByRole("region", { name: "Launch draft review" }).getByRole("status")).toContainText(
    "No transaction created",
  );
  await expect(
    page.getByRole("button", { name: "Wallet signing unavailable" }),
  ).toBeDisabled();
  await expect(page.getByText("0.05 SOL", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
test("demo holder eligibility, activation, inspection and pause/resume", async ({
  page,
}) => {
  await page.goto("/?source=fixtures#studio");
  await expect(
    page.getByRole("heading", { name: "Meet your next city worker." }),
  ).toBeVisible();
  await page.getByLabel("Agent name", { exact: true }).fill("Genesis Tester");
  await expect(
    page.getByRole("button", { name: "Activate demo agent" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByRole("button", { name: "Activate demo agent" }).click();
  await expect(page.getByRole("status")).toContainText("Demo agent activated");
  await page
    .locator(".agent-row")
    .first()
    .click();
  await expect(
    page.getByRole("complementary", { name: "Agent details", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause agent", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume agent", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Resume agent", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Pause agent", exact: true }),
  ).toBeVisible();
});
test("mobile world and navigation fit the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?source=fixtures");
  await expect(page.locator("canvas")).toBeVisible();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "artifacts/genesis-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: "Communities", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Different communities. One world." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
