import { describe, expect, it } from 'vitest';
import { demoDashboard } from './adapter';
import { activityCategory, cityPopulation } from './activityPresentation';
import { displayActivity } from './agentIdentity';
import { officialToken } from '../content/project';

describe('public activity provenance', () => {
  it('never promotes virtual trades, work receipts or holder-linked actions to paid/on-chain work', () => {
    const d = demoDashboard();
    for (const type of ['trade.executed', 'task.verified', 'social.encounter', 'agent.activated'] as const) {
      expect(activityCategory({ ...d.activities[0]!, type }, d.communities, 'production').label).toBe('City World');
    }
  });
  it('requires matched registry mint, signature and network; demo evidence never becomes on-chain', () => {
    const d = demoDashboard(), c = { ...d.communities[0]!, provenance: { platformOrigin: 'PLATFORM', initiator: 'HUMAN', network: 'mainnet-beta', quoteAsset: 'SOL' } as const };
    const event = { ...d.activities[0]!, type: 'launch.confirmed' as const, communityId: c.id, data: { mint: c.mint, signature: c.launchSignature } };
    expect(activityCategory(event, [c], 'production')).toMatchObject({ label: 'On-chain', detail: expect.stringContaining('Mainnet') });
    expect(activityCategory(event, [c], 'demo').label).toBe('Demo record');
    expect(activityCategory(event, [{ ...c, provenance: undefined }], 'production').label).toBe('Verification pending');
    expect(activityCategory({ ...event, data: { ...event.data, signature: 'different' } }, [c], 'production').label).toBe('Verification pending');
    expect(activityCategory({ ...event, data: { ...event.data, mint: 'different' } }, [c], 'production').label).toBe('Verification pending');
    expect(activityCategory(event, [{ ...c, provenance: { ...c.provenance, network: 'devnet' } }], 'devnet').detail).toContain('test network');
  });
  it('separates verified zero holders, missing indexing, Common Agents and virtual household residents', () => {
    const stats = { ...demoDashboard().stats, mode: 'production' as const, population: 850, activeAgents: 42,
      aecoPopulation: { status: 'current' as const, mint: officialToken.mint, network: 'mainnet-beta' as const,
        holders: 0, commonAgents: 33, indexedSlot: 123, checkedAt: '2026-10-23T00:00:00Z' } };
    expect(cityPopulation(stats)).toEqual({ holders: 0, commonAgents: 33, cityGroupResidents: stats.simulation?.groups.reduce((n, group) => n + group.activeAgents, 0) ?? null, virtualResidents: 850, stale: false });
    expect(cityPopulation({ ...stats, aecoPopulation: { ...stats.aecoPopulation, status: 'syncing' } }).holders).toBeNull();
    expect(cityPopulation({ ...stats, aecoPopulation: { ...stats.aecoPopulation, mint: 'other' } }).holders).toBeNull();
    expect(cityPopulation({ ...stats, aecoPopulation: { ...stats.aecoPopulation, status: 'stale' } }).stale).toBe(true);
    expect(cityPopulation({ ...stats, mode: 'demo' }).holders).toBeNull();
    expect(cityPopulation({ ...stats, aecoPopulation: { ...stats.aecoPopulation, status: 'syncing' } }).commonAgents).toBeNull();
  });
  it('formats work templates without claiming an available shift has started or altering stored evidence', () => {
    const d = demoDashboard(), a = d.agents[0]!;
    const event = { summary: 'production shift posted: Hearth Bakery', agentId: null, type: 'task.created' as const };
    expect(displayActivity(event, [])).toBe('Work shift available: Hearth Bakery');
    expect(event.summary).toBe('production shift posted: Hearth Bakery');
    expect(displayActivity({ ...event, type: 'task.verified', agentId: a.id, summary: `${a.name} completed production shift for Hearth Bakery` }, [a])).toContain('completed a work shift at Hearth Bakery');
    expect(displayActivity({ ...event, type: 'social.encounter', summary: 'A production shift posted: is discussed.' }, [])).toBe('A production shift posted: is discussed.');
    expect(displayActivity({ ...event, type: 'launch.confirmed', summary: 'production shift posted: ($SHIFT) launched on Agentic Economy.' }, [])).toContain('production shift posted:');
  });
});
