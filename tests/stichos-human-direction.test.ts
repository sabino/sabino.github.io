import test from 'node:test';
import assert from 'node:assert/strict';
import { humanoidDirection } from '../src/stichos/art.ts';

test('both north diagonals use the same rear pose and equipment depth', () => {
  for (const angle of [-Math.PI / 4, -Math.PI / 2, (-3 * Math.PI) / 4]) {
    assert.deepEqual(humanoidDirection(angle), { face: 0, weaponBehindBody: true });
    assert.deepEqual(humanoidDirection(angle + Math.PI * 2), humanoidDirection(angle));
  }
});

test('equipment depth preserves northward motion even when the body uses a side pose', () => {
  for (const angle of [-Math.PI / 6, (-5 * Math.PI) / 6]) {
    const north = humanoidDirection(angle),
      south = humanoidDirection(-angle);
    assert.equal(north.face, south.face, 'These headings share a side-facing sprite');
    assert.equal(north.weaponBehindBody, true);
    assert.equal(south.weaponBehindBody, false);
  }
  for (const angle of [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI])
    assert.equal(humanoidDirection(angle).weaponBehindBody, false);
});
