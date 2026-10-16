import { expect, test } from "@playwright/test";
test("legacy identities are stable, readable and never masquerade as verified wallets", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/?source=backend#studio");
  await expect(page.getByRole("button", { name: "Token activation unavailable" })).toBeDisabled();
  const rows = page.locator(".agent-row b"); await expect(rows.first()).toBeVisible({ timeout: 60000 });
  const names = await rows.allTextContents();
  expect(new Set(names).size).toBe(names.length);
  expect(names.every((n) => /^[A-Z][A-Za-z]+_\d{3} · /.test(n) && !n.startsWith("0x") && !n.includes("..."))).toBe(true);
  await page.reload(); await expect(rows.first()).toHaveText(names[0]!);
  expect(await rows.allTextContents()).toEqual(names);
  await page.locator(".agent-row").first().click();
  const inspector = page.getByRole("complementary", { name: "Agent details", exact: true });
  await expect(inspector.getByRole("heading", { name: names[0], exact: true })).toBeVisible();
  await expect(page.getByTestId("agent-canonical-id")).toContainText("agt_");
  await expect(page.getByTestId("agent-owner")).toContainText("no verified activation record");
  await page.screenshot({ path: "artifacts/agent-identity-studio.png" });
});
