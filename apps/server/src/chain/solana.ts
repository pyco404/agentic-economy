import bs58 from "bs58";
import { isDeepStrictEqual } from "node:util";
import { AddressLookupTableProgram, Connection, Keypair, PublicKey, VersionedTransaction, type AddressLookupTableAccount, type VersionedTransactionResponse } from "@solana/web3.js";
import { DEV_BUY_MAX_BPS, LAUNCH_FEE_LAMPORTS, devBuyTokenAmount, SYSTEM_PROGRAM_ID, PUMP_PROGRAM_ID, PUMP_FEES_PROGRAM_ID, PUMP_AMM_PROGRAM_ID } from "@agentic-economy/shared";
import { anchorAccountDiscriminator, bondingCurvePda, decodeBondingCurveCreator, decodeSharingConfig, sharingConfigPda } from "./pump.js";
import sdk from "./pump-sdk.cjs";
import { pumpTradesFromInner, pumpTradesFromEvidence } from "./pump-events.js";
import { ChainFeatureUnavailable, type DevBuyChainQuote, type ChainTrade, type CurveProgress, type BuildLaunchInput, type BuiltLaunchTransaction, type ChainGateway, type FeeRoutingState, type ObservedTransaction, type TokenBalance } from "./types.js";

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
  async getSignatureStatus(signature:string){const status=(await this.conn.getSignatureStatuses([signature],{searchTransactionHistory:true})).value[0];return status?{slot:status.slot,confirmationStatus:status.confirmationStatus??null,err:status.err}:null;}
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
      tokenTotalSupply: bc ? bc.data.readBigUInt64LE(40) : null,
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
      if (!tx?.meta || tx.meta.err) { if (!tx) complete = false; return; }
      slot = Math.max(slot, tx.slot);
      const observed=normalizeTransaction(sigs[i]!.signature,tx,'confirmed');
      const parsed = pumpTradesFromEvidence(tx.meta.logMessages??['Log truncated'], observed.innerInstructions??[], mint);
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

  private devBuyCache: { at: number; value: { available: boolean; reason: string | null } } | null = null;
  private async launchTable(): Promise<AddressLookupTableAccount> {
    const address = new PublicKey(this.launchOptions!.lookupTable!), info = await this.conn.getAccountInfo(address, "confirmed");
    if (!info || !info.owner.equals(AddressLookupTableProgram.programId)) throw new ChainFeatureUnavailable("invalid_lookup_table", "Launch lookup table has an invalid owner or is missing");
    const table = (await this.conn.getAddressLookupTable(address)).value;
    if (!table || !table.isActive()) throw new ChainFeatureUnavailable("invalid_lookup_table", "Launch lookup table is inactive");
    return table;
  }

  /**
   * Developer Buy fits one atomic transaction only when the launch lookup table holds every fixed account the buy
   * can touch, including every protocol and buyback fee recipient (the SDK picks one at random per transaction).
   * Checked against the live table and Global, and with a maximum-length sample packet. Cached for five minutes.
   */
  async devBuySupport(): Promise<{ available: boolean; reason: string | null }> {
    if (this.devBuyCache && Date.now() - this.devBuyCache.at < 300_000) return this.devBuyCache.value;
    const done = (value: { available: boolean; reason: string | null }) => ((this.devBuyCache = { at: Date.now(), value }), value);
    if (!this.launchOptions?.enabled || !this.launchOptions.lookupTable) return done({ available: false, reason: "Launches are not enabled on this network" });
    const [table, global] = await Promise.all([this.launchTable(), new sdk.OnlinePumpSdk(this.conn).fetchGlobal()]);
    const sample = async () => {
      const mint = Keypair.generate(), user = Keypair.generate().publicKey.toBase58(), { pumpLaunchInstructions } = await import("./pump-builder.js");
      const input = { launcherWallet: user, mint: mint.publicKey.toBase58(), mintSecretKey: mint.secretKey, name: "N".repeat(32), symbol: "S".repeat(13), uri: `ipfs://b${"a".repeat(58)}`,
        platformTreasury: Keypair.generate().publicKey.toBase58(), agentRewardsTreasury: Keypair.generate().publicKey.toBase58(), devBuy: { tokenAmount: 1n, maxQuoteCost: 1n } };
      return { input, instructions: await pumpLaunchInstructions(input, global) };
    };
    const [a, b] = [await sample(), await sample()];
    const keys = (s: typeof a) => new Set(s.instructions.flatMap((i) => i.keys.map((k) => k.pubkey.toBase58())));
    const programs = new Set([...a.instructions, ...b.instructions].map((i) => i.programId.toBase58())), kb = keys(b);
    const recipients = ([global.feeRecipient, ...global.feeRecipients, ...(global.buybackFeeRecipients ?? [])] as PublicKey[]).map((k) => k.toBase58()).filter((k: string) => k !== SYSTEM_PROGRAM_ID);
    const required = new Set([...[...keys(a)].filter((k) => kb.has(k) && !programs.has(k)), ...recipients]);
    const present = new Set(table.state.addresses.map((k) => k.toBase58())), missing = [...required].filter((k) => !present.has(k));
    if (missing.length) return done({ available: false, reason: `The launch lookup table lacks ${missing.length} account(s) a Developer Buy needs` });
    try { const { buildPumpLaunch } = await import("./pump-builder.js"); await buildPumpLaunch(a.input, Keypair.generate().publicKey.toBase58(), [table], global); }
    catch { return done({ available: false, reason: "A Developer Buy does not fit one atomic transaction with this lookup table" }); }
    return done({ available: true, reason: null });
  }

  /** Exact quote for a new SOL curve from the live Global and fee config (deterministic: the curve is created in the same transaction). */
  async quoteDevBuy(bps: number): Promise<DevBuyChainQuote> {
    const online = new sdk.OnlinePumpSdk(this.conn), [global, feeConfig, slot] = await Promise.all([online.fetchGlobal(), online.fetchFeeConfig(), this.conn.getSlot("confirmed")]);
    const totalSupply = BigInt(global.tokenTotalSupply.toString()), tokenAmount = devBuyTokenAmount(totalSupply, bps), capTokenAmount = devBuyTokenAmount(totalSupply, DEV_BUY_MAX_BPS);
    if (tokenAmount > BigInt(global.initialRealTokenReserves.toString())) throw new ChainFeatureUnavailable("dev_buy_unavailable", "Developer Buy exceeds the curve's initial reserves");
    if (tokenAmount === 0n) return { slot, totalSupply, tokenAmount, capTokenAmount, estimatedQuoteCost: 0n, pumpFees: 0n, maxQuoteCost: 0n, priceImpactBps: 0 };
    const BN = global.tokenTotalSupply.constructor;
    const cost = BigInt(sdk.getBuySolAmountFromTokenAmount({ global, feeConfig, mintSupply: null, bondingCurve: null, amount: new BN(tokenAmount.toString()), quoteMint: sdk.normalizeQuoteMint(undefined) }).toString());
    const vSol = BigInt(global.initialVirtualSolReserves.toString()), vTok = BigInt(global.initialVirtualTokenReserves.toString());
    const curveCost = (tokenAmount * vSol) / (vTok - tokenAmount) + 1n;
    // Spot price after vs before, in basis points: ((vSol+curveCost)/(vTok-amount)) / (vSol/vTok) - 1.
    const priceImpactBps = Number(((vSol + curveCost) * vTok * 10_000n) / (vSol * (vTok - tokenAmount)) - 10_000n);
    // The price is fixed by the configuration read here; 1% headroom only absorbs a fee-config change before signing.
    const maxQuoteCost = cost + (cost * 100n + 9_999n) / 10_000n;
    return { slot, totalSupply, tokenAmount, capTokenAmount, estimatedQuoteCost: cost, pumpFees: cost - curveCost, maxQuoteCost, priceImpactBps };
  }

  async buildLaunchTransaction(input: BuildLaunchInput): Promise<BuiltLaunchTransaction> {
    const genesisHash=await this.launchGenesis();
    if(input.quoteAsset==="USDC")await this.verifyQuoteMint(input.quoteMint??"");
    const table=await this.launchTable();
    let global:unknown;
    if(input.devBuy){
      const support=await this.devBuySupport();
      if(!support.available)throw new ChainFeatureUnavailable("dev_buy_unavailable",support.reason??"Developer Buy is unavailable on this network");
      global=await new sdk.OnlinePumpSdk(this.conn).fetchGlobal();
    }
    const latest=await this.conn.getLatestBlockhash("confirmed"),{buildPumpLaunch,devBuyTokenAccount}=await import("./pump-builder.js");
    let built;
    try{built=await buildPumpLaunch(input,latest.blockhash,[table],global);}
    catch(e){if(input.devBuy)throw new ChainFeatureUnavailable("dev_buy_unavailable",(e as Error).message);throw e;}
    const tokenAccount=input.devBuy?devBuyTokenAccount(input.launcherWallet,input.mint):null;
    const before=await this.conn.getBalance(new PublicKey(input.launcherWallet),"confirmed").catch(()=>null); // estimate input only
    const simulation=await this.conn.simulateTransaction(VersionedTransaction.deserialize(Buffer.from(built.transaction,"base64")),{sigVerify:false,commitment:"confirmed",innerInstructions:!!input.devBuy,accounts:{encoding:"base64",addresses:[input.launcherWallet,...(tokenAccount?[tokenAccount]:[])]}});
    if(simulation.value.err)throw new ChainFeatureUnavailable("pump_simulation_failed","Launch simulation failed; no launch or platform charge was submitted");
    let devBuy:{tokenAmount:bigint;quoteSpent:bigint}|null=null;
    if(input.devBuy){
      // Fail closed unless the simulation proves the exact requested tokens arrive at or below the reviewed ceiling.
      const account=simulation.value.accounts?.[1],received=account?Buffer.from((account.data as unknown as [string,string])[0],"base64").readBigUInt64LE(64):null;
      // Pump's authenticated self-CPI event under the buy instruction (logs truncate during create_v2).
      const buyIndex=VersionedTransaction.deserialize(Buffer.from(built.transaction,"base64")).message.compiledInstructions.length-1;
      const inner=(simulation.value.innerInstructions??[]).flatMap((group)=>group.instructions.flatMap((ix)=>"data" in ix&&"accounts" in ix?[{parentIndex:group.index,programId:ix.programId.toBase58(),accounts:ix.accounts.map((a)=>a.toBase58()),dataBase64:Buffer.from(bs58.decode(ix.data)).toString("base64")}]:[]));
      const buys=pumpTradesFromInner(inner,input.mint,buyIndex).filter((t)=>t.side==="buy"&&t.user===input.launcherWallet);
      const trade=buys.length===1?buys[0]!:null;
      // The buyback fee is part of the protocol fee (observed lamport-by-lamport), so it is not added again.
      const spent=trade?BigInt(trade.quoteAmount)+BigInt(trade.protocolFee)+BigInt(trade.creatorFee):null;
      if(received!==input.devBuy.tokenAmount||!trade||BigInt(trade.tokenAmount)!==input.devBuy.tokenAmount||spent===null||spent>input.devBuy.maxQuoteCost)
        throw new ChainFeatureUnavailable("dev_buy_unverified","The Developer Buy could not be proven exact in simulation; nothing was submitted");
      devBuy={tokenAmount:received,quoteSpent:spent};
    }
    const fee=await this.conn.getFeeForMessage(VersionedTransaction.deserialize(Buffer.from(built.transaction,"base64")).message,"confirmed");
    if(fee.value===null)throw new ChainFeatureUnavailable("blockhash_expired","Launch blockhash expired while estimating fees; prepare again");
    // Rent is the network's (devnet's differs from mainnet's) and grows with metadata length, so measure it:
    // simulated launcher debit minus the network fee and the platform charge. Omitted if the wallet moved meanwhile.
    const after=simulation.value.accounts?.[0]?.lamports,rent=after==null||before===null?null:BigInt(before)-BigInt(after)-BigInt(fee.value)-LAUNCH_FEE_LAMPORTS-(devBuy?.quoteSpent??0n);
    return {transaction:built.transaction,lastValidBlockHeight:latest.lastValidBlockHeight,demo:false,genesisHash,estimatedNetworkFeesLamports:String(fee.value),
      ...(rent!==null&&rent>0n&&rent<100_000_000n?{estimatedAccountRentLamports:rent.toString()}:{}),
      ...(devBuy?{devBuy:{tokenAmount:devBuy.tokenAmount.toString(),quoteSpent:devBuy.quoteSpent.toString()}}:{})};
  }
  async submitLaunchTransaction(transaction:string){
    await this.launchGenesis();
    return this.conn.sendRawTransaction(Buffer.from(transaction,"base64"),{skipPreflight:false,maxRetries:20});
  }
  getFinalizedBlockHeight(){return this.conn.getBlockHeight("finalized");}
  async mintAccountExists(mint:string){return (await this.conn.getAccountInfo(new PublicKey(mint),"finalized"))!==null;}

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
