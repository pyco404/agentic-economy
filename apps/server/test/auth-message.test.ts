import { describe, expect, it } from "vitest";
import { buildChallengeMessage, AuthService } from "../src/services/auth.js";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
import { newWallet } from "./helpers.js";

// Independent grammar checks from Phantom's SIWS ABNF, rather than signing any
// arbitrary string as the old wallet fixtures did. Never calls a real wallet.
function assertWalletMessage(message:string) {
 const lines=message.split("\n");
 expect(lines[0]).toMatch(/^[^\s/]+ wants you to sign in with your Solana account:$/);
 expect(lines[1]).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
 expect(lines[2]).toBe("");expect(lines[3]).not.toContain("\n");expect(lines[4]).toBe("");
 expect(lines[5]).toMatch(/^URI: https?:\/\//);expect(lines[6]).toBe("Version: 1");
 const chain=lines.find(l=>l.startsWith("Chain ID: "));
 if(chain)expect(chain).toMatch(/^Chain ID: (mainnet|testnet|devnet|localnet|solana:mainnet|solana:testnet|solana:devnet)$/);
 expect(lines.find(l=>l.startsWith("Nonce: "))).toMatch(/^Nonce: [A-Za-z0-9]{8,}$/);
 for(const field of ["Issued At: ","Expiration Time: "])expect(Number.isFinite(Date.parse(lines.find(l=>l.startsWith(field))!.slice(field.length)))).toBe(true);
}
describe("wallet-readable sign-in messages",()=>{
 it("omits the optional chain in demo mode and still verifies the exact signed challenge",async()=>{
  const config=loadConfig({MODE:"demo",AUTH_DOMAIN:"127.0.0.1:5176",AUTH_URI:"http://127.0.0.1:5176"});
  const auth=new AuthService(new MemoryStore(),config),wallet=newWallet();
  const challenge=await auth.challenge(wallet.wallet);assertWalletMessage(challenge.message);
  expect(challenge.message).not.toContain("Chain ID:");
  expect((await auth.verify(wallet.wallet,challenge.nonce,wallet.sign(challenge.message))).identity.wallet).toBe(wallet.wallet);
  await expect(auth.verify(wallet.wallet,challenge.nonce,wallet.sign(challenge.message))).rejects.toThrow(/already used/);
  expect(config.mode).toBe("demo");expect(config.feeRoutingVerified).toBe(false);
 });
 it.each([undefined,"devnet","localnet","mainnet-beta"] as const)("formats %s using a supported optional SIWS chain",cluster=>{
  const message=buildChallengeMessage({domain:"staging.useaeco.xyz",uri:"https://staging.useaeco.xyz",wallet:newWallet().wallet,
   cluster,nonce:"ABCDEFGH12345678",issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+300000).toISOString()});
  assertWalletMessage(message);
  if(cluster)expect(message).toContain(`Chain ID: ${cluster==="mainnet-beta"?"mainnet":cluster}`);
 });
});
