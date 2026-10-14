/* eslint-disable @typescript-eslint/no-explicit-any */
import bs58 from "bs58";
import nacl from "tweetnacl";
import type { FastifyInstance } from "fastify";
import { loadConfig } from "../src/config.js";
import { createContext, type AppContext } from "../src/context.js";
import { buildApp } from "../src/http/app.js";
import { MockChain } from "../src/chain/mock.js";
import type { Store } from "../src/store/types.js";
import type { Coordinator } from "../src/coord/types.js";
import pg from "pg";
import { LOCK_KEYS } from "../src/store/postgres.js";

export interface TestEnv {
  ctx: AppContext;
  app: FastifyInstance;
  chain: MockChain;
  close(): Promise<void>;
}

export async function makeEnv(env: Record<string, string> = {}, overrides: { store?: Store; chain?: MockChain; coord?: Coordinator } = {}): Promise<TestEnv> {
  const config = loadConfig({ MODE: "demo", LOG_LEVEL: "silent", SIM_AUTOSTART: "false", WORLD_SEED: "test-world", ...env });
  const chain = overrides.chain ?? new MockChain();
  const ctx = await createContext(config, { chain, store: overrides.store, coord: overrides.coord });
  const app = await buildApp(ctx);
  return { ctx, app, chain, close: async () => (await app.close(), await ctx.close()) };
}

export function newWallet() {
  const kp = nacl.sign.keyPair();
  return { wallet: bs58.encode(kp.publicKey), sign: (msg: string) => bs58.encode(nacl.sign.detached(new TextEncoder().encode(msg), kp.secretKey)) };
}

/** Full challenge → sign → verify flow; returns a bearer token. */
export async function login(app: FastifyInstance, w = newWallet()) {
  const ch = (await app.inject({ method: "POST", url: "/api/v1/auth/challenge", payload: { wallet: w.wallet } })).json();
  const res = await app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { wallet: w.wallet, nonce: ch.nonce, signature: w.sign(ch.message) } });
  if (res.statusCode !== 200) throw new Error(res.body);
  return { ...w, token: res.json().token as string, auth: { authorization: `Bearer ${res.json().token}` } };
}

let keyCounter = 0;
export const idem = () => ({ "idempotency-key": `test-key-${Date.now()}-${++keyCounter}` });

export const DRAFT = {
  name: "Test Token",
  symbol: "TEST",
  description: "integration test",
  metadataUri: "https://example.invalid/meta.json",
};

/** prepare → demo-sign (with outcome) → confirm. */
export async function launch(
  app: FastifyInstance,
  user: Awaited<ReturnType<typeof login>>,
  outcome = "success",
  draft = DRAFT,
): Promise<{ launchId: string; signature: string; prepared: any; confirm: { statusCode: number; json(): any } }> {
  const prep = await app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers: { ...user.auth, ...idem() }, payload: { draft } });
  if (prep.statusCode !== 201) throw new Error(prep.body);
  const launchId = prep.json().launch.id as string;
  const signed = await app.inject({ method: "POST", url: `/api/v1/demo/launches/${launchId}/sign`, headers: user.auth, payload: { outcome } });
  const signature = signed.json().signature as string;
  const confirm = await app.inject({ method: "POST", url: "/api/v1/launches/confirm", headers: user.auth, payload: { launchId, signature } });
  return { launchId, signature, prepared: prep.json(), confirm };
}

/** Simulate the simulation leader's process dying: terminate the backend holding the sim advisory lock. */
export async function killSimLeaderBackend(url: string, key: number = LOCK_KEYS.sim): Promise<number> {
  // pg_locks is cluster-wide but advisory locks are per database: only ever touch the disposable test DB's own sessions
  // (other local databases may be running real processes, e.g. the frontend's integration backend).
  assertDisposableTestDb(url);
  const pool = new pg.Pool({ connectionString: url });
  try {
    const r = await pool.query(
      `SELECT pg_terminate_backend(l.pid) AS ok FROM pg_locks l
       WHERE l.locktype = 'advisory' AND l.objid = $1 AND l.granted
         AND l.database = (SELECT oid FROM pg_database WHERE datname = current_database())`,
      [key],
    );
    return r.rowCount ?? 0;
  } finally {
    await pool.end();
  }
}

/**
 * Tests drop and recreate the public schema. Refuse to do that to anything that is not obviously a
 * disposable test database (guards against pointing TEST_DATABASE_URL at staging/production).
 */
export function assertDisposableTestDb(url: string): void {
  const name = /^postgres(?:ql)?:\/\/[^/]*\/([^?#]+)/.exec(url)?.[1] ?? "";
  if (!/_test$/.test(name)) throw new Error(`refusing to reset database "${name}": test databases must be named *_test`);
}

export async function resetTestSchema(url: string): Promise<void> {
  assertDisposableTestDb(url);
  const pool = new pg.Pool({ connectionString: url });
  try {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  } finally {
    await pool.end();
  }
}
