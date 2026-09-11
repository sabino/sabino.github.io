import test from 'node:test';
import assert from 'node:assert/strict';
import { actionMotion, effectActor } from '../src/stichos/actor-motion.ts';
import type { HumanoidActionKind } from '../src/stichos/actor-motion.ts';
import type { Effect } from '../src/stichos/types.ts';

test('contextual pose envelopes are finite, bounded, quantized, and settle back to planted idle', () => {
  for (const kind of ['gather', 'craft', 'ward', 'heal', 'hurt'] as HumanoidActionKind[]) {
    const steps = new Set<number>();
    for (let i = -100; i <= 200; i++) {
      const motion = actionMotion({ kind, progress: i / 100 });
      steps.add(motion.step);
      assert.ok(
        Object.values(motion)
          .filter((v) => typeof v === 'number')
          .every(Number.isFinite),
      );
      assert.ok(motion.strength >= 0 && motion.strength <= 1);
      assert.ok(motion.crouch >= 0 && motion.crouch <= 6);
      assert.ok(Math.abs(motion.lean) <= 3);
    }
    assert.equal(steps.size, 6);
    assert.equal(actionMotion({ kind, progress: 0 }).strength, 0);
    assert.ok(actionMotion({ kind, progress: 1 }).strength < 1e-12);
    assert.equal(actionMotion({ kind, progress: 0 }).kind, null);
    assert.equal(actionMotion({ kind, progress: 1 }).kind, null);
    assert.deepEqual(
      actionMotion({ kind, progress: 0.1, reduced: true }),
      actionMotion({ kind, progress: 0.9, reduced: true }),
      'reduced motion uses a static restrained pose',
    );
  }
  for (const progress of [NaN, Infinity, -Infinity])
    assert.equal(actionMotion({ kind: 'hurt', progress }).kind, null);
});

test('contextual effects choose one actor and separate gathering from bench work', () => {
  const actors = [
    { id: 'player', player: true, x: 0, y: 0 },
    { id: 'merchant', player: false, x: 0.5, y: 0 },
  ];
  const effect: Effect = {
    id: 1,
    kind: 'hurt',
    x: 0.48,
    y: 0,
    age: 0,
    duration: 0.4,
    color: '#abc',
  };
  assert.deepEqual(effectActor(effect, actors), { id: 'merchant', kind: 'hurt' });
  assert.equal(effectActor({ ...effect, x: 100 }, actors), null);
  assert.deepEqual(effectActor({ ...effect, kind: 'harvest', x: 1.4 }, actors), {
    id: 'player',
    kind: 'gather',
  });
  assert.deepEqual(effectActor({ ...effect, kind: 'harvest', x: 0 }, actors), {
    id: 'player',
    kind: 'craft',
  });
  assert.equal(effectActor({ ...effect, kind: 'arrow' }, actors), null);
  assert.equal(
    effectActor(
      { ...effect, kind: 'harvest' },
      actors.filter((a) => !a.player),
    ),
    null,
  );
});

test('identified work belongs to its physical worker even beside the player or away from the effect', () => {
  const actors = [
    { id: '$player', bodyId: 'priest-body', player: true, x: 0, y: 0 },
    { id: 'worker', player: false, x: 1.3, y: 0 },
    { id: 'bystander', player: false, x: 0.1, y: 0 },
  ];
  const effect: Effect = {
    id: 2,
    actorId: 'worker',
    kind: 'harvest',
    x: 0,
    y: 0,
    age: 0,
    duration: 0.65,
    color: '#abc',
    tool: { kind: 'axe', seed: 73 },
  };
  assert.deepEqual(effectActor(effect, actors), { id: 'worker', kind: 'gather' });
  assert.deepEqual(effectActor({ ...effect, x: 100 }, actors), {
    id: 'worker',
    kind: 'gather',
  });
  assert.equal(effectActor({ ...effect, actorId: 'offscreen-worker' }, actors), null);
  assert.deepEqual(effectActor({ ...effect, actorId: 'priest-body' }, actors), {
    id: '$player',
    kind: 'gather',
  });
  assert.deepEqual(effectActor({ ...effect, kind: 'hurt' }, actors), {
    id: 'worker',
    kind: 'hurt',
  });
  assert.equal(effectActor({ ...effect, kind: 'arrow' }, actors), null);
});
