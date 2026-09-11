import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { InfiniteWorld, CITY_SPACING, STOP_SPACING } from '../src/stichos/world.ts';
import {
  ecologyProfile,
  STICHOS_CLIMATE_SEED,
  type RegionalClimate,
} from '../src/stichos/ecology.ts';
import type { Point, Tile } from '../src/stichos/types.ts';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

test('regional generation preserves complete generation-three maps and never silently upgrades old worlds', () => {
  for (const [seed, x, y, expected] of [
    [703, 0, 0, '497aa83bb3bc92afce72d1cc90a4b83d9299bcea89b4a1a53df0199aba34a6ff'],
    [703, 13, 0, '56677f63b0ae86a24d499f62b035f15ec90f7dbf98af8e9d3aa3b57550002a2e'],
    [703, 40, 0, 'bf6ea9a96e94ff88f1b35564e74a7075e6fdc7ba9f3c681340bc317348dda00d'],
    [903, 27, -19, 'e66e8f6b8746ce2027f446f274c979b1c8969c6609486c98309ef998bf4d8038'],
  ] as const)
    assert.equal(digest(new InfiniteWorld(seed, 3).chunk(x, y)), expected);
  assert.equal(new InfiniteWorld(71).generation, 3);
  assert.notEqual(
    digest(new InfiniteWorld(71, 3).chunk(0, 0)),
    digest(new InfiniteWorld(71, 4).chunk(0, 0)),
  );
});

test('generation four produces eleven ecologically distinct biomes with continuous blended climate', () => {
  const world = new InfiniteWorld(71, 4),
    biomes = new Set<string>();
  let mixed = 0;
  for (let i = 0; i < 1800; i++) {
    const c = world.climate(((i * 137) % 16001) - 8000, ((i * 293) % 16007) - 8000);
    biomes.add(c.biome);
    const values = Object.values(c.weights);
    assert.ok(values.every((v) => Number.isFinite(v) && v >= 0 && v <= 1));
    assert.ok(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    if (values.filter((w) => w > 0.15).length > 1) mixed++;
  }
  assert.deepEqual([...biomes].sort(), [
    'alpine',
    'badlands',
    'dunes',
    'frostwood',
    'highlands',
    'marsh',
    'meadow',
    'tundra',
    'volcanic',
    'wetland',
    'woodland',
  ]);
  assert.ok(mixed > 600, 'ecotones blend multiple biome suitability functions');
  for (const [x, y] of [
    [16, -16],
    [-32, 48],
    [1_000_000, -999_984],
    [-1_000_000, 999_984],
  ]) {
    const left = world.climate(x - 0.00001, y - 0.00001),
      right = world.climate(x + 0.00001, y + 0.00001);
    for (const field of [
      'elevation',
      'moisture',
      'regionalCold',
      'coldness',
      'geothermal',
    ] as const)
      assert.ok(Math.abs(left[field]! - right[field]!) < 0.00001, `${x},${y} ${field}`);
    for (const biome of Object.keys(left.weights))
      assert.ok(
        Math.abs(left.weights[biome] - right.weights[biome]) < 0.0001,
        `${x},${y} ${biome}`,
      );
  }
});

test('Stíchos keeps its ice-age climate while thermal refugia and other planets obey their own heat budgets', () => {
  const stichos = new InfiniteWorld(STICHOS_CLIMATE_SEED, 4),
    warmer = new InfiniteWorld(71, 4);
  let cold = 0,
    refuge = 0,
    totalStichos = 0,
    totalWarm = 0;
  assert.ok(
    stichos.climate(0, 5).temperature < -5,
    'Theo still awakens in the freezing cathedral district',
  );
  assert.equal(stichos.settlementsAround(0, 0, 1)[0].architecture?.style, 'gothic');
  for (let i = 0; i < 1500; i++) {
    const x = ((i * 137) % 16001) - 8000,
      y = ((i * 293) % 16007) - 8000;
    const c = stichos.climate(x, y);
    if (c.temperature < -5) cold++;
    if (c.temperature > 5) {
      refuge++;
      assert.ok(c.geothermal! > 0.3, 'warm Stíchos sites are caused by geothermal heat');
    }
    totalStichos += c.temperature;
    totalWarm += warmer.climate(x, y).temperature;
  }
  assert.ok(cold > 1050 && refuge > 10);
  assert.ok(
    totalWarm / 1500 - totalStichos / 1500 > 14,
    'planet seeds change climate physically, not just planet names',
  );
});

test('regional geometry and culture reconstruct exactly after reverse visits and bounded cache eviction', () => {
  const world = new InfiniteWorld(71, 4),
    other = new InfiniteWorld(71, 4);
  const coords = [
    [-17, -17],
    [0, 0],
    [15, 16],
    [-1_000_016, 1_000_016],
    [640, 0],
    [-428, -1929],
  ];
  const before = coords.map(([x, y]) =>
    structuredClone(world.chunk(Math.floor(x / 16), Math.floor(y / 16))),
  );
  for (const [x, y] of [...coords].reverse()) other.tile(x, y);
  for (let i = 0; i < coords.length; i++)
    assert.deepEqual(
      other.chunk(Math.floor(coords[i][0] / 16), Math.floor(coords[i][1] / 16)),
      before[i],
    );
  for (let i = 0; i < 165; i++) world.chunk(i * 3 + 7, -i - 3);
  assert.equal(world.cacheSize, 160);
  for (let i = 0; i < coords.length; i++)
    assert.deepEqual(
      world.chunk(Math.floor(coords[i][0] / 16), Math.floor(coords[i][1] / 16)),
      before[i],
    );
  assert.equal(world.cacheSize, 160);
});

function reachable(world: InfiniteWorld, start: Point, radius: number) {
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
        seen.has(key) ||
        Math.abs(p.x - start.x) > radius ||
        Math.abs(p.y - start.y) > radius ||
        world.blocked(p.x, p.y, undefined, true)
      )
        continue;
      seen.add(key);
      queue.push(p);
    }
  return seen;
}

test('six regional architecture grammars share local material and retain connected rooms and one cathedral per distant city', () => {
  const world = new InfiniteWorld(71, 4),
    towns = world.settlementsAround(0, 0, 2048);
  assert.equal(world.cacheSize, 0, 'galaxy/settlement queries never load base terrain');
  const selected = new Map(towns.map((t) => [t.architecture!.style, t]));
  assert.deepEqual([...selected.keys()].sort(), [
    'adobe',
    'alpine',
    'basalt',
    'gothic',
    'stilt',
    'timber',
  ]);
  const cities = towns.filter((t) => t.rank === 'city');
  for (const a of cities)
    for (const b of cities)
      if (a.id !== b.id) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= CITY_SPACING);
  for (const town of selected.values()) {
    const seen = reachable(world, town, town.radius + 3),
      buildings = new Map<string, Tile[]>();
    for (let y = town.y - town.radius; y <= town.y + town.radius; y++)
      for (let x = town.x - town.radius; x <= town.x + town.radius; x++) {
        const tile = world.tile(x, y);
        assert.deepEqual(
          tile.architecture,
          town.architecture,
          'town walls, roads and buildings share one regional craft grammar',
        );
        if (!tile.building) continue;
        const cells = buildings.get(tile.building) ?? [];
        cells.push(tile);
        buildings.set(tile.building, cells);
      }
    assert.equal(
      [...buildings.values()].filter((cells) => cells[0].buildingKind === 'church').length,
      town.rank === 'city' ? 1 : 0,
    );
    for (const cells of buildings.values()) {
      const width = Math.max(...cells.map((c) => c.x)) - Math.min(...cells.map((c) => c.x)) + 1;
      const depth = Math.max(...cells.map((c) => c.y)) - Math.min(...cells.map((c) => c.y)) + 1;
      assert.equal(cells.length, width * depth, 'roof footprint must stay complete');
      assert.ok(
        cells.some((c) => c.terrain === 'floor' && seen.has(`${c.x},${c.y}`)),
        'actual interior remains accessible',
      );
    }
    for (const npc of world.npcsAround(town.x, town.y, town.radius + 1))
      if (npc.id.startsWith(town.id + ':')) assert.ok(seen.has(`${npc.x},${npc.y}`), npc.id);
    const crossing = {
      x: Math.round(Math.round(town.x / STOP_SPACING) * STOP_SPACING),
      y: Math.round(Math.round(town.y / STOP_SPACING) * STOP_SPACING),
    };
    assert.ok(
      seen.has(`${crossing.x},${crossing.y}`),
      'architecture adapts without breaking the road approach',
    );
    if (town.architecture!.style === 'stilt') assert.equal(town.architecture!.raised, true);
    if (town.architecture!.style === 'adobe')
      assert.equal(town.architecture!.wallMaterial, 'adobe');
    if (town.architecture!.style === 'alpine') assert.equal(town.architecture!.roof, 'steep');
  }
});

test('actual vegetation, minerals and water reflect climate and survive browser reconstruction as tool-harvestable entities', () => {
  const world = new InfiniteWorld(71, 4),
    forms = new Set<string>(),
    minerals = new Set<string>(),
    grounds = new Set<string>();
  const totals: Record<string, { tiles: number; trees: number; rocks: number }> = {};
  let neighborCount = 0,
    matching = 0;
  for (let i = 0; i < 120; i++) {
    const x = ((i * 137) % 16001) - 8000,
      y = ((i * 293) % 16007) - 8000;
    const chunk = world.chunk(Math.floor(x / 16), Math.floor(y / 16));
    for (const tile of chunk.tiles) {
      grounds.add(tile.terrain);
      const count = (totals[tile.biome] ??= { tiles: 0, trees: 0, rocks: 0 });
      count.tiles++;
      const c = world.climate(tile.x, tile.y) as RegionalClimate;
      const e = ecologyProfile(c);
      assert.equal(tile.ecology!.treeForm, e.treeForm);
      assert.equal(tile.ecology!.rockMaterial, e.rockMaterial);
      if (tile.terrain === 'ice') assert.ok(c.temperature < -1);
      if (tile.terrain === 'water') assert.ok(c.temperature >= -1);
      if (tile.x < chunk.cx * 16 + 15) {
        neighborCount++;
        if (world.tile(tile.x + 1, tile.y).biome === tile.biome) matching++;
      }
    }
    for (const p of chunk.props) {
      const tile = world.tile(p.x, p.y),
        count = totals[tile.biome];
      if (p.kind === 'pine') {
        forms.add(p.vegetation!);
        count.trees++;
        assert.ok(p.solid);
        assert.ok(!['road', 'water', 'ice'].includes(tile.terrain));
      }
      if (p.kind === 'rock') {
        minerals.add(p.mineral!);
        count.rocks++;
        assert.ok(p.solid);
      }
    }
  }
  assert.ok(
    matching / neighborCount > 0.96,
    'regional contours must not degenerate into per-tile biome noise',
  );
  assert.ok(
    forms.has('conifer') &&
      forms.has('broadleaf') &&
      forms.has('willow') &&
      forms.has('acacia') &&
      (forms.has('palm') || forms.has('cactus')),
  );
  for (const mineral of ['granite', 'slate', 'sandstone', 'basalt', 'limestone'])
    assert.ok(minerals.has(mineral), mineral);
  for (const ground of ['snow', 'grass', 'sand', 'mud', 'basalt', 'water', 'ice'])
    assert.ok(grounds.has(ground), ground);
  assert.ok(
    totals.woodland.trees / totals.woodland.tiles > (totals.dunes.trees / totals.dunes.tiles) * 4,
    'woodland has physically denser trees than dunes',
  );
  assert.ok(
    totals.volcanic.rocks / totals.volcanic.tiles >
      (totals.woodland.rocks / totals.woodland.tiles) * 2,
    'mineral seams follow geology',
  );
});

test('new biome roads remain traversable and generation-four residents carry varied individually constructed gear', () => {
  const world = new InfiniteWorld(71, 4),
    kinds = new Set<string>(),
    seeds = new Set<number>();
  for (let x = -640; x <= 640; x++)
    assert.equal(world.blocked(x, 0, undefined, true), false, `route ${x},0`);
  for (let y = -240; y <= 240; y++)
    assert.equal(world.blocked(213, y, undefined, true), false, `route 213,${y}`);
  for (const town of world.settlementsAround(0, 0, 700).slice(0, 12))
    for (const npc of world.npcsAround(town.x, town.y, town.radius)) {
      kinds.add(npc.appearance.weapon);
      if (npc.appearance.weapon !== 'none') {
        assert.equal(typeof npc.appearance.weaponSeed, 'number');
        assert.ok(!seeds.has(npc.appearance.weaponSeed!));
        seeds.add(npc.appearance.weaponSeed!);
      }
    }
  assert.deepEqual([...kinds].sort(), ['bow', 'none', 'staff', 'sword']);
  assert.ok(seeds.size > 12);
});
