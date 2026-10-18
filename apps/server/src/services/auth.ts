import { createHash, randomBytes } from "node:crypto";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { BRAND_NAME, type ChallengeResponse, type VerifyResponse } from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import type { Store } from "../store/types.js";
import { AppError } from "../util/errors.js";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** SIWS-compatible text. Chain ID is optional; demo is not a Solana chain.
 * https://github.com/phantom/sign-in-with-solana#specification */
export function buildChallengeMessage(p: { domain: string; uri: string; wallet: string; cluster?: AppConfig["solana"]["cluster"]; nonce: string; issuedAt: string; expiresAt: string }): string {
  return [
    `${p.domain} wants you to sign in with your Solana account:`,
    p.wallet,
    "",
    `Sign in to ${BRAND_NAME}. This request will not trigger a blockchain transaction or cost any fees.`,
    "",
    `URI: ${p.uri}`,
    "Version: 1",
    ...(p.cluster ? [`Chain ID: ${p.cluster === "mainnet-beta" ? "mainnet" : p.cluster}`] : []),
    `Nonce: ${p.nonce}`,
    `Issued At: ${p.issuedAt}`,
    `Expiration Time: ${p.expiresAt}`,
  ].join("\n");
}

/**
 * Wallet authentication with single-use, expiring challenges (anti-replay) and opaque bearer
 * sessions stored only as SHA-256 hashes.
 */
export class AuthService {
  constructor(
    private readonly store: Store,
    private readonly config: AppConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private audience(origin?: string) {
    const uri = new URL(this.config.auth.uri);
    if (origin !== undefined) {
      if (!this.config.corsOrigins.includes(origin)) throw new AppError("forbidden", "This browser origin is not authorized for wallet sign-in");
      let requested: URL;
      try { requested = new URL(origin); } catch { throw new AppError("bad_request", "Invalid browser origin"); }
      if (requested.origin !== origin || !["http:", "https:"].includes(requested.protocol)) throw new AppError("bad_request", "Invalid browser origin");
      return { domain: requested.host, uri: requested.origin };
    }
    // Legacy non-browser clients use the configured URI. Keep the port: a
    // hostname-only AUTH_DOMAIN does not represent the browser's authority.
    return { domain: uri.host, uri: uri.origin };
  }

  async challenge(wallet: string, origin?: string): Promise<ChallengeResponse> {
    const audience = this.audience(origin);
    const now = this.now();
    const nonce = bs58.encode(randomBytes(16));
    const expiresAt = new Date(now.getTime() + this.config.auth.challengeTtlSeconds * 1000).toISOString();
    const message = buildChallengeMessage({
      ...audience,
      wallet,
      cluster: this.config.mode === "demo" ? undefined : this.config.solana.cluster,
      nonce,
      issuedAt: now.toISOString(),
      expiresAt,
    });
    await this.store.createChallenge({ nonce, wallet, message, expiresAt });
    return { nonce, message, expiresAt };
  }

  async verify(wallet: string, nonce: string, signatureB58: string, origin?: string): Promise<VerifyResponse> {
    const audience = origin === undefined ? null : this.audience(origin);
    // Consume first: a nonce can be presented exactly once, valid signature or not.
    const ch = await this.store.consumeChallenge(nonce, wallet, this.now());
    if (!ch) throw new AppError("unauthorized", "challenge is unknown, expired, already used, or for a different wallet");
    if (audience && (!ch.message.startsWith(`${audience.domain} wants you to sign in with your Solana account:\n`) ||
      !ch.message.split("\n").includes(`URI: ${audience.uri}`)))
      throw new AppError("unauthorized", "Sign-in challenge belongs to a different browser origin. Connect again on this page.");
    let sig: Uint8Array;
    let pub: Uint8Array;
    try {
      sig = bs58.decode(signatureB58);
      pub = bs58.decode(wallet);
    } catch {
      throw new AppError("unauthorized", "malformed signature or wallet");
    }
    if (sig.length !== 64 || pub.length !== 32 || !nacl.sign.detached.verify(new TextEncoder().encode(ch.message), sig, pub))
      throw new AppError("unauthorized", "signature does not verify for this wallet and challenge");

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + this.config.auth.sessionTtlSeconds * 1000).toISOString();
    await this.store.createSession({ tokenHash: hashToken(token), wallet, expiresAt });
    return { token, identity: { wallet, sessionExpiresAt: expiresAt } };
  }

  /** Resolve a bearer token to a wallet. */
  async authenticate(authorization: string | undefined): Promise<{ wallet: string; sessionExpiresAt: string }> {
    const m = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization ?? "");
    if (!m) throw new AppError("unauthorized", "missing or malformed Authorization: Bearer token");
    const s = await this.store.getSession(hashToken(m[1]!), this.now());
    if (!s) throw new AppError("unauthorized", "session expired or invalid");
    return { wallet: s.wallet, sessionExpiresAt: s.expiresAt };
  }
}
