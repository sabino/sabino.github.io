import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  InfiniteWorld,
  CHUNK_SIZE,
  CITY_SPACING,
  STOP_SPACING,
  appearance,
} from '../src/stichos/world.ts';
import type { Point, Tile } from '../src/stichos/types.ts';

test('generation one preserves existing wilderness terrain, obstacles, residents and resources byte-for-byte', () => {
  const fixtures = [
    [0, 2, 2, '4585711e4601c50a90f245e7c93447e3a7fe7b2f9d6d0d5079de59d5649a141e'],
    [0, -3, -3, '8a9822b2cbeccd9eeb388b816426f5ec0673f8cce2bd6d73140d4778693c24fd'],
    [703, 2, 2, 'fa249150b08eb8ff9ec32e4bb9b18c446ad3942433287ad142ba96ae07630b0a'],
    [703, -3, -3, 'f1f0211f5e7e7dc13660f58f722101c712741115bd87d8762da2114a57243717'],
    [903, 2, 2, 'a349f253f21bef26208a47bd0b1fdb50ff179780781dc0af58223aaa2f8a2a6b'],
    [903, -3, -3, '5dfd403edfc9948ba6f72e99ab38f1ae74e06221c9ffa442d53bdd96783f6d28'],
  ] as const;
  for (const [seed, x, y, expected] of fixtures) {
    const world = new InfiniteWorld(seed, 1);
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify(world.chunk(x, y)))
        .digest('hex'),
      expected,
    );
  }
  assert.equal(new InfiniteWorld(2).generation, 3);
  assert.notDeepEqual(new InfiniteWorld(2, 1).chunk(2, 2), new InfiniteWorld(2, 2).chunk(2, 2));
  assert.throws(() => new InfiniteWorld(2, 4 as 2), /Unsupported/);
});

test('warped climate is continuous across positive, negative and distant chunk seams', () => {
  const world = new InfiniteWorld(71, 2);
  for (const [x, y] of [
    [16, -16],
    [-32, 48],
    [1_000_000, -999_984],
    [-1_000_000, 999_984],
  ]) {
    const left = world.climate(x - 0.00001, y - 0.00001),
      right = world.climate(x + 0.00001, y + 0.00001);
    for (const field of ['elevation', 'moisture', 'regionalCold', 'coldness'] as const)
      assert.ok(Math.abs(left[field] - right[field]) < 0.00001, `${x},${y}: ${field}`);
    for (const biome of ['frostwood', 'tundra', 'marsh', 'highlands'] as const)
      assert.ok(
        Math.abs(left.weights[biome] - right.weights[biome]) < 0.0001,
        `${x},${y}: ${biome}`,
      );
    assert.deepEqual(world.climate(x, y), new InfiniteWorld(71, 2).climate(x, y));
  }
});

test('regional climate gives coherent ice-age biome transitions and colder highlands', () => {
  const world = new InfiniteWorld(903, 2),
    samples = [],
    biomes = new Set<string>();
  let mixed = 0;
  for (let i = 0; i < 1600; i++) {
    const c = world.climate(((i * 137) % 4001) - 2000, ((i * 193) % 4003) - 2000);
    samples.push(c);
    biomes.add(c.biome);
    assert.ok(c.temperature < -5 && c.temperature > -35);
    assert.ok(Object.values(c.weights).every((w) => Number.isFinite(w) && w >= 0 && w <= 1));
    assert.ok(Math.abs(Object.values(c.weights).reduce((a, b) => a + b, 0) - 1) < 1e-12);
    if (Object.values(c.weights).filter((w) => w > 0.15).length >= 2) mixed++;
  }
  assert.deepEqual([...biomes].sort(), ['frostwood', 'highlands', 'marsh', 'tundra']);
  assert.ok(
    mixed > 200,
    'ecotones should contain meaningful blended suitability, not abrupt exclusive thresholds',
  );
  let comparable = 0;
  for (let i = 0; i < samples.length; i++)
    for (let j = i + 1; j < samples.length; j++) {
      const a = samples[i],
        b = samples[j];
      if (
        Math.abs(a.regionalCold - b.regionalCold) < 0.02 &&
        Math.abs(a.moisture - b.moisture) < 0.06 &&
        a.elevation > b.elevation + 0.35
      ) {
        assert.ok(
          a.temperature < b.temperature - 1,
          'higher ground must be colder at comparable regional climate and moisture',
        );
        comparable++;
      }
    }
  assert.ok(comparable > 20, 'sample enough independent altitude/climate combinations');
});

test('settlement discovery does not generate or evict terrain chunks', () => {
  const world = new InfiniteWorld(703, 2);
  const towns = world.settlementsAround(0, 0, 112);
  assert.ok(towns.length >= 5);
  assert.equal(world.cacheSize, 0);
  assert.ok(towns.every((t) => Math.hypot(t.x, t.y) <= 112));
  assert.equal(new Set(towns.map((t) => t.id)).size, towns.length);
  for (const t of towns)
    assert.ok(
      world
        .chunk(Math.floor(t.x / 16), Math.floor(t.y / 16))
        .settlements.some((s) => s.id === t.id),
    );
  const before = world.cacheSize;
  assert.deepEqual(world.settlementsAround(0, 0, 112), towns);
  assert.equal(world.cacheSize, before);
});

test('open-roof vaults have an uninterrupted road approach, connected rooms, deep loot and actual guards', () => {
  for (let seed = 0; seed < 24; seed++) {
    const world = new InfiniteWorld(seed, 2);
    const site = world.vaultsAround(40, 40, 1)[0];
    assert.ok(site, 'the first excavation is always discoverable southeast of the cathedral');
    assert.equal(world.cacheSize, 0, 'site discovery should not build terrain chunks');
    const start = { x: site.entrance.x, y: 80 };
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
          id = `${p.x},${p.y}`,
          t = world.tile(p.x, p.y);
        if (seen.has(id) || t.site !== site.id || world.blocked(p.x, p.y)) continue;
        seen.add(id);
        queue.push(p);
      }
    assert.ok(
      seen.has(`${site.reward.x},${site.reward.y}`),
      `${seed}: loot unreachable from road approach`,
    );
    assert.ok(seen.size > 100, 'vault must contain connected rooms rather than one short passage');
    let walls = 0;
    for (let y = 24; y < 56; y++)
      for (let x = 24; x < 56; x++) {
        const tile = world.tile(x, y);
        if (tile.site !== site.id) continue;
        assert.equal(tile.building, undefined, 'excavations must remain open roof');
        if (tile.terrain === 'wall') {
          walls++;
          assert.ok(world.blocked(x, y));
        } else assert.ok(seen.has(`${x},${y}`), `${seed}: isolated excavation floor ${x},${y}`);
      }
    assert.ok(walls > 50, 'generated rooms need substantial real collision boundaries');
    const props = world
      .propsAround(site.x, site.y, 48)
      .filter((p) => p.id.startsWith(site.id + ':'));
    assert.ok(
      props.some(
        (p) =>
          p.id === `${site.id}:cache` &&
          p.kind === 'chest' &&
          p.x === site.reward.x &&
          p.y === site.reward.y,
      ),
    );
    assert.ok(props.some((p) => p.id === `${site.id}:notice` && !world.blocked(p.x, p.y)));
    const guards = world
      .npcsAround(site.x, site.y, 24)
      .filter((n) => n.id.startsWith(site.id + ':guard:'));
    assert.equal(guards.length, 2);
    for (const guard of guards) {
      assert.ok(guard.hostile);
      assert.ok(seen.has(`${guard.x},${guard.y}`));
      assert.ok(Math.hypot(guard.x - site.entrance.x, guard.y - site.entrance.y) > 10);
    }
  }
});

test('vault occurrence and placement are deterministic in negative districts and absent from legacy worlds', () => {
  const a = new InfiniteWorld(703, 2),
    b = new InfiniteWorld(703, 2);
  const expected = a.vaultsAround(-80, -80, 128);
  assert.ok(expected.some((v) => v.x < 0 && v.y < 0));
  for (let x = 0; x < 40; x++) b.vaultsAround(x * 80, 160, 100);
  assert.deepEqual(b.vaultsAround(-80, -80, 128), expected);
  for (const site of expected) {
    assert.deepEqual(a.tile(site.reward.x, site.reward.y), b.tile(site.reward.x, site.reward.y));
    assert.equal(a.blocked(site.entrance.x, site.entrance.y), false);
  }
  const legacy = new InfiniteWorld(703, 1);
  assert.deepEqual(legacy.vaultsAround(40, 40, 128), []);
  assert.ok(!legacy.propsAround(40, 40, 40).some((p) => p.id.startsWith('vault:')));
});

test('chunk seams and content are independent of load order including negative and far coordinates', () => {
  const a = new InfiniteWorld(703, 2),
    b = new InfiniteWorld(703, 2);
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
    const world = new InfiniteWorld(seed, 2);
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
  const world = new InfiniteWorld(2, 2),
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
    const world = new InfiniteWorld(seed, 2),
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
  const world = new InfiniteWorld(319, 2);
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
  const world = new InfiniteWorld(903, 2),
    biomes = new Set<string>(),
    terrain = new Set<string>(),
    shapes = new Set<string>();
  let neighbors = 0,
    matching = 0;
  // Regional climate spans farther than the old local-only noise. Keep the same
  // 81 sampled chunks while covering multiple complete climate regions.
  for (let cy = -16; cy <= 16; cy += 4)
    for (let cx = -16; cx <= 16; cx += 4) {
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
  assert.notDeepEqual(new InfiniteWorld(1, 2).chunk(9, 9), new InfiniteWorld(2, 2).chunk(9, 9));
});

test('humanoid appearance is deterministic, visibly varied, and respects role and clan components', () => {
  const forms = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const a = appearance(seed, 'guard', seed % 6);
    assert.deepEqual(a, appearance(seed, 'guard', seed % 6));
    assert.ok(['sword', 'bow'].includes(a.weapon));
    assert.ok(a.height >= 0.88 && a.height <= 1.14);
    assert.equal(a.trim, new InfiniteWorld(0, 2).clans[seed % 6].color);
    forms.add(JSON.stringify(a));
  }
  assert.equal(forms.size, 100);
  assert.equal(appearance(3, 'botanist').weapon, 'staff');
});

test('generation two terrain, settlement anchors and vaults retain reviewed snapshots after the wider world revision', () => {
  // Origin display names were intentionally refreshed for the Vespera correction.
  // The separate pre-rename geometry fixtures below prove those labels did not move the world.
  const fixtures = [
    [0, 0, 0, '1dbe670245876907947e46395dca5e9ba6838f34e023529467d23cbde83be9a7'],
    [0, 2, 2, 'bd2db888e3a1e5500b10cd604807627a9657f0854432564b7bbcd0742ab0ac94'],
    [0, -3, -3, '105c011cad1f032ebae2ee89e888ffd6850c6819f634759e5b53aa2f9759a0ae'],
    [703, 0, 0, '983ae4cd9f5c35cd490ce712d48bc9ce3d41d2b9303ac5da6c24e4ab4ec686c0'],
    [703, 2, 2, '2a6836907d520312bf8a6db4495563e34379d440f383a26487acd24dbfc1f24d'],
    [703, 5, 0, '32ca66c4bd89c0f622b5dba061560b661db11031058564542687f89224034635'],
    [1398032707, -3, -3, 'e5c1f7c89f1166517b13cdfe742514e16a2d512da103d9e3017e2adc120fcf62'],
    [1398032707, 5, 0, 'aa61fa3a7a497186d144240fac6b7786d6770f2eba41e36f441ba0b9ec6b95e1'],
  ] as const;
  for (const [seed, cx, cy, expected] of fixtures)
    assert.equal(
      createHash('sha256')
        .update(JSON.stringify(new InfiniteWorld(seed, 2).chunk(cx, cy)))
        .digest('hex'),
      expected,
    );
});

test('generation three separates cities by 640 tiles and composes smaller seeded stops between them', () => {
  const counts = new Set<number>(),
    ranks = new Set<string>(),
    positions = new Set<string>();
  for (let seed = 0; seed < 100; seed++) {
    const world = new InfiniteWorld(seed, 3),
      towns = world.settlementsAround(0, 0, 700),
      cities = towns.filter((t) => t.rank === 'city');
    assert.equal(world.cacheSize, 0, 'large settlement queries must remain metadata-only');
    assert.equal(
      cities.length,
      5,
      'origin plus four neighboring cities, not a church every short road',
    );
    for (const a of cities)
      for (const b of cities)
        if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= CITY_SPACING);
    for (const t of towns) {
      assert.ok(Number.isInteger(t.x) && Number.isInteger(t.y));
      ranks.add(t.rank!);
      assert.equal(t.kind === 'cathedral', t.rank === 'city');
    }
    for (const sign of [-1, 1]) {
      const roadStops = towns
        .filter(
          (t) => Math.abs(t.y) <= 10 && Math.sign(t.x) === sign && Math.abs(t.x) < CITY_SPACING,
        )
        .sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
      assert.equal(roadStops.length, 2, 'two smaller stops divide the long city road');
      assert.ok(Math.abs(roadStops[0].x) >= 193 && Math.abs(roadStops[0].x) <= 234);
      assert.ok(
        Math.abs(roadStops[1].x - roadStops[0].x) >= 190 &&
          Math.abs(roadStops[1].x - roadStops[0].x) <= 240,
      );
    }
    counts.add(towns.length);
    positions.add(JSON.stringify(towns.map((t) => [t.x, t.y, t.rank])));
  }
  assert.equal(positions.size, 100);
  assert.ok(counts.size > 3);
  assert.deepEqual([...ranks].sort(), ['city', 'hamlet', 'village']);
});

test('generation three building archetypes, residents and useful fixtures connect to actual road crossings', () => {
  const kinds = new Set<string>(),
    sizes = new Set<string>(),
    buildingCounts = new Set<number>();
  for (const seed of [3, 71, 703]) {
    const world = new InfiniteWorld(seed, 3),
      towns = world.settlementsAround(0, 0, 700);
    const selected = ['city', 'village', 'hamlet'].map(
      (rank) => towns.find((t) => t.rank === rank && t.id !== 'origin')!,
    );
    selected.push(towns.find((t) => t.id === 'origin')!);
    for (const town of selected) {
      assert.ok(town);
      const seen = reachable(world, town, town.radius + 3),
        footprints = new Map<string, Tile[]>();
      for (let y = town.y - town.radius; y <= town.y + town.radius; y++)
        for (let x = town.x - town.radius; x <= town.x + town.radius; x++) {
          const tile = world.tile(x, y);
          if (!tile.building?.startsWith(town.id + ':')) continue;
          assert.ok(tile.buildingKind, 'every footprint tile needs an honest renderer archetype');
          const cells = footprints.get(tile.building) ?? [];
          cells.push(tile);
          footprints.set(tile.building, cells);
        }
      buildingCounts.add(footprints.size);
      assert.equal(
        [...footprints.values()].filter((c) => c[0].buildingKind === 'church').length,
        town.rank === 'city' ? 1 : 0,
      );
      for (const cells of footprints.values()) {
        const kind = cells[0].buildingKind!;
        kinds.add(kind);
        assert.ok(cells.every((c) => c.buildingKind === kind));
        const xs = cells.map((c) => c.x),
          ys = cells.map((c) => c.y);
        const width = Math.max(...xs) - Math.min(...xs) + 1,
          depth = Math.max(...ys) - Math.min(...ys) + 1;
        assert.equal(
          cells.length,
          width * depth,
          'footprint is complete, without clipped roofs or disconnected wings',
        );
        sizes.add(`${width}:${depth}`);
      }
      for (const npc of world.npcsAround(town.x, town.y, town.radius + 1))
        if (npc.id.startsWith(town.id + ':') || npc.id.startsWith('origin-')) {
          assert.ok(Number.isInteger(npc.x) && Number.isInteger(npc.y));
          assert.ok(
            seen.has(`${npc.x},${npc.y}`),
            `${town.id}/${npc.id} must stand on connected ground`,
          );
        }
      const props = world
        .propsAround(town.x, town.y, town.radius + 2)
        .filter((p) => p.id.startsWith(town.id + ':') || p.id === 'origin-radio');
      for (const prop of props)
        assert.ok(accessible(seen, prop), `${seed}/${town.id}/${prop.id} cannot be used`);
      for (const kind of ['cequin', 'workbench', 'bench'])
        assert.ok(props.some((p) => p.kind === kind));
      const crossing = {
        x: Math.round(Math.round(town.x / STOP_SPACING) * STOP_SPACING),
        y: Math.round(Math.round(town.y / STOP_SPACING) * STOP_SPACING),
      };
      assert.ok(
        seen.has(`${crossing.x},${crossing.y}`),
        'local streets connect to the rounded global crossing',
      );
    }
  }
  assert.ok(
    kinds.has('church') &&
      kinds.has('inn') &&
      kinds.has('workshop') &&
      kinds.has('house') &&
      kinds.has('storehouse') &&
      kinds.has('greenhouse'),
  );
  assert.ok(sizes.size >= 5);
  assert.ok(buildingCounts.size >= 3);
});

test('rounded generation-three roads remain unbroken across distant cities, negative coordinates and chunk eviction', () => {
  for (const seed of [0, 703]) {
    const world = new InfiniteWorld(seed, 3),
      original = structuredClone(world.chunk(-41, 0));
    for (let p = -1920; p <= 1920; p++) {
      assert.equal(world.blocked(p, 0), false, `${seed}: east/west ${p}`);
      assert.equal(world.blocked(0, p), false, `${seed}: north/south ${p}`);
    }
    for (const index of [-7, -2, 1, 5]) {
      const line = Math.round(index * STOP_SPACING);
      for (let p = -220; p <= 220; p++) {
        assert.equal(world.blocked(line, p), false, `${seed}: rounded vertical ${line},${p}`);
        assert.equal(world.blocked(p, line), false, `${seed}: rounded horizontal ${p},${line}`);
      }
    }
    assert.equal(world.cacheSize, 160);
    assert.deepEqual(world.chunk(-41, 0), original);
    assert.deepEqual(
      world.tile(-1_000_016, 1_000_016),
      new InfiniteWorld(seed, 3).tile(-1_000_016, 1_000_016),
    );
    assert.deepEqual(
      world.climate(347, -819),
      new InfiniteWorld(seed, 2).climate(347, -819),
      'world spacing reuses coherent climate rather than reseeding biomes',
    );
  }
});

test('generation three relocates vaults between wider settlements with an accessible road approach', () => {
  for (const seed of [0, 71, 703]) {
    const world = new InfiniteWorld(seed, 3),
      site = world.vaultsAround(107, 107, 1)[0];
    assert.ok(site);
    assert.ok(Number.isInteger(site.entrance.x) && Number.isInteger(site.entrance.y));
    for (const town of world.settlementsAround(site.x, site.y, 300))
      assert.ok(Math.hypot(site.x - town.x, site.y - town.y) > town.radius + 32);
    for (let y = site.entrance.y; y <= 213; y++)
      assert.equal(world.blocked(site.entrance.x, y), false, `${seed}: vault approach ${y}`);
    const seen = reachable(world, site.entrance, 40);
    assert.ok(seen.has(`${site.reward.x},${site.reward.y}`));
    for (const npc of world
      .npcsAround(site.x, site.y, 24)
      .filter((n) => n.id.startsWith(site.id + ':guard:')))
      assert.ok(seen.has(`${npc.x},${npc.y}`));
    assert.ok(world.propsAround(site.entrance.x, 212, 3).some((p) => p.id === site.id + ':notice'));
  }
});

test('Vespera labels the city and cathedral while all three generations retain their exact origin geometry', () => {
  // These pre-rename fixtures omit only prop/settlement display names. NPC names,
  // seeds, positions, doors, terrain, resources and every other property remain hashed.
  const fixtures = [
    [1, 0, 0, '3ab5acf653123c5f9168dc5a2506c38e1d0326cd4dc870b8c6134100ee9026c9'],
    [1, 0, -1, 'c19d63ddc1a4df468b4ab7ad81bc601f5a3d86e3194d99eae5094a9d8a24b5f8'],
    [1, -1, -1, '60cd744c9341ce6c1ddbd61078f30e0275637ce23e2b694744c2cd921d38d393'],
    [1, -1, 0, 'dba16d8f12dc8d6780075f3d9487c8c32ab073f41555090c06c7bf0b9b38f010'],
    [2, 0, 0, 'fd2487cd9a77e7b8f2ef61e7edcf333646f0bd02e6ed3fe0b7d55574c86da53d'],
    [2, 0, -1, 'd375b2c56f35b2a283305b3c834a5f0e6b53fa77628ec868786134b90e1e1c92'],
    [2, -1, -1, '28aaf60351e245a357c590708429991b2fcac28dd3d1280c27ab0773d222eaca'],
    [2, -1, 0, '52235fa694484d0b60fcd12ba417a9c4a5a2a5f708ccc93567a9029cf515b011'],
    [3, 0, 0, '86eff48e98f5253d9e8ac6aa86a3c137ed6fac8278552fcf83b0e52c9ada325c'],
    [3, 0, -1, '928e6bc85a6030f7dddf6d170a2eb2560a8bc65b2d3b5e4799524d85d66dd2d3'],
    [3, -1, -1, '3cec5188af94fd5082e8d8588729edef545c206ce7bcbb238a30b2b138ded767'],
    [3, -1, 0, '6911631a51be98c97b5b076ea78ab5845bbe61df51e82bf0cd01aeb4ae531393'],
  ] as const;
  for (const [generation, cx, cy, expected] of fixtures) {
    const chunk = new InfiniteWorld(703, generation).chunk(cx, cy);
    const geometry = {
      ...chunk,
      props: chunk.props.map(({ name: _name, ...p }) => p),
      settlements: chunk.settlements.map(({ name: _name, ...s }) => s),
    };
    assert.equal(createHash('sha256').update(JSON.stringify(geometry)).digest('hex'), expected);
  }
  for (const generation of [1, 2, 3] as const) {
    const world = new InfiniteWorld(703, generation);
    assert.equal(world.settlementsAround(0, 0, 1)[0].name, 'Vespera');
    const cathedral = world.propsAround(0, -5, 16).filter((p) => p.id.startsWith('origin:hall:'));
    assert.ok(cathedral.length >= 3);
    assert.ok(cathedral.every((p) => p.name === 'Cathedral of Vespera'));
    assert.equal(
      world.propsAround(0, 0, 4).find((p) => p.id === 'origin:notice')?.name,
      'Vespera noticeboard',
    );
  }
});
