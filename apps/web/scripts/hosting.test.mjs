import test from "node:test";
import assert from "node:assert/strict";
import { validateHostingEnvironment } from "./validate-hosting-env.mjs";

const config = { VITE_DATA_MODE: "api", VITE_API_URL: "https://api-staging.useaeco.xyz",
  VITE_WS_URL: "wss://api-staging.useaeco.xyz/api/v1/ws" };
test("accepts the public staging pair without interpreting api as a financial mode", () => {
  assert.deepEqual(validateHostingEnvironment(config), { api: config.VITE_API_URL, ws: config.VITE_WS_URL });
});
test("rejects fixture mode, missing URLs and insecure or inaccessible browser endpoints", () => {
  for (const patch of [
    { VITE_DATA_MODE: "demo" }, { VITE_API_URL: "" }, { VITE_WS_URL: "" },
    { VITE_API_URL: "http://api-staging.useaeco.xyz" },
    { VITE_WS_URL: "ws://api-staging.useaeco.xyz/api/v1/ws" },
    { VITE_API_URL: "https://localhost" }, { VITE_API_URL: "https://127.0.0.1" },
    { VITE_API_URL: "https://backend.railway.internal" },
  ]) assert.throws(() => validateHostingEnvironment({ ...config, ...patch }));
});
test("rejects malformed route pairs and embedded credentials", () => {
  for (const patch of [
    { VITE_API_URL: `${config.VITE_API_URL}/api/v1` },
    { VITE_API_URL: `${config.VITE_API_URL}?token=not-a-session` },
    { VITE_API_URL: "https://user:example@api-staging.useaeco.xyz" },
    { VITE_WS_URL: "wss://api-staging.useaeco.xyz/ws" },
    { VITE_WS_URL: "wss://api.useaeco.xyz/api/v1/ws" },
    { VITE_WS_URL: `${config.VITE_WS_URL}#fragment` },
  ]) assert.throws(() => validateHostingEnvironment({ ...config, ...patch }));
});
