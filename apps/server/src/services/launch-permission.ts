import { OFFICIAL_TREASURIES } from "@agentic-economy/shared";
import type { AppConfig } from "../config.js";
import { AppError } from "../util/errors.js";

/** Initial Mainnet rollout policy. Public launching requires a separately approved release.
 * No environment flag, request body, saved intent or completed AECO launch unlocks it.
 * The caller must supply the cryptographically authenticated session wallet.
 * Historical reconciliation remains available: this policy guards preparation/broadcast only.
 */
export function launchWalletAllowed(config: AppConfig, wallet?: string, preparedNetwork?: string): boolean {
  const mainnet = config.mode === "production" || config.solana.cluster === "mainnet-beta" || preparedNetwork === "mainnet-beta";
  return !mainnet || wallet === OFFICIAL_TREASURIES.aecoDeployer;
}

export function assertLaunchWalletAllowed(config: AppConfig, wallet: string, preparedNetwork?: string): void {
  if (!launchWalletAllowed(config, wallet, preparedNetwork))
    throw new AppError("forbidden", "Mainnet coin creation is currently restricted to the official deployer. Public launching is not open yet.");
}
