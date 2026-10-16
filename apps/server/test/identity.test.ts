import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActivateAgentResponse, AgentResponse, MyActivationResponse } from "@agentic-economy/shared";
import { DEFAULT_STRATEGY } from "../src/sim/engine.js";
import { idem, launch, login, makeEnv, type TestEnv } from "./helpers.js";

let env: TestEnv;
beforeAll(async () => {
  env = await makeEnv({ HOUSE_AGENTS_PER_WALLET: "2", HOUSE_AGENTS_MAX: "5" });
});
afterAll(async () => env.close());

type User = Awaited<ReturnType<typeof login>>;

async function launched(user?: User) {
  const launcher = user ?? (await login(env.app));
  const { confirm } = await launch(env.app, launcher);
  return { launcher, communityId: confirm.json().launch.communityId as string, mint: confirm.json().launch.mint as string };
}

const activate = (user: User, communityId: string, headers: Record<string, string> = idem()) =>
  env.app.inject({ method: "POST", url: "/api/v1/agents/activate", headers: { ...user.auth, ...headers }, payload: { communityId, profession: "merchant" } });

const house = (user: User, communityId: string) =>
  env.app.inject({ method: "POST", url: "/api/v1/agents/house", headers: { ...user.auth, ...idem() }, payload: { communityId, profession: "builder" } });

describe("token-linked activation", () => {
  it("lets only the token's launcher activate, names the agent after the wallet and makes it the owner", async () => {
    const { launcher, communityId, mint } = await launched();

    // Holding (even buying) the token is never enough.
    const holder = await login(env.app);
    env.chain.setTokenBalance(holder.wallet, mint, 9_000_000_000n);
    const denied = await activate(holder, communityId);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("not_token_launcher");

    const res = await activate(launcher, communityId);
    expect(res.statusCode).toBe(201);
    const { activation, agent } = ActivateAgentResponse.parse(res.json());
    const short = `${launcher.wallet.slice(0, 4)}...${launcher.wallet.slice(-4)}`;
    expect(activation).toMatchObject({ communityId, tokenMint: mint, activatingWallet: launcher.wallet, displayName: short, status: "active", agentId: agent.id });
    expect(agent).toMatchObject({ displayName: short, ownerWallet: launcher.wallet });
    expect(agent.identity).toEqual({ kind: "token_linked", activationId: activation.id, tokenMint: mint, activatingWallet: launcher.wallet, launchId: activation.launchId, communityId });

    const listed = (await env.app.inject({ method: "GET", url: "/api/v1/world/agents" })).json().agents.find((a: { id: string }) => a.id === agent.id);
    expect(listed.identity.kind).toBe("token_linked");

    // Owner controls: the activating wallet only.
    const stranger = await login(env.app);
    expect((await env.app.inject({ method: "PATCH", url: `/api/v1/agents/${agent.id}`, headers: stranger.auth, payload: { status: "paused" } })).statusCode).toBe(403);
    const paused = await env.app.inject({ method: "PATCH", url: `/api/v1/agents/${agent.id}`, headers: launcher.auth, payload: { status: "paused" } });
    expect(paused.json().agent.status).toBe("paused");
  });

  it("allows one token-linked agent per wallet: a wallet that launched two tokens can activate only one", async () => {
    const { launcher, communityId: first } = await launched();
    const { communityId: second } = await launched(launcher); // launching more tokens is not limited
    const ok = await activate(launcher, first);
    expect(ok.statusCode).toBe(201);
    const again = await activate(launcher, second);
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("wallet_already_activated");
    expect(again.json().error.details).toMatchObject({ activationId: ok.json().activation.id, agentId: ok.json().agent.id, communityId: first, status: "active" });
  });

  it("returns the original activation for a retried request and never creates a second agent", async () => {
    const { launcher, communityId } = await launched();
    const headers = idem();
    const a = await activate(launcher, communityId, headers);
    const b = await activate(launcher, communityId, headers);
    expect(b.statusCode).toBe(201);
    expect(b.headers["idempotent-replayed"]).toBe("true");
    expect(b.json().agent.id).toBe(a.json().agent.id);

    // Even if the HTTP replay record were lost (e.g. the first response timed out before it was stored),
    // the service-level dedupe returns the same reservation for the same key.
    const req = { communityId, profession: "merchant" as const, strategy: { ...DEFAULT_STRATEGY } };
    const s = await env.ctx.agents.activate(launcher.wallet, req, headers["idempotency-key"]);
    expect(s.activation.id).toBe(a.json().activation.id);
    // ...while a different key for the same wallet is a conflict, not a duplicate.
    await expect(env.ctx.agents.activate(launcher.wallet, req, "another-key-0001")).rejects.toMatchObject({ code: "wallet_already_activated" });
    expect(env.ctx.runtime.agentSummaries().filter((x) => x.identity.kind === "token_linked" && x.ownerWallet === launcher.wallet)).toHaveLength(1);
  });

  it("admits exactly one of many concurrent activations with different keys", async () => {
    const { launcher, communityId } = await launched();
    const results = await Promise.all(Array.from({ length: 8 }, () => activate(launcher, communityId)));
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    for (const r of results.filter((r) => r.statusCode !== 201)) expect(["wallet_already_activated", "activation_in_progress"]).toContain(r.json().error.code);
  });

  it("enforces one agent per mint even for a reservation that bypasses the launcher check", async () => {
    const { launcher, communityId, mint } = await launched();
    const ok = await activate(launcher, communityId);
    expect(ok.statusCode).toBe(201);
    const other = await login(env.app);
    const r = await env.ctx.runtime.bus.enqueueIdentity(
      "test:mint-reuse",
      {
        kind: "token_linked",
        agentId: "agt_mintreuse01",
        nameCandidates: ["Other...Name"],
        activation: { id: "act_mintreuse01", agentId: "agt_mintreuse01", communityId, launchId: ok.json().activation.launchId, tokenMint: mint, activatingWallet: other.wallet },
      },
      () => ({ type: "agent.update", agentId: "agt_mintreuse01" }),
    );
    expect(r).toMatchObject({ ok: false, reason: "mint_taken", activation: { id: ok.json().activation.id } });
  });

  it("serves the caller's activation from the session only", async () => {
    const { launcher, communityId } = await launched();
    const before = MyActivationResponse.parse((await env.app.inject({ method: "GET", url: "/api/v1/me/activation", headers: launcher.auth })).json());
    expect(before).toMatchObject({ activation: null, agent: null });
    const done = (await activate(launcher, communityId)).json();
    const mine = MyActivationResponse.parse((await env.app.inject({ method: "GET", url: "/api/v1/me/activation", headers: launcher.auth })).json());
    expect(mine.activation?.id).toBe(done.activation.id);
    expect(mine.agent?.id).toBe(done.agent.id);
    // Another session cannot see it, and the route takes no wallet parameter.
    const other = await login(env.app);
    const theirs = (await env.app.inject({ method: "GET", url: `/api/v1/me/activation?wallet=${launcher.wallet}`, headers: other.auth })).json();
    expect(theirs.activation).toBeNull();
    expect((await env.app.inject({ method: "GET", url: "/api/v1/me/activation" })).statusCode).toBe(401);
  });
});

describe("demo house agents", () => {
  it("creates ownerless house agents with unique Word_NNN names, within quotas", async () => {
    const { launcher, communityId } = await launched();
    const caller = await login(env.app);
    const created = [await house(caller, communityId), await house(caller, communityId)];
    const agents = created.map((r) => {
      expect(r.statusCode).toBe(201);
      return AgentResponse.parse(r.json()).agent;
    });
    for (const a of agents) {
      expect(a.ownerWallet).toBeNull(); // authenticating the request does not make the caller an owner
      expect(a.identity).toEqual({ kind: "house", syntheticName: a.displayName });
      expect(a.displayName).toMatch(/^[A-Z][a-z]+_\d{3}$/);
    }
    expect(agents[0]!.displayName).not.toBe(agents[1]!.displayName);

    const third = await house(caller, communityId);
    expect(third.statusCode).toBe(403); // HOUSE_AGENTS_PER_WALLET=2

    // Nobody can change a house agent, not even the wallet that requested it.
    const patch = await env.app.inject({ method: "PATCH", url: `/api/v1/agents/${agents[0]!.id}`, headers: caller.auth, payload: { status: "paused" } });
    expect(patch.statusCode).toBe(403);

    // City-wide cap (HOUSE_AGENTS_MAX=5) also holds across many wallets.
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await house(await login(env.app), communityId)).statusCode);
    expect(codes).toEqual([201, 201, 201, 403]);
    void launcher;
  });
});

describe("retired POST /agents", () => {
  it("answers 410 gone with the replacement routes, before authentication", async () => {
    const r = await env.app.inject({ method: "POST", url: "/api/v1/agents", payload: {} });
    expect(r.statusCode).toBe(410);
    expect(r.json().error).toMatchObject({ code: "gone", details: { replacements: ["POST /api/v1/agents/activate", "POST /api/v1/agents/house"] } });
  });
});
