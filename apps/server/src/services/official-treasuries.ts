import { z } from 'zod';
import { OFFICIAL_TREASURIES, OfficialTreasuryWallet, TxSignature, WRAPPED_SOL_MINT, type TreasuryEntry } from '@agentic-economy/shared';

const MAINNET_GENESIS = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
const integer = z.number().int().nonnegative().safe();
const balanceResult = z.object({ context: z.object({ slot: integer }), value: integer });
const signaturesResult = z.array(z.object({ signature: TxSignature, slot: integer, blockTime: z.number().int().nullable(), err: z.unknown() })).max(12);

/** Public read-only monitoring. Never signs, broadcasts, claims fees or writes ledger entries.
 * A wallet balance/transfer is NOT proof of eligible creator-fee revenue or wallet ownership.
 */
export class OfficialTreasuryMonitor {
  private cached: { at: number; wallets: OfficialTreasuryWallet[] } | undefined;
  private pending: Promise<OfficialTreasuryWallet[]> | undefined;
  constructor(private readonly rpcUrl: string | null, private readonly request: typeof fetch = fetch, private readonly now: () => Date = () => new Date()) {}

  private async rpc(method: 'getGenesisHash' | 'getBalance' | 'getSignaturesForAddress', params: unknown[]) {
    const response = await this.request(this.rpcUrl!, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(5000),
    });
    // RPC URLs/provider error text can contain credentials. Never expose them to clients or logs.
    if (!response.ok) throw new Error('Treasury RPC unavailable');
    const body = z.object({ result: z.unknown().optional(), error: z.unknown().optional() }).parse(await response.json());
    if (body.error || body.result === undefined) throw new Error('Treasury RPC rejected read');
    return body.result;
  }

  private async snapshot(): Promise<OfficialTreasuryWallet[]> {
    const checkedAt = this.now().toISOString();
    const wallets = ([['platform', OFFICIAL_TREASURIES.platform], ['agent_rewards', OFFICIAL_TREASURIES.agentRewards]] as const).map(([account, address]): OfficialTreasuryWallet => ({
      account, address, network: 'mainnet-beta', identity: 'owner_supplied', source: 'solana_rpc', status: 'unavailable', balanceLamports: null, slot: null, updatedAt: null, checkedAt,
      message: this.rpcUrl ? 'Verified Mainnet wallet data is temporarily unavailable.' : 'Read-only Mainnet RPC is not configured.',
      accounting: { coverage: 'deployment_ledger_only', creatorFeesLamports: '0', launchChargesLamports: '0', lifetimeCreatorFeesLamports: null, pendingDistributionsLamports: null }, recentTransactions: [],
    }));
    if (!this.rpcUrl) return wallets;
    try {
      if (await this.rpc('getGenesisHash', []) !== MAINNET_GENESIS) throw new Error('Wrong treasury monitoring network');
    } catch { return wallets; }
    return Promise.all(wallets.map(async wallet => {
      // Independent responses: a history-provider failure must not invent a zero balance or discard a valid balance.
      const [balance, history] = await Promise.allSettled([
        this.rpc('getBalance', [wallet.address, { commitment: 'finalized' }]).then(value => balanceResult.parse(value)),
        this.rpc('getSignaturesForAddress', [wallet.address, { commitment: 'finalized', limit: 12 }]).then(value => signaturesResult.parse(value)),
      ]);
      if (balance.status === 'fulfilled') Object.assign(wallet, { status: 'available', balanceLamports: BigInt(balance.value.value).toString(), slot: balance.value.context.slot, updatedAt: checkedAt });
      if (history.status === 'fulfilled') wallet.recentTransactions = history.value.map(tx => ({ signature: tx.signature, slot: tx.slot, blockTime: tx.blockTime, failed: tx.err !== null, classification: 'unclassified' }));
      wallet.message = balance.status === 'fulfilled'
        ? `Finalized Mainnet RPC balance. ${history.status === 'fulfilled' ? 'Recent transactions are not automatically creator-fee income.' : 'Recent transaction history is unavailable.'} Lifetime fee history and unclaimed distributions are not fully indexed.`
        : 'Verified Mainnet balance is unavailable; no zero balance is assumed.';
      return OfficialTreasuryWallet.parse(wallet);
    }));
  }

  async read(entries: TreasuryEntry[]): Promise<OfficialTreasuryWallet[]> {
    if (!this.cached || this.now().getTime() - this.cached.at >= 60_000) {
      this.pending ??= this.snapshot().then(wallets => { this.cached = { at: this.now().getTime(), wallets }; return wallets; }).finally(() => { this.pending = undefined; });
      await this.pending;
    }
    const superseded = new Set(entries.flatMap(e => e.supersedes ? [e.supersedes] : []));
    return this.cached!.wallets.map(wallet => {
      const eligible = entries.filter(e => !superseded.has(e.id) && e.accountAddress === wallet.address && e.account === wallet.account && e.assetMint === WRAPPED_SOL_MINT && e.decimals === 9 && e.direction === 'credit' && e.finality === 'finalized' && e.evidence?.source === 'solana_rpc' && e.evidence.network === 'mainnet-beta');
      // Duplicate proof keys must never inflate revenue, even in a malformed snapshot.
      const unique = [...new Map(eligible.map(e => [`${e.signature}:${e.instructionIndex}:${e.account}:${e.stream}`, e])).values()];
      const sum = (stream: TreasuryEntry['stream']) => unique.filter(e => e.stream === stream).reduce((total, e) => total + BigInt(e.amount), 0n).toString();
      return { ...wallet, accounting: { ...wallet.accounting, creatorFeesLamports: sum('creator_fee'), launchChargesLamports: sum('launch_fee') }, recentTransactions: wallet.recentTransactions.map(tx => ({ ...tx, classification: tx.failed ? 'unclassified' as const : unique.some(e => e.signature === tx.signature && e.stream === 'creator_fee') ? 'verified_creator_fee' as const : unique.some(e => e.signature === tx.signature && e.stream === 'launch_fee') ? 'verified_launch_charge' as const : 'unclassified' as const })) };
    });
  }
}
