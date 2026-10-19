import { afterEach, describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import { loadConfig } from "../src/config.js";
import { idem, login, makeEnv, DRAFT, type TestEnv } from "./helpers.js";

let env: TestEnv | undefined;
afterEach(async () => { await env?.close(); env = undefined; });

/** Prepare a launch and land it on the mock chain at `confirmed` commitment only. */
async function landConfirmed(e: TestEnv) {
  const user = await login(e.app);
  const prep = await e.app.inject({ method: "POST", url: "/api/v1/launches/prepare", headers: { ...user.auth, ...idem() }, payload: { draft: DRAFT } });
  const launch = prep.json().launch;
  const signature = e.chain.simulateLaunch({ launcherWallet: user.wallet, mint: launch.mint, platformTreasury: e.ctx.config.treasuries.platform, agentRewardsTreasury: e.ctx.config.treasuries.agentRewards }, "success", "confirmed");
  const confirm = () => e.app.inject({ method: "POST", url: "/api/v1/launches/confirm", headers: user.auth, payload: { launchId: launch.id, signature } });
  const receipts = async () => (await e.ctx.store.allTreasuryEntries()).filter((t) => t.launchId === launch.id);
  return { launch, signature, confirm, receipts };
}

describe("launch registration finality policy", () => {
  it("with finalized policy, a confirmed-only launch binds its signature but registers nothing until final", async () => {
    env = await makeEnv({ LAUNCH_REGISTRATION_COMMITMENT: "finalized" });
    const { signature, confirm, receipts } = await landConfirmed(env);
    for (let i = 0; i < 2; i++) {
      const r = (await confirm()).json().launch;
      expect(r).toMatchObject({ status: "submitted", signature, communityId: null });
      expect(r.slot).toBeGreaterThan(0);
    }
    expect(await receipts()).toHaveLength(0);
    env.chain.finalize(signature);
    const done = (await confirm()).json().launch;
    expect(done.status).toBe("confirmed");
    expect(done.communityId).toMatch(/^com_/);
    expect((await receipts()).map((t) => t.finality)).toEqual(["finalized"]);
    expect((await confirm()).json().launch.communityId).toBe(done.communityId);
  });

  it("with finalized policy, a confirmed transaction that is then dropped never registers a community", async () => {
    env = await makeEnv({ LAUNCH_REGISTRATION_COMMITMENT: "finalized" });
    const { signature, confirm, receipts } = await landConfirmed(env);
    expect((await confirm()).json().launch.status).toBe("submitted");
    env.chain.dropTransaction(signature);
    const r = (await confirm()).json().launch;
    expect(r.communityId).toBeNull();
    expect(r.status).not.toBe("confirmed");
    expect(await receipts()).toHaveLength(0);
  });

  it("outside production the default registers at confirmed, with the receipt pending finality", async () => {
    env = await makeEnv();
    expect(env.ctx.config.launchRegistrationCommitment).toBe("confirmed");
    const { confirm, receipts } = await landConfirmed(env);
    expect((await confirm()).json().launch.status).toBe("confirmed");
    expect((await receipts()).map((t) => t.finality)).toEqual(["pending"]);
  });

  it("production always requires finalized", () => {
    const base = { MODE: "production", DATABASE_URL: "postgres://localhost/x", SOLANA_RPC_URL: "https://rpc.example", PLATFORM_TREASURY: Keypair.generate().publicKey.toBase58(), AGENT_REWARDS_TREASURY: Keypair.generate().publicKey.toBase58() };
    expect(() => loadConfig({ ...base, LAUNCH_REGISTRATION_COMMITMENT: "confirmed" })).toThrow(/finalized/);
    expect(loadConfig(base).launchRegistrationCommitment).toBe("finalized");
  });
});
