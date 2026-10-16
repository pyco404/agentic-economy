import { describe, expect, it } from "vitest";
import { agentIdentity, displayActivity, displayAgentName, type IdentityAgent } from "./agentIdentity";
const roster = Array.from({ length: 1100 }, (_, i) => ({ id: `agt_courier${String(i).padStart(6, "0")}`,
  name: "Integration Courier", ownerWallet: "11111111111111111111111111111111" }));
describe("authoritative agent identities", () => {
  it("gives duplicate house/legacy names readable stable aliases without wallet prefixes", () => {
    expect(new Set(roster.map(displayAgentName)).size).toBe(roster.length);
    for (const a of roster) {
      const identity = agentIdentity(a);
      expect(identity.primary).toMatch(/^[A-Z][A-Za-z]+_\d{3}$/);
      expect(identity.displayName).not.toContain("0x");
      expect(identity.displayName).not.toContain("...");
      expect(identity.owner).toBeNull();
    }
  });
  it("does not treat a legacy owner or fungible balance as verified activation", () => {
    expect(agentIdentity(roster[0]!).kind).toBe("unclassified");
    const linked: IdentityAgent = { ...roster[0]!, identity: { kind: "token_linked",
      activatingWallet: "CMYx" + "1".repeat(24) + "6Wec", tokenMint: "1".repeat(32), activationId: "activation_canonical" } };
    expect(agentIdentity(linked).primary).toBe("CMYx...6Wec");
    expect(displayAgentName(linked)).not.toContain("#");
    expect(agentIdentity(linked).owner).toBe(linked.identity!.kind === "token_linked" ? linked.identity!.activatingWallet : null);
    expect(agentIdentity({ ...linked, identity: { kind: "token_linked", activatingWallet: "invalid", tokenMint: "1".repeat(32), activationId: "" } }).owner).toBeNull();
  });
  it("preserves house names across restart, reorder, removal and additions", () => {
    const names = new Map(roster.map((a) => [a.id, displayAgentName(a)]));
    const restarted: IdentityAgent[] = JSON.parse(JSON.stringify(roster));
    for (const a of [...restarted.reverse().slice(4), { id: "agt_new", name: "Integration Courier" }])
      if (names.has(a.id)) expect(displayAgentName(a)).toBe(names.get(a.id));
    const house: IdentityAgent = { ...roster[0]!, identity: { kind: "house", syntheticName: "Ovenkeeper_302" } };
    expect(agentIdentity(house).primary).toBe("Ovenkeeper_302"); expect(agentIdentity(house).owner).toBeNull();
    expect(agentIdentity({ ...house, identity: { kind: "house", syntheticName: "0xfern_108" } }).primary).not.toContain("0x");
  });
  it("attributes historical events without modifying persisted summaries", () => {
    const event = { agentId: roster[0]!.id, summary: "Integration Courier completed delivery" };
    expect(displayActivity(event, roster)).toContain(displayAgentName(roster[0]!));
    expect(event.summary).toBe("Integration Courier completed delivery");
  });
});
