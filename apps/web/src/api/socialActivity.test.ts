import { describe, expect, it } from 'vitest';
import { EconomicEvent, SocialMoment } from './shared';
import { activityFocus, cityHighlights, interestingActivity, socialMoment } from './socialActivity';
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

it('keeps historical work at its workplace after the worker moves away',()=>{
 const work={...event,type:'task.verified' as const,agentId:'agt_worker',buildingId:'bld_bakery'};
 expect(activityFocus(work,[{id:'agt_worker',pos:{x:99,y:99}}] as Parameters<typeof activityFocus>[1],[{id:'bld_bakery',x:4,z:6}])).toEqual({x:4,z:6,agentId:'agt_worker'});
});
it('reduces repeat shifts and automatic production only in highlights, preserving raw evidence',()=>{
 const completed={...event,type:'task.verified' as const,buildingId:'bld_bakery',data:{taskKind:'production_shift'}};
 const events=[{...completed,id:'new',tick:400},{...completed,id:'repeat',tick:350},{...completed,id:'older',tick:200},
  {...event,id:'auto',type:'production.completed' as const}, {...event,id:'launch',type:'launch.confirmed' as const}];
 const before=JSON.stringify(events);
 expect(cityHighlights(events).map(e=>e.id)).toEqual(['new','older','launch']);
 expect(JSON.stringify(events)).toBe(before);
});
