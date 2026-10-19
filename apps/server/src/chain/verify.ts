import { PublicKey } from "@solana/web3.js";
import {
  AGENT_TREASURY_CREATOR_FEE_BPS,
  LAUNCH_FEE_LAMPORTS,
  PLATFORM_TREASURY_CREATOR_FEE_BPS,
  PUMP_PROGRAM_ID,
} from "@agentic-economy/shared";
import { PUMP_IX } from "./pump.js";
import type { FeeRoutingState, ObservedTransaction } from "./types.js";

export interface LaunchExpectation {
  launcherWallet: string;
  mint: string;
  platformTreasury: string;
  agentRewardsTreasury: string;
  sharingConfig: string;
  /** Required by real RPC confirmation; fixtures without raw instruction data omit it. */
  draft?: {name:string;symbol:string;metadataUri:string};
  preparedMessageBase64?:string;
  /** Curve quote mint the launch must have: the native mint for SOL, the configured USDC mint for USDC. */
  quoteMint?: string;
  /** True when the quote is not SOL: its curve quote must be read and match, never assumed. */
  quoteRequired?: boolean;
}

export interface VerificationIssue {
  code: string;
  message: string;
}

export type LaunchVerification =
  | { outcome: "pending" }
  | { outcome: "failed"; issues: VerificationIssue[] }
  | { outcome: "recovery_needed"; issues: VerificationIssue[]; feeIxIndex: number; slot: number; commitment: ObservedTransaction["commitment"] }
  | { outcome: "confirmed"; feeIxIndex: number; slot: number; commitment: ObservedTransaction["commitment"] };

/**
 * Pure verification of a launch transaction + resulting on-chain fee-routing state.
 * The client's claims are never trusted: everything here comes from chain data.
 *
 * failed           — tx failed, or did not go through our route (no exact 0.05 SOL platform charge,
 *                    no Pump create for the expected mint, wrong payer). Atomic tx ⇒ nothing was charged
 *                    unless the tx succeeded.
 * recovery_needed  — tx succeeded (fee paid, token created) but creator-fee routing is not exactly
 *                    60/40 to our treasuries with the config admin revoked. No community until fixed.
 * confirmed        — everything verified.
 */
export function verifyLaunch(exp: LaunchExpectation, tx: ObservedTransaction | null, routing: FeeRoutingState | null): LaunchVerification {
  if (!tx) return { outcome: "pending" };
  const issues: VerificationIssue[] = [];
  if (tx.err !== null) return { outcome: "failed", issues: [{ code: "transaction_failed", message: `transaction failed on-chain: ${JSON.stringify(tx.err)}` }] };

  if(exp.preparedMessageBase64&&tx.messageBase64!==exp.preparedMessageBase64)issues.push({code:"prepared_message_mismatch",message:"On-chain transaction does not match the server-prepared launch message"});

  if (tx.feePayer !== exp.launcherWallet) issues.push({ code: "wrong_fee_payer", message: `fee payer ${tx.feePayer} is not the launcher wallet` });

  if(!tx.signers.includes(exp.launcherWallet)||!tx.signers.includes(exp.mint))issues.push({code:"launch_signature_missing",message:"Both the creator and mint must sign the launch"});

  const feeTransfers = tx.systemTransfers.filter((t) => t.from === exp.launcherWallet && t.to === exp.platformTreasury);
  const exact = feeTransfers.filter((t) => t.lamports === LAUNCH_FEE_LAMPORTS);
  if (exact.length !== 1 || feeTransfers.length !== 1)
    issues.push({
      code: "launch_fee_missing",
      message: `expected exactly one ${LAUNCH_FEE_LAMPORTS} lamport transfer to the platform treasury, found ${feeTransfers.map((t) => t.lamports.toString()).join(",") || "none"}`,
    });

  const creates = tx.instructions.filter((ix) => ix.programId === PUMP_PROGRAM_ID && ix.discriminatorHex === PUMP_IX.createV2);
  const create=creates[0];
  if(creates.length>1)issues.push({code:"pump_create_multiple",message:"Expected exactly one token creation"});
  if (!create) issues.push({ code: "pump_create_missing", message: "no Pump.fun create_v2 instruction in transaction" });
  else if (create.accounts[0] !== exp.mint) issues.push({ code: "mint_mismatch", message: `create_v2 mint ${create.accounts[0]} != expected ${exp.mint}` });

  if(create&&exp.draft){
    const string=(s:string)=>{const b=Buffer.from(s),n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
    const expected=Buffer.concat([Buffer.from(PUMP_IX.createV2,"hex"),string(exp.draft.name),string(exp.draft.symbol),string(exp.draft.metadataUri),new PublicKey(exp.launcherWallet).toBuffer()]);
    const data=Buffer.from(create.dataBase64??"","base64"),tail=data.subarray(expected.length);
    // Optional EOF-tolerant flags may be omitted. All supplied flags must be
    // false/zero: no mayhem, cashback, custom rate or holder-reward redirection.
    if(!data.subarray(0,expected.length).equals(expected)||![1,2,10,11].includes(tail.length)||tail.some(n=>n!==0)||create.accounts[5]!==exp.launcherWallet)
      issues.push({code:"pump_create_data_mismatch",message:"On-chain token metadata, creator or launch flags differ from the prepared launch"});
  }

  if (issues.length > 0) return { outcome: "failed", issues };
  const feeIxIndex = exact[0]!.ixIndex;

  // Fee routing: native Pump fee-sharing config, locked to 60/40, launcher 0%.
  const r = routing ?? { sharingConfig: null, bondingCurveCreator: null, bondingCurveComplete: null };
  const sc = r.sharingConfig;
  if (!sc) issues.push({ code: "fee_sharing_missing", message: "no Pump fee-sharing config exists for this mint" });
  else {
    if (sc.address !== exp.sharingConfig) issues.push({ code: "fee_sharing_address", message: "sharing config address is not the canonical PDA" });
    if (sc.mint !== exp.mint) issues.push({ code: "fee_sharing_mint", message: "sharing config mint mismatch" });
    if (sc.status !== "Active") issues.push({ code: "fee_sharing_inactive", message: "sharing config is not Active" });
    if (!sc.adminRevoked) issues.push({ code: "fee_sharing_admin_not_revoked", message: "sharing config admin can still change shares" });
    const shares = new Map(sc.shareholders.map((h) => [h.address, h.shareBps]));
    const ok =
      sc.shareholders.length === 2 &&
      shares.get(exp.agentRewardsTreasury) === AGENT_TREASURY_CREATOR_FEE_BPS &&
      shares.get(exp.platformTreasury) === PLATFORM_TREASURY_CREATOR_FEE_BPS;
    if (!ok)
      issues.push({
        code: "fee_shares_incorrect",
        message: `shareholders must be exactly agent-rewards 6000 bps + platform 4000 bps (launcher 0); got ${sc.shareholders.map((h) => `${h.address}:${h.shareBps}`).join(", ")}`,
      });
  }
  const curveQuote = r.bondingCurveQuoteMint ?? null;
  if (exp.quoteMint && (curveQuote !== null ? curveQuote !== exp.quoteMint : exp.quoteRequired))
    issues.push({ code: "quote_mint_mismatch", message: `bonding curve quote mint ${curveQuote ?? "unknown"} is not the prepared ${exp.quoteMint}` });
  if (r.bondingCurveCreator !== exp.sharingConfig)
    issues.push({ code: "creator_not_sharing_config", message: `bonding curve creator ${r.bondingCurveCreator ?? "unknown"} is not the sharing config PDA` });

  if (issues.length > 0) return { outcome: "recovery_needed", issues, feeIxIndex, slot: tx.slot, commitment: tx.commitment };
  return { outcome: "confirmed", feeIxIndex, slot: tx.slot, commitment: tx.commitment };
}
