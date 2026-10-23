import {PublicKey as SolanaKey} from '@solana/web3.js';
import sdk from './pump-sdk.cjs';
import WebSocket from 'ws';
import { z } from 'zod';
import { PublicKey } from '@agentic-economy/shared';
import { bondingCurvePda } from './pump.js';

export const HELIUS_GENESIS = { 'mainnet-beta': '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d', devnet: 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG' } as const;
const READS = new Set(['getGenesisHash', 'getBalance', 'getSignaturesForAddress', 'getTransaction', 'getSignatureStatuses', 'getMultipleAccounts', 'getAccountInfo', 'getSlot', 'getBlockTime', 'getBlock', 'getTokenAccounts', 'getAsset', 'getProgramAccounts']);
export class HeliusReadError extends Error {
  constructor(readonly code: 'unavailable' | 'rate_limited' | 'unsupported' | 'unauthorized' | 'wrong_network' | 'budget') { super(`Helius read ${code.replaceAll('_', ' ')}`); }
}

/** Conservative per-process budget, shared across networks. Never upgrades a plan or enables overages.
 * These counters are not an account-wide billing cap; configure provider-side usage alerts too.
 */
export class HeliusReadBudget {
  private tail: Promise<unknown> = Promise.resolve();
  private queued = 0; private last = 0; private cooldown = 0;
  private usage: Array<{ at: number; cost: number }> = [];
  constructor(private now = () => Date.now(), private sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))) {}
  pause(ms: number) { this.cooldown = Math.max(this.cooldown, this.now() + Math.min(60_000, Math.max(500, ms))); }
  run<T>(cost: number, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (this.queued >= 8) return Promise.reject(new HeliusReadError('budget'));
    this.queued++;
    const result = this.tail.then(async () => {
      if (signal?.aborted) throw new HeliusReadError('unavailable');
      if (this.now() < this.cooldown) throw new HeliusReadError('rate_limited');
      const wait = 500 - (this.now() - this.last); if (wait > 0) await this.sleep(wait);
      if (signal?.aborted) throw new HeliusReadError('unavailable');
      const now = this.now(); this.usage = this.usage.filter(e => now - e.at < 86_400_000);
      for (const [window, max] of [[60_000, 120], [3_600_000, 1000], [86_400_000, 10_000]])
        if (this.usage.filter(e => now - e.at < window!).reduce((sum, e) => sum + e.cost, 0) + cost > max!) throw new HeliusReadError('budget');
      this.last = now; this.usage.push({ at: now, cost }); return work();
    }).finally(() => { this.queued--; });
    this.tail = result.catch(() => undefined); return result;
  }
}
const safeInteger = z.number().int().nonnegative().safe();
const amount = z.union([z.string().regex(/^\d+$/), safeInteger]).transform(value => BigInt(value));
const accountPage = z.object({ last_indexed_slot: safeInteger, cursor: z.string().max(2048).nullish(), token_accounts: z.array(z.object({ address: PublicKey, mint: PublicKey, owner: PublicKey, amount })).max(1000) });
export interface HeliusHolderObservation {
  slot: number; holders: number | null; exact: boolean;
  index: { source: 'helius_das'; indexedSlot: number; fetchedAt: string; complete: boolean; scannedAccounts: number; owners: Array<{ address: string; amount: string }>; reason: string | null };
}

/** Fixed endpoints + read allowlist. Credentials never leave this backend adapter.
 * No raw provider message, URL, response error body or fetch cause is propagated.
 */
export class HeliusReader {
  #url: string;
  private verifiedUntil = 0; private verification: Promise<void> | undefined;
  private holders = new Map<string, { at: number; value: HeliusHolderObservation }>();
  private holderJobs = new Map<string, Promise<HeliusHolderObservation>>();
  private assets = new Map<string, { at: number; value: IndexedMetadata | null }>();
  constructor(key: string, readonly network: keyof typeof HELIUS_GENESIS, private budget: HeliusReadBudget, private request: typeof fetch = fetch, private now = () => Date.now()) {
    this.#url = `https://${network === 'devnet' ? 'devnet' : 'mainnet'}.helius-rpc.com/?api-key=${encodeURIComponent(key)}`;
  }
  private async raw(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!READS.has(method)) throw new HeliusReadError('unsupported');
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await this.budget.run(['getTokenAccounts', 'getAsset', 'getProgramAccounts'].includes(method) ? 10 : 1, async () => {
          let response: Response;
          try { response = await this.request(this.#url, { method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'aeco-read', method, params }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) }); }
          catch { throw new HeliusReadError('unavailable'); }
          if (response.status === 401 || response.status === 403) throw new HeliusReadError('unauthorized');
          if (response.status === 429) { this.budget.pause(Number(response.headers.get('retry-after') ?? 1) * 1000); throw new HeliusReadError('rate_limited'); }
          if (!response.ok) throw new HeliusReadError('unavailable');
          let body: { result?: unknown; error?: { code?: number } };
          try { const text = await response.text(); if (text.length > (method === 'getProgramAccounts' ? 16_000_000 : 4_000_000)) throw new Error(); body = JSON.parse(text); } catch { throw new HeliusReadError('unavailable'); }
          if (body.error) {
            if (body.error.code === -32601 || body.error.code === -32003) throw new HeliusReadError('unsupported');
            if (body.error.code === -32001) throw new HeliusReadError('unauthorized');
            if (body.error.code === -32029) { this.budget.pause(1000); throw new HeliusReadError('rate_limited'); }
            throw new HeliusReadError('unavailable');
          }
          if (!Object.hasOwn(body, 'result')) throw new HeliusReadError('unavailable');
          return body.result;
        }, signal);
      } catch (e) {
        // One bounded retry for transient transport/server failures. 429 opens a cooldown instead of a retry storm.
        if (attempt || !(e instanceof HeliusReadError) || e.code !== 'unavailable' || signal?.aborted) throw e instanceof HeliusReadError ? e : new HeliusReadError('unavailable');
      }
    }
    throw new HeliusReadError('unavailable');
  }
  async rpc(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!READS.has(method)) throw new HeliusReadError('unsupported');
    if (this.now() >= this.verifiedUntil) {
      this.verification ??= this.raw('getGenesisHash', [], signal).then(hash => {
        if (hash !== HELIUS_GENESIS[this.network]) throw new HeliusReadError('wrong_network');
        this.verifiedUntil = this.now() + 30_000;
      }).finally(() => { this.verification = undefined; });
      await this.verification;
    }
    if (method === 'getGenesisHash') return HELIUS_GENESIS[this.network];
    return this.raw(method, params, signal);
  }
  /** Finalized change notifications are hints only. Balances always come from a complete RPC
   * reconciliation. Unsupported subscriptions fall back to polling; no secret URL is logged. */
  watchTokenAccounts(mint: string, onChange: () => void, signal: AbortSignal, openSocket = (url: string) => new WebSocket(url, { handshakeTimeout: 10_000, maxPayload: 1_000_000 })): () => void {
    PublicKey.parse(mint);
    let socket: WebSocket | undefined;
    let timer: NodeJS.Timeout | undefined;
    let stopped = false;
    const stop = () => { stopped = true; if (timer) clearTimeout(timer); if (socket) { socket.removeAllListeners('close'); socket.close(); } signal.removeEventListener('abort', stop); };
    const connect = async () => {
      if (stopped || signal.aborted) return;
      try {
        await this.rpc('getGenesisHash', [], signal);
        if (stopped || signal.aborted) return;
        socket = openSocket(this.#url.replace(/^https:/, 'wss:'));
        socket.on('error', () => undefined);
        socket.on('open', () => {
          ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'].forEach((program, id) => socket?.send(JSON.stringify({ jsonrpc: '2.0', id: id + 1, method: 'programSubscribe', params: [program, { encoding: 'base64', commitment: 'finalized', filters: [{ memcmp: { offset: 0, bytes: mint } }] }] })));
        });
        socket.on('message', raw => {
          try {
            const body = JSON.parse(String(raw));
            if (body.error) { stop(); return; }
            if (body.method === 'programNotification' && Number.isSafeInteger(body.params?.result?.context?.slot)) onChange();
          } catch { /* Malformed hints cannot mutate holdings. */ }
        });
        socket.on('close', () => { if (!stopped && !signal.aborted) timer = setTimeout(() => void connect(), 30_000); });
      } catch { if (!stopped && !signal.aborted) timer = setTimeout(() => void connect(), 30_000); }
    };
    signal.addEventListener('abort', stop, { once: true });
    void connect();
    return stop;
  }
  /** Inject into web3.js with a non-secret placeholder URL; preserve JSON-RPC ids and batching. */
  readonly fetch: typeof fetch = async (_url, init) => {
    try {
      const body = JSON.parse(String(init?.body)); const batch = Array.isArray(body) ? body : [body];
      if (batch.length > 20) throw new HeliusReadError('budget');
      const results = [];
      for (const entry of batch) results.push({ jsonrpc: '2.0', id: entry.id, result: await this.rpc(entry.method, entry.params, init?.signal ?? undefined) });
      return Response.json(Array.isArray(body) ? results : results[0]);
    } catch (e) { throw e instanceof HeliusReadError ? e : new HeliusReadError('unavailable'); }
  };
  /** Treasury-only fallback to its existing read endpoint; every fallback verifies the same genesis. */
  withFallback(url: string | null, request: typeof fetch = fetch): typeof fetch {
    let verifiedUntil = 0;
    return async (input, init) => {
      try { return await this.fetch(input, init); } catch {
        if (!url || init?.signal?.aborted) throw new HeliusReadError('unavailable');
        try {
          const body = JSON.parse(String(init?.body));
          if (Array.isArray(body) || !['getGenesisHash','getBalance','getSignaturesForAddress','getTransaction'].includes(body.method)) throw new Error();
          const read = async (payload: unknown) => {
            const response = await request(url, { ...init, method:'POST',redirect:'error',body:JSON.stringify(payload),signal:init?.signal ? AbortSignal.any([init.signal,AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
            if (!response.ok) throw new Error(); const value = z.object({result:z.unknown().optional(),error:z.unknown().optional()}).parse(await response.json()); if (value.error) throw new Error(); return value;
          };
          if (this.now() >= verifiedUntil) {
            const check = await read({ jsonrpc:'2.0',id:'fallback-check',method:'getGenesisHash',params:[] });
            if (check.result !== HELIUS_GENESIS[this.network]) throw new Error(); verifiedUntil = this.now() + 30_000;
          }
          return Response.json(await read(body));
        } catch { throw new HeliusReadError('unavailable'); }
      }
    };
  }
  async holderCount(mint: string): Promise<HeliusHolderObservation> {
    PublicKey.parse(mint);
    const old = this.holders.get(mint); if (old && this.now() - old.at < 60_000) return old.value;
    const job = this.holderJobs.get(mint); if (job) return job;
    const next = this.scanHolders(mint).then(value => { if (this.holders.size >= 100) this.holders.delete(this.holders.keys().next().value!); this.holders.set(mint, { at: this.now(), value }); return value; }).finally(() => this.holderJobs.delete(mint));
    this.holderJobs.set(mint, next); return next;
  }
  private async scanHolders(mint: string): Promise<HeliusHolderObservation> {
    const accounts = new Map<string, { owner: string; amount: bigint }>(), cursors = new Set<string>();
    let cursor: string | undefined, slot: number | undefined, consistent = true, complete = false, reason: string | null = null;
    for (let page = 0; page < 5; page++) {
      let result: z.infer<typeof accountPage>;
      try { result = accountPage.parse(await this.rpc('getTokenAccounts', { mint, limit: 1000, ...(cursor ? { cursor } : {}), options: { showZeroBalance: false } })); }
      catch (e) { if (slot === undefined) throw e instanceof HeliusReadError ? e : new HeliusReadError('unavailable'); reason = 'Index page unavailable; count is a lower bound.'; break; }
      // An empty terminal page contains no balances and cannot contradict the prior snapshot.
      if (result.token_accounts.length && slot !== undefined && result.last_indexed_slot !== slot) consistent = false;
      slot = slot === undefined ? result.last_indexed_slot : Math.min(slot, result.last_indexed_slot);
      for (const account of result.token_accounts) {
        if (account.mint !== mint) throw new HeliusReadError('unavailable');
        const previous = accounts.get(account.address);
        if (previous && (previous.owner !== account.owner || previous.amount !== account.amount)) consistent = false;
        accounts.set(account.address, { owner: account.owner, amount: account.amount });
      }
      if (!result.token_accounts.length || (!result.cursor && result.token_accounts.length < 1000)) { complete = true; break; }
      if (!result.cursor || cursors.has(result.cursor)) { reason = 'Index cursor did not advance; count is a lower bound.'; break; }
      cursor = result.cursor; cursors.add(cursor);
    }
    const owners = new Map<string, bigint>();
    const reserves=new Set([bondingCurvePda(mint),sdk.canonicalPumpPoolPda(new SolanaKey(mint)).toBase58()]);
    for (const account of accounts.values()) if (account.amount > 0n && !reserves.has(account.owner)) owners.set(account.owner, (owners.get(account.owner) ?? 0n) + account.amount);
    // DAS does not promise a pinned snapshot across pages. Never call a changing/mixed-slot scan exact.
    const exact = complete && consistent;
    if (!consistent) reason = 'Index changed during enumeration; no current holder count is claimed.';
    else if (!exact) reason ??= 'Index scan budget reached; count is a lower bound.';
    return { slot: slot ?? 0, holders: consistent ? owners.size : null, exact, index: { source: 'helius_das', indexedSlot: slot ?? 0, fetchedAt: new Date(this.now()).toISOString(), complete: exact, scannedAccounts: accounts.size, owners: [...owners].sort(([a], [b]) => a.localeCompare(b)).slice(0, 25).map(([address, value]) => ({ address, amount: value.toString() })), reason } };
  }
  async metadata(mint: string): Promise<IndexedMetadata | null> {
    const old = this.assets.get(mint); if (old && this.now() - old.at < 300_000) return old.value;
    let value: IndexedMetadata | null = null;
    try {
      const result = z.object({ id: PublicKey, content: z.object({ json_uri: z.string().max(2048).optional(), metadata: z.object({ name: z.string().max(256).optional(), symbol: z.string().max(64).optional() }).optional() }).optional() }).parse(await this.rpc('getAsset', { id: PublicKey.parse(mint) }));
      if (result.id === mint) value = { source: 'helius_das', mint, name: result.content?.metadata?.name ?? null, symbol: result.content?.metadata?.symbol ?? null, fetchedAt: new Date(this.now()).toISOString() };
    } catch { /* Optional index metadata must not replace saved launch metadata or block other metrics. */ }
    if (this.assets.size >= 200) this.assets.delete(this.assets.keys().next().value!);
    this.assets.set(mint, { at: this.now(), value }); return value;
  }
}
export interface IndexedMetadata { source: 'helius_das'; mint: string; name: string | null; symbol: string | null; fetchedAt: string }
