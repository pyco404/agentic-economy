import { describe, expect, it } from 'vitest';
import { chooseSpeech, type SpeechCandidate, SPEECH_BUDGET } from './socialBubbles';
import { createCitizens } from './citizens';
import * as THREE from 'three';

function citizen(i: number): SpeechCandidate {
  return { id: `agt_social${i}`, name: 'Neighbour', state: 'interacting', x: i, z: 10, screenX: 120 + i * 210, screenY: 240,
    social: { tick: 10, personality: { temperament: 'sociable', interest: 'music', routine: 'evening square' }, mood: 'content', socialNeed: 20, destination: null,
      current: { eventId: `soc_${i}`, kind: 'conversation', description: 'A nearby conversation.', speech: 'How is the garden?', reaction: 'talk', partnerIds: ['agt_other'], untilTick: 20, location: { x: i, y: 10 } } } };
}
describe('bounded social rendering', () => {
  it('caps desktop/mobile bubbles, avoids overlap and shows one speaker per event', () => {
    const agents = Array.from({ length: 1000 }, (_, i) => citizen(i));
    expect(chooseSpeech(agents, 1440, 900, 3)).toHaveLength(SPEECH_BUDGET.desktop);
    expect(chooseSpeech(agents, 690, 900, 3).length).toBeLessThanOrEqual(SPEECH_BUDGET.mobile);
    expect(chooseSpeech(agents, 1440, 900, .8)).toHaveLength(1);
    const duplicate = citizen(1); duplicate.social!.current!.eventId = 'soc_0';
    expect(chooseSpeech([citizen(0), duplicate], 1440, 900, 3)).toHaveLength(1);
    const overlap = citizen(1); overlap.screenX = 150;
    expect(chooseSpeech([citizen(0), overlap], 1440, 900, 3)).toHaveLength(1);
  });
  it('hides expired authoritative speech and respects viewport edges', () => {
    const expired = citizen(0); expired.social!.current!.untilTick = 10;
    expect(chooseSpeech([expired], 1440, 900, 3)).toHaveLength(0);
    const outside = citizen(1); outside.screenX = -20;
    expect(chooseSpeech([outside], 344, 900, 3)).toHaveLength(0);
  });
  it('uses the existing three citizen batches for distinct expressive poses', () => {
    const citizens = createCitizens(1), matrix = new THREE.Matrix4();
    const poses = [];
    for (const reaction of ['talk', 'wave', 'cheer', 'consider'] as const) {
      citizens.set(0, 0, 0, 0, 1, false, '#789684', false, true, undefined, 0, reaction);
      citizens.meshes[0]!.getMatrixAt(2, matrix); poses.push(matrix.toArray().join(','));
    }
    expect(new Set(poses).size).toBe(4); expect(citizens.meshes).toHaveLength(3);
    citizens.dispose();
  });
});
