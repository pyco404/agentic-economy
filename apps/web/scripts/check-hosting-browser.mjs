import { chromium, expect } from "@playwright/test";
import assert from "node:assert/strict";

const base = new URL(process.argv[2]);
const fixtures = process.argv.includes("--fixtures");
assert(!fixtures || ["127.0.0.1", "localhost"].includes(base.hostname), "Fixture smoke checks are local-only, never public staging certification.");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/bin/google-chrome",
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader"] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: .5 });
  const errors = [], sockets = [], writes = [];
  let bootstrapMode;
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("websocket", (socket) => { if (socket.url().includes("/api/v1/ws")) sockets.push(socket.url()); });
  page.on("request", (request) => { if (request.url().includes("/api/v1/") && !["GET", "OPTIONS"].includes(request.method())) writes.push(request.url()); });
  page.on("response", async (response) => {
    if (new URL(response.url()).pathname === "/api/v1/world/bootstrap" && response.ok()) {
      bootstrapMode = (await response.json()).mode;
    }
  });
  const url = new URL("/explore", base); url.searchParams.set("source", fixtures ? "fixtures" : "backend");
  await page.goto(url.href, { timeout: 90000 });
  if (!fixtures) {
    await expect(page.getByTestId("connection-status")).toContainText("connected", { timeout: 60000 });
    await expect.poll(() => bootstrapMode).toBe("demo");
  }
  await expect(page.getByRole("heading", { name: "Discover what's being built." })).toBeVisible();
  const city = page.getByTestId("city-canvas"), canvas = page.locator("canvas");
  await expect.poll(async () => Number(await city.getAttribute("data-rendered-buildings")), { timeout: 60000 }).toBeGreaterThan(0);
  await canvas.evaluate((node) => { window.__hostingCanvas = node; });
  const camera = await city.getAttribute("data-camera");
  await page.getByRole("link", { name: "Communities", exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "Different communities. One world." })).toBeVisible();
  await page.getByRole("button", { name: "Close page and view city" }).press("Enter");
  await expect(page.getByRole("heading", { name: "A city in motion." })).toBeVisible();
  assert.equal(await canvas.evaluate((node) => node === window.__hostingCanvas), true);
  assert.equal(await city.getAttribute("data-camera"), camera);
  await expect(page.getByRole("button", { name: "Connect wallet", exact: true })).toBeDisabled();
  if (!fixtures) { assert.equal(sockets.length, 1); assert.equal(new URL(sockets[0]).protocol, "wss:"); }
  assert.deepEqual(writes, []); assert.deepEqual(errors, []);
  await page.reload({ timeout: 90000 });
  await expect(page.getByRole("heading", { name: "Different communities. One world." })).toBeVisible();
  console.log(fixtures ? "Local compiled frontend browser smoke passed with explicit fixtures; public staging integration remains unverified."
    : "Hosted frontend browser smoke passed: real API connection, public WSS, deep-link refresh, persistent world, demo restrictions and no writes.");
} finally { await browser.close(); }
