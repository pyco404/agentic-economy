import { OFFICIAL_TREASURIES } from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import { AppError } from "../util/errors.js";

/** Initial Mainnet rollout policy. Public launching requires a separately approved release.
 * Only the separate public-release approval can widen it; request bodies, saved
 * intents and the completed AECO launch never grant permission.
 * The caller must supply the cryptographically authenticated session wallet.
 * Historical reconciliation remains available: this policy guards preparation/broadcast only.
 */
export function launchWalletAllowed(config: AppConfig, wallet?: string, preparedNetwork?: string): boolean {
  const mainnet = config.mode === "production" || config.solana.cluster === "mainnet-beta" || preparedNetwork === "mainnet-beta";
  return !mainnet || wallet === OFFICIAL_TREASURIES.aecoDeployer ||
    (!!wallet && config.pumpLaunch.mainnetApproved && config.pumpLaunch.publicMainnetApproved === true);
}

export function assertLaunchWalletAllowed(config: AppConfig, wallet: string, preparedNetwork?: string): void {
  if (!launchWalletAllowed(config, wallet, preparedNetwork))
    throw new AppError("forbidden", "Mainnet coin creation is currently restricted to the official deployer. Public launching is not open yet.");
}

/** Read-only construction of the official deployer-owned launch intent, never authority to sign or broadcast. */
export function preparedMintPreparationAllowed(config:AppConfig,wallet?:string,draftId?:string):boolean{
  return !config.pumpLaunch.publicMainnetApproved&&config.mode==='production'&&config.solana.cluster==='mainnet-beta'&&wallet===OFFICIAL_TREASURIES.aecoDeployer&&
    (!config.pumpLaunch.preparedMintDraftId||!draftId||draftId===config.pumpLaunch.preparedMintDraftId)&&
    config.treasuries.platform===OFFICIAL_TREASURIES.platform&&config.treasuries.agentRewards===OFFICIAL_TREASURIES.agentRewards;
}
