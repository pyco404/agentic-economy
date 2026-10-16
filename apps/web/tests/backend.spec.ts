import {
  test,
  expect,
  type APIRequestContext,
  type WebSocketRoute,
} from "@playwright/test";
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
} from "node:crypto";
const base = "http://127.0.0.1:8787";
function base58(bytes: Uint8Array) {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  let n = BigInt("0x" + Buffer.from(bytes).toString("hex")),
    result = "";
  while (n) {
    result = chars[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    result = "1" + result;
  }
  return result;
}
async function authenticateDemo(request: APIRequestContext) {
  // Public, deterministic demo seed from the backend's documented demo wallets; never a real wallet.
  const seed = createHash("sha256")
    .update("agentic-economy-demo:wallet:100")
    .digest();
  const key = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]),
    format: "der",
    type: "pkcs8",
  });
  const wallet = base58(
    createPublicKey(key).export({ format: "der", type: "spki" }).subarray(-32),
  );
  const challenge = await (
    await request.post(`${base}/api/v1/auth/challenge`, { data: { wallet } })
  ).json();
  const verified = await request.post(`${base}/api/v1/auth/verify`, {
    data: {
      wallet,
      nonce: challenge.nonce,
      signature: base58(sign(null, Buffer.from(challenge.message), key)),
    },
  });
  expect(verified.ok()).toBe(true);
  const { token } = await verified.json();
  return { Authorization: `Bearer ${token}` };
}
test.describe("real PostgreSQL backend integration", () => {
  test.setTimeout(120000);
  test.beforeEach(async ({ request }) => {
    const health = await (await request.get(`${base}/healthz`)).json();
    expect(health.mode).toBe("demo");
    expect(health.store).toBe("postgres");
    expect(health.financialFeaturesEnabled).toBe(false);
  });
  test("loads canonical world and renders movement, stock and production from the live stream", async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/?source=backend");
    await expect(page.locator(".app")).toHaveAttribute(
      "data-source",
      "backend",
    );
    await expect(page.getByTestId("connection-status")).toContainText(
      "connected",
      { timeout: 30000 },
    );
    await expect
      .poll(
        async () =>
          Number(
            await page
              .getByTestId("city-canvas")
              .getAttribute("data-rendered-buildings"),
          ),
        { timeout: 30000 },
      )
      .toBeGreaterThan(100);
    const agents = await (
      await request.get(`${base}/api/v1/world/agents`)
    ).json();
    expect(agents.agents.length).toBeGreaterThan(0);
    await expect(
      page.getByText("Moss Collective", { exact: true }),
    ).toHaveCount(0);
    const positions = await page
      .locator(".app")
      .getAttribute("data-agent-position");
    await expect
      .poll(() => page.locator(".app").getAttribute("data-agent-position"), {
        timeout: 45000,
      })
      .not.toBe(positions);
    // A persisted economy can reach stock/capacity limits. Validate authoritative
    // production totals rather than requiring unbounded production growth.
    await expect
      .poll(
        async () => {
          const stats = await (
            await request.get(`${base}/api/v1/world/stats`)
          ).json();
          const total = Object.values(
            stats.goodsProduced as Record<string, number>,
          ).reduce((sum, count) => sum + count, 0);
          return (
            Number(
              await page.locator(".app").getAttribute("data-production"),
            ) === total
          );
        },
        { timeout: 45000 },
      )
      .toBe(true);
    const tick = Number(
      await page.locator(".app").getAttribute("data-world-tick"),
    );
    await expect
      .poll(
        async () =>
          Number(await page.locator(".app").getAttribute("data-world-tick")),
        { timeout: 30000 },
      )
      .toBeGreaterThan(tick);
    await expect
      .poll(
        async () =>
          Number(
            await page
              .getByTestId("city-canvas")
              .getAttribute("data-active-effects"),
          ),
        { timeout: 45000 },
      )
      .toBeGreaterThan(0);
    const world = await (
      await request.get(`${base}/api/v1/world/chunks?x=1&y=1&radius=2`)
    ).json();
    const bakery = world.chunks
      .flatMap(
        (c: {
          buildings: { kind: string; name: string; params: { seed: number } }[];
        }) => c.buildings,
      )
      .find((b: { kind: string }) => b.kind === "bakery");
    expect(bakery).toBeDefined();
    await page.getByRole("button", { name: "Explore buildings" }).click();
    await page.getByLabel("Search buildings").fill(bakery.name);
    await page
      .getByRole("button", {
        name: new RegExp(bakery.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      })
      .first()
      .click();
    await expect(
      page.getByRole("complementary", {
        name: "Building details",
        exact: true,
      }),
    ).toContainText(String(bakery.params.seed));
    await expect(page.getByTestId("building-stock")).toBeVisible();
    await page.getByRole("button", { name: "Close building details" }).click();
    await page.getByRole("button", { name: "Reset camera" }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "artifacts/backend-genesis-desktop.png" });
    await page.getByRole("link", { name: "Agent Studio", exact: true }).click();
    await page
      .getByRole("button", {
        name: new RegExp(
          agents.agents[0].name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        ),
      })
      .first()
      .click();
    await expect(
      page.getByRole("complementary", { name: "Agent details", exact: true }),
    ).toContainText("Decision log");
    await expect(page.locator(".decision-log").first()).toBeVisible();
    expect(errors).toEqual([]);
  });
  test("actual mock-chain launch and agent commands appear as an HQ and live agent", async ({
    page,
    request,
  }) => {
    await page.goto("/?source=backend");
    await expect(page.getByTestId("connection-status")).toContainText(
      "connected",
      { timeout: 30000 },
    );
    const headers = await authenticateDemo(request),
      name = `Integration Guild ${Date.now().toString(36)}`;
    const prepared = await request.post(`${base}/api/v1/launches/prepare`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        draft: {
          name,
          symbol: "DTEST",
          description:
            "Local frontend integration demo; no real blockchain transaction.",
          metadataUri: "https://example.invalid/frontend-integration.json",
        },
      },
    });
    expect(prepared.ok()).toBe(true);
    const draft = await prepared.json();
    expect(draft.demoTransaction).toBe(true);
    const signed = await (
      await request.post(
        `${base}/api/v1/demo/launches/${draft.launch.id}/sign`,
        { headers, data: { outcome: "success" } },
      )
    ).json();
    let launch: { communityId: string | null; status: string } = draft.launch;
    await expect
      .poll(
        async () => {
          const response = await request.post(
            `${base}/api/v1/launches/confirm`,
            {
              headers,
              data: { launchId: draft.launch.id, signature: signed.signature },
            },
          );
          expect(response.ok()).toBe(true);
          launch = (await response.json()).launch;
          return launch.status;
        },
        { timeout: 30000, intervals: [1000] },
      )
      .toBe("confirmed");
    expect(launch.communityId).toBeTruthy();
    const created = await request.post(`${base}/api/v1/agents`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: {
        communityId: launch.communityId,
        name: "Integration Courier",
        profession: "logistics_operator",
      },
    });
    expect(created.ok()).toBe(true);
    const { agent } = await created.json();
    await page.getByRole("button", { name: "Explore buildings" }).click();
    await page.getByLabel("Search buildings").fill(name);
    await expect(
      page.getByRole("button", { name: new RegExp(name + " HQ") }),
    ).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: new RegExp(name + " HQ") }).click();
    await expect(
      page.getByRole("complementary", {
        name: "Building details",
        exact: true,
      }),
    ).toContainText("active");
    await page.screenshot({ path: "artifacts/backend-headquarters.png" });
    const pause = await request.patch(`${base}/api/v1/agents/${agent.id}`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { status: "paused" },
    });
    expect(pause.ok()).toBe(true);
    await expect
      .poll(async () => {
        const response = await request.get(`${base}/api/v1/agents/${agent.id}`);
        return (await response.json()).agent.status;
      })
      .toBe("paused");
    const resume = await request.patch(`${base}/api/v1/agents/${agent.id}`, {
      headers: { ...headers, "Idempotency-Key": crypto.randomUUID() },
      data: { status: "active" },
    });
    expect(resume.ok()).toBe(true);
    await page.getByRole("link", { name: "Communities", exact: true }).click();
    await page.getByLabel("Search communities").fill(name);
    await expect(
      page.getByRole("button", { name: new RegExp(name) }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Treasury", exact: true }).click();
    await expect(
      page.getByText("Backend demo receipts use a mock chain.", {
        exact: false,
      }),
    ).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
  });
  test("overview, neighborhoods and unchanged geometry remain readable during simulation", async ({
    page,
  }) => {
    await page.goto("/?source=backend");
    await expect(page.getByTestId("connection-status")).toContainText(
      "connected",
      { timeout: 30000 },
    );
    await expect
      .poll(async () =>
        Number(
          await page
            .getByTestId("city-canvas")
            .getAttribute("data-rendered-buildings"),
        ),
      )
      .toBeGreaterThan(100);
    await page.waitForTimeout(1500);
    const builds = Number(
      await page
        .getByTestId("city-canvas")
        .getAttribute("data-geometry-builds"),
    );
    await page.waitForTimeout(6500);
    expect(
      Number(
        await page
          .getByTestId("city-canvas")
          .getAttribute("data-geometry-builds"),
      ),
    ).toBeLessThanOrEqual(builds + 1);
    const calls = Number(
      await page.getByTestId("city-canvas").getAttribute("data-draw-calls"),
    );
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(1000);
    await page.getByRole("button", { name: "Toggle economy overlay" }).click();
    await page.screenshot({ path: "artifacts/living-economy-overview.png" });
    await page.screenshot({ path: "artifacts/backend-genesis-desktop.png" });
    await page
      .getByLabel("Focus district")
      .selectOption({ label: "Riverside Works" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "artifacts/living-economy-industry.png" });
    await page.getByRole("button", { name: "Explore buildings" }).click();
    await page.getByLabel("Filter building type").selectOption("economic");
    await expect(page.locator(".building-list button").first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Reset camera" }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "artifacts/living-economy-mobile.png" });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
  test("reconnect replays real retained events without skipping the reconnect join sequence", async ({
    page,
  }) => {
    let first: WebSocketRoute | undefined;
    let connections = 0;
    const resumes: number[] = [];
    const replayed: number[] = [];
    let reconnectJoin = 0;
    await page.routeWebSocket("**/api/v1/ws", async (socket) => {
      connections++;
      const number = connections;
      if (number > 1) await new Promise((resolve) => setTimeout(resolve, 4000));
      const server = socket.connectToServer();
      if (number === 1) first = socket;
      socket.onMessage((message) => {
        const data = JSON.parse(String(message));
        if (data.type === "resume") resumes.push(data.lastSeq);
        server.send(message);
      });
      server.onMessage((message) => {
        const data = JSON.parse(String(message));
        if (
          number > 1 &&
          data.type === "world.snapshot" &&
          data.data.reason === "join"
        )
          reconnectJoin = data.seq;
        if (
          number > 1 &&
          // A short gap need not contain an economic completion. Movement and
          // chunk updates are durable replay events too; control snapshots are not.
          typeof data.seq === "number" &&
          data.type !== "world.snapshot" &&
          !data.type.startsWith("system.") &&
          data.seq <= reconnectJoin
        )
          replayed.push(data.seq);
        socket.send(message);
      });
    });
    await page.goto("/?source=backend");
    await expect(page.getByTestId("connection-status")).toContainText(
      "connected",
      { timeout: 30000 },
    );
    await expect
      .poll(
        async () =>
          Number(await page.locator(".app").getAttribute("data-stream-seq")),
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
    const before = Number(
      await page.locator(".app").getAttribute("data-stream-seq"),
    );
    await first!.close({
      code: 1013,
      reason: "Integration transport disconnect",
    });
    await expect
      .poll(() => resumes.length, { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect(page.getByTestId("connection-status")).toContainText(
      "connected",
      { timeout: 30000 },
    );
    expect(resumes[0]).toBeGreaterThanOrEqual(before);
    expect(resumes[0]).toBeLessThan(reconnectJoin);
    expect(
      replayed.some((seq) => seq > resumes[0]! && seq <= reconnectJoin),
    ).toBe(true);
    await expect
      .poll(
        async () =>
          Number(await page.locator(".app").getAttribute("data-replayed")),
        { timeout: 30000 },
      )
      .toBeGreaterThan(0);
  });
});
