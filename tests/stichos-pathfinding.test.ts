import test from 'node:test';
import assert from 'node:assert/strict';
import { findWalkingPath } from '../src/stichos/pathfinding.ts';
import { InfiniteWorld } from '../src/stichos/world.ts';
import type { Point } from '../src/stichos/types.ts';

test('a distant unobstructed click visits a narrow route rather than flooding the world', () => {
  let probes = 0;
  const path = findWalkingPath({ x: 0, y: 0 }, [{ x: 48, y: 0 }], () => {
    probes++;
    return false;
  });
  assert.equal(path.length, 48);
  assert.deepEqual(path.at(-1), { x: 48, y: 0 });
  assert.ok(probes < 160, `collision probes: ${probes}`);
});

test('routes take a real doorway and never cross solid walls or diagonal corners', () => {
  const blocked = (x: number, y: number) => x === 4 && y !== 6;
  const start = { x: 0, y: 0 },
    end = { x: 8, y: 0 };
  const path = findWalkingPath(start, [end], blocked);
  assert.equal(path.length, 20);
  assert.ok(path.some((p) => p.x === 4 && p.y === 6));
  let last = start;
  for (const point of path) {
    assert.equal(Math.abs(point.x - last.x) + Math.abs(point.y - last.y), 1);
    assert.equal(blocked(point.x, point.y), false);
    last = point;
  }
  assert.deepEqual(findWalkingPath(start, [end], blocked), path);
});

test('target approaches share a search and choose a reachable side', () => {
  const targets = [
    { x: 8, y: 0 },
    { x: 8, y: 1 },
    { x: 8, y: 2 },
  ];
  const blocked = (x: number, y: number) =>
    ((x === 7 || x === 9) && y < 2) || (y === -1 && x === 8);
  const path = findWalkingPath({ x: 0, y: 0 }, targets, blocked);
  assert.deepEqual(path.at(-1), { x: 8, y: 2 });
  assert.equal(path.length, 10);
});

test('unreachable and distant requests stay bounded and probe each cell once', () => {
  const calls = new Map<string, number>();
  const blocked = (x: number, y: number) => {
    const key = `${x},${y}`;
    calls.set(key, (calls.get(key) ?? 0) + 1);
    return x === 5;
  };
  assert.deepEqual(findWalkingPath({ x: 0, y: 0 }, [{ x: 8, y: 0 }], blocked, { radius: 10 }), []);
  assert.ok([...calls.values()].every((count) => count === 1));
  assert.deepEqual(findWalkingPath({ x: 0, y: 0 }, [{ x: 53, y: 0 }], blocked), []);
});

test('generated settlement routes remain shortest with cache eviction and opposite load order', () => {
  const world = new InfiniteWorld(11, 4);
  const reverse = new InfiniteWorld(11, 4);
  for (let x = 2; x >= -2; x--) for (let y = 2; y >= -2; y--) reverse.chunk(x, y);
  const start = { x: 0, y: 5 },
    end = { x: 0, y: 40 };
  const blocked = (x: number, y: number) => world.blocked(x, y, new Set(), true);
  const route = findWalkingPath(start, [end], blocked);
  assert.equal(route.length, 35);
  assert.deepEqual(
    route,
    findWalkingPath(start, [end], (x, y) => reverse.blocked(x, y, new Set(), true)),
  );
  for (const point of route) assert.equal(blocked(point.x, point.y), false);
});

test('A* matches breadth-first shortest distances across deterministic obstacle grids', () => {
  for (let seed = 0; seed < 20; seed++) {
    const start = { x: 0, y: 0 },
      end = { x: 9, y: 7 };
    const blocked = (x: number, y: number) =>
      Math.abs(x) > 12 || Math.abs(y) > 12 || (x * 31 + y * 53 + seed * 7) % 11 === 3;
    const queue: (Point & { distance: number })[] = [{ ...start, distance: 0 }];
    const seen = new Set(['0,0']);
    let expected = 0;
    if (!blocked(end.x, end.y))
      for (let i = 0; i < queue.length; i++) {
        const at = queue[i];
        if (at.x === end.x && at.y === end.y) {
          expected = at.distance;
          break;
        }
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const x = at.x + dx,
            y = at.y + dy,
            key = `${x},${y}`;
          if (seen.has(key) || blocked(x, y)) continue;
          seen.add(key);
          queue.push({ x, y, distance: at.distance + 1 });
        }
      }
    assert.equal(
      findWalkingPath(start, [end], blocked, { radius: 12 }).length,
      expected,
      `grid ${seed}`,
    );
  }
});
