import { describe, expect, it } from 'vitest';
import { agentLabelName, chooseAgentLabels, uniqueAgentLabelNames, fullAgentIdentity, type LabelOffset, type LabelCandidate } from './agentLabels';
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
  it('keeps all crowded identities, including ordinary, hovered and selected agents', () => {
    const agents = Array.from({ length: 512 }, (_, i) => ({ ...agent(`agt_${i}`, 300, 300), hovered: i === 3, selected: i === 7 }));
    const placed = chooseAgentLabels(agents, 800, 600);
    expect(placed).toHaveLength(512);
    expect(new Set(placed.map(a => a.id)).size).toBe(512);
    expect(new Set(placed.map(a => a.labelY)).size).toBeGreaterThan(1);
  });
  it('retains offsets across motion, reordered input, priorities, viewport changes and temporary overlaps', () => {
    const agents = [agent('first'), agent('second', 205)], remembered = new Map<string, LabelOffset>();
    chooseAgentLabels(agents, 800, 600, [], remembered);
    const original = new Map(remembered);
    for (let frame = 0; frame < 100; frame++) {
      const placed = chooseAgentLabels(agents.map((a, i) => ({ ...a, screenX: a.screenX + frame * .1,
        screenY: a.screenY + frame * .05, selected: i === frame % 2 })).reverse(), frame % 2 ? 800 : 344, 600,
        [{ left: 0, top: 0, width: 800, height: 600 }], remembered);
      expect(placed).toHaveLength(2); expect(remembered).toEqual(original);
    }
  });
  it('keeps labels at every edge while any part of the body remains on screen', () => {
    const edge = (id: string, x: number, y: number, left: number, top: number): LabelCandidate =>
      ({ ...agent(id, x, y), screenBounds: { left, top, width: 16, height: 16 } });
    const agents = [edge('left', -5, 200, -8, 192), edge('right', 805, 200, 792, 192),
      edge('top', 200, -15, 192, -8), edge('bottom', 200, 605, 192, 592), edge('outside', -40, 200, -48, 192)];
    const placed = chooseAgentLabels(agents, 800, 600);
    expect(placed.map(a => a.id).sort()).toEqual(['bottom', 'left', 'right', 'top']);
    for (const a of placed) {
      expect(a.labelX - a.width / 2).toBeGreaterThanOrEqual(0);
      expect(a.labelX + a.width / 2).toBeLessThanOrEqual(800);
      expect(a.labelY - a.height).toBeGreaterThanOrEqual(0);
      expect(a.labelY).toBeLessThanOrEqual(600);
    }
  });
  it('does not hide labels behind HUD or speech bounds and keeps mobile focus readable', () => {
    const [focused] = chooseAgentLabels([{ ...agent('agt_focused', 20, 30), hovered: true }], 344, 700);
    expect(focused!.labelX - focused!.width / 2).toBeGreaterThanOrEqual(0);
    expect(focused!.labelY - focused!.height).toBeGreaterThanOrEqual(0);
    expect(chooseAgentLabels([agent('blocked')], 800, 600, [{ left: 0, top: 0, width: 800, height: 600 }])).toHaveLength(1);
    expect(chooseAgentLabels([agent('outside', -50)], 800, 600)).toHaveLength(0);
  });
});
