import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CombatFeedback,
  COMBAT_FEEDBACK_LIMITS,
  attackEnvelope,
  feedbackSettings,
  legacyCombatCue,
  validCombatCue,
} from '../src/stichos/combat-feedback.ts';
import type { CombatCue, CombatActor } from '../src/stichos/combat-feedback.ts';
import type { Effect } from '../src/stichos/types.ts';
import { drawCombatGround, drawCombatForeground } from '../src/stichos/combat-feedback-render.ts';

const view = { left: -10, right: 10, top: -10, bottom: 10 };
const actor: CombatActor = { id: '$player', bodyId: 'body-1', x: 0, y: 0, hp: 100, heading: 0 };
const cue = (id = 'cue', kind: CombatCue['kind'] = 'impact'): CombatCue => ({
  id,
  kind,
  x: 0,
  y: 0,
  age: 0,
  duration: 0.6,
  actorId: 'body-1',
  color: '#d8b38a',
});
const effect = (kind: Effect['kind'] = 'hurt'): Effect => ({
  id: 1,
  kind,
  x: 0,
  y: 0,
  age: 0,
  duration: 0.5,
  color: '#c9b88a',
  actorId: 'body-1',
});

test('cue validation rejects malformed or unbounded presentation payloads', () => {
  assert.equal(validCombatCue(cue()), true);
  for (const patch of [
    { x: NaN },
    { y: Infinity },
    { id: '' },
    { id: 'a'.repeat(161) },
    { age: -1 },
    { duration: 0 },
    { duration: 21 },
    { age: 0.6 },
    { radius: 999 },
    { radius: NaN },
    { color: 'url(javascript:alert(1))' },
    { text: 'x'.repeat(97) },
    { strength: Infinity },
  ])
    assert.equal(validCombatCue({ ...cue(), ...patch }), false, JSON.stringify(patch));
});

test('legacy effects preserve positions and durations and distinguish cancelable hostile shapes', () => {
  for (const kind of ['slash', 'arrow', 'ward', 'hurt', 'heal', 'ember'] as const) {
    const original = effect(kind),
      copy = structuredClone(original),
      converted = legacyCombatCue(original)!;
    assert.equal(converted.age, original.age);
    assert.equal(converted.duration, original.duration);
    assert.equal(converted.actorId, original.actorId);
    assert.deepEqual(original, copy);
  }
  assert.equal(legacyCombatCue({ ...effect('speech'), text: 'Drawing bow' })?.shape, 'line');
  assert.equal(legacyCombatCue({ ...effect('speech'), text: 'Striking' })?.shape, 'cone');
  assert.equal(legacyCombatCue({ ...effect('speech'), text: 'I know a shortcut.' }), null);
  assert.equal(legacyCombatCue({ ...effect('harvest'), tool: { kind: 'axe', seed: 3 } }), null);
});

test('feedback consumes immutable simulation snapshots and uses its own deterministic particle stream', () => {
  const a = new CombatFeedback(),
    b = new CombatFeedback();
  const effects = [effect()],
    actors = [actor];
  const copy = structuredClone({ effects, actors });
  a.update(1, effects, actors, view);
  b.update(1, effects, actors, view);
  assert.deepEqual(a.particles, b.particles);
  assert.deepEqual({ effects, actors }, copy);
  assert.ok(a.diagnostics.particles > 0);
  const count = a.diagnostics.particles;
  a.update(1.016, [{ ...effect(), age: 0.016 }], actors, view);
  assert.equal(a.diagnostics.particles, count, 'same ID never produces a new burst every render');
});

test('pools and all retained caches remain bounded under a saturated source stream', () => {
  const feedback = new CombatFeedback();
  const actors = Array.from({ length: 1000 }, (_, i) => ({ ...actor, id: `actor-${i}` }));
  for (let frame = 0; frame < 180; frame++) {
    const cues = Array.from({ length: 200 }, (_, i) => cue(`${frame}:${i}`, 'level'));
    feedback.update(frame / 60, [], actors, view, feedbackSettings(1), cues);
    const d = feedback.diagnostics;
    assert.ok(d.particles <= COMBAT_FEEDBACK_LIMITS.particles);
    assert.ok(d.cues <= COMBAT_FEEDBACK_LIMITS.cues);
    assert.ok(d.actors <= COMBAT_FEEDBACK_LIMITS.actors);
    assert.ok(d.remembered <= COMBAT_FEEDBACK_LIMITS.remembered);
  }
  assert.ok(feedback.diagnostics.dropped > 0);
});

test('offscreen and late snapshots never create phantom bursts or camera impulses', () => {
  const feedback = new CombatFeedback();
  feedback.update(1, [], [actor], view, feedbackSettings(1), [{ ...cue(), x: 100 }]);
  assert.equal(feedback.diagnostics.cues, 0);
  assert.equal(feedback.diagnostics.particles, 0);
  feedback.update(2, [], [actor], view, feedbackSettings(1), [{ ...cue('late'), age: 0.4 }]);
  assert.equal(feedback.diagnostics.particles, 0);
  assert.deepEqual(feedback.cameraOffset(), { x: 0, y: 0 });
});

test('projectile collision and canceled anticipation disappear without waiting for old duration', () => {
  const feedback = new CombatFeedback();
  const cues = ['projectile', 'charge', 'telegraph', 'anticipation'].map((kind) =>
    cue(kind, kind as CombatCue['kind']),
  );
  feedback.update(1, [], [actor], view, feedbackSettings(), cues);
  assert.equal(feedback.diagnostics.cues, 4);
  feedback.update(1.016, [], [actor], view);
  assert.equal(feedback.diagnostics.cues, 0);
});

test('hostile warnings displace decoration at saturation and preserve exact world-space radius', () => {
  const feedback = new CombatFeedback();
  feedback.update(
    1,
    [],
    [actor],
    view,
    feedbackSettings(1),
    Array.from({ length: 48 }, (_, i) => cue(String(i))),
  );
  const warning = {
    ...cue('danger', 'telegraph'),
    radius: 7.5,
    heading: Math.PI / 2,
    shape: 'circle' as const,
  };
  feedback.update(1.01, [], [actor], view, feedbackSettings(1), [warning]);
  assert.equal(feedback.diagnostics.cues, 48);
  assert.equal([...feedback.activeCues].find((c) => c.id === 'danger')?.radius, 7.5);
});

test('zero intensity and reduced motion stop particles, camera displacement and squash without hiding warning geometry', () => {
  for (const settings of [feedbackSettings(0), feedbackSettings(1, true)]) {
    const feedback = new CombatFeedback();
    feedback.update(1, [], [actor], view, settings, [cue(), cue('warning', 'telegraph')]);
    feedback.update(1.05, [], [actor], view, settings, [
      { ...cue('warning', 'telegraph'), age: 0.05 },
    ]);
    assert.equal(feedback.diagnostics.particles, 0);
    assert.deepEqual(feedback.cameraOffset(), { x: 0, y: 0 });
    assert.equal(feedback.pose('$player').x, 0);
    assert.equal(feedback.pose('$player').scaleY, 1);
    assert.ok([...feedback.activeCues].some((c) => c.kind === 'telegraph'));
  }
});

test('disabling effects immediately clears active particles and rewind clears actor history', () => {
  const feedback = new CombatFeedback();
  feedback.update(1, [effect()], [actor], view, feedbackSettings(1));
  assert.ok(feedback.diagnostics.particles > 0);
  feedback.update(1.01, [], [actor], view, feedbackSettings(0));
  assert.equal(feedback.diagnostics.particles, 0);
  feedback.update(0, [], [{ ...actor, hp: 0 }], view);
  assert.equal(feedback.diagnostics.cues, 0, 'loading a dead body is not a new death event');
});

test('only live-to-dead transitions animate death, and body identity binds hit feedback', () => {
  const feedback = new CombatFeedback();
  feedback.update(1, [], [actor], view);
  feedback.update(1.01, [effect()], [actor], view);
  assert.ok(feedback.pose('$player').flash > 0);
  feedback.update(1.03, [], [{ ...actor, hp: 0 }], view);
  assert.equal([...feedback.activeCues].filter((c) => c.kind === 'death').length, 1);
  assert.equal(feedback.pose('$player').death, 0);
  feedback.update(1.05, [], [{ ...actor, hp: 0 }], view);
  assert.equal([...feedback.activeCues].filter((c) => c.kind === 'death').length, 1);
});

test('attack envelope separates release, brief impact hold and recovery without changing world time', () => {
  assert.equal(attackEnvelope(-1), 0);
  assert.equal(attackEnvelope(NaN), 0);
  assert.equal(attackEnvelope(0.4), 0);
  assert.ok(attackEnvelope(0.08) > attackEnvelope(0));
  assert.equal(attackEnvelope(0.13), 1);
  assert.ok(attackEnvelope(0.28) < attackEnvelope(0.16));
  assert.equal(attackEnvelope(0.01, 0.32, true), attackEnvelope(0.2, 0.32, true));
});

test('level-up celebrates an observed increase once, never a loaded level or unchanged snapshot', () => {
  const feedback = new CombatFeedback();
  feedback.update(1, [], [{ ...actor, level: 12 }], view);
  assert.equal(feedback.diagnostics.cues, 0);
  feedback.update(1.05, [], [{ ...actor, level: 13 }], view);
  assert.equal([...feedback.activeCues].filter((c) => c.kind === 'level').length, 1);
  feedback.update(1.1, [], [{ ...actor, level: 13 }], view);
  assert.equal([...feedback.activeCues].filter((c) => c.kind === 'level').length, 1);
});

test('all render branches balance context state and draw warning cues at zero intensity', () => {
  const allKinds: CombatCue['kind'][] = [
    'anticipation',
    'charge',
    'melee',
    'projectile',
    'impact',
    'guard',
    'area',
    'dash',
    'death',
    'loot',
    'level',
    'status',
    'telegraph',
  ];
  let balance = 0,
    drawCalls = 0;
  const context = new Proxy(
    {},
    {
      get(_target, key) {
        if (key === 'save') return () => balance++;
        if (key === 'restore') return () => balance--;
        if (key === 'measureText') return () => ({ width: 50 });
        return (...args: unknown[]) => {
          assert.ok(args.filter((a) => typeof a === 'number').every(Number.isFinite));
          drawCalls++;
        };
      },
      set() {
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  for (const settings of [feedbackSettings(1), feedbackSettings(0), feedbackSettings(1, true)]) {
    const feedback = new CombatFeedback();
    feedback.update(
      1,
      [],
      [actor],
      view,
      settings,
      allKinds.map((kind) => ({ ...cue(kind, kind), text: 'Readable' })),
    );
    drawCombatGround(context, feedback, (p) => p, 36);
    drawCombatForeground(context, feedback, (p) => p, 36);
    assert.equal(balance, 0);
  }
  assert.ok(drawCalls > 100);
});
