import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld, CHUNK_SIZE, appearance } from '../src/stichos/world.ts';
import type { Point, Tile } from '../src/stichos/types.ts';

test('chunk seams and content are independent of load order including negative and far coordinates', () => {
  const a = new InfiniteWorld(703),
    b = new InfiniteWorld(703);
  const positions = [
    [-17, -17],
    [-16, -16],
    [-1, -1],
    [0, 0],
    [15, 15],
    [16, 16],
    [31, -16],
    [1_000_003, -999_999],
    [-1_000_001, 1_000_008],
  ];
  const expected = positions.map(([x, y]) => structuredClone(a.tile(x, y)));
  for (const [x, y] of [...positions].reverse()) b.tile(x, y);
  for (let i = 0; i < positions.length; i++) {
    const [x, y] = positions[i],
      tile = b.tile(x, y);
    assert.deepEqual(tile, expected[i]);
    assert.equal(tile.x, x);
    assert.equal(tile.y, y);
    const chunk = b.chunk(Math.floor(x / CHUNK_SIZE), Math.floor(y / CHUNK_SIZE));
    assert.equal(chunk.tiles.length, 256);
    assert.deepEqual(
      chunk.tiles.find((t) => t.x === x && t.y === y),
      tile,
    );
  }
  assert.deepEqual(a.propsAround(-4, 3, 24), b.propsAround(-4, 3, 24));
  assert.deepEqual(a.npcsAround(-4, 3, 24), b.npcsAround(-4, 3, 24));
});

test('a continuous road can be walked thousands of tiles through towns and wilderness in each direction', () => {
  for (const seed of [0, 17, 703]) {
    const world = new InfiniteWorld(seed);
    for (let p = -1600; p <= 1600; p++) {
      assert.equal(world.blocked(p, 0), false, `seed ${seed}: east/west route blocked at ${p}`);
      assert.equal(world.blocked(0, p), false, `seed ${seed}: north/south route blocked at ${p}`);
      assert.ok(['road', 'bridge', 'floor'].includes(world.tile(p, 0).terrain));
    }
    assert.ok(world.tile(1_000_000, 0));
    assert.ok(world.tile(0, -1_000_000));
    assert.ok(world.cacheSize <= 160);
  }
});

test('chunk LRU stays bounded and evicted terrain, residents and resources regenerate identically', () => {
  const world = new InfiniteWorld(2),
    original = structuredClone(world.chunk(0, 0));
  for (let cx = 1; cx <= 200; cx++) world.chunk(cx, cx % 7);
  assert.equal(world.cacheSize, 160);
  assert.deepEqual(world.chunk(0, 0), original);
  assert.equal(world.cacheSize, 160);
});

function reachable(world: InfiniteWorld, start: Point, radius: number): Set<string> {
  const queue = [start],
    seen = new Set([`${start.x},${start.y}`]);
  for (let i = 0; i < queue.length; i++)
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const p = { x: queue[i].x + dx, y: queue[i].y + dy },
        key = `${p.x},${p.y}`;
      if (
        Math.abs(p.x - start.x) > radius ||
        Math.abs(p.y - start.y) > radius ||
        seen.has(key) ||
        world.blocked(p.x, p.y)
      )
        continue;
      seen.add(key);
      queue.push(p);
    }
  return seen;
}
const accessible = (seen: Set<string>, p: Point) =>
  seen.has(`${p.x},${p.y}`) ||
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([dx, dy]) => seen.has(`${p.x + dx},${p.y + dy}`));

test('origin has accessible canon residents, radio, crafting, herbs, timber, and ore with no hostile spawn', () => {
  for (const seed of [0, 1, 2, 9, 71, 703]) {
    const world = new InfiniteWorld(seed),
      seen = reachable(world, world.spawn, 22);
    assert.equal(world.blocked(world.spawn.x, world.spawn.y), false);
    const npcs = world.npcsAround(0, 0, 24),
      props = world.propsAround(0, 0, 24);
    for (const id of ['origin-botanist', 'origin-archivist', 'origin-engineer']) {
      const npc = npcs.find((n) => n.id === id);
      assert.ok(npc);
      assert.ok(seen.has(`${npc.x},${npc.y}`), `${id} must stand on reachable ground`);
    }
    assert.ok(!npcs.some((n) => n.hostile));
    assert.ok(props.some((p) => p.id === 'origin-radio' && accessible(seen, p)));
    for (const kind of ['workbench', 'shrine', 'heartleaf', 'emberroot'])
      assert.ok(
        props.some((p) => p.kind === kind && accessible(seen, p)),
        kind,
      );
    for (const [kind, count] of [
      ['cequin', 3],
      ['pine', 2],
      ['rock', 2],
    ] as const)
      assert.ok(props.filter((p) => p.kind === kind && accessible(seen, p)).length >= count, kind);
    const rock = props.find((p) => p.kind === 'rock')!;
    assert.ok(world.blocked(rock.x, rock.y));
    assert.equal(world.blocked(rock.x, rock.y, new Set([rock.id])), false);
  }
});

test('generated settlement interiors and residents connect to open streets and road network', () => {
  const world = new InfiniteWorld(319);
  for (const [gx, gy] of [
    [0, 0],
    [1, 0],
    [-1, 0],
    [1, -1],
    [-2, 1],
    [2, 2],
  ]) {
    const town = world.settlementsAround(gx * 80, gy * 80, 16)[0];
    assert.ok(town);
    const seen = reachable(world, { x: town.x, y: town.y }, 24);
    for (const npc of world.npcsAround(town.x, town.y, 19))
      if (!npc.hostile) assert.ok(seen.has(`${npc.x},${npc.y}`), `${town.id}/${npc.id}`);
    for (const prop of world.propsAround(town.x, town.y, 19))
      if (prop.id.startsWith(town.id))
        assert.ok(accessible(seen, prop), `${town.id}/${prop.id} is inaccessible`);
    assert.ok(seen.has(`${gx * 80},${gy * 80}`), 'plaza connects to global road crossing');
    const walls: Tile[] = [];
    for (let y = town.y - 15; y <= town.y + 15; y++)
      for (let x = town.x - 15; x <= town.x + 15; x++) {
        const t = world.tile(x, y);
        if (t.terrain === 'wall') walls.push(t);
      }
    assert.ok(walls.length > 20, 'town has actual room perimeter architecture');
  }
});

test('coherent wilderness varies four biomes, resources and terrain rather than repeating a finite island', () => {
  const world = new InfiniteWorld(903),
    biomes = new Set<string>(),
    terrain = new Set<string>(),
    shapes = new Set<string>();
  let neighbors = 0,
    matching = 0;
  for (let cy = -8; cy <= 8; cy += 2)
    for (let cx = -8; cx <= 8; cx += 2) {
      const chunk = world.chunk(cx, cy);
      shapes.add(JSON.stringify(chunk.tiles.map((t) => t.terrain)));
      for (const tile of chunk.tiles) {
        biomes.add(tile.biome);
        terrain.add(tile.terrain);
      }
      for (let i = 0; i < chunk.tiles.length - 1; i++)
        if (i % 16 !== 15) {
          neighbors++;
          if (chunk.tiles[i].biome === chunk.tiles[i + 1].biome) matching++;
        }
    }
  for (const biome of ['frostwood', 'tundra', 'marsh', 'highlands', 'settlement'])
    assert.ok(biomes.has(biome), biome);
  for (const kind of ['snow', 'grass', 'ice', 'water', 'road', 'floor', 'wall', 'bridge'])
    assert.ok(terrain.has(kind), kind);
  assert.ok(shapes.size > 50);
  assert.ok(matching / neighbors > 0.85, 'neighboring tiles should form coherent regions');
  assert.notDeepEqual(new InfiniteWorld(1).chunk(9, 9), new InfiniteWorld(2).chunk(9, 9));
});

test('humanoid appearance is deterministic, visibly varied, and respects role and clan components', () => {
  const forms = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const a = appearance(seed, 'guard', seed % 6);
    assert.deepEqual(a, appearance(seed, 'guard', seed % 6));
    assert.ok(['sword', 'bow'].includes(a.weapon));
    assert.ok(a.height >= 0.88 && a.height <= 1.14);
    assert.equal(a.trim, new InfiniteWorld(0).clans[seed % 6].color);
    forms.add(JSON.stringify(a));
  }
  assert.equal(forms.size, 100);
  assert.equal(appearance(3, 'botanist').weapon, 'staff');
});
