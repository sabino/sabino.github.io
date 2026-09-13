import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECHNIQUES,
  techniqueById,
  techniquesFor,
  techniqueContains,
  techniqueAngles,
  assistedAim,
} from '../src/stichos/combat-techniques.ts';

test('six techniques have bounded distinct behavior and progression, including invented implements', () => {
  assert.equal(new Set(TECHNIQUES.map((t) => t.id)).size, 6);
  for (const family of ['sword', 'bow', 'staff'] as const) {
    const pair = techniquesFor(family);
    assert.deepEqual(
      pair.map((t) => t.level),
      [1, 4],
    );
    assert.notEqual(pair[0].description, pair[1].description);
  }
  assert.deepEqual(techniquesFor('none', 'projectile'), techniquesFor('bow'));
  assert.equal(techniqueById('__proto__'), undefined);
  assert.equal(techniqueById({ id: 'fan' }), undefined);
});
test('technique geometry has exact world-space front, radial, line and range boundaries', () => {
  const origin = { x: 0, y: 0 },
    pulse = techniqueById('pulse')!,
    line = techniqueById('faultline')!,
    arc = techniqueById('crescent')!;
  assert.equal(techniqueContains(pulse, origin, { x: -3.2, y: 0 }, 0), true);
  assert.equal(techniqueContains(pulse, origin, { x: 3.200001, y: 0 }, 0), false);
  assert.equal(techniqueContains(line, origin, { x: 3, y: 0.65 }, 0), true);
  assert.equal(techniqueContains(line, origin, { x: 3, y: 0.651 }, 0), false);
  assert.equal(techniqueContains(line, origin, { x: -1, y: 0 }, 0), false);
  assert.equal(techniqueContains(arc, origin, { x: -1, y: 0 }, 0), false);
  assert.equal(techniqueContains(pulse, origin, { x: NaN, y: 0 }, 0), false);
  assert.deepEqual(techniqueAngles(techniqueById('fan')!, 0), [-0.19, 0, 0.19]);
});
test('touch assist selects visible hostiles deterministically without snapping behind or to citizens', () => {
  const targets = [
    { id: 'citizen', x: 0.2, y: 0, hp: 100, hostile: false },
    { id: 'cover', x: 0.3, y: 0, hp: 100, hostile: true },
    { id: 'behind', x: -0.4, y: 0, hp: 100, hostile: true },
    { id: 'b', x: 1, y: 0, hp: 100, hostile: true },
    { id: 'a', x: 1, y: 0, hp: 100, hostile: true },
  ];
  assert.equal(assistedAim({ x: 0, y: 0 }, 0, targets, 2, (t) => t.id !== 'cover')?.id, 'a');
  assert.equal(
    assistedAim({ x: 0, y: 0 }, 0, targets, 0.1, () => true),
    undefined,
  );
});
