import { z } from "zod";
import { PublicKey } from "./primitives.js";

export const ChallengeRequest = z.object({ wallet: PublicKey }).meta({ id: "ChallengeRequest" });
export type ChallengeRequest = z.infer<typeof ChallengeRequest>;

/** The wallet must sign `message` verbatim (UTF-8, ed25519 signMessage). Single use; expires. */
export const ChallengeResponse = z
  .object({
    nonce: z.string(),
    message: z.string(),
    expiresAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "ChallengeResponse" });
export type ChallengeResponse = z.infer<typeof ChallengeResponse>;

export const VerifyRequest = z
  .object({
    wallet: PublicKey,
    nonce: z.string(),
    /** Base58 ed25519 signature over the exact challenge message bytes. */
    signature: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/),
  })
  .meta({ id: "VerifyRequest" });
export type VerifyRequest = z.infer<typeof VerifyRequest>;

export const WalletIdentity = z
  .object({
    wallet: PublicKey,
    sessionExpiresAt: z.iso.datetime({ offset: true }),
  })
  .meta({ id: "WalletIdentity" });
export type WalletIdentity = z.infer<typeof WalletIdentity>;

/** Use `token` as `Authorization: Bearer <token>`. Store in memory, not localStorage. */
export const VerifyResponse = z
  .object({ token: z.string(), identity: WalletIdentity })
  .meta({ id: "VerifyResponse" });
export type VerifyResponse = z.infer<typeof VerifyResponse>;
