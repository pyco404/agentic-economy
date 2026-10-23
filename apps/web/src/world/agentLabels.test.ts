import { describe, expect, it } from 'vitest';
import { agentLabelName, chooseAgentLabels, uniqueAgentLabelNames, fullAgentIdentity, type LabelCandidate } from './agentLabels';
const agent = (id: string, x = 200, y = 200): LabelCandidate => ({ id, name: id, x: 0, z: 0, state: 'idle', screenX: x, screenY: y });

describe('authoritative city labels', () => {
  it('uses canonical IDs when identity is missing, never a made-up name or an unverified owner', () => {
    expect(agentLabelName({ id: 'agt_missing', name: 'Agent', ownerWallet: 'CMYx1234566Wec' })).toBe('agt_missing');
  });
  it('preserves existing resident names and validated backend wallet expansions', () => {
    expect(agentLabelName({ id: 'agt_house', name: 'old', identity: { kind: 'house', syntheticName: 'Fern_108' } })).toBe('Fern_108');
    const wallet = 'CMYxA' + '1'.repeat(23) + 'B6Wec';
    const identity = { kind: 'aeco_observed' as const, wallet, tokenMint: '1'.repeat(32), network: 'mainnet-beta' as const, balanceRaw: '1', decimals: 6, observedSlot: 1 };
    expect(agentLabelName({ id: 'agt_common', name: 'Common Agent', displayName: 'CMYxA...B6Wec', identity })).toBe('CMYxA...B6Wec');
    expect(agentLabelName({ id: 'agt_common', name: 'Common Agent', displayName: 'Fake...Name', identity })).toBe('CMYx...6Wec');
    expect(fullAgentIdentity({ ...agent('agt_common'), identity })).toContain(wallet);
  });
  it('resolves colliding wallet abbreviations and resident names without changing an existing label', () => {
    const common = (id: string, middle: string) => ({ ...agent(id), identity: { kind: 'aeco_observed' as const, wallet: `ABCD${middle.repeat(24)}WXYZ`, tokenMint: '1'.repeat(32), network: 'mainnet-beta' as const, balanceRaw: '1', decimals: 6, observedSlot: 1 } });
    const a = common('agt_z', '1'), b = common('agt_a', '2'), names = uniqueAgentLabelNames([a]);
    const before = names.get(a.id); uniqueAgentLabelNames([b, a], names);
    expect(names.get(a.id)).toBe(before); expect(names.get(b.id)).not.toBe(before);
    const saved = new Map(names); uniqueAgentLabelNames([a, b].reverse(), names); expect(names).toEqual(saved);
    const residents = [1, 2].map(n => ({ ...agent(`agt_resident${n}`), identity: { kind: 'house' as const, syntheticName: 'Fern_108' } }));
    expect(new Set(uniqueAgentLabelNames(residents).values()).size).toBe(2);
  });
  it('keeps a useful distant sample and prioritizes hovered/selected agents', () => {
    const result = chooseAgentLabels([agent('ordinary', 600), { ...agent('selected'), selected: true }, { ...agent('hovered', 450), hovered: true }], .5, 1000, 800);
    expect(result[0]!.id).toBe('hovered'); expect(result.some(a => a.id === 'selected')).toBe(true);
    expect(result.length).toBeLessThanOrEqual(6);
  });
  it('labels all 65 well-spaced close agents and bounds dense/far scenes', () => {
    const agents = Array.from({ length: 65 }, (_, i) => agent(`agt_${i}`, 90 + i % 8 * 165, 100 + Math.floor(i / 8) * 80));
    expect(chooseAgentLabels(agents, 5, 1440, 1000)).toHaveLength(65);
    expect(chooseAgentLabels(agents, 2, 1440, 1000).length).toBeLessThanOrEqual(32);
    const packed = chooseAgentLabels(agents.map(a => ({ ...a, screenX: 300, screenY: 300 })), 5, 800, 600);
    expect(packed.length).toBeLessThan(8);
    for (const a of packed) for (const b of packed) if (a.id !== b.id) expect(Math.abs(a.labelX - b.labelX) >= (a.width + b.width) / 2 || Math.abs(a.labelY - b.labelY) >= Math.max(a.height, b.height)).toBe(true);
    expect(chooseAgentLabels([agent('outside', -50)], 5, 800, 600)).toHaveLength(0);
  });
  it('avoids UI and speech bounds, repositions close labels and keeps mobile focus within the viewport', () => {
    const a = { ...agent('agt_focused', 20, 30), hovered: true };
    const [focused] = chooseAgentLabels([a], 5, 344, 700);
    expect(focused).toBeDefined(); expect(focused!.labelX - focused!.width / 2).toBeGreaterThanOrEqual(0);
    expect(focused!.labelY - focused!.height).toBeGreaterThanOrEqual(0);
    expect(chooseAgentLabels([agent('blocked')], 2, 800, 600, [{ left: 100, top: 100, width: 300, height: 300 }])).toHaveLength(0);
    const crowded = chooseAgentLabels([agent('first'), agent('second', 205)], 5, 800, 600);
    expect(crowded).toHaveLength(2); expect(crowded[1]!.labelY).not.toBe(crowded[0]!.labelY);
  });
});
