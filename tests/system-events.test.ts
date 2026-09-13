import test from 'node:test';
import assert from 'node:assert/strict';
import { audibleSystemEvents, validSystemSoundEvents } from '../src/stichos/system-events.ts';
test('semantic audio is bounded and never crosses a floor boundary or carries arbitrary payloads', () => {
  const cue = { kind: 'door-open', x: 18, y: 0 };
  assert.equal(validSystemSoundEvents([cue]), true);
  assert.equal(validSystemSoundEvents([{ ...cue, audio: 'binary' }]), false);
  assert.equal(validSystemSoundEvents(Array(25).fill(cue)), false);
  assert.equal(validSystemSoundEvents([{ ...cue, x: Infinity }]), false);
  assert.equal(audibleSystemEvents([cue], { spaceId: 'surface', x: 0, y: 0 }).length, 1);
  assert.equal(audibleSystemEvents([cue], { spaceId: 'surface', x: -0.01, y: 0 }).length, 0);
  assert.equal(
    audibleSystemEvents([cue], { spaceId: 'underground:town:1:0:0', x: 0, y: 0 }).length,
    0,
  );
});
