import { describe, expect, it } from "vitest";
import { ActivateAgentRequest, AgentIdentity, ApiError, CreateHouseAgentRequest, SyntheticName, routes } from "../src/index.js";

const wallet = "CMYxQ1nC3e7hY1Yt3dF9n7aV2u8kR4pL5sW6xZ9h6Wec";
const mint = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

describe("agent identity contract (0.3.0)", () => {
  it("accepts readable house names and rejects wallet-like or 0x names", () => {
    for (const ok of ["Fern_108", "Bow_194", "Kestrel_421"]) expect(SyntheticName.safeParse(ok).success).toBe(true);
    for (const bad of ["0xfern_108", "fern_108", "Fern108", "Fern_1", wallet, "CMYx...6Wec"]) expect(SyntheticName.safeParse(bad).success).toBe(false);
  });

  it("keeps house, token-linked and legacy classifications distinct", () => {
    expect(AgentIdentity.parse({ kind: "house", syntheticName: "Fern_108" }).kind).toBe("house");
    // A house identity cannot carry a wallet.
    expect(AgentIdentity.parse({ kind: "house", syntheticName: "Fern_108", activatingWallet: wallet })).not.toHaveProperty("activatingWallet");
    const token = { kind: "token_linked", activationId: "act_abc12345", tokenMint: mint, activatingWallet: wallet, launchId: "lch_abc12345", communityId: "com_abc12345" };
    expect(AgentIdentity.parse(token).kind).toBe("token_linked");
    // Token-linked requires the full activation record; a wallet alone is not enough.
    expect(AgentIdentity.safeParse({ kind: "token_linked", activatingWallet: wallet }).success).toBe(false);
    expect(AgentIdentity.parse({ kind: "legacy", syntheticName: "Bow_194", legacyOwnerWallet: wallet }).kind).toBe("legacy");
  });

  it("never lets a client supply a mint, name or owner for new agents", () => {
    const body = { communityId: "com_abc12345", profession: "farmer", tokenMint: mint, name: "Mine", ownerWallet: wallet };
    for (const schema of [ActivateAgentRequest, CreateHouseAgentRequest]) {
      const parsed = schema.parse(body);
      expect(parsed).not.toHaveProperty("tokenMint");
      expect(parsed).not.toHaveProperty("name");
      expect(parsed).not.toHaveProperty("ownerWallet");
    }
  });

  it("retires POST /agents in favour of the new routes and exposes the activation errors", () => {
    expect(routes.createAgent.retired?.replacements).toEqual(["POST /api/v1/agents/activate", "POST /api/v1/agents/house"]);
    expect(routes.createHouseAgent.demoOnly).toBe(true);
    for (const code of ["gone", "not_token_launcher", "wallet_already_activated", "mint_already_activated", "activation_in_progress", "unsupported_lifecycle", "rate_limited"])
      expect(ApiError.shape.error.shape.code.options).toContain(code);
  });
});
