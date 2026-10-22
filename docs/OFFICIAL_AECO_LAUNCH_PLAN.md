# Official $AECO planned mint and launch identities

Owner-supplied preparation record, 22 October 2026. **PLANNED / NOT LAUNCHED / MAINNET EXECUTION NOT APPROVED.** A generated keypair and a valid address are not evidence of a created mint account, supply, metadata, finalized transaction or market listing.

| Role | Fixed public address |
| --- | --- |
| Official planned $AECO mint | `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco` |
| Platform Treasury | `HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2` |
| Agent Rewards Treasury | `GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi` |
| Dedicated $AECO deployer | `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR` |

These four roles are distinct. The mint is not a treasury, fee recipient or deployer wallet. All addresses were checked locally for canonical 32-byte Solana public-key encoding; no private key was accessed and no on-chain existence or keypair custody is claimed by that validation. Preserve existing treasury recipients and accounting; do not transfer funds or infer fee receipts from this planning record.

## Fixed-mint launch preparation

Use exactly `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco` for the official native-token launch. Do not generate, substitute or silently fall back to another mint. Use a separate disposable mint only for Devnet signing rehearsals; there is no required intermediate Mainnet token. A ticker or vanity suffix alone never proves official launch provenance.

The ordinary non-Mainnet flow keeps random mint generation. The backend deployed at `5fa0507` requires an operator-bound wallet-owned draft for the initial Mainnet release and constructs its exact official mint without a secret. The existing review screen exchanges a public unsigned review and a verified local mint-signature artifact before separate Phantom approval. The integration is deployed on production with execution disabled; authenticated ordinary-wallet launch/signature-import denials are verified live. Official private-key signing and a real Mainnet launch have not occurred. Do not create the official token through a random-mint fallback. Do not request, publish, log or place the private key in chat, Git, browser bundles or documentation. This record imports no signing material and makes no transaction.

The owner will personally enter metadata/artwork/links and select 1% Developer Buy in the normal Create Coin form. Do not pre-fill these fields or change the ordinary 0% default. Protocol supply/decimals, tokenomics and exact Mainnet costs still require final review; choosing 1% does not authorize a purchase. Initial pairing is TOKEN/SOL; preserve the separate 0.05 SOL platform charge, optional 0–3.5% Developer Buy and eligible creator-fee split of 60% Agent Rewards / 40% Platform. Final parameters, readiness, scoped execution and the specific transaction require explicit owner approval. The owner initiates and approves the real transaction through https://useaeco.xyz.

## Holder indexing and Common Agent preparation

Prepare the indexer for this exact public mint on `mainnet-beta`, but keep live `AECO_MINT` configuration unset until the independently verified official launch is accepted. The production environment example contains the address only as a commented future assignment. Keep `AECO_MINT_VERIFIED=false` and `AECO_COMMON_AGENTS_ENABLED=false`; no runtime variable was changed.

After separately approved launch verification, bind finalized scans and the confirmed production launch/community to this mint and the dedicated deployer. Confirm actual supply/decimals, token program, provenance and relevant pool/vault exclusions. No demo/test mint may substitute. Then separately review read-only observation activation and provider capacity.

For this same mint, each qualifying unique holder wallet receives one persistent Common Agent, without connection, registration or activation. Use the existing network/mint/wallet identity mapping: repeated purchases do not duplicate an agent; 400 qualifying wallets produce 400 distinct Common Agents. Token-linked identity and one-activated-token-agent-per-wallet rules remain separate. Observation grants no agent-control, custody or payout rights. [Identity model](COMMON_AGENT_PER_TOKEN_PLAN.md), [holder implementation](AECO_COMMON_AGENTS.md).

## Treasury and future pairing references

Treat the planned mint as the native-asset identity in future accounting/indexing preparation, never as either SOL treasury recipient. Continue denominating launch charges and eligible current creator fees in SOL; no AECO balance, collection, payment or distribution is asserted before real evidence exists.

Phase 4 TOKEN/AECO pairing planning must reference this mint, subject to independent launch/pool/protocol verification and separate approval. It is not a live trading pair and is not enabled by reserving the mint.

The required sequence remains: public website → production readiness and disposable Devnet signing rehearsal → separately approved direct official $AECO launch using this mint → verified holder Common Agents → separately approved public launching → Phase 3. [Production checklist](PRODUCTION_RELEASE_CHECKLIST.md). No migration, deployment, financial gate, treasury setting or live indexer was changed by recording this plan.

Preparation checks: all four public addresses passed local canonical Solana-key validation. The production environment example was parsed through the actual backend configuration loader using a dummy, unconnected database URL; treasury identities match the existing shared constants, live mint remains unset, and launch/verification/Common Agent flags remain false. No provider, database, private-key or blockchain connection was made for these checks.

Secure integration preparation: public-key-only construction, operator-local mint co-signing and immutable local reservations are now implemented and tested with disposable offline keys. No official key was accessed. The server reservation and public-artifact handoff are deployed on staging/production at `5fa0507`; final expiry/recovery/security acceptance and owner-controlled launch authorization remain required before execution. Intentional wallet funding is deferred to the owner and does not block website deployment. [Detailed workflow and limits](AECO_LOCAL_MINT_SIGNING.md), [direct official launch review](DIRECT_AECO_LAUNCH_REVIEW.md).
