import bs58 from "bs58";
import { isDeepStrictEqual } from "node:util";
import { AddressLookupTableProgram, Connection, PublicKey, VersionedTransaction, type VersionedTransactionResponse } from "@solana/web3.js";
import { LAUNCH_FEE_LAMPORTS, SYSTEM_PROGRAM_ID, PUMP_PROGRAM_ID, PUMP_FEES_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "@agentic-economy/shared";
import { anchorAccountDiscriminator, bondingCurvePda, decodeBondingCurveCreator, decodeSharingConfig, sharingConfigPda } from "./pump.js";
import sdk from "./pump-sdk.cjs";
import { pumpTradesFromLogs } from "./pump-events.js";
import { ChainFeatureUnavailable, type ChainTrade, type CurveProgress, type BuildLaunchInput, type BuiltLaunchTransaction, type ChainGateway, type FeeRoutingState, type ObservedTransaction, type TokenBalance } from "./types.js";

/**
 * Solana JSON-RPC adapter (devnet / mainnet). Read paths are implemented; launch transaction
 * Construction/submission requires explicit opt-in, safe genesis verification,
 * a configured on-chain lookup table and successful simulation. Mainnet writes are rejected.
 */
export class SolanaRpcChain implements ChainGateway {
  readonly source = "solana_rpc" as const;
  private readonly conn: Connection;

  constructor(rpcUrl: string, private launchOptions?:{enabled:boolean;lookupTable:string|null;localGenesisHash:string|null;cluster:"devnet"|"mainnet-beta"|"localnet"}) {
    this.conn = new Connection(rpcUrl, "confirmed");
  }

  getGenesisHash(){return this.conn.getGenesisHash();}
  async verifyMarketPool(pool:string,mint:string,quoteMint:string){
    const a=await this.conn.getAccountInfo(new PublicKey(pool),'confirmed');
    if(pool===bondingCurvePda(mint)&&a?.owner.toBase58()===PUMP_PROGRAM_ID){
      const {default:sdk}=await import('./pump-sdk.cjs');
      const curve=sdk.PUMP_SDK.decodeBondingCurve(a),quote=curve.quoteMint.toBase58();
      return quoteMint===(quote==='11111111111111111111111111111111'?'So11111111111111111111111111111111111111112':quote);
    }
    // Pinned official Pool layout: discriminator, u8 bump, u16 index, creator, base, quote.
    return !!a&&a.owner.toBase58()===PUMP_AMM_PROGRAM_ID&&a.data.length>=107&&a.data.subarray(0,8).equals(anchorAccountDiscriminator('Pool'))&&new PublicKey(a.data.subarray(43,75)).toBase58()===mint&&new PublicKey(a.data.subarray(75,107)).toBase58()===quoteMint;
  }
  async isTransactionOrphaned(signature:string,slot:number){
    // A missing/pruned transaction alone is not evidence of a fork. Require a rooted,
    // available block at the original slot that explicitly excludes this signature.
    if(await this.conn.getSlot('finalized')<=slot)return false;
    try{const block=await this.conn.getBlockSignatures(slot,'finalized');return !!block&&!block.signatures.includes(signature);}catch{return false;}
  }
  async getTransaction(signature: string): Promise<ObservedTransaction | null> {
    const tx = await this.conn.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
    // Missing execution metadata is not evidence of a successful transaction.
    if (!tx?.meta) return null;
    const status = await this.conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
    const observed = status.value[0];
    if (!observed || !["confirmed", "finalized"].includes(observed.confirmationStatus ?? "")) return null;
    if (!isDeepStrictEqual(observed.err, tx.meta.err)) throw new Error("RPC transaction status contradicts its execution metadata; retry confirmation");
    const finalized = observed.confirmationStatus === "finalized";
    return {...normalizeTransaction(signature, tx, finalized ? "finalized" : "confirmed"),genesisHash:await this.conn.getGenesisHash()};
  }

  async getFeeRoutingState(mint: string): Promise<FeeRoutingState> {
    const scAddr = sharingConfigPda(mint);
    const [sc, bc] = await this.conn.getMultipleAccountsInfo([new PublicKey(scAddr), new PublicKey(bondingCurvePda(mint))], "confirmed");
    if(sc && sc.owner.toBase58()!==PUMP_FEES_PROGRAM_ID)throw new Error('Sharing config account has an unexpected program owner');
    if(bc && bc.owner.toBase58()!==PUMP_PROGRAM_ID)throw new Error('Bonding curve account has an unexpected program owner');
    const curve = bc ? decodeBondingCurveCreator(bc.data) : null;
    let quoteMint: string | null = null;
    // The official decoder knows the current curve layout, including its quote mint.
    // normalizeQuoteMint maps a legacy/unset (all-zero) quote to the native mint, i.e. a SOL curve.
    if (bc) try { quoteMint = sdk.normalizeQuoteMint(sdk.PUMP_SDK.decodeBondingCurve(bc).quoteMint).toBase58(); } catch { quoteMint = null; }
    return {
      sharingConfig: sc ? decodeSharingConfig(scAddr, sc.data) : null,
      bondingCurveCreator: curve?.creator ?? null,
      bondingCurveComplete: curve?.complete ?? null,
      bondingCurveQuoteMint: quoteMint,
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

  async listSignaturesForAddress(address: string, until: string | null, limit: number, before?:string): Promise<string[]> {
    const sigs = await this.conn.getSignaturesForAddress(new PublicKey(address), { until: until ?? undefined, limit, before }, "confirmed");
    return sigs.map((s) => s.signature);
  }

  private async launchGenesis(){
    if(!this.launchOptions?.enabled||!this.launchOptions.lookupTable)throw new ChainFeatureUnavailable("pump_launch_disabled","Safe-network Pump launches are disabled or have no verified lookup table configured");
    const genesis=await this.conn.getGenesisHash();
    // A configured URL or MODE label alone never authorizes a mainnet write.
    const expected=this.launchOptions.cluster==="devnet"?"EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG":this.launchOptions.cluster==="localnet"&&["localhost","127.0.0.1","[::1]"].includes(new URL(this.conn.rpcEndpoint).hostname)?this.launchOptions.localGenesisHash:null;
    if(!expected||genesis!==expected||genesis==="5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d")throw new ChainFeatureUnavailable("unsafe_launch_network","RPC genesis does not match the configured safe testing network");
    return genesis;
  }
  async getCurveProgress(mint: string): Promise<CurveProgress | null> {
    const { context, value: [curve, global] } = await this.conn.getMultipleAccountsInfoAndContext([new PublicKey(bondingCurvePda(mint)), sdk.GLOBAL_PDA], "confirmed");
    if (!curve) return null;
    if (curve.owner.toBase58() !== PUMP_PROGRAM_ID || !global || global.owner.toBase58() !== PUMP_PROGRAM_ID) throw new Error("Bonding curve or Global has an unexpected program owner");
    const c = sdk.PUMP_SDK.decodeBondingCurve(curve), initial = BigInt(sdk.PUMP_SDK.decodeGlobal(global).initialRealTokenReserves.toString());
    const remaining = BigInt(c.realTokenReserves.toString());
    // Basis points of the initial real token reserves already sold; exact integer arithmetic, clamped.
    const bps = c.complete ? 10_000n : initial > 0n ? ((initial - (remaining > initial ? initial : remaining)) * 10_000n) / initial : 0n;
    return { slot: context.slot, complete: c.complete, progressPct: Number(bps) / 100, quoteMint: sdk.normalizeQuoteMint(c.quoteMint).toBase58() };
  }

  async getHolderCount(mint: string): Promise<{ slot: number; holders: number | null; exact: boolean }> {
    const curve = bondingCurvePda(mint);
    try {
      // Exact scan where the RPC indexes Token-2022 (public endpoints exclude it).
      // Token account layout: mint (0..32), owner (32..64), amount u64 LE (64..72).
      const res = await this.conn.getProgramAccounts(new PublicKey("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"), {
        commitment: "confirmed", withContext: true, dataSlice: { offset: 32, length: 40 },
        filters: [{ memcmp: { offset: 0, bytes: mint } }],
      });
      if (res.value.length > 20_000) return { slot: res.context.slot, holders: null, exact: false };
      const owners = new Set<string>();
      for (const { account } of res.value) {
        const data = Buffer.from(account.data), owner = bs58.encode(data.subarray(0, 32));
        if (owner !== curve && data.length >= 40 && data.readBigUInt64LE(32) > 0n) owners.add(owner);
      }
      return { slot: res.context.slot, holders: owners.size, exact: true };
    } catch (e) {
      if ((e as { code?: number }).code !== -32010) throw e;
    }
    // Fallback available on every RPC: the 20 largest token accounts. Fewer than 20 non-zero accounts means the
    // list is complete (exact); otherwise it is only a lower bound.
    const largest = await this.conn.getTokenLargestAccounts(new PublicKey(mint), "confirmed");
    const nonZero = largest.value.filter((a) => a.amount !== "0");
    const infos = nonZero.length ? (await this.conn.getMultipleParsedAccounts(nonZero.map((a) => a.address), { commitment: "confirmed" })).value : [];
    const owners = new Set<string>();
    for (const info of infos) {
      const owner = info && "parsed" in info.data ? (info.data.parsed as { info?: { owner?: string } }).info?.owner : undefined;
      if (owner && owner !== curve) owners.add(owner);
    }
    return { slot: largest.context.slot, holders: owners.size, exact: nonZero.length < 20 };
  }

  async getRecentTrades(mint: string, limit: number): Promise<{ slot: number; complete: boolean; trades: ChainTrade[] }> {
    const sigs = (await this.conn.getSignaturesForAddress(new PublicKey(bondingCurvePda(mint)), { limit: Math.min(50, Math.max(1, limit)) }, "confirmed")).filter((s) => !s.err);
    const txs = sigs.length ? await this.conn.getTransactions(sigs.map((s) => s.signature), { maxSupportedTransactionVersion: 0, commitment: "confirmed" }) : [];
    const trades: ChainTrade[] = [];
    let complete = txs.length === sigs.length, slot = 0;
    txs.forEach((tx, i) => {
      if (!tx?.meta?.logMessages || tx.meta.err) { if (!tx) complete = false; return; }
      slot = Math.max(slot, tx.slot);
      const parsed = pumpTradesFromLogs(tx.meta.logMessages, mint);
      if (!parsed.complete) complete = false;
      for (const t of parsed.trades) trades.push({ ...t, signature: sigs[i]!.signature, slot: tx.slot, blockTime: tx.blockTime ?? null });
    });
    return { slot: slot || (await this.conn.getSlot("confirmed")), complete, trades: trades.slice(0, limit) };
  }

  getBlockTime(slot: number) { return this.conn.getBlockTime(slot); }

  async verifyQuoteMint(mint: string): Promise<void> {
    const quote = new PublicKey(mint);
    const global = await this.conn.getAccountInfo(sdk.GLOBAL_PDA, "confirmed");
    if (!global || global.owner.toBase58() !== PUMP_PROGRAM_ID) throw new ChainFeatureUnavailable("quote_unverified", "Pump Global account is missing on this network");
    if (!sdk.PUMP_SDK.decodeGlobal(global).whitelistedQuoteMints.some((m: PublicKey) => m.equals(quote)))
      throw new ChainFeatureUnavailable("quote_unverified", "This network's Pump Global allowlist does not include the configured USDC mint");
    const info = (await this.conn.getParsedAccountInfo(quote, "confirmed")).value;
    const parsed = info && "parsed" in info.data ? (info.data.parsed as { type?: string; info?: { decimals?: number; isInitialized?: boolean } }) : null;
    if (!info || info.owner.toBase58() !== "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" || parsed?.type !== "mint" || parsed.info?.decimals !== 6 || !parsed.info.isInitialized)
      throw new ChainFeatureUnavailable("quote_unverified", "The configured USDC quote is not an initialized six-decimal SPL Token mint");
  }

  async buildLaunchTransaction(input: BuildLaunchInput): Promise<BuiltLaunchTransaction> {
    const genesisHash=await this.launchGenesis(),address=new PublicKey(this.launchOptions!.lookupTable!);
    if(input.quoteAsset==="USDC")await this.verifyQuoteMint(input.quoteMint??"");
    const info=await this.conn.getAccountInfo(address,"confirmed");
    if(!info||!info.owner.equals(AddressLookupTableProgram.programId))throw new ChainFeatureUnavailable("invalid_lookup_table","Launch lookup table has an invalid owner or is missing");
    const table=(await this.conn.getAddressLookupTable(address)).value;
    if(!table||!table.isActive())throw new ChainFeatureUnavailable("invalid_lookup_table","Launch lookup table is inactive");
    const latest=await this.conn.getLatestBlockhash("confirmed"),{buildPumpLaunch}=await import("./pump-builder.js");
    const built=await buildPumpLaunch(input,latest.blockhash,[table]);
    const before=await this.conn.getBalance(new PublicKey(input.launcherWallet),"confirmed").catch(()=>null); // estimate input only
    const simulation=await this.conn.simulateTransaction(VersionedTransaction.deserialize(Buffer.from(built.transaction,"base64")),{sigVerify:false,commitment:"confirmed",accounts:{encoding:"base64",addresses:[input.launcherWallet]}});
    if(simulation.value.err)throw new ChainFeatureUnavailable("pump_simulation_failed","Launch simulation failed; no launch or platform charge was submitted");
    const fee=await this.conn.getFeeForMessage(VersionedTransaction.deserialize(Buffer.from(built.transaction,"base64")).message,"confirmed");
    if(fee.value===null)throw new ChainFeatureUnavailable("blockhash_expired","Launch blockhash expired while estimating fees; prepare again");
    // Rent is the network's (devnet's differs from mainnet's) and grows with metadata length, so measure it:
    // simulated launcher debit minus the network fee and the platform charge. Omitted if the wallet moved meanwhile.
    const after=simulation.value.accounts?.[0]?.lamports,rent=after==null||before===null?null:BigInt(before)-BigInt(after)-BigInt(fee.value)-LAUNCH_FEE_LAMPORTS;
    return {transaction:built.transaction,lastValidBlockHeight:latest.lastValidBlockHeight,demo:false,genesisHash,estimatedNetworkFeesLamports:String(fee.value),
      ...(rent!==null&&rent>0n&&rent<100_000_000n?{estimatedAccountRentLamports:rent.toString()}:{})};
  }
  async submitLaunchTransaction(transaction:string){
    await this.launchGenesis();
    return this.conn.sendRawTransaction(Buffer.from(transaction,"base64"),{skipPreflight:false,maxRetries:20});
  }
  getFinalizedBlockHeight(){return this.conn.getBlockHeight("finalized");}

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
    instructions.push({ ixIndex, programId, discriminatorHex: data.length >= 8 ? data.subarray(0, 8).toString("hex") : null, accounts, dataBase64: data.toString("base64") });
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
  const innerInstructions=(tx.meta?.innerInstructions??[]).flatMap(group=>group.instructions.map(ix=>({parentIndex:group.index,programId:keys[ix.programIdIndex]!,accounts:ix.accounts.map(i=>keys[i]!),dataBase64:Buffer.from(bs58.decode(ix.data)).toString('base64'),stackHeight:(ix as typeof ix & {stackHeight?:number}).stackHeight??null})));
  const tokenAccounts:NonNullable<ObservedTransaction['tokenAccounts']>={};
  for(const b of tx.meta?.postTokenBalances??[]){
    const before=tx.meta?.preTokenBalances?.find(p=>p.accountIndex===b.accountIndex);
    if(!b.owner||before&&(before.mint!==b.mint||before.owner!==b.owner||before.uiTokenAmount.decimals!==b.uiTokenAmount.decimals))continue;
    tokenAccounts[keys[b.accountIndex]!]={mint:b.mint,owner:b.owner,decimals:b.uiTokenAmount.decimals,pre:BigInt(before?.uiTokenAmount.amount??'0'),post:BigInt(b.uiTokenAmount.amount)};
  }
  return {
    signature,source:'solana_rpc',feeLamports:BigInt(tx.meta?.fee??0),innerInstructions,tokenAccounts,
    messageBase64:Buffer.from(msg.serialize()).toString("base64"),
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
