#!/usr/bin/env bash
# Isolated loopback Solana validator with the official Pump programs and configuration cloned from public devnet.
# Used by scripts/test-launchpad-usdc-local.ts (launch, test buy, creator-fee distribution and ledger checks).
# Loopback only; fresh ledger on every start; no wallet, key or public transaction is involved.
#
#   scripts/local-pump-validator.sh <ledger-dir>      # RPC http://127.0.0.1:18999, faucet 19900
set -euo pipefail
LEDGER="${1:?ledger directory required}"
PROGRAMS=(
  6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P # Pump
  pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ # Pump Fees
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA # Pump AMM
  MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e # Mayhem
)
# Pump Global and config, Mayhem state, the allowlisted devnet USDC mint, and every protocol fee recipient listed
# in Global and the Pump Fees config (the SDK picks recipients at random, so all must exist as on devnet).
ACCOUNTS=(
  4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf 13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ 6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP
  4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1
  4TCi6Wx4oTukGftCTNxhoERdmezunyS632RmizDbH8Ud Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y 8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt
  8L83KW8DokuXFXyhd2gqaTdTgaMkJBRGNSKbP8NeLSiE DSEjDVZZtYY1RupBWhu6gEjkcMmHMQBA2mDw8DfjHbDn GUYCUEpxSkm1ccDo3LSKMR4Xpe5bgMnEZaFygWUSEVH3
  68yFSZxzLWJXkxxRGydZ63C6mHx1NLEDWmwN9Lb5yySg 5PXxuZkvftsg5CAGjv5LL5tEtvBRskdx1AAjxw8hK2Qx 6QgPshH1egekJ2TURfakiiApDdv98qfRuRe7RectX8xs
  78i5hpHxbtmosSJdfJ74WzwdUr3eKWg9RbCPpBeAF78t 8RMFYhsVsfdGCuWPFLxMCbSpSesiofabDdNorGqFrBNe 9GDepfBcjJMvNgmijXWVWa97Am7VZYCqXx7kJV44E9ij
  9ppkS5madL2uXozoEnMnZi5bKDq9jgdKkSavjWTS5NfW DDMCfwbcaNYTeMk1ca8tr8BQKFaUfFCWFwBJq8JcnyCw DRDBsRMst21CJUhwD16pncgiXnBrFaRAPvA2G6SUQceE
  uCMQEU7D1wgssKxZAshPy9MFWzDhnoKsxiUwNwKmYQG BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s GesfTA3X2arioaHp8bbKdjG9vJtskViWACZoYvxp4twS
  4budycTjhs9fD6xw62VBducVTNgMgJJ5BgtKq7mAZwn6 8SBKzEQU4nLSzcwF4a74F2iaUDQyTfjGndn6qUWBnrpR 4UQeTP1T39KZ9Sfxzo3WR5skgsaP6NZa87BAkuazLEKH
  8sNeir4QsLsJdYpc9RZacohhK1Y5FLU3nC5LXgYB4aa6 Fh9HmeLNUMVCvejxCtCL2DbYaRyBFVJ5xrWkLnMH6fdk 463MEnMeGyJekNZFQSTUABBEbLnvMTALbT6ZmsxAbAdq
  6AUH3WEHucYZyC61hqpqYUWVto5qA5hjHuNQ32GNnNxA 5YxQFdt3Tr9zJLvkFccqXVUwhdTWJQc1fFg2YPbxvxeD 9M4giFFMxmFGXtc3feFzRai56WbBqehoSeRE5GK7gf7
  GXPFM2caqTtQYC2cJ5yJRi9VDkpsYZXzYdwYpGnLmtDL 3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR 5cjcW9wExnJJiqgLjq7DEG75Pm6JBgE1hNv4B2vHXUW6
  EHAAiTxcdDwQ3U4bU6YcMsQGaekdzLS3B5SmYo46kJtL 5eHhjP8JaYkz83CWwvGU2uMUXefd3AazWGx4gpcuEEYD A7hAgCzFw14fejgCp387JUJRMNyz4j89JKnhtKU8piqW
  8LWu7QM2dGR1G8nKDHthckea57bkCzXyBTAKPJUBDHo8
)
args=(--ledger "$LEDGER" --reset --quiet --rpc-port 18999 --faucet-port 19900 --bind-address 127.0.0.1 --dynamic-port-range 19001-19040 --url https://api.devnet.solana.com)
for p in "${PROGRAMS[@]}"; do args+=(--clone-upgradeable-program "$p"); done
for a in "${ACCOUNTS[@]}"; do args+=(--clone "$a"); done
exec solana-test-validator "${args[@]}"
