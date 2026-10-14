import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LAUNCH_FEE_LAMPORTS } from "@agentic-economy/shared";
import { AuthService } from "../src/services/auth.js";
import { MemoryStore } from "../src/store/memory.js";
import { loadConfig } from "../src/config.js";
import { DRAFT, idem, launch, login, makeEnv, newWallet, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await makeEnv();
});
afterAll(async () => env.close());

describe("wallet authentication", () => {
  it("issues a session for a valid signature and rejects challenge replay", async () => {
    const w = newWallet();
    const ch = (await env.app.inject({ method: "POST", url: "/api/v1/auth/challenge", payload: { wallet: w.wallet } })).json();
    expect(ch.message).toContain(w.wallet);
    expect(ch.message).toContain(`Nonce: ${ch.nonce}`);
    const payload = { wallet: w.wallet, nonce: ch.nonce, signature: w.sign(ch.message) };
    const ok = await env.app.inject({ method: "POST", url: "/api/v1/auth/verify", payload });
    expect(ok.statusCode).toBe(200);
    const session = await env.app.inject({ method: "GET", url: "/api/v1/auth/session", headers: { authorization: `Bearer ${ok.json().token}` } });
    expect(session.json().wallet).toBe(w.wallet);

    const replay = await env.app.inject({ method: "POST", url: "/api/v1/auth/verify", payload });
    expect(replay.statusCode).toBe(401);
  });

  it("rejects a signature from a different key, and burns the nonce", async () => {
    const victim = newWallet();
    const attacker = newWallet();
    const ch = (await env.app.inject({ method: "POST", url: "/api/v1/auth/challenge", payload: { wallet: victim.wallet } })).json();
    const bad = await env.app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { wallet: victim.wallet, nonce: ch.nonce, signature: attacker.sign(ch.message) } });
    expect(bad.statusCode).toBe(401);
    const retry = await env.app.inject({ method: "POST", url: "/api/v1/auth/verify", payload: { wallet: victim.wallet, nonce: ch.nonce, signature: victim.sign(ch.message) } });
    expect(retry.statusCode).toBe(401);
  });

  it("rejects expired challenges", async () => {
    let now = new Date("2026-10-14T00:00:00Z");
    const store = new MemoryStore();
    const auth = new AuthService(store, loadConfig({ MODE: "demo" }), () => now);
    const w = newWallet();
    const ch = await auth.challenge(w.wallet);
    now = new Date(now.getTime() + 301_000);
    await expect(auth.verify(w.wallet, ch.nonce, w.sign(ch.message))).rejects.toThrow(/expired/);
  });

  it("requires a session for protected routes", async () => {
    const r = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers: idem(), payload: { draft: DRAFT } });
    expect(r.statusCode).toBe(401);
    expect(r.json().error.code).toBe("unauthorized");
  });
});

describe("launchpad", () => {
  it("prepares a launch with the fixed fee breakdown and requires an Idempotency-Key", async () => {
    const user = await login(env.app);
    const noKey = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers: user.auth, payload: { draft: DRAFT } });
    expect(noKey.statusCode).toBe(400);

    const headers = { ...user.auth, ...idem() };
    const a = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers, payload: { draft: DRAFT } });
    expect(a.statusCode).toBe(201);
    const fees = a.json().launch.fees;
    expect(fees.platformLaunchFeeLamports).toBe("50000000");
    expect(fees.launcherCreatorFeeBps).toBe(0);
    expect(fees.creatorFeeSplit.agentRewardsBps).toBe(6000);
    expect(fees.creatorFeeSplit.platformBps).toBe(4000);
    expect(a.json().demoTransaction).toBe(true);

    const replay = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers, payload: { draft: DRAFT } });
    expect(replay.headers["idempotent-replayed"]).toBe("true");
    expect(replay.json().launch.id).toBe(a.json().launch.id);
    const conflict = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers, payload: { draft: { ...DRAFT, name: "Other" } } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("idempotency_conflict");
  });

  it("confirms a verified launch: registers exactly one community and one platform-only 0.05 SOL receipt", async () => {
    const user = await login(env.app);
    const { confirm, launchId, signature } = await launch(env.app, user);
    expect(confirm.statusCode).toBe(200);
    const l = confirm.json().launch;
    expect(l.status).toBe("confirmed");
    expect(l.history.map((h: { status: string }) => h.status)).toEqual(["draft", "awaiting_signature", "confirmed"]);
    const community = (await env.app.inject({ method: "GET", url: `/api/v1/communities/${l.communityId}` })).json().community;
    expect(community.mint).toBe(l.mint);
    expect(community.creatorWallet).toBe(user.wallet);
    expect(community.headquartersBuildingId).toMatch(/^bld_/);

    const entries = (await env.ctx.store.allTreasuryEntries()).filter((e) => e.launchId === launchId);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ stream: "launch_fee", account: "platform", amount: LAUNCH_FEE_LAMPORTS.toString(), finality: "finalized" });

    // Duplicate confirmation is idempotent: same result, nothing new recorded.
    const again = await env.app.inject({ method: "POST", url: "/api/v1/launches/confirm", headers: user.auth, payload: { launchId, signature } });
    expect(again.statusCode).toBe(200);
    expect(again.json().launch.communityId).toBe(l.communityId);
    expect((await env.ctx.store.allTreasuryEntries()).filter((e) => e.launchId === launchId)).toHaveLength(1);
    expect((await env.ctx.store.allCommunities()).filter((c) => c.launchId === launchId)).toHaveLength(1);

    // A different signature cannot be bound to a confirmed launch.
    const other = await env.app.inject({ method: "POST", url: "/api/v1/launches/confirm", headers: user.auth, payload: { launchId, signature: "5".repeat(88) } });
    expect(other.statusCode).toBe(409);
  });

  it("only the launcher can confirm", async () => {
    const user = await login(env.app);
    const stranger = await login(env.app);
    const prep = await env.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers: { ...user.auth, ...idem() }, payload: { draft: DRAFT } });
    const launchId = prep.json().launch.id;
    const sig = (await env.app.inject({ method: "POST", url: `/api/v1/demo/launches/${launchId}/sign`, headers: user.auth, payload: {} })).json().signature;
    const r = await env.app.inject({ method: "POST", url: "/api/v1/launches/confirm", headers: stranger.auth, payload: { launchId, signature: sig } });
    expect(r.statusCode).toBe(403);
  });

  it("marks a failed transaction failed: no community, no receipt", async () => {
    const user = await login(env.app);
    const { confirm, launchId } = await launch(env.app, user, "tx_failed");
    expect(confirm.json().launch.status).toBe("failed");
    expect(confirm.json().launch.errors[0].code).toBe("transaction_failed");
    expect(confirm.json().launch.communityId).toBeNull();
    expect((await env.ctx.store.allTreasuryEntries()).filter((e) => e.launchId === launchId)).toHaveLength(0);
  });

  it("rejects a landed transaction without the exact 0.05 SOL platform charge", async () => {
    const user = await login(env.app);
    const { confirm } = await launch(env.app, user, "wrong_fee");
    expect(confirm.json().launch.status).toBe("failed");
    expect(confirm.json().launch.errors.map((e: { code: string }) => e.code)).toContain("launch_fee_missing");
  });

  it("puts launches with unsupported/incorrect fee routing into recovery_needed (fee recorded, no community)", async () => {
    for (const outcome of ["missing_fee_sharing", "launcher_share"]) {
      const user = await login(env.app);
      const { confirm, launchId } = await launch(env.app, user, outcome);
      const l = confirm.json().launch;
      expect(l.status).toBe("recovery_needed");
      expect(l.communityId).toBeNull();
      expect(l.errors.length).toBeGreaterThan(0);
      const fee = (await env.ctx.store.allTreasuryEntries()).filter((e) => e.launchId === launchId);
      expect(fee).toHaveLength(1);
      expect(fee[0]!.stream).toBe("launch_fee");
      expect(await env.ctx.store.getCommunityByMint(l.mint)).toBeNull();
    }
  });

  it("allows unlimited consecutive launches from one wallet (no cooldown, no duplicate-metadata gate)", async () => {
    const user = await login(env.app);
    for (let i = 0; i < 20; i++) {
      const { confirm } = await launch(env.app, user, "success", DRAFT); // identical metadata every time
      expect(confirm.json().launch.status).toBe("confirmed");
    }
    const mine = (await env.ctx.store.allCommunities()).filter((c) => c.creatorWallet === user.wallet);
    expect(mine).toHaveLength(20);
  });
});

describe("communities, holder eligibility and agents", () => {
  it("gates agent activation on on-chain holdings and enforces ownership", async () => {
    const launcher = await login(env.app);
    const { confirm } = await launch(env.app, launcher);
    const communityId = confirm.json().launch.communityId as string;
    const mint = confirm.json().launch.mint as string;

    const holder = await login(env.app);
    const body = { communityId, name: "Test Courier", profession: "logistics_operator" };
    const denied = await env.app.inject({ method: "POST", url: "/api/v1/agents", headers: { ...holder.auth, ...idem() }, payload: body });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("not_eligible");

    env.chain.setTokenBalance(holder.wallet, mint, 5_000_000_000n);
    const created = await env.app.inject({ method: "POST", url: "/api/v1/agents", headers: { ...holder.auth, ...idem() }, payload: body });
    expect(created.statusCode).toBe(201);
    const agent = created.json().agent;
    expect(agent.ownerWallet).toBe(holder.wallet);
    expect(agent.permissions).not.toContain("sign_transactions");

    const elig = await env.app.inject({ method: "GET", url: `/api/v1/communities/${communityId}/eligibility`, headers: holder.auth });
    expect(elig.json()).toMatchObject({ eligible: true, source: "mock_chain" });

    const stranger = await login(env.app);
    const hijack = await env.app.inject({ method: "PATCH", url: `/api/v1/agents/${agent.id}`, headers: stranger.auth, payload: { status: "paused" } });
    expect(hijack.statusCode).toBe(403);
    const pause = await env.app.inject({ method: "PATCH", url: `/api/v1/agents/${agent.id}`, headers: holder.auth, payload: { status: "paused", strategy: { risk: "low" } } });
    expect(pause.statusCode).toBe(200);
    expect(pause.json().agent.status).toBe("paused");
    expect(pause.json().agent.strategy.risk).toBe("low");
  });

  it("returns 404 for communities that were not launched through the platform", async () => {
    const r = await env.app.inject({ method: "GET", url: "/api/v1/communities/com_notlaunched123" });
    expect(r.statusCode).toBe(404);
  });

  it("caps agents per wallet per community", async () => {
    const launcher = await login(env.app);
    const { confirm } = await launch(env.app, launcher);
    const communityId = confirm.json().launch.communityId as string;
    const codes: number[] = [];
    for (let i = 0; i < 4; i++)
      codes.push((await env.app.inject({ method: "POST", url: "/api/v1/agents", headers: { ...launcher.auth, ...idem() }, payload: { communityId, name: `Agent ${i}`, profession: "merchant" } })).statusCode);
    expect(codes).toEqual([201, 201, 201, 403]);
  });
});

describe("public read API", () => {
  it("serves world, economy and treasury reads that satisfy the contract", async () => {
    for (let i = 0; i < 30; i++) await env.ctx.runtime.tickOnce();
    for (const url of ["/api/v1/world/bootstrap", "/api/v1/world/chunks?x=1&y=1&radius=1", "/api/v1/world/stats", "/api/v1/world/agents", "/api/v1/activities", "/api/v1/markets", "/api/v1/economy/summary", "/api/v1/tasks?status=open", "/api/v1/tasks/receipts", "/api/v1/rewards", "/api/v1/communities", "/api/v1/treasury", "/api/v1/treasury/summary", "/api/v1/treasury/entries", "/healthz", "/metrics"]) {
      const r = await env.app.inject({ method: "GET", url });
      expect(r.statusCode, url).toBe(200);
    }
    const chunks = (await env.app.inject({ method: "GET", url: "/api/v1/world/chunks?x=1&y=1&radius=1" })).json();
    expect(chunks.chunks).toHaveLength(9);
    expect(chunks.mode).toBe("demo");
  });

  it("paginates activities with opaque cursors without overlap", async () => {
    const p1 = (await env.app.inject({ method: "GET", url: "/api/v1/activities?limit=5" })).json();
    const p2 = (await env.app.inject({ method: "GET", url: `/api/v1/activities?limit=5&cursor=${p1.nextCursor}` })).json();
    expect(p1.items).toHaveLength(5);
    const ids = new Set(p1.items.map((e: { id: string }) => e.id));
    for (const e of p2.items) expect(ids.has(e.id)).toBe(false);
    expect(p2.items[0].seq).toBeLessThan(p1.items[4].seq);
  });

  it("returns structured errors", async () => {
    const r = await env.app.inject({ method: "GET", url: "/api/v1/agents/agt_doesnotexist" });
    expect(r.statusCode).toBe(404);
    expect(r.json()).toMatchObject({ error: { code: "not_found" } });
    expect(typeof r.json().requestId).toBe("string");
    const bad = await env.app.inject({ method: "GET", url: "/api/v1/world/chunks?x=abc&y=0" });
    expect(bad.statusCode).toBe(400);
  });
});

describe("non-demo safety", () => {
  it("disables launches and demo endpoints on devnet until fee routing is verified", async () => {
    const dev = await makeEnv(
      {
        MODE: "devnet",
        DATABASE_URL: "postgres://unused",
        SOLANA_RPC_URL: "http://127.0.0.1:1",
        PLATFORM_TREASURY: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        AGENT_REWARDS_TREASURY: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      },
      { store: new MemoryStore() },
    );
    try {
      const user = await login(dev.app);
      const r = await dev.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers: { ...user.auth, ...idem() }, payload: { draft: DRAFT } });
      expect(r.statusCode).toBe(503);
      expect(r.json().error.code).toBe("feature_disabled");
      const demo = await dev.app.inject({ method: "POST", url: "/api/v1/demo/launches/lch_aaaaaaaaaaaa/sign", headers: user.auth, payload: {} });
      expect(demo.statusCode).toBe(404);
      const t = (await dev.app.inject({ method: "GET", url: "/api/v1/treasury" })).json();
      expect(t.feeRouting.verified).toBe(false);
      expect(t.payouts.mode).toBe("disabled_dry_run");
    } finally {
      await dev.close();
    }
  });
});
