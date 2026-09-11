import test from 'node:test';
import assert from 'node:assert/strict';
import { Stichos } from '../src/stichos/session.ts';
import { exposureAt } from '../src/stichos/exposure.ts';

function body(seed: number, y: number, generation: 3 | 4 = 4) {
  const game = new Stichos(seed, generation);
  Object.assign(game.player, { x: 0, y, hp: 100, breath: 50, warmth: 50, cequinTime: 0 });
  assert.equal(game.world.blocked(0, y, undefined, true), false);
  return game;
}
function pass(game: Stichos, seconds: number) {
  for (let i = 0; i < seconds * 4; i++) game.update(0.25, { x: 0, y: 0, run: false });
}

test('the same idle activity restores breath and thermal comfort in temperate air but loses both in actual freezing terrain', () => {
  const warm = body(8, -1200),
    cold = body(0x53544943, -1150);
  assert.ok(warm.exposure.temperature > 5 && warm.exposure.pollution === 0);
  assert.ok(cold.exposure.temperature < -15);
  pass(warm, 10);
  pass(cold, 10);
  assert.ok(warm.player.breath > 51.7 && warm.player.warmth > 52.1);
  assert.ok(cold.player.breath < 48.5 && cold.player.warmth < 49);
  assert.equal(warm.player.hp, 100);
  assert.equal(cold.player.hp, 100);
});

test('industrial haze, thin air and volcanic dust remain distinct from cold, while protection and real interiors mitigate exposure', () => {
  const haze = body(8, -1050),
    thin = body(8, 850),
    dust = body(71, 150);
  assert.ok(
    haze.exposure.temperature > 0 &&
      haze.exposure.pollution > 0.2 &&
      haze.exposure.coldStress === 0,
  );
  assert.ok(thin.exposure.altitudeStress > 0.2);
  assert.ok(
    dust.exposure.temperature > 40 && dust.exposure.heatStress > 0 && dust.exposure.pollution > 0.6,
  );
  pass(haze, 10);
  assert.ok(haze.player.breath < 49.4 && haze.player.warmth > 52);
  const protectedBody = body(8, -1050);
  protectedBody.player.cequinTime = 100;
  pass(protectedBody, 10);
  assert.ok(protectedBody.player.breath > 52.9);
  const world = new Stichos(0x53544943, 4).world;
  const inside = world.tile(2, -5);
  assert.ok(inside.building && inside.terrain === 'floor');
  const shelter = exposureAt(inside, world.civilization!.axes);
  assert.equal(shelter.sheltered, true);
  assert.equal(shelter.coldStress, 0);
  assert.ok(shelter.warmthRate > 1);
  assert.equal(
    exposureAt(world.tile(0, 0), world.civilization!.axes).sheltered,
    false,
    'an open plaza floor is not a heated building',
  );
});

test('generation-three breathing and cold rates remain unchanged for existing saves', () => {
  const legacy = body(8, 50, 3);
  assert.notEqual(legacy.world.tile(0, 50).terrain, 'floor');
  pass(legacy, 2);
  assert.ok(Math.abs(legacy.player.breath - (50 - 0.11 * 2)) < 1e-8);
  assert.ok(Math.abs(legacy.player.warmth - (50 - 0.075 * 2)) < 1e-8);
});
