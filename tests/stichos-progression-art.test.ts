import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { homeDecorations } from '../src/stichos/progression-art.ts';
import type { HomeState } from '../src/stichos/progression.ts';

test('owned furnishing and four garden plots fit real interiors without occupying the door aisle', () => {
  let homes = 0;
  for (const generation of [1, 2, 3] as const) {
    for (const seed of [0, 17, 703, 8192]) {
      const world = new InfiniteWorld(seed, generation);
      const doors = world
        .propsAround(0, 0, 35)
        .filter((p) => p.kind === 'door' && p.building?.includes(':house:'));
      const seen = new Set<string>();
      for (const door of doors) {
        if (seen.has(door.building!)) continue;
        seen.add(door.building!);
        const home: HomeState = {
          id: `owned:${door.building}`,
          buildingId: door.building!,
          settlementId: 'origin',
          name: 'Test home',
          x: door.x,
          y: door.y,
          purchasedAt: 0,
          furniture: {
            rest: 'clinic-bed',
            hearth: 'tile-hearth',
            work: 'precision-bench',
            garden: 'glass-planters',
          },
          plots: Array.from({ length: 4 }, (_, i) => ({
            plant: 'cequin',
            seed: i + seed,
            plantedAt: 0,
            readyAt: 60,
            yield: 3,
          })),
        };
        const decorations = homeDecorations(home, 61, world);
        assert.equal(
          decorations.length,
          9,
          `all furnishings and crops appear for ${generation}/${seed}/${door.building}`,
        );
        assert.equal(new Set(decorations.map((d) => d.id)).size, 9);
        for (const d of decorations) {
          const tile = world.tile(Math.round(d.x), Math.round(d.y));
          assert.equal(tile.building, door.building);
          assert.equal(tile.terrain, 'floor');
          assert.ok(Math.abs(d.x - door.x) > 0.5, 'central north/south door aisle is kept clear');
        }
        assert.deepEqual(
          decorations,
          homeDecorations(structuredClone(home), 61, new InfiniteWorld(seed, generation)),
        );
        assert.ok(
          decorations
            .filter((d) => d.kind === 'crop')
            .every((d) => d.kind === 'crop' && d.stage === 'ready'),
        );
        homes++;
      }
    }
  }
  assert.ok(homes >= 24, `multiple seeds and legacy generations checked (${homes})`);
});

test('crop appearance follows saved simulation time and invalid homes produce no scenery', () => {
  const world = new InfiniteWorld(928, 3);
  const door = world
    .propsAround(0, 0, 35)
    .find((p) => p.kind === 'door' && p.building?.includes(':house:'))!;
  const home: HomeState = {
    id: 'stages',
    buildingId: door.building!,
    settlementId: 'origin',
    name: 'Stages',
    x: door.x,
    y: door.y,
    purchasedAt: 0,
    furniture: {},
    plots: [{ plant: 'heartleaf', seed: 17, plantedAt: 10, readyAt: 110, yield: 2 }, null],
  };
  const stage = (time: number) =>
    homeDecorations(home, time, world).find((d) => d.kind === 'crop' && d.plot === 0);
  assert.equal((stage(10) as { stage: string }).stage, 'seedling');
  assert.equal((stage(70) as { stage: string }).stage, 'growing');
  assert.equal((stage(110) as { stage: string }).stage, 'ready');
  assert.deepEqual(homeDecorations({ ...home, buildingId: 'missing-building' }, 110, world), []);
});
