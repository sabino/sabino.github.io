import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld, CITY_SPACING } from '../src/stichos/world.ts';

test('settlement minerals are placed in workyards and shelterbelt trees leave the urban core clear', () => {
  for (const seed of [0, 71, 703, 9182]) {
    const world = new InfiniteWorld(seed, 3);
    for (const center of [
      [0, 0],
      [CITY_SPACING, 0],
      [-CITY_SPACING, CITY_SPACING],
    ]) {
      const town = world.settlementsAround(center[0], center[1], 4)[0];
      assert.ok(town);
      const props = world.propsAround(town.x, town.y, town.radius * 1.5);
      const urban = props.filter((p) => world.tile(p.x, p.y).biome === 'settlement');
      for (const prop of urban) {
        if (prop.kind === 'rock') {
          assert.match(prop.id, /:ore:\d+$/);
          assert.equal(prop.name, 'Workshop ore stock');
        }
        if (prop.kind === 'pine' && !prop.id.includes(':timber:')) {
          assert.ok(
            Math.max(Math.abs(prop.x - town.x), Math.abs(prop.y - town.y)) >= town.radius - 4,
          );
        }
      }
      for (const suffix of [':timber:1', ':timber:2', ':ore:1', ':ore:2']) {
        const resource = props.find((p) => p.id === town.id + suffix);
        assert.ok(resource, `${seed} ${town.id}${suffix}`);
        assert.ok(
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].some(([x, y]) => !world.blocked(resource.x + x, resource.y + y, undefined, true)),
          'workyard can be reached',
        );
      }
    }
  }
});

test('resource stands preserve road verges and reproduce after remote chunk eviction', () => {
  for (const seed of [0, 71, 703]) {
    const world = new InfiniteWorld(seed, 3);
    const before = structuredClone(world.chunk(-1, -1));
    for (let p = -350; p <= 350; p++)
      for (const [x, y] of [
        [p, 2],
        [p, -2],
        [2, p],
        [-2, p],
      ]) {
        const obstruction = world
          .propsAround(x, y, 0.1)
          .find(
            (prop) =>
              ['pine', 'rock'].includes(prop.kind) && prop.solid && !/:timber:|:ore:/.test(prop.id),
          );
        assert.equal(obstruction, undefined, `clear road verge ${seed} ${x},${y}`);
      }
    for (let i = 0; i < 170; i++) world.chunk(1000 + i, -777);
    assert.deepEqual(world.chunk(-1, -1), before);
    const forest = world.propsAround(-50, -50, 70).filter((p) => p.kind === 'pine');
    assert.ok(forest.length > 8, 'useful woodland remains outside the city');
  }
});
