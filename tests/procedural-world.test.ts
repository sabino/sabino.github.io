import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld, tileAt } from '../src/procedural/world.ts';

test('100 generated worlds connect all tiles, placements and mission anchors to the landing', () => {
  const shapes = new Set<string>(),
    counts = new Set<number>(),
    missions = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const world = generateWorld(seed, 1);
    const cells = new Map(world.tiles.map((t) => [`${t.x},${t.z}`, t]));
    assert.equal(cells.size, world.tiles.length);
    const start = tileAt(world, world.spawn.x, world.spawn.z)!;
    const reached = new Set([`${start.x},${start.z}`]),
      queue = [start];
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const key = `${t.x + dx},${t.z + dz}`,
          next = cells.get(key);
        if (next && !reached.has(key)) {
          reached.add(key);
          queue.push(next);
        }
      }
    }
    assert.equal(reached.size, cells.size, `seed ${seed}: disconnected surface cells`);
    const walkable = new Set([`${start.x},${start.z}`]),
      walking = [start];
    for (let i = 0; i < walking.length; i++) {
      const t = walking[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const key = `${t.x + dx},${t.z + dz}`,
          next = cells.get(key);
        if (
          next &&
          !walkable.has(key) &&
          (next.height <= t.height + 0.4 || next.kind === 'path' || next.kind === 'ladder')
        ) {
          walkable.add(key);
          walking.push(next);
        }
      }
    }
    for (const p of [...world.placements.map((p) => p.position), world.gate, world.resonator]) {
      assert.ok(
        reached.has(`${Math.round(p.x)},${Math.round(p.z)}`),
        `seed ${seed}: unreachable anchor`,
      );
      assert.ok(
        walkable.has(`${Math.round(p.x)},${Math.round(p.z)}`),
        `seed ${seed}: objective requires an unavailable jump`,
      );
      assert.equal(
        p.y,
        tileAt(world, p.x, p.z)!.height,
        `seed ${seed}: anchor must sit on its actual tile`,
      );
    }
    assert.ok(world.species.some((s) => s.id === world.mission.target));
    assert.ok(world.species.length >= world.mission.required);
    assert.ok(world.weapon.core !== 'growth' || world.mission.kind !== 'hunt');
    shapes.add(JSON.stringify(world.tiles.map((t) => [t.x, t.z, t.height])));
    counts.add(world.tiles.length);
    missions.add(world.mission.kind);
  }
  assert.equal(shapes.size, 100);
  assert.ok(counts.size > 50);
  assert.deepEqual([...missions].sort(), ['attune', 'escort', 'hunt', 'survey']);
});

test('same world seed reconstructs geometry and content while crossing changes the assignment rule', () => {
  for (const seed of [0, 1, 77, 999, 0xffffffff]) {
    const a = generateWorld(seed, 0),
      b = generateWorld(seed, 0),
      later = generateWorld(seed, 5);
    assert.deepEqual(a, b);
    assert.deepEqual(a.tiles, later.tiles);
    assert.deepEqual(a.species, later.species);
    assert.deepEqual(a.weapon, later.weapon);
    assert.equal(a.mission.kind, 'survey');
  }
});
