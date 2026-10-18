import { Keypair, VersionedTransaction } from "@solana/web3.js";
import {
  AGENT_TREASURY_CREATOR_FEE_BPS,
  LAUNCH_FEE_LAMPORTS,
  PLATFORM_TREASURY_CREATOR_FEE_BPS,
  type Community,
  type FeeBreakdown,
  type LaunchDraft,
  type LaunchStatus,
  type PrepareLaunchResponse,
  type TokenLaunch,
} from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import { MockChain, type MockLaunchOutcome } from "../chain/mock.js";
import { sharingConfigPda } from "../chain/pump.js";
import { ChainFeatureUnavailable, type ChainGateway } from "../chain/types.js";
import { verifyLaunch } from "../chain/verify.js";
import type { Coordinator } from "../coord/types.js";
import type { CommandBus, StateReader } from "../roles/read-model.js";
import { publishDurable } from "../roles/stream.js";
import { communityBranding } from "./community.js";
import { ConflictError, type Store } from "../store/types.js";
import { AppError } from "../util/errors.js";
import { newId } from "../util/ids.js";
import type { TreasuryService } from "./treasury.js";

/** Rent estimates (lamports) for accounts created by the launch transaction; shown as estimates only. */
const RENT_ESTIMATE_LAMPORTS = 16_500_000n;
const NETWORK_FEE_ESTIMATE_LAMPORTS = 50_000n;

/**
 * Launch lifecycle. Deliberately NO per-wallet limits, cooldowns, history checks, duplicate-metadata
 * gates or approvals (spec §2.3): any authenticated wallet may prepare any number of launches.
 */
export class LaunchService {
  constructor(
    private readonly store: Store,
    private readonly chain: ChainGateway,
    private readonly config: AppConfig,
    private readonly treasury: TreasuryService,
    private readonly coord: Coordinator,
    private readonly bus: CommandBus,
    private readonly reader: StateReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  feeBreakdown(): FeeBreakdown {
    return {
      platformLaunchFeeLamports: LAUNCH_FEE_LAMPORTS.toString(),
      platformTreasury: this.config.treasuries.platform,
      estimatedNetworkFeesLamports: NETWORK_FEE_ESTIMATE_LAMPORTS.toString(),
      estimatedAccountRentLamports: RENT_ESTIMATE_LAMPORTS.toString(),
      launcherCreatorFeeBps: 0,
      creatorFeeSplit: {
        agentRewardsTreasury: this.config.treasuries.agentRewards,
        agentRewardsBps: AGENT_TREASURY_CREATOR_FEE_BPS,
        platformTreasury: this.config.treasuries.platform,
        platformBps: PLATFORM_TREASURY_CREATOR_FEE_BPS,
      },
      notes: [
        "0.05 SOL is charged once per launch and goes 100% to the Agentic Economy platform treasury.",
        "The charge and the Pump.fun token creation are in ONE atomic transaction: if creation fails, nothing is charged (network fees aside).",
        "Solana network fees and account rent are paid by your wallet and are estimates.",
        "You (the launcher) receive 0% of creator fees. Creator fees actually collected are split 60% agent rewards treasury / 40% platform treasury via Pump.fun's fee-sharing config, locked at launch.",
        "Pump.fun protocol and liquidity-provider fees are governed by Pump.fun and are not part of this split.",
        ...(this.config.mode === "demo" ? ["DEMO MODE: no real transaction is created and no SOL moves."] : []),
      ],
    };
  }

  private assertEnabled() {
    if (this.config.mode === "demo") return;
    if (!this.config.financialFeaturesEnabled)
      throw new AppError("feature_disabled", "Launches are disabled until Pump.fun fee routing has been verified for this deployment (FEE_ROUTING_VERIFIED).");
  }

  async prepare(wallet: string, draft: LaunchDraft, owned?:{id:string;version:number;launchId:string}): Promise<PrepareLaunchResponse> {
    this.assertEnabled();
    if(this.config.mode!=="demo"&&(!owned||!this.config.pumpLaunch.enabled))throw new AppError("feature_disabled","Launch execution requires an owned verified draft and an explicitly enabled safe network");
    if(owned){const existing=await this.store.getLaunch(owned.launchId);if(existing){
      const l=existing.launch;if(l.launcherWallet!==wallet||l.execution?.draftId!==owned.id||l.execution.draftVersion!==owned.version)throw new AppError("conflict","Launch attempt does not match this draft");
      return{launch:l,transaction:l.execution.transaction,lastValidBlockHeight:l.execution.lastValidBlockHeight,demoTransaction:false};
    }}
    if(Buffer.byteLength(draft.name)>32||Buffer.byteLength(draft.symbol)>13||Buffer.byteLength(draft.metadataUri)>200)throw new AppError("bad_request","Token name, symbol or metadata URI exceeds protocol byte limits");
    const mintKp = Keypair.generate();
    const mint = mintKp.publicKey.toBase58();
    let built;
    try {
      built = await this.chain.buildLaunchTransaction({
        launcherWallet: wallet,
        mint,
        mintSecretKey: mintKp.secretKey,
        name: draft.name,
        symbol: draft.symbol,
        uri: draft.metadataUri,
        platformTreasury: this.config.treasuries.platform,
        agentRewardsTreasury: this.config.treasuries.agentRewards,
      });
    } catch (e) {
      if (e instanceof ChainFeatureUnavailable) throw new AppError("feature_disabled", e.message, { code: e.code });
      throw new AppError("unavailable","Launch preparation is temporarily unavailable. Retry with the same attempt; nothing has been submitted.");
    }
    const at = this.now().toISOString();
    const launch: TokenLaunch = {
      id: owned?.launchId??newId("lch"),
      mode: this.config.mode,
      status: "awaiting_signature",
      launcherWallet: wallet,
      draft,
      mint,
      feeSharingConfig: sharingConfigPda(mint),
      fees: {...this.feeBreakdown(),...(built.estimatedNetworkFeesLamports?{estimatedNetworkFeesLamports:built.estimatedNetworkFeesLamports}:{})},
      ...(owned&&built.genesisHash&&built.lastValidBlockHeight!==null?{execution:{draftId:owned.id,draftVersion:owned.version,transaction:built.transaction,lastValidBlockHeight:built.lastValidBlockHeight,genesisHash:built.genesisHash,network:this.config.solana.cluster as "devnet"|"localnet",quoteAsset:"SOL" as const,platformOrigin:"PLATFORM" as const,initiator:"HUMAN" as const}}:{}),
      signature: null,
      slot: null,
      communityId: null,
      errors: [],
      history: [
        { status: "draft", at },
        { status: "awaiting_signature", at },
      ],
      createdAt: at,
      updatedAt: at,
    };
    if(owned&&!launch.execution)throw new AppError("feature_disabled","Chain adapter did not return a safe-network launch preparation");
    await this.store.createLaunch(launch);
    return { launch, transaction: built.transaction, demoTransaction: built.demo, lastValidBlockHeight: built.lastValidBlockHeight };
  }

  /** Persist submission BEFORE broadcast: a lost RPC response remains recoverable. */
  async submit(wallet:string,id:string,signed:string):Promise<TokenLaunch>{
    this.assertEnabled();
    if(!this.config.pumpLaunch.enabled||!this.chain.submitLaunchTransaction)throw new AppError("feature_disabled","Safe-network launch execution is disabled");
    const record=await this.store.getLaunch(id);if(!record)throw new AppError("not_found","Launch not found");
    const l=record.launch;if(l.launcherWallet!==wallet)throw new AppError("forbidden","Only the creator can submit this launch");
    if(!l.execution)throw new AppError("bad_request","Launch has no stored execution preparation");
    const {validateSignedPumpLaunch}=await import("../chain/pump-builder.js");
    let checked;try{checked=await validateSignedPumpLaunch(l.execution.transaction,signed);}catch{throw new AppError("bad_request","Wallet signatures or transaction message do not match the prepared launch");}
    if(l.signature&&l.signature!==checked.signature)throw new AppError("conflict","Another signature is bound to this launch");
    if(l.status==="confirmed"||l.status==="failed")return l;
    if(await this.chain.getTransaction(checked.signature))return this.confirm(wallet,id,checked.signature);
    if(l.status==="expired")return l;
    if(this.chain.getFinalizedBlockHeight&&(await this.chain.getFinalizedBlockHeight())>l.execution.lastValidBlockHeight){
      // A previously broadcast transaction may be missing from this RPC's history.
      // Keep uncertainty recoverable instead of asserting that no charge occurred.
      if(l.signature)return l;
      const expired=this.transition(l,"expired");await this.store.updateLaunch(expired,record.version);return expired;
    }
    const pending={...this.transition(l,"submitted"),signature:checked.signature};
    try{await this.store.updateLaunch(pending,record.version);}catch(e){if(e instanceof ConflictError){const latest=(await this.store.getLaunch(id))!.launch;if(latest.signature!==checked.signature)throw new AppError("conflict","Another launch submission won the race");return latest;}throw e;}
    try{const returned=await this.chain.submitLaunchTransaction(signed);if(returned!==checked.signature)throw new Error("RPC signature mismatch");}catch{throw new AppError("unavailable","Submission is uncertain. Check this launch again; retry only the same signed transaction.");}
    return pending;
  }
  async refresh(wallet:string,id:string){
    const initial=await this.store.getLaunch(id);if(!initial)throw new AppError("not_found","Launch not found");const l=initial.launch;if(l.launcherWallet!==wallet)throw new AppError("forbidden","Only the creator can inspect this preparation");
    if(l.signature&&!['confirmed','failed','expired'].includes(l.status))return this.confirm(wallet,id,l.signature);
    if(l.execution&&!l.signature&&this.chain.getFinalizedBlockHeight&&(await this.chain.getFinalizedBlockHeight())>l.execution.lastValidBlockHeight){
      const expired=this.transition(l,"expired");
      try{await this.store.updateLaunch(expired,initial.version);return expired;}catch(e){if(e instanceof ConflictError)return(await this.store.getLaunch(id))!.launch;throw e;}
    }
    return l;
  }

  async get(id: string): Promise<TokenLaunch> {
    const rec = await this.store.getLaunch(id);
    if (!rec) throw new AppError("not_found", `launch ${id} not found`);
    return rec.launch;
  }

  private transition(l: TokenLaunch, status: LaunchStatus): TokenLaunch {
    const at = this.now().toISOString();
    return { ...l, status, updatedAt: at, history: l.status === status ? l.history : [...l.history, { status, at }] };
  }

  /**
   * Verify the landed transaction from chain data and, if valid, register the community atomically
   * with the platform launch-fee receipt. Idempotent: repeated calls with the same signature return
   * the same result; a different signature for a confirmed launch is rejected.
   */
  async confirm(wallet: string, launchId: string, signature: string): Promise<TokenLaunch> {
    const rec = await this.store.getLaunch(launchId);
    if (!rec) throw new AppError("not_found", `launch ${launchId} not found`);
    const launch = rec.launch;
    if (launch.launcherWallet !== wallet) throw new AppError("forbidden", "only the launching wallet can confirm this launch");
    if (launch.signature && launch.signature !== signature)
      throw new AppError("conflict", "a different transaction signature is already bound to this launch", { boundSignature: launch.signature });
    if (launch.status === "confirmed") {
      // Idempotent re-confirm also heals a crash between registration and command enqueue (dedupe makes this a no-op otherwise).
      await this.registerInWorld(launch.communityId!, launch.draft.name, launch.mint, false);
      return launch;
    }
    if (launch.status === "failed" || (launch.status === "expired"&&!launch.execution)) return launch;
    const other = await this.store.findLaunchBySignature(signature);
    if (other && other.id !== launch.id) throw new AppError("conflict", "signature belongs to another launch");

    const [tx, routing] = await Promise.all([this.chain.getTransaction(signature), this.chain.getFeeRoutingState(launch.mint)]);
    const v = verifyLaunch(
      {
        launcherWallet: launch.launcherWallet,
        mint: launch.mint,
        platformTreasury: launch.fees.platformTreasury,
        agentRewardsTreasury: launch.fees.creatorFeeSplit.agentRewardsTreasury,
        sharingConfig: launch.feeSharingConfig,
        ...(this.chain.source === "solana_rpc" ? {draft:launch.draft,...(launch.execution?{preparedMessageBase64:Buffer.from(VersionedTransaction.deserialize(Buffer.from(launch.execution.transaction,"base64")).message.serialize()).toString("base64")}:{} )} : {}),
      },
      tx,
      routing,
    );
    const at = this.now().toISOString();

    try {
      if (v.outcome === "pending") {
        const next = { ...this.transition(launch, "submitted"), signature };
        await this.store.updateLaunch(next, rec.version);
        return next;
      }
      if (v.outcome === "failed") {
        const next = { ...this.transition(launch, "failed"), signature, errors: [...launch.errors, ...v.issues.map((i) => ({ ...i, at }))] };
        await this.store.updateLaunch(next, rec.version);
        return next;
      }
      // Fee was paid on-chain in both remaining outcomes: record the platform receipt (idempotent).
      const feeEntry = this.treasury.launchFeeEntry(launch, signature, v.feeIxIndex, v.slot, v.commitment);
      if (v.outcome === "recovery_needed") {
        const next = { ...this.transition(launch, "recovery_needed"), signature, slot: v.slot, errors: [...launch.errors, ...v.issues.map((i) => ({ ...i, at }))] };
        await this.store.updateLaunch(next, rec.version);
        for (const e of await this.store.appendTreasuryEntries([feeEntry])) await publishDurable(this.coord, `treasury:${e.id}`, "treasury.updated", this.reader.tick, { entry: e });
        return next;
      }

      const communityId = newId("com");
      const community = this.buildCommunity(launch, communityId, signature, at);
      const next: TokenLaunch = { ...this.transition(launch, "confirmed"), signature, slot: v.slot, communityId };
      await this.store.confirmLaunch(next, rec.version, community, [feeEntry], {
        id: `evt_l${launch.id.slice(4)}`,
        tick: this.reader.tick,
        at,
        type: "launch.confirmed",
        summary: `${launch.draft.name} ($${launch.draft.symbol}) launched on Pump.fun through Agentic Economy`,
        agentId: null,
        buildingId: null,
        communityId,
        data: { mint: launch.mint, signature },
      });
      await publishDurable(this.coord, `treasury:${feeEntry.id}`, "treasury.updated", this.reader.tick, { entry: feeEntry });
      // Give the community a headquarters in the shared world (durable command, applied by the simulation leader).
      await this.registerInWorld(communityId, launch.draft.name, launch.mint, true);
      return next;
    } catch (e) {
      if (e instanceof ConflictError) {
        // Lost a race with a concurrent confirm: return the winner's result.
        const latest = await this.store.getLaunch(launchId);
        if (latest && latest.launch.signature === signature) return latest.launch;
        throw new AppError("conflict", e.message);
      }
      throw e;
    }
  }

  /**
   * Enqueue the HQ placement for a registered community. Waiting is best-effort: the registration is
   * already durable, and the simulation leader also reconciles registered-but-unplaced communities.
   */
  private async registerInWorld(communityId: string, name: string, mint: string, wait: boolean) {
    const q = await this.bus.enqueue({ type: "community.register", communityId, name, branding: communityBranding(mint) }, `community.register:${communityId}`);
    if (wait && q && q.appliedTick === null) await this.bus.awaitApplied(q.id, 3_000).catch(() => undefined);
  }

  private buildCommunity(l: TokenLaunch, id: string, signature: string, at: string): Community {
    const cluster = this.config.mode === "production" ? "" : `?cluster=${this.config.solana.cluster}`;
    const explorer=this.config.solana.cluster==="localnet"?`https://explorer.solana.com/address/${l.mint}?cluster=custom&customUrl=${encodeURIComponent(new URL(this.config.solana.rpcUrl??"http://127.0.0.1:8899").origin)}`:`https://solscan.io/token/${l.mint}${cluster}`;
    return {
      id,
      name: l.draft.name,
      symbol: l.draft.symbol,
      description: l.draft.description,
      imageUri: l.draft.imageUri,
      metadataUri: l.draft.metadataUri,
      mint: l.mint,
      launchId: l.id,
      launchSignature: signature,
      creatorWallet: l.launcherWallet,
      feeSharingConfig: l.feeSharingConfig,
      links: {
        pumpFun: `https://pump.fun/coin/${l.mint}`,
        explorer,
        website: l.draft.website,
        twitter: l.draft.twitter,
        telegram: l.draft.telegram,
      },
      headquartersBuildingId: null,
      stats: { agents: 0, activeAgents: 0, verifiedTasks: 0, prominence: 0 },
      registeredAt: at,
      ...(l.execution?{provenance:{platformOrigin:l.execution.platformOrigin,initiator:l.execution.initiator,network:l.execution.network,quoteAsset:l.execution.quoteAsset}}:{}),
    };
  }

  /** DEMO ONLY: simulate the wallet signing and the transaction landing on the mock chain. */
  async demoSign(wallet: string, launchId: string, outcome: MockLaunchOutcome): Promise<string> {
    if (this.config.mode !== "demo" || !(this.chain instanceof MockChain)) throw new AppError("not_found", "demo endpoints are only available in demo mode");
    const launch = await this.get(launchId);
    if (launch.launcherWallet !== wallet) throw new AppError("forbidden", "only the launching wallet can sign");
    if (launch.status !== "awaiting_signature") throw new AppError("conflict", `launch is ${launch.status}`);
    return this.chain.simulateLaunch(
      { launcherWallet: wallet, mint: launch.mint, platformTreasury: this.config.treasuries.platform, agentRewardsTreasury: this.config.treasuries.agentRewards },
      outcome,
    );
  }
}
