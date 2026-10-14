/**
 * Generates the published contracts from the Zod source of truth:
 *   contracts/openapi.yaml               — OpenAPI 3.1 (components = every registered schema)
 *   packages/shared/fixtures/*.json      — deterministic-ish demo fixtures captured from a real demo runtime
 * Run: pnpm contracts:gen   (CI should fail if the output differs from what is committed — see `--check`).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import YAML from "yaml";
import { CONTRACT_VERSION, routes, type RouteDef, type ServerEvent } from "@agentic-economy/shared";
import { loadConfig } from "../src/config.js";
import { createContext } from "../src/context.js";
import { seedDemo, demoWallet } from "../src/demo-seed.js";
import { buildApp } from "../src/http/app.js";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const check = process.argv.includes("--check");

type Json = Record<string, unknown>;

function clean(v: unknown, rename: (ref: string) => string): unknown {
  if (Array.isArray(v)) return v.map((x) => clean(x, rename));
  if (v && typeof v === "object") {
    const out: Json = {};
    for (const [k, x] of Object.entries(v)) {
      if (k === "$schema" || k === "$id") continue;
      out[k] = k === "$ref" && typeof x === "string" ? rename(x) : clean(x, rename);
    }
    return out;
  }
  return v;
}

function buildOpenApi() {
  const opts = { target: "draft-2020-12" as const, uri: (id: string) => `#/components/schemas/${id}`, unrepresentable: "any" as const };
  const out = z.toJSONSchema(z.globalRegistry, opts).schemas as Record<string, Json>;
  const inp = z.toJSONSchema(z.globalRegistry, { ...opts, io: "input" }).schemas as Record<string, Json>;
  const withInput = new Set(Object.keys(inp).filter((id) => JSON.stringify(inp[id]) !== JSON.stringify(out[id])));
  const ident = (r: string) => r;
  const toInput = (r: string) => {
    const id = r.replace("#/components/schemas/", "");
    return withInput.has(id) ? `#/components/schemas/${id}Input` : r;
  };
  const schemas: Json = {};
  for (const id of Object.keys(out).sort()) {
    schemas[id] = clean(out[id], ident);
    if (withInput.has(id)) schemas[`${id}Input`] = clean(inp[id], toInput);
  }

  const inline = (s: z.ZodType) => {
    const js = z.toJSONSchema(s, { io: "input", unrepresentable: "any", reused: "inline" }) as Json;
    const defs = (js.$defs ?? {}) as Record<string, Json>;
    const ref = typeof js.$ref === "string" ? js.$ref.replace("#/$defs/", "") : null;
    return clean(ref ? defs[ref] : js, (r) => (r.startsWith("#/$defs/") ? `#/components/schemas/${r.slice(8)}` : r)) as Json;
  };
  const refOrInline = (s: z.ZodType, io: "input" | "output") => {
    const id = z.globalRegistry.get(s)?.id as string | undefined;
    if (id) return { $ref: `#/components/schemas/${io === "input" && withInput.has(id) ? `${id}Input` : id}` };
    return inline(s);
  };

  const paths: Json = {};
  for (const def of Object.values(routes) as RouteDef[]) {
    const path = def.path.replace(/:([A-Za-z]+)/g, "{$1}");
    const parameters: Json[] = [];
    for (const [where, obj] of [
      ["path", def.params],
      ["query", def.query],
    ] as const) {
      if (!obj) continue;
      const js = inline(obj);
      const props = (js.properties ?? {}) as Record<string, Json>;
      const required = new Set((js.required ?? []) as string[]);
      for (const [name, schema] of Object.entries(props)) parameters.push({ name, in: where, required: where === "path" || required.has(name), schema });
    }
    if (def.idempotencyKey)
      parameters.push({
        name: "Idempotency-Key",
        in: "header",
        required: def.idempotencyKey === "required",
        description: "8-128 chars [A-Za-z0-9_.:-]. Same key + same request ⇒ stored response replayed; same key + different request ⇒ 409 idempotency_conflict.",
        schema: { type: "string", minLength: 8, maxLength: 128 },
      });
    const op: Json = {
      operationId: def.operationId,
      summary: def.summary,
      tags: [def.tag],
      ...(parameters.length ? { parameters } : {}),
      ...(def.body ? { requestBody: { required: true, content: { "application/json": { schema: refOrInline(def.body, "input") } } } } : {}),
      ...(def.auth ? { security: [{ walletSession: [] }] } : {}),
      ...(def.demoOnly ? { "x-demo-only": true, description: "Only registered when MODE=demo. Never available on devnet/production." } : {}),
      responses: {
        [String(def.successStatus ?? 200)]: { description: "OK", content: { "application/json": { schema: refOrInline(def.response, "output") } } },
        default: { description: "Error", content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } } },
      },
    };
    paths[path] = { ...((paths[path] as Json) ?? {}), [def.method]: op };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Agentic Economy API",
      version: CONTRACT_VERSION,
      description: [
        "Backend contract for Agentic Economy. Generated from packages/shared (Zod) by apps/server/scripts/gen-contracts.ts — do not edit by hand.",
        "Every list/read response carries `mode` (demo | devnet | production); clients must show a visible Demo Mode label when mode=demo.",
        "Amounts in lamports/token base units are decimal strings. City Credits are integer milli-credits, simulated and non-withdrawable.",
        "$AECO is a FUTURE token and does not exist; nothing in this API mints, sells or references it as live.",
        "WebSocket protocol: GET /api/v1/ws (see contracts/events.md); message schemas are the *Event components.",
      ].join("\n\n"),
    },
    servers: [{ url: "http://localhost:8787", description: "local" }],
    tags: ["world", "economy", "agents", "communities", "launches", "treasury", "auth", "system", "demo"].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: { walletSession: { type: "http", scheme: "bearer", description: "Opaque session token from POST /api/v1/auth/verify." } },
      schemas,
    },
  };
}

async function buildFixtures() {
  const config = loadConfig({ MODE: "demo", LOG_LEVEL: "silent", SIM_AUTOSTART: "false", WORLD_SEED: "agentic-economy-genesis" });
  const ctx = await createContext(config);
  await seedDemo(ctx);
  const app = await buildApp(ctx);
  const ws: ServerEvent[] = [];
  const unsub = ctx.runtime.subscribe((e) => {
    if (!ws.some((x) => x.type === e.type)) ws.push(e);
  });
  for (let i = 0; i < 240; i++) await ctx.runtime.tickOnce();
  unsub();

  const get = async (url: string) => {
    const r = await app.inject({ method: "GET", url });
    if (r.statusCode !== 200) throw new Error(`${url} → ${r.statusCode} ${r.body}`);
    return r.json();
  };
  const community = (await get("/api/v1/communities?limit=1")).items[0];
  const agentId = ctx.runtime.engine.state.agentOrder[0]!;
  const launchId = community.launchId as string;
  const fixtures: Record<string, unknown> = {
    "world-bootstrap": await get("/api/v1/world/bootstrap"),
    "world-chunks": await get("/api/v1/world/chunks?x=1&y=1&radius=4"),
    "world-stats": await get("/api/v1/world/stats"),
    "world-agents": await get("/api/v1/world/agents"),
    activities: await get("/api/v1/activities?limit=50"),
    markets: await get("/api/v1/markets"),
    "economy-summary": await get("/api/v1/economy/summary"),
    tasks: await get("/api/v1/tasks?limit=50"),
    receipts: await get("/api/v1/tasks/receipts?limit=20"),
    rewards: await get("/api/v1/rewards?limit=20"),
    communities: await get("/api/v1/communities"),
    community: await get(`/api/v1/communities/${community.id}`),
    "community-agents": await get(`/api/v1/communities/${community.id}/agents`),
    agent: await get(`/api/v1/agents/${agentId}`),
    "agent-activity": await get(`/api/v1/agents/${agentId}/activity?limit=30`),
    treasury: await get("/api/v1/treasury"),
    "treasury-entries": await get("/api/v1/treasury/entries"),
    launch: await get(`/api/v1/launches/${launchId}`),
    "ws-events": ws.sort((a, b) => a.type.localeCompare(b.type)),
  };
  await app.close();
  await ctx.close();
  return { fixtures, demoLauncher: demoWallet(0) };
}

const openapi = YAML.stringify(buildOpenApi(), { lineWidth: 0 });
const target = `${ROOT}contracts/openapi.yaml`;
if (check) {
  const current = await readFile(target, "utf8").catch(() => "");
  if (current !== openapi) {
    console.error("contracts/openapi.yaml is out of date — run pnpm contracts:gen");
    process.exit(1);
  }
  console.log("contracts up to date");
} else {
  await writeFile(target, openapi);
  const { fixtures } = await buildFixtures();
  const dir = `${ROOT}packages/shared/fixtures/`;
  await mkdir(dir, { recursive: true });
  for (const [name, data] of Object.entries(fixtures)) await writeFile(`${dir}${name}.json`, JSON.stringify(data, null, 2) + "\n");
  await writeFile(`${dir}README.md`, FIXTURE_README(Object.keys(fixtures)));
  console.log(`wrote contracts/openapi.yaml and ${Object.keys(fixtures).length} fixtures`);
}

function FIXTURE_README(names: string[]) {
  return `# Agentic Economy fixtures (DEMO MODE)

Generated by \`pnpm contracts:gen\` from a real demo runtime (mock chain, seeded demo communities,
240 simulated ticks). Every file is a verbatim HTTP response body from the endpoint named below and
validates against the schemas in \`packages/shared\` (enforced by \`packages/shared/test/fixtures.test.ts\`).
All data is **demo data**: \`mode\` is \`"demo"\`, wallets/mints are generated, nothing is on-chain.

| File | Source |
|---|---|
${names
  .map((n) => `| \`${n}.json\` | ${n === "ws-events" ? "One sample of each WebSocket server event type" : "GET endpoint of the same name"} |`)
  .join("\n")}
`;
}
