import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD_ACOUSTICS, worldOcclusion } from '../src/stichos/world-acoustics.ts';
import type { Prop, Tile } from '../src/stichos/types.ts';

function fixture(walls: number[] = [], doors: number[] = []) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    tile(x: number, y: number) {
      calls++;
      x = Math.round(x);
      y = Math.round(y);
      return {
        x,
        y,
        terrain: walls.includes(x) ? 'wall' : doors.includes(x) ? 'floor' : 'grass',
      } as Tile;
    },
    propsAround(x: number, y: number) {
      return doors.includes(x) ? [{ id: `door:${x}`, kind: 'door', x, y } as Prop] : [];
    },
  };
}
test('acoustics distinguish open ground, wall faces and closed/open doors', () => {
  const from = { x: 0, y: 0 },
    to = { x: 6, y: 0 };
  assert.equal(worldOcclusion(fixture(), from, to, new Set()), 0);
  assert.equal(worldOcclusion(fixture([2, 3]), from, to, new Set()), WORLD_ACOUSTICS.wall);
  assert.equal(worldOcclusion(fixture([], [3]), from, to, new Set()), WORLD_ACOUSTICS.closedDoor);
  assert.equal(worldOcclusion(fixture([], [3]), from, to, new Set(['door:3'])), 0);
  assert.equal(worldOcclusion(fixture([2, 4]), from, to, new Set()), 2 * WORLD_ACOUSTICS.wall);
});
test('geometry work and occlusion remain bounded and never mute through walls', () => {
  const world = fixture(Array.from({ length: 40 }, (_, i) => i * 2));
  const value = worldOcclusion(world, { x: 0, y: 0 }, { x: 42, y: 0 }, new Set());
  assert.equal(value, WORLD_ACOUSTICS.maximumOcclusion);
  assert.ok(value < 1);
  assert.ok(world.calls <= Math.ceil(42 / WORLD_ACOUSTICS.sampleStep));
  const before = world.calls;
  assert.equal(worldOcclusion(world, { x: NaN, y: 0 }, { x: 2, y: 0 }, new Set()), 0);
  assert.equal(worldOcclusion(world, { x: 0, y: 0 }, { x: 1000, y: 0 }, new Set()), 0);
  assert.equal(world.calls, before);
});
