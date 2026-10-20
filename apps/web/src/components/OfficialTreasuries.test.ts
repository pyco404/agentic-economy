import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OFFICIAL_TREASURIES, type OfficialTreasuryWallet } from '../api/shared';
import { OfficialTreasuries } from './OfficialTreasuries';

const wallet: OfficialTreasuryWallet = {
  account: 'agent_rewards', address: OFFICIAL_TREASURIES.agentRewards, network: 'mainnet-beta', identity: 'owner_supplied', source: 'solana_rpc', status: 'available', balanceLamports: '1234567891', slot: 123, updatedAt: '2026-10-20T18:00:00Z', checkedAt: '2026-10-20T18:00:00Z', message: 'Finalized RPC observation', accounting: { coverage: 'deployment_ledger_only', creatorFeesLamports: '600', launchChargesLamports: '0', lifetimeCreatorFeesLamports: null, pendingDistributionsLamports: null }, recentTransactions: [{ signature: '1'.repeat(88), slot: 100, blockTime: 1, failed: false, classification: 'unclassified' }],
};
describe('official wallet transparency (synthetic observations)', () => {
  it('shows official public keys but no deployer; unavailable never becomes a zero balance', () => {
    const html = renderToStaticMarkup(createElement(OfficialTreasuries, {}));
    expect(html).toContain(OFFICIAL_TREASURIES.platform); expect(html).toContain(OFFICIAL_TREASURIES.agentRewards); expect(html).not.toContain(OFFICIAL_TREASURIES.aecoDeployer);
    expect(html).toContain('Unavailable'); expect(html).not.toContain('0.0 SOL'); expect(html).toContain('Mainnet'); expect(html).toContain('payouts remain disabled');
  });
  it('renders exact balances, separately verified income and honest history coverage', () => {
    const html = renderToStaticMarkup(createElement(OfficialTreasuries, { wallets: [wallet] }));
    expect(html).toContain('1.234567891 SOL'); expect(html).toContain('0.0000006 SOL'); expect(html).toContain('Unclassified transaction'); expect(html).toContain('Lifetime eligible fees'); expect(html).toContain('Unavailable');
    expect(html).toContain('https://explorer.solana.com/address/'); expect(html).not.toContain('cluster=devnet'); expect(html).toContain('finalized slot 123');
  });
  it('rejects a wrong-network or mismatched-address observation in the public wallet section', () => {
    const html = renderToStaticMarkup(createElement(OfficialTreasuries, { wallets: [{ ...wallet, address: OFFICIAL_TREASURIES.aecoDeployer }] }));
    expect(html).not.toContain('1.234567891 SOL'); expect(html).not.toContain(OFFICIAL_TREASURIES.aecoDeployer);
  });
});
