import { MAINNET_GENESIS, PLANNED_AECO_MINT, inspectMintSigningReview, mintMessageHash, verifyMintSigningArtifact } from "../chain/offline-mint.js";
import { assertLaunchWalletAllowed, launchWalletAllowed, preparedMintPreparationAllowed } from "./launch-permission.js";
import {officialServerMintSigner, type ServerMintSigner} from '../chain/server-mint.js';
import {SignedLaunchStore} from "../store/signed-launch.js";
import { Keypair, VersionedTransaction } from "@solana/web3.js";
import {
  AGENT_TREASURY_CREATOR_FEE_BPS,
  OFFICIAL_TREASURIES,
  DEV_BUY_MAX_BPS,
  solBudgetLamports,
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
import { ChainFeatureUnavailable, type ChainGateway, type DevBuyChainQuote } from "../chain/types.js";
import { verifyLaunch } from "../chain/verify.js";
import type { Coordinator } from "../coord/types.js";
import type { CommandBus, StateReader } from "../roles/read-model.js";
import { publishDurable } from "../roles/stream.js";
import { communityBranding } from "./community.js";
import { ConflictError, type LaunchRecord, type Store } from "../store/types.js";
import { AppError } from "../util/errors.js";
import { newId } from "../util/ids.js";
import type { TreasuryService } from "./treasury.js";

/** Rent estimates (lamports) for accounts created by the launch transaction; shown as estimates only. */
const RENT_ESTIMATE_LAMPORTS = 16_500_000n;
/** Rent-exempt minimum for a 165-byte SPL token account: (165 + 128) bytes x 3480 lamports/byte-year x 2 years. */
/** Mainnet rent for a 165-byte SPL token account (devnet's is lower). Upper-bound preview only: a prepared
 * transaction replaces it with the rent measured from its own simulation on the target network. */
export const TOKEN_ACCOUNT_RENT_LAMPORTS = 2_039_280n;
/** A USDC launch also creates up to four SPL token accounts, all paid by the launcher: the bonding curve's quote
 * vault, the two fee-sharing quote vaults and, unless it already exists, the creator's own USDC account. */
const USDC_VAULT_RENT_LAMPORTS = 4n * TOKEN_ACCOUNT_RENT_LAMPORTS;
const NATIVE_MINT = "So11111111111111111111111111111111111111112";
/** amount/total in basis points as an exact decimal string (up to 6 decimal places, trailing zeros dropped). */
export function exactBps(amount: bigint, total: bigint): string {
  const scaled = (amount * 10_000n * 1_000_000n) / total, whole = scaled / 1_000_000n, frac = (scaled % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}
export type LaunchQuote = { asset: "SOL" } | { asset: "USDC"; mint: string };
const currentQuoteAllowed=(quote:LaunchQuote):boolean=>quote.asset==="SOL";
const NETWORK_FEE_ESTIMATE_LAMPORTS = 50_000n;

/**
 * Launch lifecycle. Deliberately NO per-wallet limits, cooldowns, history checks, duplicate-metadata
 * quotas. Mainnet rollout additionally restricts launching to the official deployer until
 * a separately approved public-launch release; Devnet testing is unaffected.
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
    private readonly submissions:SignedLaunchStore = new SignedLaunchStore(),
    private readonly diagnose:(event:{stage:string;launchId:string;signature?:string;code?:string})=>void=()=>{},
    private readonly serverMintSigner:ServerMintSigner|undefined=officialServerMintSigner(config),
  ) {}

  feeBreakdown(quote: LaunchQuote = { asset: "SOL" }): FeeBreakdown {
    return {
      platformLaunchFeeLamports: LAUNCH_FEE_LAMPORTS.toString(),
      platformTreasury: this.config.treasuries.platform,
      estimatedNetworkFeesLamports: NETWORK_FEE_ESTIMATE_LAMPORTS.toString(),
      estimatedAccountRentLamports: (RENT_ESTIMATE_LAMPORTS + (quote.asset === "USDC" ? USDC_VAULT_RENT_LAMPORTS : 0n)).toString(),
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
      throw new AppError("feature_disabled", "Coin creation is unavailable in this environment.");
  }

  async prepare(wallet: string, draft: LaunchDraft, owned?:{id:string;version:number;launchId:string;devBuyBps?:number;devBuySol?:string}, quote: LaunchQuote = { asset: "SOL" }): Promise<PrepareLaunchResponse> {
    return this.prepareReview(wallet,draft,owned,quote);
  }

  private async prepareReview(wallet:string,draft:LaunchDraft,owned:{id:string;version:number;launchId:string;devBuyBps?:number;devBuySol?:string}|undefined,quote:LaunchQuote,
    renewal?:{record:LaunchRecord;finalizedHeight:number}) : Promise<PrepareLaunchResponse> {
    assertLaunchWalletAllowed(this.config, wallet);
    const readOnlyPreparation=!!owned&&preparedMintPreparationAllowed(this.config,wallet,owned.id);
    if(!readOnlyPreparation)this.assertEnabled();
    if(!readOnlyPreparation&&this.config.mode!=="demo"&&(!owned||!this.config.pumpLaunch.enabled))throw new AppError("feature_disabled","Launch execution requires an owned verified draft and an explicitly enabled safe network");
    if(!currentQuoteAllowed(quote))throw new AppError("feature_disabled","Only SOL is supported for new launches");
    if(owned){const existing=await this.store.getLaunch(owned.launchId);if(existing){
      const l=existing.launch;if(l.launcherWallet!==wallet||l.execution?.draftId!==owned.id||l.execution.draftVersion!==owned.version)throw new AppError("conflict","Launch attempt does not match this draft");
      assertLaunchWalletAllowed(this.config, wallet, l.mode === "production" ? "mainnet-beta" : l.execution.network);
      this.assertLocalMintBinding(l);
      if(!renewal)return{launch:l,transaction:l.execution.transaction,lastValidBlockHeight:l.execution.lastValidBlockHeight,demoTransaction:false};
      if(existing.version!==renewal.record.version || l.execution.localMintReview?.messageSha256!==renewal.record.launch.execution?.localMintReview?.messageSha256)
        throw new AppError("conflict","This review changed. Reload its current status before renewing.");
    }}
    if(Buffer.byteLength(draft.name)>32||Buffer.byteLength(draft.symbol)>13||Buffer.byteLength(draft.metadataUri)>200)throw new AppError("bad_request","Token name, symbol or metadata URI exceeds protocol byte limits");
    // Developer Buy comes only from the server-owned draft; quoted from the live chain, never from the client.
    let devBuyBps=owned?.devBuyBps??0;
    const budget=owned?.devBuySol ? solBudgetLamports(owned.devBuySol) : undefined;
    if(budget===null||budget===0n||(budget!==undefined&&devBuyBps!==0))throw new AppError('bad_request','Invalid or conflicting Developer Buy SOL budget');
    let devQuote:DevBuyChainQuote|null=null;
    if(devBuyBps!==0||budget!==undefined){
      if(!Number.isInteger(devBuyBps)||devBuyBps<0||devBuyBps>DEV_BUY_MAX_BPS)throw new AppError("bad_request",`Developer Buy must be between 0% and ${DEV_BUY_MAX_BPS/100}% of total supply`);
      if(!owned||quote.asset!=="SOL"||!this.chain.quoteDevBuy||!this.chain.devBuySupport)throw new AppError("feature_disabled","Developer Buy is available only for SOL launches on an enabled test network");
      try{
        const support=await this.chain.devBuySupport(readOnlyPreparation);
        if(!support.available)throw new ChainFeatureUnavailable("dev_buy_unavailable",support.reason??"Developer Buy is unavailable on this network");
        devQuote=await this.chain.quoteDevBuy(devBuyBps,budget);
        if(budget!==undefined){
          if(devQuote.maxQuoteCost!==budget||devQuote.estimatedQuoteCost>budget)throw new AppError('bad_request','Developer Buy quote exceeds your SOL budget');
          devBuyBps=Number(devQuote.tokenAmount*10_000n/devQuote.totalSupply);
        }
      }catch(e){
        if(e instanceof ChainFeatureUnavailable)throw new AppError("feature_disabled",e.message,{code:e.code});
        throw new AppError("unavailable","Developer Buy pricing is temporarily unavailable. Retry the same attempt; nothing has been submitted.");
      }
      if(devQuote.tokenAmount<=0n||devQuote.tokenAmount>devQuote.capTokenAmount||devQuote.tokenAmount*10_000n>devQuote.totalSupply*BigInt(DEV_BUY_MAX_BPS))throw new AppError("bad_request","Developer Buy exceeds 3.5% of total supply");
    }
    assertLaunchWalletAllowed(this.config, wallet);
    const reserved = this.config.solana.cluster === "mainnet-beta";
    if(reserved && (!owned || !preparedMintPreparationAllowed(this.config,wallet,owned.id)))
      throw new AppError("forbidden","Only the authenticated official launch intent may use this Mainnet mint");
    if(reserved && (!this.chain.buildUnsignedLaunchTransaction || !this.chain.mintAccountExists))
      throw new AppError("unavailable","The reserved mint cannot be prepared. Reconcile its existing state; do not substitute another mint.");
    if(reserved)await this.assertExpiredMintAbsent({mint:PLANNED_AECO_MINT});
    // The official branch never generates or receives its private mint key.
    const mintKp = reserved ? null : Keypair.generate();
    const mint = reserved ? PLANNED_AECO_MINT : mintKp!.publicKey.toBase58();
    let built;
    try {
      const input = {
        launcherWallet: wallet,
        mint,
        name: draft.name,
        symbol: draft.symbol,
        uri: draft.metadataUri,
        platformTreasury: this.config.treasuries.platform,
        agentRewardsTreasury: this.config.treasuries.agentRewards,
        ...(quote.asset === "USDC" ? { quoteAsset: "USDC" as const, quoteMint: quote.mint } : {}),
        ...(devQuote ? { devBuy: { tokenAmount: devQuote.tokenAmount, maxQuoteCost: devQuote.maxQuoteCost } } : {}),
      };
      built = reserved ? await this.chain.buildUnsignedLaunchTransaction!(input) : await this.chain.buildLaunchTransaction({...input,mintSecretKey:mintKp!.secretKey});
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
      fees: {...this.feeBreakdown(quote),...(built.estimatedNetworkFeesLamports?{estimatedNetworkFeesLamports:built.estimatedNetworkFeesLamports}:{}),...(built.estimatedAccountRentLamports?{estimatedAccountRentLamports:built.estimatedAccountRentLamports}:{}),
        // The simulated spend (exact for this transaction) replaces the formula estimate when available.
        developerBuy:devQuote?{bps:devBuyBps,quoteAsset:"SOL" as const,totalSupply:devQuote.totalSupply.toString(),tokenAmount:devQuote.tokenAmount.toString(),
          estimatedQuoteCost:built.devBuy?.quoteSpent??devQuote.estimatedQuoteCost.toString(),pumpFees:devQuote.pumpFees.toString(),maxQuoteCost:devQuote.maxQuoteCost.toString(),priceImpactBps:devQuote.priceImpactBps}:null},
      ...(owned&&built.genesisHash&&built.lastValidBlockHeight!==null?{execution:{draftId:owned.id,draftVersion:owned.version,transaction:built.transaction,lastValidBlockHeight:built.lastValidBlockHeight,genesisHash:built.genesisHash,network:this.config.solana.cluster,quoteAsset:quote.asset,...(quote.asset==="USDC"?{quoteMint:quote.mint}:{}),platformOrigin:"PLATFORM" as const,initiator:"HUMAN" as const,
        ...(devQuote?{devBuy:{bps:devBuyBps,...(owned?.devBuySol?{budgetSol:owned.devBuySol}:{}),tokenAmount:devQuote.tokenAmount.toString(),maxQuoteCost:devQuote.maxQuoteCost.toString()}}:{})}}:{}),
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
    assertLaunchWalletAllowed(this.config, wallet, launch.execution?.network);
    if(reserved){
      if(!launch.execution || built.genesisHash!==MAINNET_GENESIS || !built.mintSigningContext || !built.estimatedNetworkFeesLamports || !built.estimatedAccountRentLamports)
        throw new AppError("unavailable","The reserved mint requires a complete Mainnet simulation and public signing review");
      const tx=VersionedTransaction.deserialize(Buffer.from(built.transaction,"base64"));
      const maximum=LAUNCH_FEE_LAMPORTS+BigInt(built.estimatedNetworkFeesLamports)+BigInt(built.estimatedAccountRentLamports)+(devQuote?.maxQuoteCost??0n);
      launch.execution.localMintReview={version:1,launchId:launch.id,network:"mainnet-beta",genesisHash:MAINNET_GENESIS,
        mint,launcherWallet:wallet,platformTreasury:this.config.treasuries.platform,agentRewardsTreasury:this.config.treasuries.agentRewards,
        name:draft.name,symbol:draft.symbol,uri:draft.metadataUri,recentBlockhash:tx.message.recentBlockhash,
        lastValidBlockHeight:launch.execution.lastValidBlockHeight,maxTotalDebitLamports:maximum.toString(),
        messageSha256:mintMessageHash(tx),unsignedTransaction:built.transaction,...built.mintSigningContext,
        ...(devQuote?{devBuy:{tokenAmount:devQuote.tokenAmount.toString(),maxQuoteCost:devQuote.maxQuoteCost.toString()}}:{})};
      await inspectMintSigningReview(launch.execution.localMintReview,this.localMintPolicy());
      this.assertLocalMintBinding(launch);
    }
    if(renewal){
      const old=renewal.record.launch,previous=old.execution!.localMintReview!,next=launch.execution?.localMintReview;
      if(!next || !reserved || next.messageSha256===previous.messageSha256 || next.lastValidBlockHeight<=renewal.finalizedHeight)
        throw new AppError("unavailable","A fresh signing window could not be prepared. The saved attempt is unchanged.");
      next.renewal={previousMessageSha256:previous.messageSha256,previousLastValidBlockHeight:previous.lastValidBlockHeight,
        finalizedBlockHeight:renewal.finalizedHeight,checkedAt:at};
      launch.execution!.localMintReviewHistory=[...(old.execution!.localMintReviewHistory??[]),previous];
      launch.createdAt=old.createdAt;launch.history=[...old.history,{status:"awaiting_signature",at}];
      launch.errors=[...old.errors,{code:"mint_review_renewed",message:"Expired public signing review renewed on the same mint and attempt; fresh wallet approval is required.",at}];
      if(await this.submissions.get(wallet,old.id))throw new AppError("conflict","Signed evidence appeared. Reconcile this attempt before renewing.");
      try{await this.store.updateLaunch(launch,renewal.record.version);}catch(e){
        if(e instanceof ConflictError){const latest=(await this.store.getLaunch(old.id))!.launch;
          if(latest.execution?.localMintReview?.renewal?.previousMessageSha256===previous.messageSha256)
            return {launch:latest,transaction:latest.execution.transaction,lastValidBlockHeight:latest.execution.lastValidBlockHeight,demoTransaction:false};
          throw new AppError("conflict","The launch changed during renewal. Check its current status.");}
        throw e;
      }
    }else await this.store.createLaunch(launch);
    return { launch, transaction: built.transaction, demoTransaction: built.demo, lastValidBlockHeight: built.lastValidBlockHeight };
  }

  private localMintPolicy(){return {mint:PLANNED_AECO_MINT,deployer:OFFICIAL_TREASURIES.aecoDeployer,
    platform:OFFICIAL_TREASURIES.platform,rewards:OFFICIAL_TREASURIES.agentRewards};}

  /** The saved intent binds mint, owner and draft; an optional operator override can only narrow access. */
  private assertLocalMintBinding(l:TokenLaunch){
    const review=l.execution?.localMintReview;
    if(review && (l.mint!==PLANNED_AECO_MINT || l.launcherWallet!==OFFICIAL_TREASURIES.aecoDeployer || l.execution?.network!=="mainnet-beta" ||
      !l.execution.draftId || review.launchId!==l.id || review.mint!==l.mint || review.launcherWallet!==l.launcherWallet ||
      (this.config.pumpLaunch.preparedMintDraftId && l.execution.draftId!==this.config.pumpLaunch.preparedMintDraftId)))
      throw new AppError("forbidden","The official mint reservation changed. Keep this attempt for read-only reconciliation.");
    if((l.mode==="production"||l.execution?.network==="mainnet-beta") && !review)
      throw new AppError("forbidden","This saved attempt is outside the official mint reservation");
  }

  async assertPreparedMintAllowed(wallet:string,id:string){
    assertLaunchWalletAllowed(this.config,wallet);
    const record=await this.store.getLaunch(id);
    if(!record || record.launch.launcherWallet!==wallet)throw new AppError("not_found","Launch not found");
    this.assertLocalMintBinding(record.launch);
  }

  async localMintReview(wallet:string,id:string){
    assertLaunchWalletAllowed(this.config,wallet);
    const record=await this.store.getLaunch(id),l=record?.launch;
    if(!l || l.launcherWallet!==wallet)throw new AppError("not_found","Launch not found");
    this.assertLocalMintBinding(l);
    if(!l.execution?.localMintReview)throw new AppError("bad_request","This launch uses the normal mint signer");
    return l.execution.localMintReview;
  }

  /** Explicit renewal of an expired, unsubmitted reserved review. Same mint/attempt, fresh approval, no broadcast. */
  async renewLocalMintReview(wallet:string,id:string,previousMessageSha256:string){
    const preparation=preparedMintPreparationAllowed(this.config,wallet);
    if(!preparation)this.assertEnabled();
    if(!preparation&&!this.config.pumpLaunch.enabled)throw new AppError("feature_disabled","Launch execution remains disabled");
    await this.localMintReview(wallet,id);
    const record=(await this.store.getLaunch(id))!,l=record.launch,review=l.execution!.localMintReview!;
    this.assertLocalMintBinding(l);
    if(review.messageSha256!==previousMessageSha256){
      if(review.renewal?.previousMessageSha256===previousMessageSha256)
        return {launch:l,transaction:l.execution!.transaction,lastValidBlockHeight:l.execution!.lastValidBlockHeight,demoTransaction:false};
      throw new AppError("conflict","This is no longer the current signing review. Reload its status.");
    }
    if(!['awaiting_signature','expired'].includes(l.status)||l.signature||await this.submissions.get(wallet,id))
      throw new AppError("conflict","Signed or unresolved launches cannot be renewed. Reconcile the original transaction.");
    await this.assertPreparedNetwork(l);
    if(!this.chain.getFinalizedBlockHeight)throw new AppError("unavailable","Finalized expiry verification is unavailable");
    let height:number;try{height=await this.chain.getFinalizedBlockHeight();}catch{throw new AppError("unavailable","Finalized expiry verification is unavailable. The saved attempt is unchanged.");}
    if(height<=review.lastValidBlockHeight)throw new AppError("conflict","The original signing window is still valid");
    await this.assertExpiredMintAbsent(l);
    let history:string[];try{history=await this.chain.listSignaturesForAddress(l.mint,null,1);}catch{throw new AppError("unavailable","Mint transaction history is unavailable. Reconcile this attempt before renewing.");}
    if(history.length)
      throw new AppError("unavailable","The reserved mint has transaction history. Reconcile it before renewing.");
    return this.prepareReview(wallet,l.draft,{id:l.execution!.draftId,version:l.execution!.draftVersion,launchId:l.id,devBuyBps:l.execution!.devBuy?.bps??0,...(l.execution!.devBuy?.budgetSol?{devBuyBps:0,devBuySol:l.execution!.devBuy.budgetSol}:{})},
      {asset:'SOL'},{record,finalizedHeight:height});
  }

  automaticMintSigningAvailable(wallet?:string){
    return !!(wallet&&this.config.financialFeaturesEnabled&&this.config.pumpLaunch.enabled&&
      preparedMintPreparationAllowed(this.config,wallet)&&this.serverMintSigner?.configured());
  }

  /** Mint-only signature immediately before Phantom; never constructs, submits or broadcasts a new attempt. */
  async automaticMintSignature(wallet:string,id:string){
    assertLaunchWalletAllowed(this.config,wallet);
    this.assertEnabled();
    if(!this.automaticMintSigningAvailable(wallet)||!this.serverMintSigner)throw new AppError('feature_disabled','Automatic mint signing is not configured. The offline signing fallback remains available.');
    const review=await this.localMintReview(wallet,id),record=await this.store.getLaunch(id);
    if(!record||record.launch.status!=='awaiting_signature'||record.launch.signature||await this.submissions.get(wallet,id))
      throw new AppError('conflict','Reconcile this launch before requesting another mint signature');
    await this.assertPreparedNetwork(record.launch);
    if(!this.chain.getFinalizedBlockHeight||await this.chain.getFinalizedBlockHeight()>review.lastValidBlockHeight)
      throw new AppError('conflict','This signing review expired. Refresh the same attempt before wallet approval.');
    await this.assertExpiredMintAbsent(record.launch);
    try{await this.chain.assertLaunchSubmissionAllowed?.();}catch{throw new AppError('unavailable','Mainnet transaction checks are unavailable or have changed. Nothing was signed.');}
    // Recheck mutable permissions after asynchronous RPC work, before accessing the signing key.
    assertLaunchWalletAllowed(this.config,wallet,record.launch.execution?.network);
    this.assertEnabled();
    if(!this.automaticMintSigningAvailable(wallet))throw new AppError('feature_disabled','Automatic mint signing is unavailable');
    const artifact=await this.serverMintSigner.sign(review,wallet);
    // Existing import validation rechecks the persisted review, state, network and expiry after signing.
    return this.importLocalMintSignature(wallet,id,artifact);
  }

  /** Public signature import only. Original unsigned bytes remain immutable in durable storage. */
  async importLocalMintSignature(wallet:string,id:string,artifact:unknown){
    this.assertEnabled();
    if(!this.config.pumpLaunch.enabled)throw new AppError("feature_disabled","Launch execution remains disabled");
    const review=await this.localMintReview(wallet,id),record=(await this.store.getLaunch(id))!;
    if(record.launch.status!=="awaiting_signature" || record.launch.signature || await this.submissions.get(wallet,id))
      throw new AppError("conflict","This saved attempt must be reconciled before another signature");
    await this.assertPreparedNetwork(record.launch);
    if(!this.chain.getFinalizedBlockHeight || await this.chain.getFinalizedBlockHeight()>review.lastValidBlockHeight)
      throw new AppError("conflict","This message expired. Reconcile the reserved attempt; do not replace its mint or message.");
    await this.assertExpiredMintAbsent(record.launch);
    let checked;
    try{checked=await verifyMintSigningArtifact(review,this.localMintPolicy(),artifact);}
    catch{throw new AppError("bad_request","The public mint signature does not match this saved attempt");}
    this.assertLocalMintBinding(record.launch);
    return {transaction:checked.transaction,messageSha256:checked.messageSha256};
  }

  /** Bind recovery reads to the network persisted with the prepared message.
   * A changed/misconfigured RPC must not expire or confirm another network's attempt.
   */
  private async assertPreparedNetwork(launch: TokenLaunch) {
    if (!launch.execution) return;
    let genesis: string | undefined;
    try { genesis = await this.chain.getGenesisHash?.(); }
    catch { throw new AppError("unavailable", "Launch network verification is unavailable. Your saved attempt is unchanged; retry checking it."); }
    if (genesis !== launch.execution.genesisHash)
      throw new AppError("unavailable", "Launch RPC network does not match the prepared attempt. Your saved attempt is unchanged.");
  }

  /** Adapted from AgenticPad: finalized height alone cannot prove a mint was never created. */
  private async assertExpiredMintAbsent(launch:Pick<TokenLaunch,"mint">){
    if(!this.chain.mintAccountExists)throw new AppError("unavailable","Finalized mint verification is unavailable. Keep this saved launch; do not create another coin.");
    let exists:boolean;
    try{exists=await this.chain.mintAccountExists(launch.mint);}catch{throw new AppError("unavailable","Finalized mint verification failed. Keep this saved launch; retry checking its status.");}
    if(exists)throw new AppError("unavailable","This mint exists on-chain and requires recovery. Do not create another coin or pay again.");
  }

  /** Persist submission BEFORE broadcast: a lost RPC response remains recoverable. */
  async submit(wallet:string,id:string,signed:string):Promise<TokenLaunch>{
    assertLaunchWalletAllowed(this.config, wallet);
    this.assertEnabled();
    if(!this.config.pumpLaunch.enabled||!this.chain.submitLaunchTransaction)throw new AppError("feature_disabled","Safe-network launch execution is disabled");
    const record=await this.store.getLaunch(id);if(!record)throw new AppError("not_found","Launch not found");
    const l=record.launch;if(l.launcherWallet!==wallet)throw new AppError("forbidden","Only the creator can submit this launch");
    assertLaunchWalletAllowed(this.config, wallet, l.mode === "production" ? "mainnet-beta" : l.execution?.network);
    if(!l.execution)throw new AppError("bad_request","Launch has no stored execution preparation");
    this.assertLocalMintBinding(l);
    const {validateSignedPumpLaunch}=await import("../chain/pump-builder.js");
    let checked;try{checked=await validateSignedPumpLaunch(l.execution.transaction,signed);}catch{throw new AppError("bad_request","Wallet signatures or transaction message do not match the prepared launch");}
    if(l.signature&&l.signature!==checked.signature)throw new AppError("conflict","Another signature is bound to this launch");
    if(l.status==="confirmed"||l.status==="failed")return l;
    await this.assertPreparedNetwork(l);
    if(await this.chain.getTransaction(checked.signature))return this.confirm(wallet,id,checked.signature);
    if(l.execution.quoteAsset!=="SOL")throw new AppError("feature_disabled","Only SOL submissions are enabled. Historical launches remain available for reconciliation.");
    if(l.status==="expired")return l;
    if(this.chain.getFinalizedBlockHeight&&(await this.chain.getFinalizedBlockHeight())>l.execution.lastValidBlockHeight){
      // A previously broadcast transaction may be missing from this RPC's history.
      // Keep uncertainty recoverable instead of asserting that no charge occurred.
      if(l.signature)return l;
      await this.assertExpiredMintAbsent(l);
      const expired=this.transition(l,"expired");await this.store.updateLaunch(expired,record.version);return expired;
    }
    try{await this.chain.assertLaunchSubmissionAllowed?.();}catch(e){this.diagnose({stage:'submission_blocked',launchId:id,signature:checked.signature,code:e instanceof ChainFeatureUnavailable?e.code:'operator_gate'});throw new AppError('feature_disabled',e instanceof ChainFeatureUnavailable?e.message:'Launch submission is disabled by this verification environment');}
    assertLaunchWalletAllowed(this.config, wallet, l.execution.network);
    this.assertLocalMintBinding(l);
    this.diagnose({stage:'persisting_signed_payload',launchId:id,signature:checked.signature});
    await this.submissions.put({wallet,launchId:id,mint:l.mint,genesisHash:l.execution.genesisHash,signature:checked.signature,transaction:signed});
    const pending={...this.transition(l,"submitted"),signature:checked.signature};
    try{await this.store.updateLaunch(pending,record.version);}catch(e){if(e instanceof ConflictError){const latest=(await this.store.getLaunch(id))!.launch;if(latest.signature!==checked.signature)throw new AppError("conflict","Another launch submission won the race");return latest;}throw e;}
    assertLaunchWalletAllowed(this.config, wallet, l.execution.network);
    this.assertLocalMintBinding(l);
    this.diagnose({stage:'rpc_broadcast',launchId:id,signature:checked.signature});
    try{const returned=await this.chain.submitLaunchTransaction(signed);if(returned!==checked.signature)throw new Error("RPC signature mismatch");}catch{this.diagnose({stage:"rpc_submission_uncertain",launchId:id,signature:checked.signature});throw new AppError("unavailable","Submission is uncertain. Check this launch again; retry only the same signed transaction.");}
    this.diagnose({stage:"rpc_acknowledged",launchId:id,signature:checked.signature});
    return pending;
  }
  /** Explicitly resume only the original signed message; never prepare a new mint or ask the wallet again. */
  async resume(wallet:string,id:string,transaction?:string){
    assertLaunchWalletAllowed(this.config, wallet);
    this.assertEnabled();
    const record=await this.store.getLaunch(id);
    if(!record||record.launch.launcherWallet!==wallet)throw new AppError('not_found','Launch not found');
    assertLaunchWalletAllowed(this.config, wallet, record.launch.mode === 'production' ? 'mainnet-beta' : record.launch.execution?.network);
    this.assertLocalMintBinding(record.launch);
    const reconciled=await this.refresh(wallet,id);
    if(['confirmed','failed','expired'].includes(reconciled.status))return reconciled;
    const receipt=await this.submissions.get(wallet,id);
    const signed=transaction??receipt?.transaction;
    if(!signed)throw new AppError('unavailable','Signed payload is no longer available. Check the original transaction; do not sign or pay again.');
    if(receipt?.transaction&&transaction&&receipt.transaction!==transaction)throw new AppError('conflict','Resume must use the original signed transaction');
    return this.submit(wallet,id,signed);
  }
  async recovery(wallet:string,id:string){
    const record=await this.store.getLaunch(id);if(!record||record.launch.launcherWallet!==wallet)throw new AppError('not_found','Launch not found');
    const receipt=await this.submissions.get(wallet,id);if(!receipt)return undefined;
    let mintAllowed=true;try{this.assertLocalMintBinding(record.launch);}catch{mintAllowed=false;}
    return {signature:receipt.signature,canResume:mintAllowed&&launchWalletAllowed(this.config,wallet,record.launch.mode === "production" ? "mainnet-beta" : record.launch.execution?.network)&&!!receipt.transaction&&this.config.pumpLaunch.enabled&&!['confirmed','failed','expired'].includes(record.launch.status)};
  }
  async refresh(wallet:string,id:string){
    const initial=await this.store.getLaunch(id);if(!initial)throw new AppError("not_found","Launch not found");const l=initial.launch;if(l.launcherWallet!==wallet)throw new AppError("forbidden","Only the creator can inspect this preparation");
    const saved=await this.submissions.get(wallet,id);
    if(saved&&(saved.mint!==l.mint||saved.genesisHash!==l.execution?.genesisHash))throw new AppError('conflict','Stored submission does not match this launch network or mint');
    if(!l.signature&&saved)return this.confirm(wallet,id,saved.signature);
    if(l.signature&&!['confirmed','failed','expired'].includes(l.status))return this.confirm(wallet,id,l.signature);
    if(l.signature&&['confirmed','failed'].includes(l.status)&&saved?.transaction){
      const tx=await this.chain.getTransaction(l.signature);
      if(tx?.commitment==='finalized'&&tx.genesisHash===l.execution?.genesisHash){
        if((l.status==='confirmed')!==(tx.err===null))throw new AppError('unavailable','RPC evidence contradicts the recorded outcome. Keep this launch for reconciliation.');
        await this.submissions.erase(wallet,id);
      }
    }
    if(l.execution&&!l.signature)await this.assertPreparedNetwork(l);
    if(l.execution&&!l.signature&&this.chain.getFinalizedBlockHeight&&(await this.chain.getFinalizedBlockHeight())>l.execution.lastValidBlockHeight){
      await this.assertExpiredMintAbsent(l);
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

    await this.assertPreparedNetwork(launch);
    const [tx, routing] = await Promise.all([this.chain.getTransaction(signature), this.chain.getFeeRoutingState(launch.mint)]);
    if (launch.execution && tx && tx.genesisHash !== launch.execution.genesisHash)
      throw new AppError("unavailable", "Transaction evidence is from a different network. Confirmation remains pending.");
    const v = verifyLaunch(
      {
        launcherWallet: launch.launcherWallet,
        mint: launch.mint,
        platformTreasury: launch.fees.platformTreasury,
        agentRewardsTreasury: launch.fees.creatorFeeSplit.agentRewardsTreasury,
        sharingConfig: launch.feeSharingConfig,
        ...(launch.execution ? { quoteMint: launch.execution.quoteAsset === "USDC" ? launch.execution.quoteMint : NATIVE_MINT, quoteRequired: launch.execution.quoteAsset === "USDC" } : {}),
        ...(launch.execution?.devBuy && launch.fees.developerBuy ? { devBuy: { tokenAmount: BigInt(launch.execution.devBuy.tokenAmount), maxQuoteCost: BigInt(launch.execution.devBuy.maxQuoteCost), totalSupply: BigInt(launch.fees.developerBuy.totalSupply) } } : {}),
        ...(this.chain.source === "solana_rpc" ? {draft:launch.draft,...(launch.execution?{preparedMessageBase64:Buffer.from(VersionedTransaction.deserialize(Buffer.from(launch.execution.transaction,"base64")).message.serialize()).toString("base64")}:{} )} : {}),
      },
      tx,
      routing,
    );
    const at = this.now().toISOString();

    try {
      if (v.outcome === "pending") {
        // A saved signature is evidence of signing, not proof that the RPC accepted a broadcast.
        // Require rooted height, history-aware absence AND finalized mint absence before closing it.
        if(launch.execution&&this.chain.getFinalizedBlockHeight&&(await this.chain.getFinalizedBlockHeight())>launch.execution.lastValidBlockHeight){
          if(!this.chain.getSignatureStatus)throw new AppError('unavailable','Signature history verification is unavailable. Keep this original attempt.');
          const status=await this.chain.getSignatureStatus(signature);
          if(status)throw new AppError('unavailable','The signature has chain evidence but its transaction is unavailable. Keep this attempt for reconciliation.');
          await this.assertExpiredMintAbsent(launch);
          const next={...this.transition(launch,'expired'),signature,errors:[...launch.errors,{code:'submission_expired_unobserved',message:'The signed transaction expired without a chain transaction or finalized mint. No successful token creation was observed.',at}]};
          await this.store.updateLaunch(next,rec.version);
          this.diagnose({stage:'expired_unobserved',launchId,signature});return next;
        }
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

      if (this.config.launchRegistrationCommitment === "finalized" && v.commitment !== "finalized") {
        // Valid but not yet final: bind the signature and slot, register nothing; a later confirm completes it.
        const next = { ...this.transition(launch, "submitted"), signature, slot: v.slot };
        await this.store.updateLaunch(next, rec.version);
        return next;
      }
      const communityId = newId("com");
      const community = this.buildCommunity(launch, communityId, signature, at);
      // Record what actually executed (not the request): exact tokens, lamports spent and share of total supply.
      const devBuyResult = v.devBuy && launch.fees.developerBuy ? { tokenAmount: v.devBuy.tokenAmount.toString(), quoteSpent: v.devBuy.quoteSpent.toString(),
        allocationBps: exactBps(v.devBuy.tokenAmount, BigInt(launch.fees.developerBuy.totalSupply)), signature } : null;
      const next: TokenLaunch = { ...this.transition(launch, "confirmed"), signature, slot: v.slot, communityId, ...(devBuyResult ? { devBuyResult } : {}) };
      await this.store.confirmLaunch(next, rec.version, community, [feeEntry], {
        id: `evt_l${launch.id.slice(4)}`,
        tick: this.reader.tick,
        at,
        type: "launch.confirmed",
        summary: `${launch.draft.name} ($${launch.draft.symbol}) launched on Agentic Economy.`,
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
