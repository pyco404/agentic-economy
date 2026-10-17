import { expect, test } from "@playwright/test";
test("authoritative identities stay consistent across lists profiles and refreshes", async ({ page }) => {
  test.setTimeout(180000);
  const rosterResponse = page.waitForResponse((response) => response.ok() && response.url().includes("/api/v1/world/agents"));
  await page.goto("/?source=backend#studio");
  // StrictMode may abort the first bootstrap fetch; take a fresh read-only snapshot from the observed API.
  const roster = (await (await page.request.get((await rosterResponse).url())).json()).agents as Array<{
    id: string; displayName?: string; identity?: { kind: string; activatingWallet?: string };
  }>;
  await expect(page.getByRole("button", { name: "Token activation unavailable" })).toBeDisabled();
  const rows = page.locator(".agent-row b"); await expect(rows.first()).toBeVisible({ timeout: 60000 });
  const names = await rows.allTextContents();
  expect(new Set(names).size).toBe(names.length);
  const authoritative = roster.every((agent) => agent.identity && agent.displayName);
  if (authoritative) expect(names).toEqual(roster.slice(0, 14).map((agent) => agent.displayName));
  else expect(names.every((n) => /^[A-Z][A-Za-z]+_\d{3} · /.test(n) && !n.startsWith("0x") && !n.includes("..."))).toBe(true);
  await page.reload(); await expect(rows.first()).toHaveText(names[0]!);
  expect(await rows.allTextContents()).toEqual(names);
  await page.locator(".agent-row").first().click();
  const inspector = page.getByRole("complementary", { name: "Agent details", exact: true });
  await expect(inspector.getByRole("heading", { name: names[0], exact: true })).toBeVisible();
  await expect(page.getByTestId("agent-canonical-id")).toContainText("agt_");
  const first = roster[0]!;
  await expect(page.getByTestId("agent-canonical-id")).toHaveText(first.id);
  if (first.identity?.kind === "token_linked")
    await expect(page.getByTestId("agent-owner")).toHaveText(first.identity.activatingWallet!);
  else await expect(page.getByTestId("agent-owner")).toContainText("no verified activation record");
  await page.screenshot({ path: "artifacts/agent-identity-studio.png" });
});
