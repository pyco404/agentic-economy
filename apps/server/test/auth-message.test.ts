import { describe, expect, it } from "vitest";
import { buildChallengeMessage, AuthService } from "../src/services/auth.js";
import { loadConfig } from "../src/config.js";
import { MemoryStore } from "../src/store/memory.js";
import { makeEnv, newWallet } from "./helpers.js";

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
 it.each(["http://localhost:5173","http://127.0.0.1:5173","https://staging.useaeco.xyz"])("binds the exact allowed browser origin %s, including ports",async origin=>{
  const config=loadConfig({MODE:"demo",AUTH_DOMAIN:"localhost",AUTH_URI:"http://localhost:5173",CORS_ORIGINS:origin});
  const auth=new AuthService(new MemoryStore(),config),wallet=newWallet();
  const ch=await auth.challenge(wallet.wallet,origin);assertWalletMessage(ch.message);
  expect(ch.message.split("\n")[0]).toBe(`${new URL(origin).host} wants you to sign in with your Solana account:`);
  expect(ch.message).toContain(`URI: ${origin}`);
  expect((await auth.verify(wallet.wallet,ch.nonce,wallet.sign(ch.message),origin)).identity.wallet).toBe(wallet.wallet);
 });
 it("rejects unknown origins and never accepts an allowed sibling's challenge",async()=>{
  const config=loadConfig({MODE:"demo",CORS_ORIGINS:"http://localhost:5173,http://localhost:5174"});
  const auth=new AuthService(new MemoryStore(),config),wallet=newWallet();
  await expect(auth.challenge(wallet.wallet,"https://evil.example")).rejects.toThrow("not authorized");
  const ch=await auth.challenge(wallet.wallet,"http://localhost:5173");
  await expect(auth.verify(wallet.wallet,ch.nonce,wallet.sign(ch.message),"http://localhost:5174")).rejects.toThrow("different browser origin");
  await expect(auth.verify(wallet.wallet,ch.nonce,wallet.sign(ch.message),"http://localhost:5173")).rejects.toThrow("already used");
 });
 it("uses the configured URI authority for non-browser clients, preserving a local port",async()=>{
  const auth=new AuthService(new MemoryStore(),loadConfig({MODE:"demo",AUTH_DOMAIN:"localhost",AUTH_URI:"http://localhost:5173"}));
  expect((await auth.challenge(newWallet().wallet)).message).toMatch(/^localhost:5173 wants/);
 });
 it("passes Origin through the HTTP challenge and cookie verification routes without trusting Host or body fields",async()=>{
  const env=await makeEnv({CORS_ORIGINS:"http://localhost:5173,http://localhost:5174"});
  try{
   const wallet=newWallet(),origin="http://localhost:5174";
   const res=await env.app.inject({method:"POST",url:"/api/v1/auth/challenge",headers:{origin,host:"untrusted-api.example"},payload:{wallet:wallet.wallet,domain:"evil.example"}});
   expect(res.statusCode).toBe(200);const ch=res.json();expect(ch.message).toMatch(/^localhost:5174 wants/);
   const verified=await env.app.inject({method:"POST",url:"/api/v1/auth/browser/verify",headers:{origin},payload:{wallet:wallet.wallet,nonce:ch.nonce,signature:wallet.sign(ch.message)}});
   expect(verified.statusCode).toBe(200);expect(verified.json().wallet).toBe(wallet.wallet);
   const unknown=await env.app.inject({method:"POST",url:"/api/v1/auth/challenge",headers:{origin:"https://evil.example"},payload:{wallet:wallet.wallet}});
   expect(unknown.statusCode).toBe(403);
  }finally{await env.close();}
 });
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
