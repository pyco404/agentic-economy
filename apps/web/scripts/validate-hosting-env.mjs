import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

export function validateHostingEnvironment(env) {
  assert.equal(env.VITE_DATA_MODE, "api", "Hosted frontend must use the authoritative API adapter.");
  const parse = (key) => {
    try { return new URL(env[key]); }
    catch { throw new Error(`${key} must be a public absolute URL.`); }
  };
  const api = parse("VITE_API_URL"), ws = parse("VITE_WS_URL");
  assert.equal(api.protocol, "https:", "Hosted API must use HTTPS.");
  assert.equal(ws.protocol, "wss:", "Hosted event stream must use WSS.");
  for (const url of [api, ws]) {
    assert(!url.username && !url.password && !url.search && !url.hash, "Public URLs must not contain credentials, queries or fragments.");
    assert(!["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(url.hostname) &&
      !url.hostname.endsWith(".localhost") && !url.hostname.endsWith(".railway.internal"), "Browser endpoints must be publicly reachable.");
  }
  assert.equal(api.pathname, "/", "API base must not include /api/v1.");
  assert.equal(ws.pathname, "/api/v1/ws", "Event stream must use the canonical WebSocket path.");
  assert.equal(ws.host, api.host, "HTTP and WebSocket endpoints must use the same backend host.");
  return { api: api.origin, ws: ws.href };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateHostingEnvironment(process.env);
  console.log("Validated public frontend build configuration.");
}
