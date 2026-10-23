import { describe, expect, it } from 'vitest';
import { EconomicEvent, SocialMoment } from './shared';
import { activityFocus, interestingActivity, socialMoment } from './socialActivity';
import { displayActivity } from './agentIdentity';

const moment = SocialMoment.parse({ id: 'soc_test', tick: 10, kind: 'conversation', phase: 'encounter', summary: 'Two neighbours discuss a garden.',
  participants: ['agt_neighbourA', 'agt_neighbourB'], buildingId: null, location: { x: 12, y: 18 }, simulated: true });
const event = EconomicEvent.parse({ id: 'evt_socialTest', seq: 8, tick: 10, at: '2026-10-23T00:00:00Z', type: 'social.encounter', summary: moment.summary,
  agentId: moment.participants[0], buildingId: null, communityId: null, data: { social: moment, simulated: true } });
describe('social activity read model', () => {
  it('focuses the actual recorded location and preserves both-agent attribution', () => {
    expect(activityFocus(event, [], [])).toEqual({ x: 12.5, z: 18.5, agentId: 'agt_neighbourA' });
    expect(displayActivity(event, [])).toBe(moment.summary);
    expect(interestingActivity(event)).toBe(true);
  });
  it('rejects malformed positions and never interprets a social event as a financial receipt', () => {
    const malformed = { ...event, data: { social: { ...moment, location: { x: 'bad', y: 18 } } } };
    expect(socialMoment(malformed)).toBeNull(); expect(activityFocus(malformed, [], [])).toBeNull();
    expect(socialMoment({ data: { ...event.data, social: { ...moment, simulated: false } } })).toBeNull();
  });
});
