// Run while the local PostgreSQL demo backend is up, then restart that owned backend process.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const api = process.env.API_URL ?? "http://127.0.0.1:8787";
async function state() {
  const get = async (path) => (await fetch(api + path)).json();
  const [health, bootstrap, chunks, agents] = await Promise.all([
    get("/healthz"),
    get("/api/v1/world/bootstrap"),
    get("/api/v1/world/chunks?x=1&y=1&radius=4"),
    get("/api/v1/world/agents"),
  ]);
  const buildings = chunks.chunks
    .flatMap((c) => c.buildings)
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((b) => ({
      id: b.id,
      kind: b.kind,
      origin: b.origin,
      params: b.params,
    }));
  return {
    store: health.store,
    tick: health.tick,
    worldId: bootstrap.worldId,
    seed: bootstrap.seed,
    agents: agents.agents.map((a) => a.id).sort(),
    geometryHash: createHash("sha256")
      .update(JSON.stringify(buildings))
      .digest("hex"),
  };
}
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-angle=swiftshader",
  ],
});
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/?source=backend");
  await page
    .getByTestId("connection-status")
    .filter({ hasText: "connected" })
    .waitFor({ timeout: 45000 });
  const before = await state();
  assert.equal(before.store, "postgres");
  await writeFile(
    "artifacts/persistence-before.json",
    JSON.stringify(before, null, 2),
  );
  console.log("READY_FOR_OWNED_BACKEND_RESTART");
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="connection-status"]')
        ?.textContent?.includes("reconnecting"),
    {},
    { timeout: 90000 },
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="connection-status"]')
        ?.textContent?.includes("connected"),
    {},
    { timeout: 90000 },
  );
  const after = await state();
  assert.equal(after.worldId, before.worldId);
  assert.equal(after.seed, before.seed);
  assert.equal(after.geometryHash, before.geometryHash);
  assert.deepEqual(after.agents, before.agents);
  assert.ok(after.tick >= before.tick);
  const result = {
    passed: true,
    before,
    after,
    replayed: Number(await page.locator(".app").getAttribute("data-replayed")),
  };
  await writeFile(
    "artifacts/persistence-result.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: true,
      beforeTick: before.tick,
      afterTick: after.tick,
      sameGeometry: true,
      sameAgents: true,
      replayed: result.replayed,
    }),
  );
} finally {
  await browser.close();
}
