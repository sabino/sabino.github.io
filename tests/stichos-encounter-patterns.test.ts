import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encounterPattern,
  encounterContains,
  encounterSteering,
} from '../src/stichos/encounter-patterns.ts';

const id = (kind: string) => `expedition:42:0:0:road:${kind}:0`;

test('the original hostile telegraphs have distinct counterplay and deterministic timing', () => {
  const scout = encounterPattern(id('skirmisher'), 4, 30, 30)!;
  const slinger = encounterPattern(id('slinger'), 4, 30, 30)!;
  const breaker = encounterPattern(id('breaker'), 4, 60, 60)!;
  assert.equal(scout.shape, 'cone');
  assert.equal(slinger.shape, 'volley');
  assert.equal(breaker.shape, 'line');
  assert.equal(slinger.angles.length, 2);
  assert.ok(slinger.angles[0] < 0 && slinger.angles[1] > 0);
  assert.ok(breaker.windup > 1);
  assert.ok(breaker.recovery > breaker.windup);
  assert.deepEqual(slinger, encounterPattern(id('slinger'), 4, 30, 30));
  assert.equal(encounterPattern('origin-guard', 4, 30, 30), undefined);
  assert.equal(encounterPattern(id('wolf'), 4, 30, 30), undefined);
});

test('the major warden encounter changes phase at half health, not by render time', () => {
  const before = encounterPattern(id('warden'), 2, 80, 145)!;
  const after = encounterPattern(id('warden'), 2, 70, 145)!;
  assert.equal(before.shape, 'line');
  assert.equal(after.shape, 'radial');
  assert.ok(after.windup >= 1.3);
  assert.ok(after.recovery >= 2);
  assert.ok(encounterContains(before, { x: 0, y: 0 }, { x: 4, y: 0.6 }, 0));
  assert.ok(!encounterContains(before, { x: 0, y: 0 }, { x: 4, y: 0.7 }, 0));
  assert.ok(!encounterContains(before, { x: 0, y: 0 }, { x: -1, y: 0 }, 0));
  assert.ok(encounterContains(after, { x: 0, y: 0 }, { x: -3, y: 0 }, 0));
  assert.ok(!encounterContains(after, { x: 0, y: 0 }, { x: -3.3, y: 0 }, 0));
  assert.ok(!encounterContains(after, { x: 0, y: 0 }, { x: NaN, y: 0 }, 0));
});

test('botanical keepers react to night ecology while ordinary fauna remain untouched', () => {
  const day = encounterPattern(id('cultivator'), 10, 50, 50, { nightness: 0 })!;
  const night = encounterPattern(id('cultivator'), 10, 50, 50, { nightness: 1 })!;
  assert.ok(night.range > day.range);
  assert.ok(night.windup < day.windup);
  assert.ok(night.windup >= 0.95, 'Even the night attack leaves a readable reaction window');
  assert.equal(encounterPattern('fauna:bird:skirmisher:0', 10, 50, 50), undefined);
});

test('slingers kite, scouts flee when hurt, and winding-up bosses can hold ground', () => {
  const slinger = encounterPattern(id('slinger'), 10, 30, 30)!;
  assert.deepEqual(encounterSteering(slinger, { x: 0, y: 0 }, { x: 2, y: 0 }, 1), { x: -1, y: -0 });
  assert.deepEqual(encounterSteering(slinger, { x: 0, y: 0 }, { x: 6, y: 0 }, 0), { x: 1, y: 0 });
  const scout = encounterPattern(id('skirmisher'), 10, 8, 32)!;
  assert.equal(scout.movement, 'kite');
  const boss = encounterPattern(id('warden'), 10, 40, 145)!;
  assert.deepEqual(encounterSteering(boss, { x: 0, y: 0 }, { x: 2, y: 0 }, 0), { x: 0, y: 0 });
});
