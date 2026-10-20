import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { PUMP_FEES_PROGRAM_ID, PUMP_PROGRAM_ID } from "@agentic-economy/shared";

/**
 * Pump.fun on-chain layout helpers. Sources (checked 2026-10-14):
 *  - pump-fun/pump-public-docs docs/instructions/CREATOR_FEE_SHARING.md, COIN_CREATION.md, SWEEP_FEES.md
 *  - pump-fun/pump-public-docs idl/pump_fees.json (SharingConfig, Shareholder, ConfigStatus)
 * Anchor discriminators are sha256("account:<Name>")[0..8] / sha256("global:<ix_name>")[0..8].
 * The BondingCurve `creator` offset must be re-checked against the current pump IDL before mainnet.
 */

export const anchorAccountDiscriminator = (name: string) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
export const anchorIxDiscriminator = (name: string) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);

export const PUMP_IX = {
  createV2: anchorIxDiscriminator("create_v2").toString("hex"),
  buy: anchorIxDiscriminator("buy").toString("hex"),
  distributeCreatorFees: anchorIxDiscriminator("distribute_creator_fees").toString("hex"),
  distributeCreatorFeesV2: anchorIxDiscriminator("distribute_creator_fees_v2").toString("hex"),
} as const;
export const PUMP_FEES_IX = {
  createFeeSharingConfig: anchorIxDiscriminator("create_fee_sharing_config").toString("hex"),
  updateFeeSharesV2: anchorIxDiscriminator("update_fee_shares_v2").toString("hex"),
} as const;

export function sharingConfigPda(mint: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("sharing-config"), new PublicKey(mint).toBuffer()], new PublicKey(PUMP_FEES_PROGRAM_ID))[0].toBase58();
}

export function bondingCurvePda(mint: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(mint).toBuffer()], new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
}

/** Pump creator vault for a creator (= the sharing config PDA once fee sharing is configured). */
export function creatorVaultPda(creator: string): string {
  return PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), new PublicKey(creator).toBuffer()], new PublicKey(PUMP_PROGRAM_ID))[0].toBase58();
}

export interface SharingConfigState {
  address: string;
  version: number;
  status: "Paused" | "Active";
  mint: string;
  admin: string;
  adminRevoked: boolean;
  shareholders: Array<{ address: string; shareBps: number }>;
}

export class DecodeError extends Error {}

/** Decode a Pump Fees `SharingConfig` account. */
export function decodeSharingConfig(address: string, data: Uint8Array): SharingConfigState {
  const buf = Buffer.from(data);
  if (buf.length < 8 + 3 + 64 + 1 + 4) throw new DecodeError("SharingConfig: account too small");
  if (!buf.subarray(0, 8).equals(anchorAccountDiscriminator("SharingConfig"))) throw new DecodeError("SharingConfig: discriminator mismatch");
  let o = 8;
  o += 1; // bump
  const version = buf.readUInt8(o++);
  const statusByte = buf.readUInt8(o++);
  if (statusByte > 1) throw new DecodeError(`SharingConfig: unknown status ${statusByte}`);
  const mint = bs58.encode(buf.subarray(o, o + 32));
  o += 32;
  const admin = bs58.encode(buf.subarray(o, o + 32));
  o += 32;
  const adminRevoked = buf.readUInt8(o++) === 1;
  const n = buf.readUInt32LE(o);
  o += 4;
  if (n > 10) throw new DecodeError(`SharingConfig: ${n} shareholders exceeds program maximum`);
  if (buf.length < o + n * 34) throw new DecodeError("SharingConfig: truncated shareholders");
  const shareholders = [];
  for (let i = 0; i < n; i++) {
    shareholders.push({ address: bs58.encode(buf.subarray(o, o + 32)), shareBps: buf.readUInt16LE(o + 32) });
    o += 34;
  }
  return { address, version, status: statusByte === 1 ? "Active" : "Paused", mint, admin, adminRevoked, shareholders };
}

/** Encode a SharingConfig (test fixtures / mock chain only). */
export function encodeSharingConfig(s: Omit<SharingConfigState, "address">): Buffer {
  const parts: Buffer[] = [anchorAccountDiscriminator("SharingConfig"), Buffer.from([255, s.version, s.status === "Active" ? 1 : 0])];
  parts.push(Buffer.from(bs58.decode(s.mint)), Buffer.from(bs58.decode(s.admin)), Buffer.from([s.adminRevoked ? 1 : 0]));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(s.shareholders.length);
  parts.push(len);
  for (const h of s.shareholders) {
    const bps = Buffer.alloc(2);
    bps.writeUInt16LE(h.shareBps);
    parts.push(Buffer.from(bs58.decode(h.address)), bps);
  }
  const body = Buffer.concat(parts);
  return Buffer.concat([body, Buffer.alloc(Math.max(0, 1024 - body.length))]);
}

/**
 * BondingCurve: disc(8) virtual_token_reserves u64, virtual_quote_reserves u64, real_token_reserves u64,
 * real_quote_reserves u64, token_total_supply u64, complete bool, creator Pubkey, …
 */
export function decodeBondingCurveCreator(data: Uint8Array): { complete: boolean; creator: string } {
  const buf = Buffer.from(data);
  if (buf.length < 81) throw new DecodeError("BondingCurve: account too small");
  if (!buf.subarray(0, 8).equals(anchorAccountDiscriminator("BondingCurve"))) throw new DecodeError("BondingCurve: discriminator mismatch");
  return { complete: buf.readUInt8(48) === 1, creator: bs58.encode(buf.subarray(49, 81)) };
}

export function encodeBondingCurve(creator: string, complete = false): Buffer {
  const buf = Buffer.alloc(151);
  anchorAccountDiscriminator("BondingCurve").copy(buf, 0);
  buf.writeUInt8(complete ? 1 : 0, 48);
  Buffer.from(bs58.decode(creator)).copy(buf, 49);
  return buf;
}
