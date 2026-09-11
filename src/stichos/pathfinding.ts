import type { Point } from './types.ts';

interface PathOptions {
  /** Planning range, in tiles, from the actor. */
  radius?: number;
  maxVisited?: number;
}

/** A bounded, deterministic four-way A* search. Collision is sampled once per cell.
 * Multiple acceptable destinations share one search instead of repeating a flood fill.
 * Doors can be considered open by the caller; movement still waits for the real door.
 */
export function findWalkingPath(
  origin: Point,
  destinations: readonly Point[],
  blocked: (x: number, y: number) => boolean,
  options: PathOptions = {},
): Point[] {
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return [];
  const radius = Math.max(1, Math.min(128, Math.floor(options.radius ?? 52)));
  const limit = Math.max(1, Math.min(65536, Math.floor(options.maxVisited ?? 5500)));
  const start = { x: Math.round(origin.x), y: Math.round(origin.y) };
  const size = radius * 2 + 1;
  const count = size * size;
  const minX = start.x - radius;
  const minY = start.y - radius;
  const address = (x: number, y: number) => (y - minY) * size + x - minX;
  const collision = new Uint8Array(count);
  const free = (x: number, y: number, id: number) => {
    if (!collision[id]) collision[id] = blocked(x, y) ? 2 : 1;
    return collision[id] === 1;
  };
  const targets = new Map<number, Point>();
  for (const destination of destinations) {
    if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y)) continue;
    const x = Math.round(destination.x),
      y = Math.round(destination.y);
    if (Math.abs(x - start.x) > radius || Math.abs(y - start.y) > radius) continue;
    const id = address(x, y);
    if (free(x, y, id)) targets.set(id, { x, y });
  }
  if (!targets.size) return [];
  const heuristic = (x: number, y: number) => {
    let best = Infinity;
    for (const target of targets.values())
      best = Math.min(best, Math.abs(x - target.x) + Math.abs(y - target.y));
    return best;
  };
  const costs = new Uint32Array(count);
  const parents = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const startId = address(start.x, start.y);
  // The extra one makes an unvisited cost distinguishable from the starting tile.
  costs[startId] = 1;
  interface Entry {
    id: number;
    x: number;
    y: number;
    cost: number;
    h: number;
    order: number;
  }
  const heap: Entry[] = [];
  let serial = 0;
  const before = (a: Entry, b: Entry) =>
    a.cost + a.h < b.cost + b.h ||
    (a.cost + a.h === b.cost + b.h && (a.h < b.h || (a.h === b.h && a.order < b.order)));
  const push = (entry: Entry) => {
    let at = heap.length;
    heap.push(entry);
    while (at > 0) {
      const parent = (at - 1) >> 1;
      if (!before(entry, heap[parent])) break;
      heap[at] = heap[parent];
      at = parent;
    }
    heap[at] = entry;
  };
  const pop = () => {
    const result = heap[0],
      last = heap.pop()!;
    if (heap.length) {
      let at = 0;
      while (at * 2 + 1 < heap.length) {
        let child = at * 2 + 1;
        if (child + 1 < heap.length && before(heap[child + 1], heap[child])) child++;
        if (!before(heap[child], last)) break;
        heap[at] = heap[child];
        at = child;
      }
      heap[at] = last;
    }
    return result;
  };
  push({ id: startId, ...start, cost: 1, h: heuristic(start.x, start.y), order: serial++ });
  let visited = 0;
  const offsets = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;
  while (heap.length && visited < limit) {
    const current = pop();
    if (closed[current.id] || costs[current.id] !== current.cost) continue;
    closed[current.id] = 1;
    visited++;
    if (targets.has(current.id)) {
      const route: Point[] = [];
      for (let id = current.id; id !== startId; id = parents[id])
        route.push({ x: minX + (id % size), y: minY + Math.floor(id / size) });
      return route.reverse();
    }
    for (const [dx, dy] of offsets) {
      const x = current.x + dx,
        y = current.y + dy;
      if (x < minX || x >= minX + size || y < minY || y >= minY + size) continue;
      const id = address(x, y),
        cost = current.cost + 1;
      if (closed[id] || (costs[id] && costs[id] <= cost) || !free(x, y, id)) continue;
      costs[id] = cost;
      parents[id] = current.id;
      push({ id, x, y, cost, h: heuristic(x, y), order: serial++ });
    }
  }
  return [];
}
