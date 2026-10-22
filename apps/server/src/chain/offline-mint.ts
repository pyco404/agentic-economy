import { createHash } from 'node:crypto';
import { AddressLookupTableAccount, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { z } from 'zod';
import { LocalMintReview } from '@agentic-economy/shared';
import { buildUnsignedPumpLaunch } from './pump-builder.js';
import sdk from './pump-sdk.cjs';
import { MAINNET_GENESIS } from './mainnet-policy.js';
export { MAINNET_GENESIS } from './mainnet-policy.js';

export const DEVNET_SIGNING_GENESIS = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const PLANNED_AECO_MINT = 'ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco';
const key = z.string().refine(s => { try { return new PublicKey(s).toBase58() === s; } catch { return false; } });
/** Schema shared with the saved launch DTO; no signing material. */
export const MintSigningReview = LocalMintReview;
export type MintSigningReview = z.infer<typeof MintSigningReview>;
export type MintSigningPolicy = { mint: string; deployer: string; platform: string; rewards: string;
  /** Omitted means Mainnet. Only the isolated rehearsal opts into Devnet. */
  network?: 'mainnet-beta' | 'devnet' };
export function mintMessageHash(transaction: VersionedTransaction): string {
  return createHash('sha256').update(transaction.message.serialize()).digest('hex');
}

/** Rebuild the existing atomic construction, not an arbitrary supplied instruction list.
 * This function has no filesystem, RPC, wallet or broadcast operations. */
export async function inspectMintSigningReview(value: unknown, policy: MintSigningPolicy) {
  const review = MintSigningReview.parse(value);
  const network = policy.network ?? 'mainnet-beta';
  if (review.network !== network || review.genesisHash !== (network === 'mainnet-beta' ? MAINNET_GENESIS : DEVNET_SIGNING_GENESIS))
    throw new Error('Review network differs from the fixed signing policy');
  if (network === 'devnet' && review.mint === PLANNED_AECO_MINT) throw new Error('The official mint is forbidden in Devnet rehearsals');
  if (review.mint !== policy.mint || review.launcherWallet !== policy.deployer || review.platformTreasury !== policy.platform || review.agentRewardsTreasury !== policy.rewards)
    throw new Error('Mint, deployer or treasury differs from the fixed signing policy');
  if(review.renewal && (review.renewal.previousMessageSha256===review.messageSha256 ||
    review.renewal.finalizedBlockHeight<=review.renewal.previousLastValidBlockHeight || review.lastValidBlockHeight<=review.renewal.finalizedBlockHeight))
    throw new Error('Renewed review lacks a valid preceding expiry and fresh signing window');
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
  if (review.devBuy && (!review.globalAccountBase64 || !review.protocolFeeRecipients)) throw new Error('Developer Buy requires the reviewed Global account and pinned protocol recipients');
  if (!review.devBuy && review.protocolFeeRecipients) throw new Error('Unexpected Developer Buy protocol recipients');
  const global = review.globalAccountBase64 ? sdk.PUMP_SDK.decodeGlobal({ data: Buffer.from(review.globalAccountBase64, 'base64') } as never) : undefined;
  const expected = await buildUnsignedPumpLaunch({ mint: review.mint, launcherWallet: review.launcherWallet,
    platformTreasury: review.platformTreasury, agentRewardsTreasury: review.agentRewardsTreasury,
    name: review.name, symbol: review.symbol, uri: review.uri,
    ...(review.devBuy ? { devBuy: { tokenAmount: BigInt(review.devBuy.tokenAmount), maxQuoteCost: BigInt(review.devBuy.maxQuoteCost) } } : {}),
  }, review.recentBlockhash, tables, global, review.protocolFeeRecipients);
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

/** Check a public local-signing result against the SERVER-PERSISTED unsigned review.
 * No mint secret enters this boundary. Do not trust a caller-supplied replacement review.
 * Payer must still be unsigned: only the separate Phantom step may authorize a debit.
 */
export async function verifyMintSigningArtifact(persistedReview: unknown, policy: MintSigningPolicy, value: unknown) {
  const { review, transaction: expected } = await inspectMintSigningReview(persistedReview, policy);
  const artifact = z.object({ launchId: z.string(), mint: key, messageSha256: z.string(),
    transaction: z.string().min(1).max(1644) }).strict().parse(value);
  if (artifact.launchId !== review.launchId || artifact.mint !== review.mint || artifact.messageSha256 !== review.messageSha256)
    throw new Error('Mint signature belongs to a different reserved attempt');
  const bytes = Buffer.from(artifact.transaction, 'base64');
  if (bytes.length > 1232 || bytes.toString('base64') !== artifact.transaction) throw new Error('Invalid mint signature encoding');
  const signed = VersionedTransaction.deserialize(bytes);
  if (!Buffer.from(signed.message.serialize()).equals(Buffer.from(expected.message.serialize())))
    throw new Error('Mint signature changed the persisted launch message');
  const { default: nacl } = await import('tweetnacl');
  if (signed.signatures.length !== 2 || signed.signatures[0]!.some(byte => byte !== 0) ||
      !nacl.sign.detached.verify(signed.message.serialize(), signed.signatures[1]!, new PublicKey(policy.mint).toBytes()))
    throw new Error('Expected only the valid reserved mint signature, before Phantom approval');
  return artifact;
}
