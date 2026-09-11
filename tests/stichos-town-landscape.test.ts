import test from 'node:test';
import assert from 'node:assert/strict';
import { InfiniteWorld } from '../src/stichos/world.ts';
import { ecologyProfile, type RegionalClimate } from '../src/stichos/ecology.ts';
import type { Settlement, Tile } from '../src/stichos/types.ts';

function townTiles(world: InfiniteWorld, town: Settlement): Tile[] {
  const tiles: Tile[] = [];
  for (let y = town.y - town.radius; y <= town.y + town.radius; y++)
    for (let x = town.x - town.radius; x <= town.x + town.radius; x++) tiles.push(world.tile(x, y));
  return tiles;
}

test('planned town parcels fill building-side ground with spaced, tool-harvestable local trees', () => {
  const world = new InfiniteWorld(11, 4);
  const town = world.settlementsAround(-213, 0, 30)[0];
  const tiles = townTiles(world, town);
  const planted = tiles.filter((tile) => tile.landscape);
  const trees = world
    .propsAround(town.x, town.y, town.radius * 1.5)
    .filter((prop) => prop.id.includes(':landscape:'));
  assert.ok(
    planted.length >= 40 && planted.length <= 180,
    'bounded small parcels fill the town interior',
  );
  assert.ok(
    trees.length >= 3 && trees.length <= 12,
    'managed groves add several trees without closing the town',
  );
  assert.ok(
    trees.some(
      (tree) => Math.max(Math.abs(tree.x - town.x), Math.abs(tree.y - town.y)) < town.radius - 4,
    ),
    'new trees may occupy planned interior parcels, not only the old perimeter belt',
  );
  for (const tree of trees) {
    assert.equal(tree.kind, 'pine');
    assert.equal(tree.solid, true);
    assert.equal(
      tree.vegetation,
      ecologyProfile(world.climate(tree.x, tree.y) as RegionalClimate).treeForm,
    );
    assert.ok(world.tile(tree.x, tree.y).landscape);
    assert.equal(world.blocked(tree.x, tree.y, undefined, true), true);
    assert.equal(
      world.blocked(tree.x, tree.y, new Set([tree.id]), true),
      false,
      'harvesting the real tree opens its tile; cosmetic planting never blocks movement',
    );
    for (const other of trees)
      if (tree.id !== other.id) assert.ok(Math.hypot(tree.x - other.x, tree.y - other.y) >= 3);
  }
});

test('parcel edges reconstruct across chunks while roads, wall verges, doors, gardens and civic work remain clear', () => {
  for (const seed of [11, 71]) {
    const world = new InfiniteWorld(seed, 4);
    const towns = [world.settlementsAround(0, 0, 1)[0], world.settlementsAround(-213, 0, 35)[0]];
    for (const town of towns) {
      const tiles = townTiles(world, town);
      const planted = tiles.filter((tile) => tile.landscape);
      const parcels = new Map<string, Tile[]>();
      for (const tile of planted) {
        const id = tile.landscape!.parcel;
        parcels.set(id, [...(parcels.get(id) ?? []), tile]);
      }
      for (const cells of parcels.values()) {
        assert.ok(
          cells.length >= 3,
          'clearance clipping removes isolated pots and two-cell slivers',
        );
        const unseen = new Set(cells.map((tile) => `${tile.x},${tile.y}`)),
          queue = [cells[0]];
        unseen.delete(`${cells[0].x},${cells[0].y}`);
        for (let i = 0; i < queue.length; i++)
          for (const next of cells)
            if (
              Math.abs(next.x - queue[i].x) + Math.abs(next.y - queue[i].y) === 1 &&
              unseen.delete(`${next.x},${next.y}`)
            )
              queue.push(next);
        assert.equal(unseen.size, 0, 'every named garden compound is cardinally contiguous');
      }
      const props = world.propsAround(town.x, town.y, town.radius * 1.5);
      const buildings = tiles.filter((tile) => tile.building);
      for (const tile of planted) {
        assert.ok(!tile.building && !tile.cultivated);
        assert.ok(!['road', 'bridge', 'wall', 'water', 'ice'].includes(tile.terrain));
        for (const b of buildings)
          assert.ok(
            Math.max(Math.abs(tile.x - b.x), Math.abs(tile.y - b.y)) > 1,
            'one tile around building walls remains bare',
          );
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            assert.ok(
              !['road', 'bridge'].includes(world.tile(tile.x + dx, tile.y + dy).terrain),
              'roads retain their complete one-tile verge',
            );
        for (const door of props.filter((prop) => prop.kind === 'door'))
          assert.ok(
            Math.abs(tile.x - door.x) > 1 || Math.abs(tile.y - door.y) > 5,
            'doors retain a wide approach',
          );
        assert.ok(
          !props.some((prop) => prop.x === tile.x && prop.y === tile.y && prop.kind !== 'pine'),
        );
        assert.ok(!world.npcsAround(tile.x, tile.y, 0).length);
        for (const [side, [dx, dy]] of [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ].entries()) {
          const same =
            world.tile(tile.x + dx, tile.y + dy).landscape?.parcel === tile.landscape!.parcel;
          assert.equal(Boolean(tile.landscape!.edge & (1 << side)), !same);
        }
      }
      const peer = new InfiniteWorld(seed, 4);
      for (const tile of [...planted].reverse())
        assert.deepEqual(
          peer.tile(tile.x, tile.y),
          tile,
          'visit order cannot change a parcel or its edge',
        );
    }
  }
});

test('unused southern town quadrants have public orchard shade without consuming road verges', () => {
  const world = new InfiniteWorld(11, 4),
    town = world.settlementsAround(-213, 0, 30)[0];
  const orchard = townTiles(world, town).filter((tile) =>
    tile.landscape?.parcel.includes(':orchard:'),
  );
  assert.ok(orchard.length >= 15, 'public planting has a coherent courtyard footprint');
  assert.ok(orchard.some((tile) => tile.x > town.x + 6 && tile.y > town.y + 2));
  const trees = world
    .propsAround(town.x, town.y, 30)
    .filter((prop) => prop.id.includes(':orchard:'));
  assert.ok(
    trees.some((tree) => tree.x > town.x + 6),
    'the formerly empty southeast quadrant gains real orchard shade',
  );
  assert.ok(trees.length <= 8, 'public planting remains navigable');
});

test('landscaping follows civilization containment and the local climatic density budget', () => {
  const industrial = new InfiniteWorld(71, 4);
  const towns = industrial.settlementsAround(0, 0, 700);
  const woodland = towns.find((town) => industrial.climate(town.x, town.y).biome === 'woodland')!;
  const desert = towns.find((town) => industrial.climate(town.x, town.y).biome === 'dunes')!;
  const lush = townTiles(industrial, woodland).filter((tile) => tile.landscape);
  const arid = townTiles(industrial, desert).filter((tile) => tile.landscape);
  assert.ok(lush.length > 0 && arid.length > 0);
  assert.ok(
    [...lush, ...arid].every((tile) => tile.landscape!.kind === 'planter'),
    'advanced low-organic settlements keep local growth in sealed beds',
  );
  assert.ok(
    lush[0].landscape!.density > arid[0].landscape!.density * 1.4,
    'desert planting remains much sparser than woodland planting',
  );
  const traditional = new InfiniteWorld(11, 4);
  const planted = townTiles(traditional, traditional.settlementsAround(0, 0, 1)[0]).filter(
    (tile) => tile.landscape,
  );
  assert.ok(planted.some((tile) => tile.landscape!.kind === 'grove'));
  assert.ok(planted.every((tile) => tile.landscape!.kind !== 'planter'));
  assert.ok(new InfiniteWorld(11, 3).chunk(0, 0).tiles.every((tile) => !tile.landscape));
});
