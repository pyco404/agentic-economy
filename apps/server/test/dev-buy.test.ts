import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AddressLookupTableAccount, Keypair, PublicKey, VersionedTransaction, type AccountInfo } from '@solana/web3.js';
import bs58 from 'bs58';
import sharp from 'sharp';
import { DEV_BUY_MAX_BPS, devBuyTokenAmount } from '@agentic-economy/shared';
import sdk from '../src/chain/pump-sdk.cjs';
import { buildPumpLaunch, devBuyTokenAccount, pumpLaunchInstructions } from '../src/chain/pump-builder.js';
import { PUMP_IX, creatorVaultPda, sharingConfigPda } from '../src/chain/pump.js';
import { verifyLaunch } from '../src/chain/verify.js';
import type { BuildLaunchInput, ChainGateway, DevBuyChainQuote, FeeRoutingState, ObservedTransaction } from '../src/chain/types.js';
import type { MockChain } from '../src/chain/mock.js';
import { makeEnv, type TestEnv } from './helpers.js';

const revive = (_k: string, v: unknown) => (v && typeof v === 'object' && '$bigint' in v ? BigInt((v as { $bigint: string }).$bigint) : v);
/** Pump Global and FeeConfig captured read-only from public devnet. */
const captured = JSON.parse(readFileSync(new URL('./fixtures/pump-global-devnet.json', import.meta.url), 'utf8'));
const account = (a: { owner: string; dataBase64: string }) => ({ data: Buffer.from(a.dataBase64, 'base64'), owner: new PublicKey(a.owner), executable: false, lamports: 1, rentEpoch: 0 }) as AccountInfo<Buffer>;
const global = sdk.PUMP_SDK.decodeGlobal(account(captured.global));
const SUPPLY = BigInt(global.tokenTotalSupply.toString()), CAP = devBuyTokenAmount(SUPPLY, DEV_BUY_MAX_BPS);

const input = (over: Partial<BuildLaunchInput> = {}): BuildLaunchInput => {
  const mint = Keypair.generate();
  return { launcherWallet: Keypair.generate().publicKey.toBase58(), mint: mint.publicKey.toBase58(), mintSecretKey: mint.secretKey, name: 'N'.repeat(32), symbol: 'S'.repeat(13),
    uri: `ipfs://b${'a'.repeat(58)}`, platformTreasury: Keypair.generate().publicKey.toBase58(), agentRewardsTreasury: Keypair.generate().publicKey.toBase58(), devBuy: { tokenAmount: CAP, maxQuoteCost: 10_344_474n }, ...over };
};

describe('Developer Buy: allocation arithmetic', () => {
  it('uses the protocol supply in base units with exact integer floors', () => {
    expect(SUPPLY).toBe(1_000_000_000_000_000n); // 1,000,000,000 tokens × 10^6, read from devnet Global, not assumed
    expect(devBuyTokenAmount(SUPPLY, 350)).toBe(35_000_000_000_000n);
    expect(devBuyTokenAmount(SUPPLY, 100)).toBe(10_000_000_000_000n);
    expect(devBuyTokenAmount(SUPPLY, 0)).toBe(0n);
    expect(devBuyTokenAmount(1_000_000_000_000_003n, 350)).toBe(35_000_000_000_000n); // floor, never rounds up past the cap
    for (const bad of [351, -1, 1.5, Number.NaN]) expect(() => devBuyTokenAmount(SUPPLY, bad)).toThrow(/range/);
  });
});

describe('Developer Buy: transaction construction', () => {
  it('appends the creator token account and an exact-amount buy after the locked shares, with no compute-limit instruction', async () => {
    const i = input(), ixs = await pumpLaunchInstructions(i, global);
    expect(ixs.map((x) => x.programId.toBase58())).toEqual(['11111111111111111111111111111111', '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P', 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ', 'pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL', '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P']);
    const buy = ixs.at(-1)!, data = Buffer.from(buy.data);
    expect(data.subarray(0, 8).toString('hex')).toBe(PUMP_IX.buy);
    expect(data.readBigUInt64LE(8)).toBe(CAP); // exact token amount
    expect(data.readBigUInt64LE(16)).toBe(10_344_474n); // max_sol_cost is the reviewed ceiling, no hidden slippage
    const keys = buy.keys.map((k) => k.pubkey.toBase58());
    // Creator fee on this buy accrues to the sharing config's vault (60/40), never to the launcher's.
    expect(keys).toContain(creatorVaultPda(sharingConfigPda(i.mint)));
    expect(keys).not.toContain(creatorVaultPda(i.launcherWallet));
    expect(keys).toContain(devBuyTokenAccount(i.launcherWallet, i.mint));
  });

  it('refuses amounts above 3.5%, non-positive amounts, USDC pairs and a missing Global', async () => {
    await expect(pumpLaunchInstructions(input({ devBuy: { tokenAmount: CAP + 1n, maxQuoteCost: 1n } }), global)).rejects.toThrow(/3\.5%/);
    await expect(pumpLaunchInstructions(input({ devBuy: { tokenAmount: 0n, maxQuoteCost: 1n } }), global)).rejects.toThrow(/positive/);
    await expect(pumpLaunchInstructions(input({ devBuy: { tokenAmount: 1n, maxQuoteCost: 0n } }), global)).rejects.toThrow(/maximum cost/);
    await expect(pumpLaunchInstructions(input({ quoteAsset: 'USDC', quoteMint: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' }), global)).rejects.toThrow(/SOL launches only/);
    await expect(pumpLaunchInstructions(input())).rejects.toThrow(/Global/);
  });

  it('fits one packet at maximum metadata only when the lookup table covers every fee recipient', async () => {
    const recipients = ([global.feeRecipient, ...global.feeRecipients, ...(global.buybackFeeRecipients ?? [])] as PublicKey[]).map((k) => k.toBase58());
    const fixed = async () => { const a = await pumpLaunchInstructions(input(), global), b = await pumpLaunchInstructions(input(), global); const kb = new Set(b.flatMap((x) => x.keys.map((k) => k.pubkey.toBase58())));
      return a.flatMap((x) => x.keys.map((k) => k.pubkey.toBase58())).filter((k) => kb.has(k)); };
    const table = (addresses: string[]) => new AddressLookupTableAccount({ key: Keypair.generate().publicKey, state: { deactivationSlot: 2n ** 64n - 1n, lastExtendedSlot: 0, lastExtendedSlotStartIndex: 0, addresses: [...new Set(addresses)].map((k) => new PublicKey(k)) } });
    const full = table([...(await fixed()), ...recipients]), withoutRecipients = table(await fixed());
    for (let n = 0; n < 5; n++) {
      const built = await buildPumpLaunch(input(), Keypair.generate().publicKey.toBase58(), [full], global);
      expect(built.bytes).toBeLessThanOrEqual(1232);
      expect(VersionedTransaction.deserialize(Buffer.from(built.transaction, 'base64')).message.header.numRequiredSignatures).toBe(2);
    }
    // Recipients are chosen at random; without them in the table a launch can exceed the packet limit.
    const sizes = await Promise.all(Array.from({ length: 12 }, () => buildPumpLaunch(input(), Keypair.generate().publicKey.toBase58(), [withoutRecipients], global).then((b) => b.bytes, () => Infinity)));
    expect(sizes.some((s) => s > 1232)).toBe(true);
  });
});

describe('Developer Buy: confirmation from the landed transaction', () => {
  // A real launch with a 3.5% Developer Buy, confirmed on an isolated validator running the cloned devnet programs.
  const load = () => JSON.parse(readFileSync(new URL('./fixtures/pump-launch-devbuy-local.json', import.meta.url), 'utf8'), revive) as {
    launcher: string; mint: string; platform: string; agent: string; totalSupply: string; devBuy: { tokenAmount: string; maxQuoteCost: string }; tx: ObservedTransaction };
  const f0 = load(), sc = sharingConfigPda(f0.mint);
  const routing: FeeRoutingState = { tokenTotalSupply: BigInt(f0.totalSupply), sharingConfig: { address: sc, version: 2, status: 'Active', mint: f0.mint, admin: f0.launcher, adminRevoked: true,
    shareholders: [{ address: f0.agent, shareBps: 6000 }, { address: f0.platform, shareBps: 4000 }] }, bondingCurveCreator: sc, bondingCurveComplete: false, bondingCurveQuoteMint: 'So11111111111111111111111111111111111111112' };
  const expectation = (f: ReturnType<typeof load>, devBuy: { tokenAmount: bigint; maxQuoteCost: bigint; totalSupply: bigint } | null = { tokenAmount: BigInt(f.devBuy.tokenAmount), maxQuoteCost: BigInt(f.devBuy.maxQuoteCost), totalSupply: BigInt(f.totalSupply) }) =>
    ({ launcherWallet: f.launcher, mint: f.mint, platformTreasury: f.platform, agentRewardsTreasury: f.agent, sharingConfig: sc, quoteMint: 'So11111111111111111111111111111111111111112', ...(devBuy ? { devBuy } : {}) });
  const issues = (v: ReturnType<typeof verifyLaunch>) => ('issues' in v ? v.issues.map((i) => i.code) : []);

  it('records the executed tokens and lamports, not the request', () => {
    const f = load(), v = verifyLaunch(expectation(f), f.tx, routing);
    expect(v).toMatchObject({ outcome: 'confirmed', devBuy: { tokenAmount: 35_000_000_000_000n, quoteSpent: 10_242_053n } });
  });

  it('holds the launch for recovery when the buy differs from the prepared exact amount, ceiling or cap', () => {
    let f = load(); const ata = Object.keys(f.tx.tokenAccounts!).find((k) => f.tx.tokenAccounts![k]!.owner === f.launcher)!;
    f.tx.tokenAccounts![ata]!.post -= 1n; expect(issues(verifyLaunch(expectation(f), f.tx, routing))).toContain('dev_buy_mismatch');
    f = load(); expect(issues(verifyLaunch(expectation(f, { tokenAmount: BigInt(f.devBuy.tokenAmount), maxQuoteCost: 10_242_052n, totalSupply: BigInt(f.totalSupply) }), f.tx, routing))).toContain('dev_buy_mismatch');
    f = load(); expect(issues(verifyLaunch(expectation(f, { tokenAmount: BigInt(f.devBuy.tokenAmount), maxQuoteCost: BigInt(f.devBuy.maxQuoteCost), totalSupply: 999_999_999_999_999n }), f.tx, routing))).toContain('dev_buy_mismatch');
    f = load(); expect(issues(verifyLaunch(expectation(f), f.tx, { ...routing, tokenTotalSupply: undefined }))).toContain('dev_buy_mismatch');
    f = load(); expect(issues(verifyLaunch(expectation(f), f.tx, { ...routing, tokenTotalSupply: 999_999_999_999_999n }))).toContain('dev_buy_mismatch');
    // Pump's event is required, and only Pump's own event authority can emit it.
    f = load(); f.tx.innerInstructions = []; expect(issues(verifyLaunch(expectation(f), f.tx, routing))).toContain('dev_buy_mismatch');
    f = load(); for (const i of f.tx.innerInstructions!) if (i.programId === '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P') i.accounts = [Keypair.generate().publicKey.toBase58()];
    expect(issues(verifyLaunch(expectation(f), f.tx, routing))).toContain('dev_buy_mismatch');
    // A buy that was never prepared is not accepted as a plain launch.
    f = load(); expect(issues(verifyLaunch(expectation(f, null), f.tx, routing))).toContain('unexpected_buy');
  });
});

describe('Developer Buy and token rules through the Launchpad API', () => {
  let env: TestEnv | undefined;
  const origin = 'http://localhost:5173', cid = 'bafkreicnu2aqjkoglrlrd65giwo4l64pdajxffk6jtq2vb7yaiopc3yu7m';
  afterEach(async () => { vi.unstubAllGlobals(); await env?.close(); env = undefined; });
  const session = async (devnet: boolean) => {
    env = await makeEnv({ PINATA_JWT: 'test-only' }); vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { cid } })));
    if (devnet) { env.ctx.config.mode = 'devnet'; env.ctx.config.financialFeaturesEnabled = true; env.ctx.config.pumpLaunch.enabled = true; }
    const creator = Keypair.generate(), nacl = (await import('tweetnacl')).default;
    const ch = (await env.app.inject({ method: 'POST', url: '/api/v1/auth/challenge', headers: { origin }, payload: { wallet: creator.publicKey.toBase58() } })).json();
    const auth = await env.app.inject({ method: 'POST', url: '/api/v1/auth/browser/verify', headers: { origin }, payload: { wallet: creator.publicKey.toBase58(), nonce: ch.nonce, signature: bs58.encode(nacl.sign.detached(new TextEncoder().encode(ch.message), creator.secretKey)) } });
    const cookie = auth.headers['set-cookie']!.toString().split(';')[0]!;
    let n = 0;
    const call = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown) => env!.app.inject({ method, url, headers: { origin, cookie, 'idempotency-key': `devbuy-test-${++n}` }, ...(payload ? { payload: payload as object } : {}) });
    const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#aabb88' } }).png().toBuffer();
    const logo = (id: string, version: number) => env!.app.inject({ method: 'POST', url: `/api/v1/launchpad/drafts/${id}/logo?version=${version}`, headers: { origin, cookie, 'content-type': 'application/octet-stream', 'idempotency-key': `devbuy-logo-${++n}` }, payload: png });
    return { creator, call, logo, chain: env.ctx.chain as MockChain & ChainGateway };
  };
  const supported = (chain: ChainGateway, quote: Partial<DevBuyChainQuote> = {}) => {
    chain.devBuySupport = async () => ({ available: true, reason: null });
    chain.quoteDevBuy = async (bps) => ({ slot: 9, totalSupply: SUPPLY, tokenAmount: devBuyTokenAmount(SUPPLY, bps), capTokenAmount: CAP, estimatedQuoteCost: 10_242_053n, pumpFees: 126_446n, maxQuoteCost: 10_344_474n, priceImpactBps: 685, ...quote });
  };

  it('persists SOL budgets, validates API quotes and blocks invalid purchases before Pinata',async()=>{
    const {call,logo,chain}=await session(true);supported(chain);
    chain.quoteDevBuy=async(_bps,budget)=>({slot:9,totalSupply:SUPPLY,tokenAmount:1_000_000n,capTokenAmount:CAP,estimatedQuoteCost:budget!-1n,pumpFees:1n,maxQuoteCost:budget!,maxAllowedQuoteCost:20_000_000n,priceImpactBps:1});
    let d=(await call('POST','/api/v1/launchpad/drafts',{name:'Budget',symbol:'BGT',devBuySol:'0.001000001'})).json();
    expect((await call('GET',`/api/v1/launchpad/drafts/${d.id}`)).json().fields.devBuySol).toBe('0.001000001');
    const quote=(await call('GET','/api/v1/launchpad/dev-buy-quote?sol=0.001000001')).json();
    expect(quote).toMatchObject({status:'available',budgetLamports:'1000001',maxQuoteCost:'1000001',estimatedQuoteCost:'1000000'});
    for(const sol of ['0','-1','0.0000000001','1e3'])expect((await call('GET',`/api/v1/launchpad/dev-buy-quote?sol=${sol}`)).statusCode).toBe(400);
    expect((await call('GET','/api/v1/launchpad/dev-buy-quote?sol=0.1&bps=1')).statusCode).toBe(400);
    const build=vi.spyOn(chain,'buildLaunchTransaction').mockResolvedValue({transaction:Buffer.alloc(8).toString('base64'),lastValidBlockHeight:100,demo:false,genesisHash:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG',estimatedNetworkFeesLamports:'10000',estimatedAccountRentLamports:'20643360',devBuy:{tokenAmount:'1000000',quoteSpent:'1000000'}});
    d=(await logo(d.id,d.version)).json();d=(await call('POST',`/api/v1/launchpad/drafts/${d.id}/metadata`,{version:d.version})).json();
    const prepared=await call('POST',`/api/v1/launchpad/drafts/${d.id}/launch`,{version:d.version});
    expect(prepared.statusCode,prepared.body).toBe(200);expect(prepared.json().launch.execution.devBuy).toMatchObject({budgetSol:'0.001000001',bps:0,maxQuoteCost:'1000001'});
    expect(build.mock.calls[0]![0].devBuy).toEqual({tokenAmount:1000000n,maxQuoteCost:1000001n});
    vi.mocked(fetch).mockClear();supported(chain,{tokenAmount:CAP+1n});
    const bad=(await call('POST','/api/v1/launchpad/drafts',{name:'Bad',symbol:'BAD',devBuySol:'0.001'})).json();
    expect((await logo(bad.id,bad.version)).statusCode).toBe(400);expect(fetch).not.toHaveBeenCalled();
  });

  it('measures names and symbols in UTF-8 bytes, never trims, and rejects out-of-range Developer Buy values on save', async () => {
    const { call } = await session(false);
    const save = (fields: object) => call('POST', '/api/v1/launchpad/drafts', fields);
    for (const ok of [{ name: 'é'.repeat(16) }, { name: '😀'.repeat(8) }, { name: 'A'.repeat(32), symbol: 'ABCDEFGHIJKLM' }, { name: '  Moss  ' }, { devBuyBps: 350 }, { devBuyBps: 0 }, { devBuyBps: 1 }, { devBuyBps: 275 }])
      expect((await save(ok)).statusCode, JSON.stringify(ok)).toBe(200);
    expect((await save({ name: '  Moss  ' })).json().fields.name).toBe('  Moss  ');
    const rejected: [object, string, string][] = [[{ name: 'é'.repeat(17) }, 'name', 'too_long'], [{ name: 'A'.repeat(33) }, 'name', 'too_long'], [{ symbol: 'ABCDEFGHIJKLMN' }, 'symbol', 'too_long'],
      [{ name: 'Mo\u0000ss' }, 'name', 'control_character'], [{ name: 'Moss\uD800' }, 'name', 'malformed_unicode'], [{ symbol: 'MO SS' }, 'symbol', 'unsupported_character']];
    for (const [fields, field, code] of rejected) {
      const r = await save(fields);
      expect(r.statusCode, JSON.stringify(fields)).toBe(400);
      expect(r.json().error.details).toEqual(expect.arrayContaining([expect.objectContaining({ path: [field], params: { code } })]));
    }
    for (const devBuyBps of [351, -1, 1.5, '100']) expect((await save({ devBuyBps })).statusCode).toBe(400);
  });

  it('stops before any Pinata upload when details, the pair or the Developer Buy are not launch-ready', async () => {
    const { call, logo, chain } = await session(true);
    const attempt = async (fields: object) => { const d = (await call('POST', '/api/v1/launchpad/drafts', { name: 'Moss', symbol: 'MOSS', ...fields })).json(); return logo(d.id, d.version); };
    const cases: [object, string, string][] = [[{ name: ' Moss' }, 'name', 'surrounding_whitespace'], [{ name: '' }, 'name', 'required'], [{ symbol: '' }, 'symbol', 'required'],
      [{ devBuyBps: 350 }, 'devBuyBps', 'dev_buy_unavailable']];
    for (const [fields, field, code] of cases) {
      const r = await attempt(fields);
      expect(r.statusCode, JSON.stringify(fields)).toBe(400);
      expect(r.json().error.details.issues).toEqual(expect.arrayContaining([expect.objectContaining({ field, code })]));
    }
    env!.ctx.config.pumpLaunch.usdcEnabled = true; supported(chain);
    const pair = await call('POST','/api/v1/launchpad/drafts',{name:'Moss',symbol:'MOSS',quoteAsset:'USDC',devBuyBps:100});
    expect(pair.statusCode).toBe(400); // rejected at the write boundary, before creating a draft or uploading
    expect(fetch).not.toHaveBeenCalled();
    expect((await attempt({ devBuyBps: 350 })).statusCode).toBe(200); // now valid: the logo is uploaded
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports availability and quotes; demo deployments never offer a Developer Buy', async () => {
    const { chain } = await session(false);
    const caps = (await env!.app.inject('/api/v1/launchpad/capabilities')).json();
    expect(caps.devBuy).toMatchObject({ status: 'unavailable', maxBps: 350, quoteAssets: ['SOL'] });
    expect((await env!.app.inject('/api/v1/launchpad/dev-buy-quote?bps=100')).json()).toMatchObject({ status: 'unavailable', bps: 100 });
    env!.ctx.config.mode = 'devnet'; env!.ctx.config.pumpLaunch.enabled = true; supported(chain);
    expect((await env!.app.inject('/api/v1/launchpad/capabilities')).json().devBuy).toMatchObject({ status: 'available', reason: null });
    expect((await env!.app.inject('/api/v1/launchpad/dev-buy-quote?bps=350')).json()).toMatchObject({ status: 'available', tokenAmount: '35000000000000', capTokenAmount: '35000000000000', maxQuoteCost: '10344474', priceImpactBps: 685 });
    for (const bps of ['351', '-1', '1.5', 'x']) expect((await env!.app.inject(`/api/v1/launchpad/dev-buy-quote?bps=${bps}`)).statusCode).toBe(400);
  });

  it('prepares the exact capped amount from the server-owned draft and shows the simulated cost', async () => {
    const { call, logo, chain } = await session(true); supported(chain);
    let input: BuildLaunchInput | undefined;
    vi.spyOn(chain, 'buildLaunchTransaction').mockImplementation(async (p) => { input = p; return { transaction: Buffer.alloc(8).toString('base64'), lastValidBlockHeight: 100, demo: false, genesisHash: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', estimatedNetworkFeesLamports: '10000', estimatedAccountRentLamports: '20643360', devBuy: { tokenAmount: '35000000000000', quoteSpent: '10242053' } }; });
    let d = (await call('POST', '/api/v1/launchpad/drafts', { name: 'Moss', symbol: 'MOSS', devBuyBps: 350 })).json();
    d = (await logo(d.id, d.version)).json(); d = (await call('POST', `/api/v1/launchpad/drafts/${d.id}/metadata`, { version: d.version })).json();
    const r = await call('POST', `/api/v1/launchpad/drafts/${d.id}/launch`, { version: d.version });
    expect(r.statusCode, r.body).toBe(200);
    expect(input!.devBuy).toEqual({ tokenAmount: 35_000_000_000_000n, maxQuoteCost: 10_344_474n });
    const { launch } = r.json();
    expect(launch.execution.devBuy).toEqual({ bps: 350, tokenAmount: '35000000000000', maxQuoteCost: '10344474' });
    expect(launch.fees.developerBuy).toEqual({ bps: 350, quoteAsset: 'SOL', totalSupply: '1000000000000000', tokenAmount: '35000000000000', estimatedQuoteCost: '10242053', pumpFees: '126446', maxQuoteCost: '10344474', priceImpactBps: 685 });
    expect(launch.fees.platformLaunchFeeLamports).toBe('50000000');
  });

  it('fails closed when the network quote would exceed the cap', async () => {
    const { call, logo, chain } = await session(true); supported(chain, { tokenAmount: CAP + 1n });
    const build = vi.spyOn(chain, 'buildLaunchTransaction');
    let d = (await call('POST', '/api/v1/launchpad/drafts', { name: 'Moss', symbol: 'MOSS', devBuyBps: 350 })).json();
    d = (await logo(d.id, d.version)).json(); d = (await call('POST', `/api/v1/launchpad/drafts/${d.id}/metadata`, { version: d.version })).json();
    const r = await call('POST', `/api/v1/launchpad/drafts/${d.id}/launch`, { version: d.version });
    expect(r.statusCode).toBe(400);
    expect(build).not.toHaveBeenCalled();
  });
});
