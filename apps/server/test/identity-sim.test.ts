import { beforeAll, describe, expect, it } from "vitest";
import { SyntheticName, type Profession } from "@agentic-economy/shared";
import { generateWorld, type WorldLayout } from "@agentic-economy/world-spec";
import { DEFAULT_STRATEGY, SimEngine, createInitialState, hashState } from "../src/sim/engine.js";
import { legacyName, upgradeState, walletNameCandidates, type SimStateV1 } from "../src/sim/identity.js";
import type { LoggedCommand, SimCommand, SimState } from "../src/sim/types.js";

let layout: WorldLayout;
beforeAll(() => {
  layout = generateWorld("identity-sim-seed");
});

const WALLET_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const WALLET_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const COMMUNITY = "com_ident001";

/** Pre-0.3.0 holder activation, exactly as it sits in existing command logs. */
const legacyCreate = (id: string, profession: Profession, wallet: string): SimCommand => ({
  type: "agent.create",
  agentId: id,
  ownerWallet: wallet,
  communityId: COMMUNITY,
  name: `Courier ${id}`,
  profession,
  strategy: { ...DEFAULT_STRATEGY },
});

const commands: Record<number, SimCommand[]> = {
  0: [
    { type: "community.register", communityId: COMMUNITY, name: "Identity Guild", branding: { primary: "#c98b6b", accent: "#3d5a80" } },
    legacyCreate("agt_leg00001", "logistics_operator", WALLET_A),
    legacyCreate("agt_leg00002", "farmer", WALLET_B),
    legacyCreate("agt_leg00003", "manufacturer", WALLET_A), // same wallet owning two agents: kept as-is
    legacyCreate("agt_leg00004", "merchant", WALLET_A),
  ],
  90: [legacyCreate("agt_leg00005", "logistics_operator", WALLET_B)],
  140: [{ type: "agent.update", agentId: "agt_leg00002", status: "paused" }],
};

function run(from: SimEngine, until: number, log: LoggedCommand[] = []) {
  let seq = log.length;
  while (from.tick < until) {
    for (const command of commands[from.tick] ?? []) {
      const logged = { tick: from.tick, seq: seq++, command };
      log.push(logged);
      from.enqueueLogged(logged);
    }
    from.step();
  }
  return log;
}

/** What a pre-0.3.0 build would have stored: no identity fields, version 1. */
function asV1(s: SimState): SimStateV1 {
  const v1 = structuredClone(s) as unknown as SimStateV1 & { agents: Record<string, Record<string, unknown>> };
  for (const id of v1.agentOrder) {
    delete v1.agents[id]!.identity;
    delete v1.agents[id]!.displayName;
  }
  (v1 as { version: number }).version = 1;
  return v1;
}

describe("simulation state v1 → v2 (agent identity)", () => {
  it("classifies every existing agent as legacy with a unique Word_NNNN name, keeping ids, names, owners and history", () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    run(engine, 120);
    const v1 = asV1(engine.state);
    const v2 = upgradeState(v1);

    expect(v2.version).toBe(2);
    const names = v2.agentOrder.map((id) => v2.agents[id]!.displayName);
    expect(new Set(names).size).toBe(names.length);
    for (const id of v2.agentOrder) {
      const before = v1.agents[id]!;
      const after = v2.agents[id]!;
      expect(after.identity).toEqual({ kind: "legacy", syntheticName: after.displayName, legacyOwnerWallet: before.ownerWallet });
      expect(after.displayName).toMatch(/^[A-Z][a-z]+_\d{4}$/);
      expect(SyntheticName.safeParse(after.displayName).success).toBe(true);
      // Nothing but the two identity fields changes.
      const { identity: _i, displayName: _d, ...rest } = after;
      expect(rest).toEqual(before);
    }
    // No wallet association is invented: owners are exactly the recorded ones.
    expect(new Set(v2.agentOrder.map((id) => v2.agents[id]!.ownerWallet))).toEqual(new Set([WALLET_A, WALLET_B]));
  });

  it("is deterministic, idempotent and leaves RNG, ledger, counters and everything else untouched", () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    run(engine, 60);
    const v1 = asV1(engine.state);
    const a = upgradeState(structuredClone(v1));
    const b = upgradeState(structuredClone(v1));
    expect(hashState(a)).toBe(hashState(b));
    expect(upgradeState(a)).toBe(a); // v2 input is returned unchanged
    const { agents: _a1, version: _v1, ...restV1 } = v1;
    const { agents: _a2, version: _v2, ...restV2 } = a;
    expect(restV2).toEqual(restV1);
  });

  it("replaying the command log from an upgraded v1 snapshot reaches exactly the uninterrupted v2 state", () => {
    const continuous = new SimEngine(createInitialState(layout), layout);
    const log = run(continuous, 200);

    // A pre-0.3.0 process crashed after taking a snapshot at tick 80; a 0.3.0 process recovers it.
    const partial = new SimEngine(createInitialState(layout), layout);
    run(partial, 80);
    const snapshot = JSON.stringify(asV1(partial.state));
    const restored = new SimEngine(upgradeState(JSON.parse(snapshot) as SimStateV1), layout);
    for (const c of log.filter((c) => c.tick >= 80)) {
      while (restored.tick < c.tick) restored.step();
      restored.enqueueLogged(c);
    }
    while (restored.tick < 200) restored.step();

    // Same economy AND the same legacy names (the old command at tick 90 is named against the same set).
    expect(hashState(restored.state)).toBe(hashState(continuous.state));
    expect(restored.state.agents.agt_leg00005!.identity.kind).toBe("legacy");
  });

  it("creates house agents without any owner and token-linked agents owned only by the activating wallet", () => {
    const engine = new SimEngine(createInitialState(layout), layout);
    run(engine, 1);
    const house: SimCommand = { type: "agent.create_house", agentId: "agt_house0001", communityId: COMMUNITY, syntheticName: "Fern_108", profession: "builder", strategy: { ...DEFAULT_STRATEGY } };
    const token: SimCommand = {
      type: "agent.activate",
      agentId: "agt_token0001",
      activationId: "act_token0001",
      communityId: COMMUNITY,
      launchId: "lch_token0001",
      tokenMint: WALLET_B,
      activatingWallet: WALLET_A,
      displayName: "7xKX...gAsU",
      profession: "merchant",
      strategy: { ...DEFAULT_STRATEGY },
    };
    engine.enqueueLogged({ tick: engine.tick, seq: 100, command: house });
    engine.enqueueLogged({ tick: engine.tick, seq: 101, command: token });
    const out = engine.step();

    const h = engine.state.agents.agt_house0001!;
    expect(h).toMatchObject({ ownerWallet: null, displayName: "Fern_108", identity: { kind: "house", syntheticName: "Fern_108" } });
    const t = engine.state.agents.agt_token0001!;
    expect(t).toMatchObject({ ownerWallet: WALLET_A, displayName: "7xKX...gAsU", identity: { kind: "token_linked", activatingWallet: WALLET_A, tokenMint: WALLET_B } });
    const activated = out.events.filter((e) => e.type === "agent.activated").map((e) => e.data);
    expect(activated).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identityKind: "house", displayName: "Fern_108" }),
        expect.objectContaining({ identityKind: "token_linked", displayName: "7xKX...gAsU" }),
      ]),
    );
  });
});

describe("agent names", () => {
  it("never reuses a legacy name and never collides with the 3-digit house namespace", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const n = legacyName(`agt_${i.toString().padStart(8, "0")}`, taken);
      expect(taken.has(n)).toBe(false);
      expect(n).toMatch(/^[A-Z][a-z]+_[1-9]\d{3}$/);
      taken.add(n);
    }
    expect(legacyName("agt_same0001", new Set())).toBe(legacyName("agt_same0001", new Set()));
  });

  it("shortens wallets to CMYx...6Wec and extends only as far as needed", () => {
    const c = walletNameCandidates(WALLET_A);
    expect(c[0]).toBe("7xKX...gAsU");
    expect(c[1]).toBe("7xKXt...sgAsU");
    expect(c.at(-1)).toBe(WALLET_A);
    expect(new Set(c).size).toBe(c.length);
    for (const n of c) expect(n.startsWith("0x")).toBe(false);
  });
});
