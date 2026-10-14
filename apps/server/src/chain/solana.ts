import { Connection, PublicKey, type VersionedTransactionResponse } from "@solana/web3.js";
import { SYSTEM_PROGRAM_ID } from "@agentic-economy/shared";
import { bondingCurvePda, decodeBondingCurveCreator, decodeSharingConfig, sharingConfigPda } from "./pump.js";
import { ChainFeatureUnavailable, type BuildLaunchInput, type BuiltLaunchTransaction, type ChainGateway, type FeeRoutingState, type ObservedTransaction, type TokenBalance } from "./types.js";

/**
 * Solana JSON-RPC adapter (devnet / mainnet). Read paths are implemented; launch transaction
 * BUILDING is intentionally not implemented until the devnet test plan in
 * apps/server/docs/pump-fun-integration.md has been executed against the official @pump-fun/pump-sdk.
 */
export class SolanaRpcChain implements ChainGateway {
  readonly source = "solana_rpc" as const;
  private readonly conn: Connection;

  constructor(rpcUrl: string) {
    this.conn = new Connection(rpcUrl, "confirmed");
  }

  async getTransaction(signature: string): Promise<ObservedTransaction | null> {
    const tx = await this.conn.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    if (!tx) return null;
    const status = await this.conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const finalized = status.value[0]?.confirmationStatus === "finalized";
    return normalizeTransaction(signature, tx, finalized ? "finalized" : "confirmed");
  }

  async getFeeRoutingState(mint: string): Promise<FeeRoutingState> {
    const scAddr = sharingConfigPda(mint);
    const [sc, bc] = await this.conn.getMultipleAccountsInfo([new PublicKey(scAddr), new PublicKey(bondingCurvePda(mint))], "confirmed");
    const curve = bc ? decodeBondingCurveCreator(bc.data) : null;
    return {
      sharingConfig: sc ? decodeSharingConfig(scAddr, sc.data) : null,
      bondingCurveCreator: curve?.creator ?? null,
      bondingCurveComplete: curve?.complete ?? null,
    };
  }

  async getTokenBalance(owner: string, mint: string): Promise<TokenBalance> {
    // Filtering by mint covers both SPL Token and Token-2022 accounts (Pump coins are Token-2022).
    const res = await this.conn.getParsedTokenAccountsByOwner(new PublicKey(owner), { mint: new PublicKey(mint) }, "confirmed");
    let amount = 0n;
    let decimals = 6;
    for (const acc of res.value) {
      const info = (acc.account.data as { parsed?: { info?: { tokenAmount?: { amount: string; decimals: number } } } }).parsed?.info?.tokenAmount;
      if (!info) continue;
      amount += BigInt(info.amount);
      decimals = info.decimals;
    }
    return { amount, decimals, slot: res.context.slot };
  }

  async listSignaturesForAddress(address: string, until: string | null, limit: number): Promise<string[]> {
    const sigs = await this.conn.getSignaturesForAddress(new PublicKey(address), { until: until ?? undefined, limit }, "confirmed");
    return sigs.map((s) => s.signature);
  }

  async buildLaunchTransaction(_input: BuildLaunchInput): Promise<BuiltLaunchTransaction> {
    throw new ChainFeatureUnavailable(
      "pump_launch_builder_unverified",
      "Pump.fun launch transaction building is disabled until the devnet test plan (create_v2 + fee-sharing config + update_fee_shares_v2 in one atomic transaction) has passed. See apps/server/docs/pump-fun-integration.md.",
    );
  }
}

export function normalizeTransaction(signature: string, tx: VersionedTransactionResponse, commitment: "confirmed" | "finalized"): ObservedTransaction {
  const msg = tx.transaction.message;
  const keys = msg.getAccountKeys({ accountKeysFromLookups: tx.meta?.loadedAddresses }).keySegments().flat().map((k) => k.toBase58());
  const header = msg.header;
  const signers = keys.slice(0, header.numRequiredSignatures);
  const instructions: ObservedTransaction["instructions"] = [];
  const systemTransfers: ObservedTransaction["systemTransfers"] = [];
  msg.compiledInstructions.forEach((ix, ixIndex) => {
    const programId = keys[ix.programIdIndex]!;
    const accounts = ix.accountKeyIndexes.map((i) => keys[i]!);
    const data = Buffer.from(ix.data);
    instructions.push({ ixIndex, programId, discriminatorHex: data.length >= 8 ? data.subarray(0, 8).toString("hex") : null, accounts });
    // SystemProgram::Transfer = u32 LE 2, then u64 LE lamports.
    if (programId === SYSTEM_PROGRAM_ID && data.length === 12 && data.readUInt32LE(0) === 2) {
      systemTransfers.push({ ixIndex, from: accounts[0]!, to: accounts[1]!, lamports: data.readBigUInt64LE(4) });
    }
  });
  const lamportDeltas: Record<string, bigint> = {};
  const pre = tx.meta?.preBalances ?? [];
  const post = tx.meta?.postBalances ?? [];
  keys.forEach((k, i) => {
    const d = BigInt(post[i] ?? 0) - BigInt(pre[i] ?? 0);
    if (d !== 0n) lamportDeltas[k] = d;
  });
  return {
    signature,
    slot: tx.slot,
    commitment,
    err: tx.meta?.err ?? null,
    feePayer: keys[0]!,
    signers,
    systemTransfers,
    instructions,
    lamportDeltas,
  };
}
