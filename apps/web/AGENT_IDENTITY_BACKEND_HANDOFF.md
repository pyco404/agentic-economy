# One token, one agent, one verified activating wallet

Latest naming correction: house agents use readable names (`Fern_108`, `Kestrel_421`), never `0x` or invented wallet addresses. Only a verified token activation may produce `CMYx...6Wec`. No wallet-agent numbering.

## Inspected current contract

`AgentSummary`/`Agent` require `ownerWallet` and `communityId`, but have no identity kind, activation ID, verified activating wallet, or agent token mint. `HolderEligibility` verifies a fungible balance, not exclusive ownership. `AgentService.create` checks eligibility and supports wallet-scoped idempotency; the published API does not establish the requested one-to-one invariant. These fields cannot safely classify legacy seed agents as wallet activations.

## Frontend behavior now

All legacy agents receive deterministic readable ID-derived aliases. A small immutable canonical-ID tag disambiguates short-code collisions without roster-dependent renaming. Names are shared across World, profiles, Studio and event attribution; historical records are unchanged. Unclassified profiles say so and show no verified activating wallet. Fixture generation remains explicitly simulated; no financial operation is enabled.

The identity formatter accepts a normalized authoritative house identity (`kind`, `syntheticName`) or token identity (`kind`, `activationId`, `tokenMint`, `activatingWallet`). No current endpoint supplies it: this is an internal presentation type, not a claimed new API. Never populate it from a form, arbitrary owner field or holdings. Real token activation is disabled in Studio pending the contract; API errors remain visible. Demo house creation remains available.

## Required Claude Code backend work (not implemented by frontend)

- Publish canonical identity fields in list, detail, snapshot and event schemas, including house agents with no wallet. Persist unique house aliases once; migrate existing references without changing agent IDs or ownership history.
- Persist one activation row per eligible Agentic Economy verified launch mint, one per verified session wallet, one per token-linked agent. Unique constraints on mint, wallet and agent ID are global across communities/tokens. An authenticated session lookup must expose the caller's existing activation without public-wallet inference.
- Resolve mint from the verified platform launch/community record; never trust a client mint or treat token balances as ownership. Validate eligibility separately where required.
- Atomically reserve/create activation and agent with database uniqueness and durable command application. Concurrent different idempotency keys for the same wallet/mint must not duplicate agents; repeat the same operation returns the original result. Preserve the same key across uncertain retries. Return explicit wallet-already-activated / mint-already-activated / in-progress conflicts and canonical IDs.
- Audit legacy duplicate wallet owners without arbitrarily reassigning them. House seed agents are not activation records.
- Transfer/deactivation stays unsupported and explicitly rejected until lifecycle policy is agreed. Do not free wallet/mint uniqueness or infer transfer from token trades; retain immutable activation history.
- Test concurrent/retried requests, cross-token wallet reuse, cross-wallet mint reuse, restart/replay, session impersonation and legacy migration. No supply, fees, creator distribution or simulation rule changes.

Until this backend work is published and tested, the strict persistence invariant is **not implemented**. The frontend cannot enforce it securely.
