import { describe, expect, it } from 'vitest';
import { visibleAgentSubset } from './agentVisibility';
it('selects visible agents beyond the first 512 without limiting identities', () => {
  const all = Array.from({ length: 10000 }, (_, i) => ({ id: `agent${i}`, x: i, z: 0 }));
  const selected = visibleAgentSubset(all, a => a.x > 9000, { x: 9500, z: 0 }, 'agent9999');
  expect(selected).toHaveLength(512); expect(selected[0]!.id).toBe('agent9999');
  expect(selected.some(a => a.id === 'agent9500')).toBe(true); expect(all).toHaveLength(10000);
});
describe('Common Agent distance selection', () => {
  it('reselects when the camera moves and gives all identities access to the render budget', () => {
    const all = Array.from({ length: 1000 }, (_, i) => ({ id: `agent${i}`, x: i, z: 0 }));
    const first = visibleAgentSubset(all, () => true, { x: 0, z: 0 }, null, 10);
    const last = visibleAgentSubset(all, () => true, { x: 999, z: 0 }, null, 10);
    expect(first[0]!.id).toBe('agent0'); expect(last[0]!.id).toBe('agent999');
    expect(first.every(a => !last.includes(a))).toBe(true);
  });
});
