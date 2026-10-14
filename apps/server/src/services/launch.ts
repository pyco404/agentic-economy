import { Keypair } from "@solana/web3.js";
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
import type { CityRuntime } from "../runtime.js";
import { ConflictError, type Store } from "../store/types.js";
import { AppError } from "../util/errors.js";
import { newId } from "../util/ids.js";
import type { TreasuryService } from "./treasury.js";

/** Rent estimates (lamports) for accounts created by the launch transaction; shown as estimates only. */
const RENT_ESTIMATE_LAMPORTS = 16_500_000n;
const NETWORK_FEE_ESTIMATE_LAMPORTS = 50_000n;

const BRAND_COLORS = ["#c98b6b", "#7a9e7e", "#6b8fc9", "#b58db6", "#d4a95a", "#5fa8a0", "#c96b7e", "#8a8fc9"];

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
    private readonly runtime: CityRuntime,
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

  async prepare(wallet: string, draft: LaunchDraft): Promise<PrepareLaunchResponse> {
    this.assertEnabled();
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
      throw e;
    }
    const at = this.now().toISOString();
    const launch: TokenLaunch = {
      id: newId("lch"),
      mode: this.config.mode,
      status: "awaiting_signature",
      launcherWallet: wallet,
      draft,
      mint,
      feeSharingConfig: sharingConfigPda(mint),
      fees: this.feeBreakdown(),
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
    await this.store.createLaunch(launch);
    return { launch, transaction: built.transaction, demoTransaction: built.demo, lastValidBlockHeight: built.lastValidBlockHeight };
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
    if (launch.status === "confirmed" || launch.status === "failed" || launch.status === "expired") return launch;
    const other = await this.store.findLaunchBySignature(signature);
    if (other && other.id !== launch.id) throw new AppError("conflict", "signature belongs to another launch");

    const [tx, routing] = await Promise.all([this.chain.getTransaction(signature), this.chain.getFeeRoutingState(launch.mint)]);
    const v = verifyLaunch(
      {
        launcherWallet: launch.launcherWallet,
        mint: launch.mint,
        platformTreasury: this.config.treasuries.platform,
        agentRewardsTreasury: this.config.treasuries.agentRewards,
        sharingConfig: launch.feeSharingConfig,
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
        for (const e of await this.store.appendTreasuryEntries([feeEntry])) this.runtime.publish("treasury.updated", this.runtime.engine.tick, { entry: e });
        return next;
      }

      const communityId = newId("com");
      const community = this.buildCommunity(launch, communityId, signature, at);
      const next: TokenLaunch = { ...this.transition(launch, "confirmed"), signature, slot: v.slot, communityId };
      await this.store.confirmLaunch(next, rec.version, community, [feeEntry], {
        id: `evt_l${launch.id.slice(4)}`,
        tick: this.runtime.engine.tick,
        at,
        type: "launch.confirmed",
        summary: `${launch.draft.name} ($${launch.draft.symbol}) launched on Pump.fun through Agentic Economy`,
        agentId: null,
        buildingId: null,
        communityId,
        data: { mint: launch.mint, signature },
      });
      this.runtime.publish("treasury.updated", this.runtime.engine.tick, { entry: { ...feeEntry } });
      // Give the community a headquarters in the shared world (applied on the next tick).
      await this.runtime.submit({ type: "community.register", communityId, name: launch.draft.name, branding: this.branding(launch.mint) });
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

  private branding(mint: string) {
    let h = 0;
    for (const ch of mint) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { primary: BRAND_COLORS[h % BRAND_COLORS.length]!, accent: BRAND_COLORS[(h >>> 8) % BRAND_COLORS.length]! };
  }

  private buildCommunity(l: TokenLaunch, id: string, signature: string, at: string): Community {
    const cluster = this.config.mode === "production" ? "" : `?cluster=${this.config.solana.cluster}`;
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
        explorer: `https://solscan.io/token/${l.mint}${cluster}`,
        website: l.draft.website,
        twitter: l.draft.twitter,
        telegram: l.draft.telegram,
      },
      headquartersBuildingId: null,
      stats: { agents: 0, activeAgents: 0, verifiedTasks: 0, prominence: 0 },
      registeredAt: at,
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
