# First controlled Mainnet test — proposal, not transaction approval

## Proposed token

| Parameter | Proposal |
| --- | --- |
| Name / ticker | AECO Launch Verification / AECOCHECK |
| Description | Controlled Agentic Economy Mainnet launch verification token; not the official native AECO token. |
| Pair | TOKEN/SOL only |
| Deployer / fee payer | `3pF1MM1PCg2tekM5KeWEDyT8LVKbVd7ia668NRAnYpAR` |
| Mint | Separate ordinary test mint; not yet reserved. Never use `ZjUr8cr2fxQoBrv8zh4n752yQmcTFVgr3z5MgZeAeco`. |
| Developer Buy | Proposed OFF (0%); no purchase approved |
| Supply / decimals | Verify live protocol-enforced creation values and obtain approval; no override or official-AECO parameters invented |
| Artwork / links / metadata | Final content/CID not approved or pinned for this proposal |
| Platform charge | Exactly 50,000,000 lamports (0.05 SOL), once, to Platform Treasury |
| Eligible creator-fee policy | 60% Agent Rewards / 40% Platform / 0% launcher |

Platform: `HmmnNqZbfUZ2YK4mWVLXEGTsAU2NUUAvFzLFxgdgKUT2`.
Agent Rewards: `GEDMCV4WXHCAnySqH4CWNh3NYBrDfAUb3t4BBVBWVnJi`.
These recipients do not authorize collection or payouts. The deployer is distinct from both.

## Exact construction proposed for the no-buy case

One v0 transaction, with separate mint and Phantom deployer signatures: compute-unit limit (600,000), System Program transfer of 0.05 SOL to Platform Treasury, SDK `create_v2` (Token-2022; mayhem/cashback/protocol holder reward off), fee-sharing configuration creation, and the final 6000/4000 share update. No separate platform payment or buy transaction. The server must persist the exact preparation and signed payload before sending; replay/recovery must reuse that attempt and message. Final public instruction bytes/message hash require approved real metadata and a current blockhash.

Fresh finalized Mainnet checks: the four program identities/upgrade slots match the reviewed policy. The configured table `33wnSGm8hPBd9omoa252NAY8JX5PWJngkTNJgzdvdEZr` is active and frozen, with 42 entries. It does not contain the two official treasury addresses, but a representative construction with those recipients and a disposable offline mint fits **1,048 bytes / 1,232**, five instructions, without Developer Buy. This is a packet-capacity check, not a successful chain simulation or final transaction; its metadata URI was explicitly `example.invalid`. No official mint or private key was used and no transaction was signed/broadcast. Recheck the final actual message rather than assuming this proves every Developer Buy/metadata configuration fits.

## Costs and blockers

The deployer's finalized balance was **0 lamports** at slot 460130947. The official planned mint account was absent at that read. No funds were moved. The measured rent for an example 165-byte token account was 1,488,440 lamports; **that is not the launch's aggregate rent** and is not a quote for its mint/curve/sharing accounts.

The only fixed quoted cost is the 0.05 SOL platform charge. Exact network fee, account rent, applicable protocol costs and maximum total debit remain **NOT QUOTED**: final metadata and successful funded-payer simulation are required. Do not request transaction approval or claim a final total from fixture/Devnet estimates. The owner must separately decide any deployer funding; no transfer is authorized here.

Before a Mainnet signature: finalize the proposed content and protocol parameters, reserve one separate test mint/owned attempt, review any provider upload, confirm funded payer and current program/table state, simulate the exact message, show every recipient/cost and the maximum total debit, bind the one-test authorization to that durable intent, and obtain explicit parameter/transaction approval. Approval of the website or this document is not launch approval.

## Permission and release status

The deployer-only gate on main passes authenticated ownership/forged-wallet, legacy/alternate preparation, saved-intent/replay, submit/resume and media/capability regressions. Production originally remained at API `6758f91`, which predates that gate; all production execution flags are false. A tested compatible gate-bearing API release must be verified on production before any activation. The current public frontend is already `d5d3d7c`, matches the approved UI assets and passes fresh desktop/mobile browsing. No frontend redesign or duplicate frontend deployment is needed.

The official $AECO launch follows only after this controlled token succeeds. Its fixed vanity mint must use the [operator-local co-signing integration](AECO_LOCAL_MINT_SIGNING.md), with independently approved supply, decimals, tokenomics, Developer Buy, metadata and costs. Holder indexing follows finalized official mint/provenance acceptance. Public launching and Phase 3 remain separately blocked.
