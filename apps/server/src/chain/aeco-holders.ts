import { PublicKey } from '@solana/web3.js';
import { z } from 'zod';
import type { HeliusReader } from './helius.js';
import type { AecoSnapshot } from '../sim/types.js';

const TOKEN_PROGRAMS = new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb']);
const SYSTEM = '11111111111111111111111111111111';
const integer = z.number().int().nonnegative().safe();
const account = z.object({ owner: z.string(), executable: z.boolean(), data: z.tuple([z.string(), z.literal('base64')]) });
const context = z.object({ slot: integer });
const mintRead = z.object({ context, value: account.nullable() });
const accountsRead = z.object({ context, value: z.array(z.object({ pubkey: z.string(), account })) });

/** Reuses Gamine's aggregate-before-activation and non-user exclusions, through our budgeted
 * Helius reader. A single finalized bank snapshot avoids paginated DAS slot drift. Sum against
 * mint supply before applying any exits; unavailable/truncated scans NEVER mean zero holders.
 * No getTokenLargestAccounts top-20 approximation or per-wallet website visit is involved. */
export async function readAecoHolders(reader: Pick<HeliusReader, 'rpc' | 'network'>, mint: string, excluded: ReadonlySet<string>, signal?: AbortSignal): Promise<AecoSnapshot> {
  const key = new PublicKey(mint);
  const first = mintRead.parse(await reader.rpc('getAccountInfo', [key.toBase58(), { encoding: 'base64', commitment: 'finalized' }], signal));
  if (!first.value || first.value.executable || !TOKEN_PROGRAMS.has(first.value.owner)) throw new Error('Common Agent mint is not an SPL mint');
  const mintData = Buffer.from(first.value.data[0], 'base64');
  if (mintData.length < 82 || mintData[45] !== 1) throw new Error('Common Agent mint is not initialized');
  const read = accountsRead.parse(await reader.rpc('getProgramAccounts', [first.value.owner, { encoding: 'base64', commitment: 'finalized', withContext: true, minContextSlot: first.context.slot, dataSlice: { offset: 0, length: 109 }, filters: [{ memcmp: { offset: 0, bytes: mint } }] }], signal));
  if (read.context.slot < first.context.slot) throw new Error('Common Agent observation is older than mint verification');
  // The accounts are one finalized bank; bracket that bank with mint reads. A supply
  // change makes this pass fail closed instead of turning an incomplete scan into exits.
  const last = mintRead.parse(await reader.rpc('getAccountInfo', [mint, { encoding: 'base64', commitment: 'finalized', minContextSlot: read.context.slot }], signal));
  if (!last.value || last.value.owner !== first.value.owner || last.context.slot < read.context.slot) throw new Error('Common Agent snapshot bank changed; retry safely');
  const finalMint = Buffer.from(last.value.data[0], 'base64');
  if (finalMint.length < 82 || finalMint[45] !== 1 || finalMint[44] !== mintData[44]) throw new Error('Common Agent mint changed');
  const seen = new Set<string>(); const balances = new Map<string, bigint>(); let total = 0n;
  for (const row of read.value) {
    if (seen.has(row.pubkey)) throw new Error('Duplicate token account in Common Agent scan');
    seen.add(row.pubkey);
    const data = Buffer.from(row.account.data[0], 'base64');
    if (row.account.executable || row.account.owner !== first.value.owner || data.length < 109 || !data.subarray(0, 32).equals(key.toBuffer()) || ![1, 2].includes(data[108]!)) throw new Error('Invalid token account in Common Agent scan');
    const amount = data.readBigUInt64LE(64); total += amount;
    const wallet = new PublicKey(data.subarray(32, 64));
    if (!amount || !PublicKey.isOnCurve(wallet.toBytes()) || excluded.has(wallet.toBase58())) continue;
    const address = wallet.toBase58(); balances.set(address, (balances.get(address) ?? 0n) + amount);
  }
  if (total !== finalMint.readBigUInt64LE(36) || total !== mintData.readBigUInt64LE(36)) throw new Error('Incomplete Common Agent token supply coverage');
  // On-curve alone is insufficient: reject executable and non-system-owned authorities as well.
  const wallets = [...balances.keys()].sort(); const holders: AecoSnapshot['holders'] = [];
  for (let offset = 0; offset < wallets.length; offset += 100) {
    const batch = wallets.slice(offset, offset + 100);
    const owners = z.object({ context, value: z.array(z.object({ owner: z.string(), executable: z.boolean() }).nullable()) }).parse(await reader.rpc('getMultipleAccounts', [batch, { encoding: 'base64', commitment: 'finalized', minContextSlot: read.context.slot }], signal));
    if (owners.context.slot < read.context.slot || owners.value.length !== batch.length) throw new Error('Incomplete Common Agent owner verification');
    owners.value.forEach((owner, i) => {
      // Null = unfunded wallet; it can still own SPL accounts. No wallet transaction privileges follow.
      if (!owner || (!owner.executable && owner.owner === SYSTEM)) holders.push({ wallet: batch[i]!, balanceRaw: balances.get(batch[i]!)!.toString() });
    });
  }
  return { network: reader.network, mint, slot: read.context.slot, checkedAt: new Date().toISOString(), decimals: finalMint[44]!, holders };
}
