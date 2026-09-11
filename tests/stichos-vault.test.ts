import test from 'node:test';
import assert from 'node:assert/strict';
import { generateVault, VAULT_SIZE } from '../src/stichos/vault.ts';

test('vaults preserve connected rooms, deliberate cycles and a deep walkable reward after organic smoothing', () => {
  const signatures = new Set<string>();
  let smallest = Infinity,
    largest = 0;
  for (let seed = 0; seed < 128; seed++) {
    const vault = generateVault(seed);
    assert.equal(vault.size, 32);
    assert.equal(vault.floor.length, 1024);
    assert.deepEqual(generateVault(seed), vault, `seed ${seed} is reproducible`);
    signatures.add(Buffer.from(vault.floor).toString('hex'));
    const width = vault.size;
    const start = vault.entrance.y * width + vault.entrance.x;
    assert.equal(vault.entrance.y, width - 1);
    assert.equal(vault.floor[start], 1);
    assert.equal(vault.floor[start + 1], 1, 'the exterior doorway has two clear tile centers');
    const distance = new Map<number, number>([[start, 0]]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head],
        x = cell % width,
        y = Math.floor(cell / width);
      const adjacent = [
        x > 0 ? cell - 1 : -1,
        x < width - 1 ? cell + 1 : -1,
        y > 0 ? cell - width : -1,
        y < width - 1 ? cell + width : -1,
      ];
      for (const next of adjacent) {
        if (next < 0 || !vault.floor[next] || distance.has(next)) continue;
        distance.set(next, distance.get(cell)! + 1);
        queue.push(next);
      }
    }
    const floorCount = vault.floor.reduce((sum, value) => sum + value, 0);
    smallest = Math.min(smallest, floorCount);
    largest = Math.max(largest, floorCount);
    assert.equal(distance.size, floorCount, `seed ${seed} has no isolated cave fragments`);
    assert.ok(
      distance.get(vault.reward.y * width + vault.reward.x)! >= 24,
      'the reward requires entering the site deeply',
    );
    assert.ok(vault.rooms.length >= 4 && vault.rooms.length <= 8);
    assert.equal(vault.connections.filter((edge) => !edge.loop).length, vault.rooms.length - 1);
    assert.ok(
      vault.connections.some((edge) => edge.loop),
      'the corridor graph has a deliberate alternative route',
    );
    const reached = new Set([0]);
    for (let pass = 0; pass < vault.rooms.length; pass++)
      for (const edge of vault.connections) {
        if (reached.has(edge.from)) reached.add(edge.to);
        if (reached.has(edge.to)) reached.add(edge.from);
      }
    assert.equal(reached.size, vault.rooms.length);
    for (const room of vault.rooms) assert.ok(distance.has(room.center.y * width + room.center.x));
    for (const corridor of vault.corridors)
      for (let step = 0; step < corridor.length; step++) {
        const point = corridor[step];
        assert.equal(vault.floor[point.y * width + point.x], 1);
        if (step)
          assert.equal(
            Math.abs(point.x - corridor[step - 1].x) + Math.abs(point.y - corridor[step - 1].y),
            1,
          );
      }
    for (let i = 0; i < vault.floor.length; i++) {
      assert.ok(
        !vault.fixedFloor[i] || vault.floor[i],
        'smoothing cannot sever the fixed room/corridor topology',
      );
      assert.ok(!(vault.floor[i] && vault.walls[i]));
      assert.equal(vault.walls[i] === 1, vault.wallMask[i] > 0);
      const x = i % width,
        y = Math.floor(i / width);
      if ((x === 0 || x === width - 1 || y === 0 || y === width - 1) && vault.floor[i])
        assert.ok(
          y === width - 1 && (x === vault.entrance.x || x === vault.entrance.x + 1),
          'only the intended south doorway opens through the perimeter',
        );
      if (!vault.floor[i]) continue;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= width || y + dy >= width) continue;
        const next = (y + dy) * width + x + dx;
        assert.ok(
          vault.floor[next] || vault.walls[next],
          'every interior walking edge has continuous floor or a solid rock rim',
        );
      }
    }
  }
  assert.ok(signatures.size > 120, 'different seeds produce different spatial plans');
  assert.ok(largest - smallest > 100, 'organic floor area varies materially between plans');
});

test('vault generation has no order-dependent cache or shared mutable arrays', () => {
  const expected = generateVault(3886);
  const changed = generateVault(3886);
  changed.floor.fill(0);
  changed.rooms[0].center.x = -100;
  for (let seed = 800; seed < 830; seed++) generateVault(seed);
  assert.deepEqual(generateVault(3886), expected);
  assert.equal(VAULT_SIZE, 32);
  assert.throws(() => generateVault(Number.NaN));
  assert.throws(() => generateVault(Infinity));
  assert.throws(() => generateVault(1.5));
});
