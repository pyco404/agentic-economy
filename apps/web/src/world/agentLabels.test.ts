import { describe, expect, it } from "vitest";
import { agentLabelName, chooseAgentLabels, type LabelCandidate } from "./agentLabels";

const agent = (id: string, x = 200, y = 200): LabelCandidate => ({ id, name: id, demoName: true,
  x: 0, z: 0, state: "idle", screenX: x, screenY: y });
describe("world agent labels", () => {
  it("never infers wallet activation from an owner field or uses 0x house names", () => {
    const name = agentLabelName({ id: "agt_kestrel1", name: "Kestrel", ownerWallet: "CMYx1234566Wec" });
    expect(name).toMatch(/^[A-Z][A-Za-z]+_\d{3}$/);
    expect(name).not.toContain("0x"); expect(name).not.toContain("...");
  });
  it("uses the same authoritative display name on world labels as in profiles", () => {
    expect(agentLabelName({ id: "agt_house", name: "old name", displayName: "Fern_506",
      identity: { kind: "house", syntheticName: "Fern_506" } })).toBe("Fern_506");
    expect(agentLabelName({ id: "agt_legacy", name: "old name", displayName: "Bow_1940",
      identity: { kind: "legacy", syntheticName: "Bow_1940", legacyOwnerWallet: "1".repeat(32) } })).toBe("Bow_1940");
    expect(agentLabelName({ id: "agt_wallet", name: "old name", displayName: "CMYxA...B6Wec",
      identity: { kind: "token_linked", activatingWallet: "CMYxA" + "1".repeat(23) + "B6Wec",
        tokenMint: "1".repeat(32), activationId: "act_verified" } })).toBe("CMYxA...B6Wec");
  });
  it("keeps selected and hovered labels at far zoom and suppresses ordinary names", () => {
    const result = chooseAgentLabels([agent("ordinary"), { ...agent("selected"), selected: true },
      { ...agent("hovered", 400), hovered: true }], 0.5, 800, 600);
    expect(result.map((a) => a.id)).toEqual(["selected", "hovered"]);
  });
  it("prioritizes selection over overlapping labels and bounds density", () => {
    const agents = Array.from({ length: 100 }, (_, i) => agent(`Citizen${i}`, 80 + i % 10 * 130, 80 + Math.floor(i / 10) * 60));
    expect(chooseAgentLabels(agents, 2, 1440, 1000).length).toBeLessThanOrEqual(18);
    expect(chooseAgentLabels(agents, 5, 1440, 1000).length).toBeGreaterThan(18);
    const result = chooseAgentLabels([agent("nearby"), { ...agent("selected"), selected: true }], 2, 800, 600);
    expect(result.map((a) => a.id)).toEqual(["selected"]);
    expect(chooseAgentLabels([agent("outside", -50)], 5, 800, 600)).toEqual([]);
  });
});

// Speech takes precedence over nearby name tags without adding more world overlays.
it('keeps name labels out of active speech bounds', () => {
  const agent = { id: 'agt_socialSpeaker', name: 'Neighbour', x: 1, z: 1, state: 'idle', selected: true, screenX: 300, screenY: 300 };
  expect(chooseAgentLabels([agent], 3, 1000, 800, [{ left: 250, top: 250, width: 190, height: 80 }])).toHaveLength(0);
  expect(chooseAgentLabels([agent], 3, 1000, 800)).toHaveLength(1);
});
