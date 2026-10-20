/**
 * TOKEN/SOL acceptance (historical USDC harness retained but disabled) through the real Launchpad application on an isolated local validator.
 *
 * Real: HTTP routes, browser wallet sign-in (Ed25519), draft/logo/metadata/review/launch/submit/confirm,
 * SolanaRpcChain (allowlist check, lookup table, simulation, submission, confirmation), PostgreSQL,
 * provenance, treasury receipt and the new on-chain market readers. Stubbed: Pinata uploads only
 * (fixed CIDs; no Pinata credential is used). Requires a loopback validator cloned from devnet:
 *
 *   AECO_RUN_LOCAL_PROTOCOL=true AECO_LOCAL_TEST_RPC=http://127.0.0.1:18999 PUMP_LOCAL_GENESIS_HASH=<local genesis> \
 *   TEST_DATABASE_URL=postgres:///<disposable>_test?host=/var/run/postgresql AECO_LOCAL_TEST_EVIDENCE=/tmp/usdc.json \
 *   pnpm --filter @agentic-economy/server exec tsx --conditions=@agentic-economy/source scripts/test-launchpad-usdc-local.ts
 *
 * Never touches a public network, an existing wallet or a real treasury. Test keys exist only in memory.
 */
import { writeFile } from 'node:fs/promises';
import { AddressLookupTableProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, VersionedTransaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import nacl from 'tweetnacl';
import pg from 'pg';
import sharp from 'sharp';
import { pumpLaunchInstructions } from '../src/chain/pump-builder.js';
import sdk from '../src/chain/pump-sdk.cjs';
import { USDC_QUOTE_MINTS, loadConfig } from '../src/config.js';
import { createContext } from '../src/context.js';
import { buildApp } from '../src/http/app.js';

const PUBLIC = ['EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'];
const rpc = process.env.AECO_LOCAL_TEST_RPC ?? '', genesis = process.env.PUMP_LOCAL_GENESIS_HASH ?? '', db = process.env.TEST_DATABASE_URL ?? '';
const memory = process.env.AECO_LOCAL_TEST_MEMORY === 'true';
if (process.env.AECO_RUN_LOCAL_PROTOCOL !== 'true' || !rpc || !genesis || (!db && !memory)) throw Error('Explicit local opt-in, loopback RPC, local genesis and disposable *_test database required');
const host = new URL(rpc);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(host.hostname) || host.username || host.password) throw Error('Loopback RPC required');
if (memory && db) throw Error('Memory-only verification must not specify a database');
if (!memory && process.env.AECO_LOCAL_TEST_RESET_APPROVED !== 'true') throw Error('Explicit approval is required before resetting the disposable database');
if (!memory && !/_test(\?|$)/.test(new URL(db).pathname + (new URL(db).search ? '?' : ''))) throw Error('Database must be a disposable *_test database');
const conn = new Connection(rpc, 'confirmed');
if ((await conn.getGenesisHash()) !== genesis || PUBLIC.includes(genesis)) throw Error('RPC is not the expected isolated local validator');

// AECO_LOCAL_TEST_QUOTE=SOL runs the same journey for SOL (regression for the quote-aware confirmation).
if(process.env.AECO_LOCAL_TEST_QUOTE&&process.env.AECO_LOCAL_TEST_QUOTE!=='SOL')throw Error('Only SOL launches are enabled by product policy');
// Broad type preserves the dormant quote-aware harness without enabling its USDC path.
const QUOTE = 'SOL' as 'SOL'|'USDC', NATIVE = 'So11111111111111111111111111111111111111112';
/** Optional Developer Buy in basis points of total supply (SOL only), e.g. AECO_LOCAL_TEST_DEV_BUY_BPS=350. */
const DEV_BUY_BPS = Number(process.env.AECO_LOCAL_TEST_DEV_BUY_BPS ?? 0);
const report: Record<string, unknown> = { network: 'isolated-localnet (devnet programs/config cloned)', genesis, quoteAsset: QUOTE, ...(QUOTE === 'USDC' ? { quoteMint: USDC_QUOTE_MINTS.localnet } : {}), stubbed: ['Pinata uploads (fixed CIDs)'], financialScope: 'local validator lamports only' };
const steps: unknown[] = (report.steps = []) as unknown[];
const step = (name: string, data: unknown) => { steps.push({ name, ...(data as object) }); console.log(name, JSON.stringify(data)); };
try {
  // Fresh in-memory keys, funded by the local faucet.
  const creator = Keypair.generate(), admin = Keypair.generate(), platform = Keypair.generate().publicKey, agent = Keypair.generate().publicKey;
  for (const kp of [creator, admin]) { const s = await conn.requestAirdrop(kp.publicKey, 5 * LAMPORTS_PER_SOL); await conn.confirmTransaction(s, 'confirmed'); }

  // Static-only lookup table: accounts shared by every launch (no per-mint accounts), for both quotes.
  const sample = async (quoteAsset?: 'USDC') => { const m = Keypair.generate(); const ix = await pumpLaunchInstructions({ launcherWallet: Keypair.generate().publicKey.toBase58(), mint: m.publicKey.toBase58(), mintSecretKey: m.secretKey, name: 'N', symbol: 'S', uri: 'ipfs://x', platformTreasury: platform.toBase58(), agentRewardsTreasury: agent.toBase58(), ...(quoteAsset ? { quoteAsset, quoteMint: USDC_QUOTE_MINTS.localnet } : {}) }); return new Set(ix.flatMap((i) => [i.programId, ...i.keys.filter((k) => !k.isSigner).map((k) => k.pubkey)]).map((k) => k.toBase58())); };
  const [s1, s2, u1, u2] = await Promise.all([sample(), sample(), sample('USDC'), sample('USDC')]);
  // Developer Buy: the buy's fixed accounts plus every protocol and buyback fee recipient the SDK may choose.
  const global = await new sdk.OnlinePumpSdk(conn).fetchGlobal();
  const devSample = async () => { const m = Keypair.generate(); const ix = await pumpLaunchInstructions({ launcherWallet: Keypair.generate().publicKey.toBase58(), mint: m.publicKey.toBase58(), mintSecretKey: m.secretKey, name: 'N', symbol: 'S', uri: 'ipfs://x', platformTreasury: platform.toBase58(), agentRewardsTreasury: agent.toBase58(), devBuy: { tokenAmount: 1n, maxQuoteCost: 1n } }, global); return new Set(ix.flatMap((i) => [i.programId, ...i.keys.filter((k) => !k.isSigner).map((k) => k.pubkey)]).map((k) => k.toBase58())); };
  const [d1, d2] = [await devSample(), await devSample()];
  const recipients = ([global.feeRecipient, ...global.feeRecipients, ...(global.buybackFeeRecipients ?? [])] as PublicKey[]).map((k) => k.toBase58()).filter((k) => k !== '11111111111111111111111111111111');
  const statics = [...new Set([...s1].filter((k) => s2.has(k)).concat([...u1].filter((k) => u2.has(k)), DEV_BUY_BPS ? [...d1].filter((k) => d2.has(k)).concat(recipients) : []))].map((k) => new PublicKey(k));
  const [create, table] = AddressLookupTableProgram.createLookupTable({ authority: admin.publicKey, payer: admin.publicKey, recentSlot: await conn.getSlot('finalized') });
  await sendAndConfirmTransaction(conn, new Transaction().add(create, AddressLookupTableProgram.extendLookupTable({ authority: admin.publicKey, payer: admin.publicKey, lookupTable: table, addresses: statics.slice(0, 20) })), [admin], { commitment: 'confirmed' });
  for (let i = 20; i < statics.length; i += 20) await sendAndConfirmTransaction(conn, new Transaction().add(AddressLookupTableProgram.extendLookupTable({ authority: admin.publicKey, payer: admin.publicKey, lookupTable: table, addresses: statics.slice(i, i + 20) })), [admin], { commitment: 'confirmed' });
  const extended = await conn.getSlot('confirmed'); while ((await conn.getSlot('confirmed')) <= extended) await new Promise((r) => setTimeout(r, 200));
  step('lookup_table', { table: table.toBase58(), staticEntries: statics.length });

  // The real application, configured for the isolated network.
  if (!memory) { const pool = new pg.Pool({ connectionString: db }); await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await pool.end(); }
  const origin = 'http://127.0.0.1:5199', cid = 'bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
  const config = loadConfig({ MODE: 'devnet', ROLE: 'all', LOG_LEVEL: 'warn', DATABASE_URL: memory ? 'postgres:///unused_local_protocol_test' : db, SOLANA_RPC_URL: rpc, SOLANA_CLUSTER: 'localnet', PUMP_LOCAL_GENESIS_HASH: genesis,
    FEE_ROUTING_VERIFIED: 'true', PUMP_LAUNCH_ENABLED: 'true', USDC_LAUNCH_ENABLED: 'true', PUMP_LAUNCH_LOOKUP_TABLE: table.toBase58(),
    PLATFORM_TREASURY: platform.toBase58(), AGENT_REWARDS_TREASURY: agent.toBase58(), PINATA_JWT: 'local-acceptance-stub', AUTH_URI: origin, CORS_ORIGINS: origin, SIM_AUTOSTART: 'false' });
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => String(url).startsWith('https://uploads.pinata.cloud/') ? Response.json({ data: { cid } }) : realFetch(url, init)) as typeof fetch;
  if (!memory) { const { migrate } = await import('../src/store/postgres.js'); const mp = new pg.Pool({ connectionString: db }); await migrate(mp); await mp.end(); }
  const { MemoryStore } = await import('../src/store/memory.js');
  const ctx = await createContext(config, memory ? {store:new MemoryStore()} : {}), app = await buildApp(ctx); ctx.runtime.start();
  try {
    const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, key = 'usdc-local-' + Math.random().toString(36).slice(2, 10), cookie?: string, type = 'application/json') =>
      app.inject({ method, url, headers: { origin, 'idempotency-key': key, ...(cookie ? { cookie } : {}), 'content-type': type }, ...(payload !== undefined ? { payload: payload as string } : {}) });
    const ch = (await call('POST', '/api/v1/auth/challenge', { wallet: creator.publicKey.toBase58() })).json();
    const verified = await call('POST', '/api/v1/auth/browser/verify', { wallet: creator.publicKey.toBase58(), nonce: ch.nonce, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(ch.message), creator.secretKey)) });
    const cookie = verified.headers['set-cookie']!.toString().split(';')[0]!;
    const caps = (await call('GET', '/api/v1/launchpad/capabilities', undefined, undefined, cookie)).json();
    const devQuote = DEV_BUY_BPS ? (await call('GET', `/api/v1/launchpad/dev-buy-quote?bps=${DEV_BUY_BPS}`)).json() : null;
    step('capabilities', { launchEnabled: caps.launchEnabled, usdc: caps.quotes.USDC, devBuy: caps.devBuy, devQuote });
    let draft = (await call('POST', '/api/v1/launchpad/drafts', { name: `AECO ${QUOTE} Local`, symbol: `AE${QUOTE}`, description: 'Isolated local acceptance', quoteAsset: QUOTE, devBuyBps: DEV_BUY_BPS }, undefined, cookie)).json();
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#4f7a4a' } }).png().toBuffer();
    draft = (await app.inject({ method: 'POST', url: `/api/v1/launchpad/drafts/${draft.id}/logo?version=${draft.version}`, headers: { origin, cookie, 'idempotency-key': 'usdc-local-logo', 'content-type': 'application/octet-stream' }, payload: png })).json();
    draft = (await call('POST', `/api/v1/launchpad/drafts/${draft.id}/metadata`, { version: draft.version }, 'usdc-local-metadata', cookie)).json();
    const review = (await call('GET', `/api/v1/launchpad/drafts/${draft.id}/review`, undefined, undefined, cookie)).json();
    step('review', { quoteAsset: review.draft.fields.quoteAsset, launchEnabled: review.launchEnabled, ready: review.readyForNextMilestone });

    const prepared = await call('POST', `/api/v1/launchpad/drafts/${draft.id}/launch`, { version: draft.version }, 'usdc-local-launch', cookie);
    if (prepared.statusCode !== 200) throw Error(`prepare failed: ${prepared.body}`);
    const { launch, transaction } = prepared.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
    step('prepared', { launchId: launch.id, mint: launch.mint, packetBytes: Buffer.from(transaction, 'base64').length, instructions: tx.message.compiledInstructions.length,
      execution: { quoteAsset: launch.execution.quoteAsset, quoteMint: launch.execution.quoteMint }, fees: launch.fees });
    tx.sign([creator]);
    const signed = Buffer.from(tx.serialize()).toString('base64');
    const submitted = await call('POST', `/api/v1/launchpad/launches/${launch.id}/submit`, { transaction: signed }, undefined, cookie);
    if (submitted.statusCode !== 200) throw Error(`submit failed: ${submitted.body}`);
    let current = submitted.json().launch;
    for (let i = 0; i < 60 && current.status !== 'confirmed'; i++) {
      if (['failed', 'expired', 'recovery_needed'].includes(current.status)) throw Error(`launch ${current.status}: ${JSON.stringify(current.errors)}`);
      await new Promise((r) => setTimeout(r, 1000));
      current = (await call('GET', `/api/v1/launchpad/launches/${launch.id}`, undefined, undefined, cookie)).json().launch;
    }
    if (current.status !== 'confirmed') throw Error(`not confirmed: ${current.status}`);
    const again = (await call('POST', `/api/v1/launchpad/launches/${launch.id}/submit`, { transaction: signed }, undefined, cookie)).json().launch;
    const routing = await ctx.chain.getFeeRoutingState(launch.mint);
    const community = (await call('GET', `/api/v1/communities/${current.communityId}`)).json().community;
    const receipts = (await call('GET', '/api/v1/treasury/entries?limit=50')).json().items.filter((e: { launchId?: string }) => e.launchId === launch.id);
    const market = (await call('GET', `/api/v1/token-markets/${launch.mint}`)).json(), trades = (await call('GET', `/api/v1/token-markets/${launch.mint}/trades`)).json();
    const platformLamports = await conn.getBalance(platform);
    // The previewed rent must equal what the launcher actually paid: debit minus network fee and platform charge.
    const landed = (await conn.getTransaction(current.signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' }))!.meta!;
    const devSpent = Number(current.devBuyResult?.quoteSpent ?? 0);
    const landedRent = landed.preBalances[0]! - landed.postBalances[0]! - landed.fee - 50_000_000 - devSpent;
    let devBuy: Record<string, unknown> | null = null;
    if (DEV_BUY_BPS) {
      const supply = BigInt(global.tokenTotalSupply.toString()), cap = supply * 350n / 10_000n, requested = supply * BigInt(DEV_BUY_BPS) / 10_000n;
      const held = await conn.getParsedTokenAccountsByOwner(creator.publicKey, { mint: new PublicKey(launch.mint) }, 'confirmed');
      const balance = BigInt(held.value[0]?.account.data.parsed.info.tokenAmount.amount ?? '0');
      // The dev buy's creator fee must accrue to the sharing config's vault (split 60/40), never the launcher's.
      const { creatorVaultPda, sharingConfigPda } = await import('../src/chain/pump.js');
      const launcherVault = await conn.getBalance(new PublicKey(creatorVaultPda(creator.publicKey.toBase58())));
      const sharedVault = await conn.getAccountInfo(new PublicKey(creatorVaultPda(sharingConfigPda(launch.mint))));
      const sharedFee = sharedVault ? sharedVault.lamports - await conn.getMinimumBalanceForRentExemption(sharedVault.data.length) : 0;
      if (process.env.AECO_LOCAL_TEST_FIXTURE) await writeFile(process.env.AECO_LOCAL_TEST_FIXTURE, JSON.stringify({ capturedFrom: 'isolated local validator (cloned devnet Pump programs)', launcher: creator.publicKey.toBase58(), mint: launch.mint, platform: platform.toBase58(), agent: agent.toBase58(), devBuy: launch.execution.devBuy, totalSupply: supply.toString(), tx: await ctx.chain.getTransaction(current.signature) }, (_k, v) => (typeof v === 'bigint' ? { $bigint: v.toString() } : v), 1) + '\n');
      devBuy = { requestedBps: DEV_BUY_BPS, requested: requested.toString(), cap: cap.toString(), received: balance.toString(), result: current.devBuyResult, previewed: launch.fees.developerBuy, launcherCreatorVault: launcherVault, sharedVaultCreatorFee: sharedFee };
      Object.assign(devBuy, { checks: {
        exactTokens: balance === requested && current.devBuyResult?.tokenAmount === requested.toString(), withinCap: balance <= cap, allocationRecorded: current.devBuyResult?.allocationBps === String(DEV_BUY_BPS),
        withinCeiling: BigInt(current.devBuyResult?.quoteSpent ?? '0') <= BigInt(launch.execution.devBuy.maxQuoteCost), previewedSpendExact: launch.fees.developerBuy?.estimatedQuoteCost === current.devBuyResult?.quoteSpent,
        creatorFeeToSharingVault: launcherVault === 0 && sharedFee > 0, quoteMatchesPreparation: devQuote?.tokenAmount === requested.toString(),
        // Independent of the formula: what remains after charge, fee and buy is exactly the new accounts' rent.
        spendMatchesSdkQuote: devQuote?.estimatedQuoteCost === current.devBuyResult?.quoteSpent } });
    }
    const checks = {
      confirmed: current.status === 'confirmed', duplicateSubmitSameLaunch: again.id === launch.id && again.status === 'confirmed',
      curveQuoteMatches: routing.bondingCurveQuoteMint === (QUOTE === 'USDC' ? USDC_QUOTE_MINTS.localnet : NATIVE), routing6040: routing.sharingConfig?.adminRevoked === true && routing.sharingConfig.shareholders.length === 2,
      provenanceQuote: community.provenance?.quoteAsset === QUOTE, platformCharge: platformLamports === 50_000_000, oneLaunchFeeReceipt: receipts.length === 1,
      rentMatchesNetwork: current.fees.estimatedAccountRentLamports === String(landedRent),
      ...(devBuy ? Object.fromEntries(Object.entries(devBuy.checks as Record<string, boolean>).map(([k, v]) => [`devBuy_${k}`, v])) : {}),
      // A Developer Buy moves the curve: progress is the bought share of the initial real reserves (floored bps).
      chainMetrics: market.chain?.source === 'solana_rpc' && market.priceUsd === null && market.graduationProgress === (DEV_BUY_BPS ? Number(BigInt(global.tokenTotalSupply.toString()) * BigInt(DEV_BUY_BPS) / 10_000n * 10_000n / BigInt(global.initialRealTokenReserves.toString())) / 100 : 0),
    };
    step('verified', { signature: current.signature, slot: current.slot, communityId: current.communityId, curveQuote: routing.bondingCurveQuoteMint, platformLamports,
      receipts: receipts.map((r: { amount: string; account: string; finality: string }) => ({ amount: r.amount, account: r.account, finality: r.finality })),
      market: { holders: market.holders, holdersLowerBound: market.holdersLowerBound, graduation: market.graduation, progress: market.graduationProgress, chain: market.chain }, trades: { status: trades.status, n: trades.trades.length, reason: trades.reason }, rent: { previewed: current.fees.estimatedAccountRentLamports, paid: landedRent }, devBuy, checks });
    if (!Object.values(checks).every(Boolean)) throw Error('One or more acceptance checks failed');
    if (process.env.AECO_LOCAL_TEST_FEES === 'true' && QUOTE === 'SOL') {
      // One isolated test buy (local lamports, separate fresh buyer), then the SDK's standard distribution.
      const buyer = Keypair.generate(), mintKey = new PublicKey(launch.mint), T22 = new PublicKey('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
      await conn.confirmTransaction(await conn.requestAirdrop(buyer.publicKey, 3 * LAMPORTS_PER_SOL), 'confirmed');
      const online = new sdk.OnlinePumpSdk(conn), global = await online.fetchGlobal(), feeConfig = await online.fetchFeeConfig().catch(() => null), state = await online.fetchBuyState(mintKey, buyer.publicKey, T22);
      // On devnet every protocol fee recipient listed in Global exists; on this clone some may be empty, and a
      // fee below the rent-exempt minimum would fail. Mirror devnet by funding only those protocol recipients
      // (never the coin's creator vault, which would distort the measured creator fees).
      const recipients = [global.feeRecipient, ...(global.feeRecipients ?? [])].filter(Boolean) as PublicKey[];
      for (const r of recipients) if ((await conn.getBalance(r)) === 0) await conn.confirmTransaction(await conn.requestAirdrop(r, LAMPORTS_PER_SOL), 'confirmed');
      const BN = global.initialRealTokenReserves.constructor as new (n: number | string) => unknown, solAmount = new BN(1 * LAMPORTS_PER_SOL); // creator fee (~0.3%) must exceed Pump's minimum distributable vault balance
      const amount = sdk.getBuyTokenAmountFromSolAmount({ global, feeConfig, mintSupply: null, bondingCurve: state.bondingCurve, amount: solAmount, quoteMint: state.quoteMint });
      const buyIxs = await sdk.PUMP_SDK.buyInstructions({ global, bondingCurveAccountInfo: state.bondingCurveAccountInfo, bondingCurve: state.bondingCurve, associatedUserAccountInfo: state.associatedUserAccountInfo, mint: mintKey, user: buyer.publicKey, amount, solAmount, slippage: 5, tokenProgram: T22 });
      // The SDK picks protocol fee recipients at random from several lists. Mirror devnet: any writable account
      // that exists on devnet as a plain system account but is missing here is funded (what cloning would do).
      // Accounts the buy itself creates (buyer token account, creator vault) do not exist on devnet and stay untouched.
      const devnet = new Connection('https://api.devnet.solana.com', 'confirmed');
      const writable = [...new Set(buyIxs.flatMap((i: { keys: { pubkey: PublicKey; isWritable: boolean; isSigner: boolean }[] }) => i.keys.filter((k) => k.isWritable && !k.isSigner).map((k) => k.pubkey.toBase58())))].map((k) => new PublicKey(k));
      const [here, there] = [await conn.getMultipleAccountsInfo(writable), await devnet.getMultipleAccountsInfo(writable)];
      const mirrored: string[] = [];
      for (let i = 0; i < writable.length; i++) if (!here[i] && there[i]?.owner.equals(new PublicKey('11111111111111111111111111111111')) && there[i]!.data.length === 0) {
        await conn.confirmTransaction(await conn.requestAirdrop(writable[i]!, Math.max(there[i]!.lamports, 1_000_000)), 'confirmed'); mirrored.push(writable[i]!.toBase58());
      }
      report.mirroredDevnetSystemAccounts = mirrored;
      if (process.env.AECO_LOCAL_TEST_DEBUG === 'true') {
        const keys = new Transaction({ feePayer: buyer.publicKey, recentBlockhash: (await conn.getLatestBlockhash()).blockhash }).add(...buyIxs).compileMessage().accountKeys;
        const [l, d] = [await conn.getMultipleAccountsInfo(keys), await devnet.getMultipleAccountsInfo(keys)];
        report.buyAccounts = keys.map((k, i) => `${i}:${k.toBase58()} local=${l[i] ? `${l[i]!.owner.toBase58().slice(0, 6)}/${l[i]!.lamports}/${l[i]!.data.length}` : 'missing'} devnet=${d[i] ? `${d[i]!.owner.toBase58().slice(0, 6)}/${d[i]!.lamports}/${d[i]!.data.length}` : 'missing'}`);
      }
      const buySig = await sendAndConfirmTransaction(conn, new Transaction().add(...buyIxs), [buyer], { commitment: 'confirmed' });
      await new Promise((r) => setTimeout(r, 31_000)); // past the 30 s trades cache
      const after = (await call('GET', `/api/v1/token-markets/${launch.mint}/trades`)).json(), bought = after.trades.find((t: { signature: string }) => t.signature === buySig);
      const before = { agent: await conn.getBalance(agent), platform: await conn.getBalance(platform) };
      const minimum = await online.getMinimumDistributableFee(mintKey, buyer.publicKey).catch((e: Error) => ({ error: e.message }));
      const dist = await online.buildDistributeCreatorFeesInstructions(mintKey, { payer: buyer.publicKey });
      const distSig = await sendAndConfirmTransaction(conn, new Transaction().add(...dist.instructions), [buyer], { commitment: 'confirmed' });
      const delta = { agent: (await conn.getBalance(agent)) - before.agent, platform: (await conn.getBalance(platform)) - before.platform };
      const distTx = await conn.getTransaction(distSig, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
      for (let i = 0; i < 3; i++) await ctx.indexer?.runOnce();
      const feeEntries = (await call('GET', '/api/v1/treasury/entries?limit=100')).json().items.filter((e: { stream: string }) => e.stream === 'creator_fee');
      const total = delta.agent + delta.platform;
      // Reconcile against the chain: the creator vault is the account the distribution debited by exactly the paid
      // total. Whatever it still holds above its rent-exempt minimum is undistributed (per-share floor rounding).
      const keys = [...distTx!.transaction.message.staticAccountKeys, ...(distTx!.meta!.loadedAddresses?.writable ?? []), ...(distTx!.meta!.loadedAddresses?.readonly ?? [])];
      const vaultIndex = distTx!.meta!.preBalances.findIndex((pre, i) => pre - distTx!.meta!.postBalances[i]! === total);
      const vault = keys[vaultIndex]!, vaultInfo = (await conn.getAccountInfo(vault, 'confirmed'))!;
      const residue = vaultInfo.lamports - (await conn.getMinimumBalanceForRentExemption(vaultInfo.data.length));
      const earned = bought ? Number(bought.creatorFee) : NaN;
      const ledger = Object.fromEntries(feeEntries.map((e: { account: string; amount: string }) => [e.account, Number(e.amount)]));
      step('creator_fees', { minimumDistributable: JSON.parse(JSON.stringify(minimum, (_k, v) => (typeof v === 'object' && v && 'toString' in v && v.constructor?.name === 'BN' ? v.toString() : v))), buySignature: buySig, tradeOnExplore: bought ? { side: bought.side, quoteAmount: bought.quoteAmount, creatorFee: bought.creatorFee } : null,
        distributionSignature: distSig, distributionInstruction: dist.instructions.map((i: { programId: PublicKey; data: Buffer }) => `${i.programId.toBase58()}:${Buffer.from(i.data).subarray(0, 8).toString('hex')}`),
        recipientDeltas: delta, split: total > 0 ? { agentBps: Math.round(delta.agent * 10000 / total), platformBps: Math.round(delta.platform * 10000 / total) } : null,
        distributionTx: { accounts: distTx?.transaction.message.staticAccountKeys.map((k) => k.toBase58()), innerInstructions: distTx?.meta?.innerInstructions?.length, logTail: distTx?.meta?.logMessages?.slice(-4) },
        reconciliation: { creatorVault: vault.toBase58(), earned, distributed: total, residueInVault: residue, floorShares: { agent: Math.floor(earned * 6000 / 10000), platform: Math.floor(earned * 4000 / 10000) } },
        ledgerCreatorFeeEntries: feeEntries.map((e: { account: string; amount: string; finality: string }) => ({ account: e.account, amount: e.amount, finality: e.finality })) });
      report.creatorFees = { tradeDecoded: !!bought && BigInt(bought.creatorFee) > 0n, distributed: total > 0, split6040: total > 0 && (delta.agent * 10 === total * 6 || delta.agent === Math.floor(total * 0.6) || delta.agent === Math.ceil(total * 0.6)) && delta.agent + delta.platform === total, ledgerRecorded: feeEntries.length === 2,
        earnedEqualsDistributedPlusResidue: earned === total + residue, payoutsAreFlooredShares: delta.agent === Math.floor(earned * 0.6) && delta.platform === Math.floor(earned * 0.4),
        ledgerMatchesChain: Object.values(ledger).sort().join() === [delta.agent, delta.platform].sort().join() };
    }
    report.result = 'passed';
  } finally { globalThis.fetch = realFetch; await app.close(); await ctx.close(); }
} catch (e) { report.result = 'failed'; report.error = e instanceof Error ? e.message : String(e); console.error(report.error); process.exitCode = 1; }
finally { if (process.env.AECO_LOCAL_TEST_EVIDENCE) await writeFile(process.env.AECO_LOCAL_TEST_EVIDENCE, JSON.stringify(report, null, 2) + '\n'); }
