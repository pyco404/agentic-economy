/**
 * Fixed product constants for Agentic Economy.
 * These encode the "fixed product rules" of the shared spec (§2). Changing any of
 * them is a product decision, not an implementation detail.
 */

export const BRAND_NAME = "Agentic Economy";
/** Future platform token. NOT minted, NOT live during MVP. Never present as tradable. */
export const FUTURE_TOKEN_TICKER = "$AECO";

/** HTTP API major version (path prefix /api/v1). */
export const API_VERSION = "v1";
/** Contract (schemas + OpenAPI + events) semantic version. Bump on any change. */
export const CONTRACT_VERSION = "0.5.2";
/** WebSocket envelope protocol version (field `v` on every message). */
export const WS_PROTOCOL_VERSION = 1;

/** 1 SOL = 1e9 lamports. */
export const LAMPORTS_PER_SOL = 1_000_000_000n;
/** Fixed launch charge: 0.05 SOL, 100% to the platform treasury (spec §2.2). */
export const LAUNCH_FEE_LAMPORTS = 50_000_000n;

/** Launcher's share of creator fees (spec §2.4). */
export const LAUNCHER_CREATOR_FEE_BPS = 0;
/** Agent rewards treasury share of creator fees actually received (spec §2.5). */
export const AGENT_TREASURY_CREATOR_FEE_BPS = 6000;
/** Platform treasury share of creator fees actually received (spec §2.5). */
export const PLATFORM_TREASURY_CREATOR_FEE_BPS = 4000;
export const BPS_DENOMINATOR = 10_000;

/** Pump.fun on-chain programs (mainnet + devnet share IDs). Verified 2026-10-14 against pump-fun/pump-public-docs. */
export const PUMP_PROGRAM_ID = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
export const PUMP_AMM_PROGRAM_ID = "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA";
export const PUMP_FEES_PROGRAM_ID = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
export const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";
export const WRAPPED_SOL_MINT = "So11111111111111111111111111111111111111112";

/** Pump.fun create_v2 metadata limits in UTF-8 BYTES, as the deployed program enforces them (verified by devnet
 * simulation: NameTooLong 6043, SymbolTooLong 6044, UriTooLong 6045). */
export const PUMP_NAME_MAX = 32;
export const PUMP_SYMBOL_MAX = 13;
export const PUMP_URI_MAX = 200;
/** Pump coins use 6 decimals. */
export const PUMP_TOKEN_DECIMALS = 6;
/** Optional Developer Buy at launch: at most 3.5% (350 basis points) of the coin's total supply. */
export const DEV_BUY_MAX_BPS = 350;

/** World layout. */
export const CHUNK_SIZE = 32;
export const GENESIS_SIZE = 128;

/** City Credits are integers in milli-credits to keep arithmetic exact. 1 CC = 1000 mCC. */
export const MILLICREDITS_PER_CREDIT = 1000;
