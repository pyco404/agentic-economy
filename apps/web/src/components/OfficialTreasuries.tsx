import { OFFICIAL_TREASURIES, type OfficialTreasuryWallet } from '../api/shared';

const sol = (value: string | null | undefined) => {
  if (value == null) return 'Unavailable';
  const digits = value.padStart(10, '0');
  return `${digits.slice(0, -9)}.${digits.slice(-9).replace(/0+$/, '') || '0'} SOL`;
};

/** Official wallet observations remain separate from the city's simulated ledger. */
export function OfficialTreasuries({ wallets }: { wallets?: OfficialTreasuryWallet[] }) {
  return <section aria-label="Official treasury wallets">
    <h2>Official treasury wallets</h2>
    <p className="small muted">Mainnet · read-only tracking. Addresses supplied by the platform owner; an RPC balance does not establish wallet ownership. Launching, fee claims and payouts remain disabled.</p>
    <div className="two-column">
      {(['agent_rewards', 'platform'] as const).map(account => {
        const wallet = wallets?.find(w => w.account === account);
        const address = account === 'platform' ? OFFICIAL_TREASURIES.platform : OFFICIAL_TREASURIES.agentRewards;
        const valid = wallet?.address === address && wallet.network === 'mainnet-beta';
        const observed = valid ? wallet : undefined;
        return <section className="surface" style={{ minWidth: 0 }} key={account} aria-label={account === 'platform' ? 'Platform Treasury' : 'Agent Rewards Treasury'}>
          <h3>{account === 'platform' ? 'Platform Treasury' : 'Agent Rewards Treasury'}</h3>
          <p className="small">{account === 'platform' ? '40% of eligible human-launch creator fees; 100% of the separate 0.05 SOL launch charge.' : '60% of eligible human-launch creator fees. No reward payouts are enabled.'}</p>
          <p className="ui-select-text" style={{ overflowWrap: 'anywhere' }}><a href={`https://explorer.solana.com/address/${address}`} target="_blank" rel="noreferrer">{address}</a></p>
          <dl className="compact-list">
            <div><dt>Finalized wallet balance</dt><dd>{sol(observed?.balanceLamports)}</dd></div>
            <div><dt>Verified creator fees recorded</dt><dd>{sol(observed?.accounting.creatorFeesLamports)}</dd></div>
            {account === 'platform' && <><div><dt>Verified launch charges recorded</dt><dd>{sol(observed?.accounting.launchChargesLamports)}</dd></div><div><dt>Other transfer totals</dt><dd>Unavailable</dd></div></>}
            <div><dt>Lifetime eligible fees collected</dt><dd>{sol(observed?.accounting.lifetimeCreatorFeesLamports)}</dd></div>
            <div><dt>Unclaimed distributions</dt><dd>{sol(observed?.accounting.pendingDistributionsLamports)}</dd></div>
          </dl>
          <p className="small muted">{observed?.message ?? 'Verified Mainnet monitoring is unavailable on this deployment.'}</p>
          <p className="small muted">Recorded revenue covers verified receipts in this deployment only. Other transfers and wallet balances are not classified as creator-fee income.</p>
          <p className="small muted">Last balance update: {observed?.updatedAt ? <time dateTime={observed.updatedAt}>{new Date(observed.updatedAt).toLocaleString()}</time> : 'Unavailable'}{observed?.slot != null ? ` · finalized slot ${observed.slot}` : ''}</p>
          <details><summary>Recent Mainnet transactions</summary>
            {observed?.recentTransactions.length ? <ul className="ui-select-text">{observed.recentTransactions.map(tx => <li key={tx.signature} style={{ overflowWrap: 'anywhere' }}>
              <a href={`https://explorer.solana.com/tx/${tx.signature}`} target="_blank" rel="noreferrer">{tx.signature.slice(0, 10)}…{tx.signature.slice(-8)}</a> · {tx.failed ? 'Failed' : tx.classification === 'verified_creator_fee' ? 'Verified creator-fee receipt' : tx.classification === 'verified_launch_charge' ? 'Verified launch charge' : 'Unclassified transaction'}{tx.direction?` · ${tx.direction} wallet balance change`:''} · slot {tx.slot}
            </li>)}</ul> : <p className="small muted">{observed?.status === 'available' ? 'No recent transactions returned, or transaction history unavailable.' : 'Transaction history unavailable.'}</p>}
          </details>
        </section>;
      })}
    </div>
  </section>;
}
