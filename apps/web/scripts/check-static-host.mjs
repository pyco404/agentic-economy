import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:5180");
assert(["http:", "https:"].includes(base.protocol));
const get = (path) => fetch(new URL(path, base), { redirect: "manual", signal: AbortSignal.timeout(15000) });
const health = await get("/healthz");
assert.equal(health.status, 200); assert.equal((await health.text()).trim(), "ok");
const home = await get("/"); assert.equal(home.status, 200);
assert.match(home.headers.get("content-type") ?? "", /text\/html/);
assert.equal(home.headers.get("cache-control"), "no-cache");
const html = await home.text(); assert.match(html, /id="root"/);
for (const path of ["/explore", "/communities", "/studio", "/economy", "/treasury", "/launchpad", "/about"]) {
  const response = await get(path); assert.equal(response.status, 200);
  assert.equal(await response.text(), html, `${path} must retain SPA fallback.`);
}
const bundle = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1]; assert(bundle, "Built Vite entry is missing.");
const asset = await get(bundle); assert.equal(asset.status, 200);
assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
assert.match(asset.headers.get("content-type") ?? "", /javascript/);
assert.equal((await get("/assets/missing-deployment-file.js")).status, 404);
assert.equal((await get("/api/v1/world/bootstrap")).status, 404);
// Host override is only meaningful for the local Caddy probe. Public TLS domains
// must be checked directly after Railway issues their certificates.
if (["127.0.0.1", "localhost"].includes(base.hostname)) {
  const { request } = await import("node:http");
  await new Promise((resolve, reject) => {
    const req = request(new URL("/explore?view=latest", base), { headers: { Host: "www.useaeco.xyz" } }, (res) => {
      try { assert.equal(res.statusCode, 308); assert.equal(res.headers.location, "https://useaeco.xyz/explore?view=latest"); resolve(); }
      catch (error) { reject(error); }
      finally { res.resume(); }
    });
    req.setTimeout(15000, () => req.destroy(new Error("Redirect probe timed out.")));
    req.on("error", reject); req.end();
  });
}
console.log("Static hosting passed: health, route refresh, asset caching, missing-asset/API isolation and applicable redirect checks.");
