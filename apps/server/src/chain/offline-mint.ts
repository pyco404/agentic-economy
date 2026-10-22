import { createHash } from 'node:crypto';
import { AddressLookupTableAccount, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { z } from 'zod';
import { buildUnsignedPumpLaunch } from './pump-builder.js';
import sdk from './pump-sdk.cjs';
import { MAINNET_GENESIS } from './mainnet-policy.js';
export { MAINNET_GENESIS } from './mainnet-policy.js';

export const PLANNED_AECO_MINT = 'ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco';
const key = z.string().refine(s => { try { return new PublicKey(s).toBase58() === s; } catch { return false; } });
const amount = z.string().regex(/^[1-9][0-9]{0,19}$/);
/** Public review artifact only. Chain observations must be independently refreshed online.
 * A Solana message does not encode a network or guarantee a claimed simulation result. */
export const MintSigningReview = z.object({
  version: z.literal(1), launchId: z.string().min(1).max(128),
  network: z.literal('mainnet-beta'), genesisHash: z.literal(MAINNET_GENESIS),
  mint: key, launcherWallet: key, platformTreasury: key, agentRewardsTreasury: key,
  name: z.string().min(1).max(32), symbol: z.string().min(1).max(13), uri: z.string().min(1).max(200),
  recentBlockhash: key, lastValidBlockHeight: z.number().int().positive().safe(),
  maxTotalDebitLamports: amount, messageSha256: z.string().regex(/^[a-f0-9]{64}$/),
  unsignedTransaction: z.string().min(1).max(1644),
  lookupTables: z.array(z.object({ key, addresses: z.array(key).max(256) }).strict()).max(4),
  devBuy: z.object({ tokenAmount: amount, maxQuoteCost: amount }).strict().optional(),
  globalAccountBase64: z.string().max(32768).optional(),
}).strict();
export type MintSigningReview = z.infer<typeof MintSigningReview>;
export type MintSigningPolicy = { mint: string; deployer: string; platform: string; rewards: string };
export function mintMessageHash(transaction: VersionedTransaction): string {
  return createHash('sha256').update(transaction.message.serialize()).digest('hex');
}

/** Rebuild the existing atomic construction, not an arbitrary supplied instruction list.
 * This function has no filesystem, RPC, wallet or broadcast operations. */
export async function inspectMintSigningReview(value: unknown, policy: MintSigningPolicy) {
  const review = MintSigningReview.parse(value);
  if (review.mint !== policy.mint || review.launcherWallet !== policy.deployer || review.platformTreasury !== policy.platform || review.agentRewardsTreasury !== policy.rewards)
    throw new Error('Mint, deployer or treasury differs from the fixed signing policy');
  const bytes = Buffer.from(review.unsignedTransaction, 'base64');
  if (bytes.length > 1232 || bytes.toString('base64') !== review.unsignedTransaction) throw new Error('Invalid transaction encoding');
  const transaction = VersionedTransaction.deserialize(bytes);
  const keys = transaction.message.staticAccountKeys;
  if (transaction.message.header.numRequiredSignatures !== 2 || keys[0]?.toBase58() !== policy.deployer || keys[1]?.toBase58() !== policy.mint)
    throw new Error('Unexpected required signer set');
  if (transaction.signatures.some(sig => sig.some(byte => byte !== 0))) throw new Error('Expected an unsigned review before mint signing');
  if (mintMessageHash(transaction) !== review.messageSha256 || transaction.message.recentBlockhash !== review.recentBlockhash)
    throw new Error('Review message hash or blockhash mismatch');
  const tables = review.lookupTables.map(t => new AddressLookupTableAccount({ key: new PublicKey(t.key), state: {
    addresses: t.addresses.map(a => new PublicKey(a)), deactivationSlot: 2n ** 64n - 1n,
    lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0,
  } }));
  if (review.devBuy && !review.globalAccountBase64) throw new Error('Developer Buy requires the reviewed public Global account');
  const global = review.globalAccountBase64 ? sdk.PUMP_SDK.decodeGlobal({ data: Buffer.from(review.globalAccountBase64, 'base64') } as never) : undefined;
  const expected = await buildUnsignedPumpLaunch({ mint: review.mint, launcherWallet: review.launcherWallet,
    platformTreasury: review.platformTreasury, agentRewardsTreasury: review.agentRewardsTreasury,
    name: review.name, symbol: review.symbol, uri: review.uri,
    ...(review.devBuy ? { devBuy: { tokenAmount: BigInt(review.devBuy.tokenAmount), maxQuoteCost: BigInt(review.devBuy.maxQuoteCost) } } : {}),
  }, review.recentBlockhash, tables, global);
  if (expected.transaction !== review.unsignedTransaction) throw new Error('Transaction differs from the existing atomic SOL launch construction');
  return { review, transaction };
}

/** Produces only the mint signature; Phantom's separate fee-payer signature stays absent. */
export async function coSignReviewedMint(value: unknown, policy: MintSigningPolicy, approvedMessageHash: string, secret: Uint8Array) {
  const { review, transaction } = await inspectMintSigningReview(value, policy);
  if (approvedMessageHash !== review.messageSha256) throw new Error('Message lacks the separately approved exact hash');
  const mint = Keypair.fromSecretKey(secret);
  try {
    if (mint.publicKey.toBase58() !== policy.mint) throw new Error('Local keypair does not match the reserved mint');
    transaction.sign([mint]);
    return { launchId: review.launchId, mint: review.mint, messageSha256: review.messageSha256,
      transaction: Buffer.from(transaction.serialize()).toString('base64') };
  } finally { mint.secretKey.fill(0); }
}
