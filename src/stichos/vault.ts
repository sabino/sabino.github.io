import { deriveSeed, random } from '../procedural/random.ts';
import type { Point } from './types.ts';

export const VAULT_SIZE = 32;
export interface VaultRoom {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  center: Point;
}
export interface VaultConnection {
  from: number;
  to: number;
  loop: boolean;
}
export interface VaultLayout {
  seed: number;
  size: number;
  /** Local x/y are integer tile centers; index is y * size + x. */
  floor: Uint8Array;
  /** A one-tile rock rim around floor; unmarked outer cells remain ordinary wilderness. */
  walls: Uint8Array;
  /** Adjacent floor bits: N=1, E=2, S=4, W=8, NE=16, SE=32, SW=64, NW=128. */
  wallMask: Uint8Array;
  /** Room cores and selected corridors are immutable during cave smoothing. */
  fixedFloor: Uint8Array;
  rooms: VaultRoom[];
  connections: VaultConnection[];
  corridors: Point[][];
  entrance: Point;
  reward: Point;
}
type Cell = { x: number; y: number; width: number; height: number };
type Edge = VaultConnection & {
  axis: 'x' | 'y';
  boundary: number;
  start: number;
  end: number;
  weight: number;
};
const index = (x: number, y: number) => y * VAULT_SIZE + x;
const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < VAULT_SIZE && y < VAULT_SIZE;
const steps = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;
const neighbors = [...steps, [1, -1], [1, 1], [-1, 1], [-1, -1]] as const;

/**
 * Open-roof botanical excavation, built from topology before surface noise.
 * The separated BSP/graph/constrained-CA/flood-fill stages follow the techniques in:
 * https://pvigier.github.io/2019/06/23/vagabond-dungeon-cave-generation.html
 * https://pvigier.github.io/2019/06/30/vagabond-dungeon-cave-generation-part2.html
 * This module produces topology only, with no borrowed visual assets or art style.
 */
export function generateVault(inputSeed: number): VaultLayout {
  if (!Number.isSafeInteger(inputSeed)) throw new Error('A vault seed must be a safe integer.');
  const seed = inputSeed >>> 0;
  const rng = random(deriveSeed(seed, 'vault:partition'));
  const integer = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const cells: Cell[] = [];

  // Split wide cells across their long axis, keeping leaf aspect ratios controlled.
  const split = (cell: Cell, depth: number) => {
    if (depth >= 3 || (depth >= 2 && rng() < 0.22)) {
      cells.push(cell);
      return;
    }
    const vertical =
      cell.width > cell.height * 1.2 ? true : cell.height > cell.width * 1.2 ? false : rng() < 0.5;
    const length = vertical ? cell.width : cell.height;
    const cross = vertical ? cell.height : cell.width;
    const minimum = Math.max(6, Math.ceil(cross / 2.5));
    if (length < minimum * 2) {
      cells.push(cell);
      return;
    }
    const cut = integer(minimum, length - minimum);
    if (vertical) {
      split({ ...cell, width: cut }, depth + 1);
      split({ ...cell, x: cell.x + cut, width: cell.width - cut }, depth + 1);
    } else {
      split({ ...cell, height: cut }, depth + 1);
      split({ ...cell, y: cell.y + cut, height: cell.height - cut }, depth + 1);
    }
  };
  split({ x: 2, y: 2, width: 28, height: 27 }, 0);
  const rooms = cells.map((cell, id): VaultRoom => {
    const width = integer(Math.max(3, cell.width - 5), cell.width - 2);
    const height = integer(Math.max(3, cell.height - 5), cell.height - 2);
    const x = cell.x + integer(1, cell.width - width - 1);
    const y = cell.y + integer(1, cell.height - height - 1);
    return {
      id,
      x,
      y,
      width,
      height,
      center: { x: x + Math.floor(width / 2), y: y + Math.floor(height / 2) },
    };
  });

  // Adjacency belongs to the cells, so corridor selection is independent of the BSP tree.
  const edges: Edge[] = [];
  for (let from = 0; from < cells.length; from++) {
    for (let to = from + 1; to < cells.length; to++) {
      const a = cells[from],
        b = cells[to];
      let shared: Pick<Edge, 'axis' | 'boundary' | 'start' | 'end'> | undefined;
      if (a.x + a.width === b.x || b.x + b.width === a.x) {
        const start = Math.max(a.y, b.y),
          end = Math.min(a.y + a.height, b.y + b.height);
        if (end - start >= 3) shared = { axis: 'x', boundary: Math.max(a.x, b.x), start, end };
      } else if (a.y + a.height === b.y || b.y + b.height === a.y) {
        const start = Math.max(a.x, b.x),
          end = Math.min(a.x + a.width, b.x + b.width);
        if (end - start >= 3) shared = { axis: 'y', boundary: Math.max(a.y, b.y), start, end };
      }
      if (!shared) continue;
      const ca = rooms[from].center,
        cb = rooms[to].center;
      edges.push({
        from,
        to,
        loop: false,
        ...shared,
        weight:
          Math.abs(ca.x - cb.x) +
          Math.abs(ca.y - cb.y) +
          deriveSeed(seed, 'edge', from, to) / 0xffffffff,
      });
    }
  }
  edges.sort((a, b) => a.weight - b.weight || a.from - b.from || a.to - b.to);
  const parent = rooms.map((room) => room.id);
  const find = (id: number): number => (parent[id] === id ? id : (parent[id] = find(parent[id])));
  const selected: Edge[] = [];
  const unused: Edge[] = [];
  for (const edge of edges) {
    const a = find(edge.from),
      b = find(edge.to);
    if (a === b) {
      unused.push(edge);
      continue;
    }
    parent[a] = b;
    selected.push(edge);
  }
  if (selected.length !== rooms.length - 1) throw new Error('Vault room graph is disconnected.');
  unused.sort(
    (a, b) => deriveSeed(seed, 'loop', a.from, a.to) - deriveSeed(seed, 'loop', b.from, b.to),
  );
  for (const edge of unused.slice(0, 1 + (seed % 2))) selected.push({ ...edge, loop: true });

  const fixedFloor = new Uint8Array(VAULT_SIZE * VAULT_SIZE);
  const fixedWall = new Uint8Array(fixedFloor.length);
  for (let y = 0; y < VAULT_SIZE; y++)
    for (let x = 0; x < VAULT_SIZE; x++)
      if (!x || !y || x === VAULT_SIZE - 1 || y === VAULT_SIZE - 1) fixedWall[index(x, y)] = 1;
  // Shared boundaries stay closed except at the selected corridor portals carved below.
  // This keeps the organic rooms legible instead of smoothing whole rooms into one hall.
  for (const edge of edges) {
    for (let p = edge.start; p < edge.end; p++)
      for (const line of [edge.boundary - 1, edge.boundary]) {
        const x = edge.axis === 'x' ? line : p,
          y = edge.axis === 'x' ? p : line;
        fixedWall[index(x, y)] = 1;
      }
  }
  const pin = (x: number, y: number) => {
    if (!inside(x, y)) return;
    fixedFloor[index(x, y)] = 1;
    fixedWall[index(x, y)] = 0;
  };
  for (const room of rooms)
    for (let y = room.y; y < room.y + room.height; y++)
      for (let x = room.x; x < room.x + room.width; x++) pin(x, y);
  const corridors: Point[][] = [];
  const carve = (waypoints: Point[], wide = false) => {
    const corridor: Point[] = [];
    const point = { ...waypoints[0] };
    const add = () => {
      pin(point.x, point.y);
      if (wide) pin(point.x + 1, point.y);
      corridor.push({ ...point });
    };
    add();
    for (const end of waypoints.slice(1)) {
      while (point.x !== end.x || point.y !== end.y) {
        if (point.x !== end.x) point.x += Math.sign(end.x - point.x);
        else point.y += Math.sign(end.y - point.y);
        add();
      }
    }
    corridors.push(corridor);
  };
  for (const edge of selected) {
    const a = rooms[edge.from].center,
      b = rooms[edge.to].center;
    const portal =
      edge.start +
      1 +
      (deriveSeed(seed, 'portal', edge.from, edge.to) % (edge.end - edge.start - 2));
    carve(
      edge.axis === 'x'
        ? [a, { x: a.x, y: portal }, { x: b.x, y: portal }, b]
        : [a, { x: portal, y: a.y }, { x: portal, y: b.y }, b],
    );
  }
  const southern = [...rooms].sort((a, b) => b.center.y - a.center.y || a.id - b.id)[0];
  const entrance = { x: Math.min(28, southern.center.x), y: VAULT_SIZE - 1 };
  carve([southern.center, { x: entrance.x, y: southern.center.y }, entrance], true);

  // Four-state CA: fixed floor, fixed wall, mutable floor and mutable wall.
  let floor = new Uint8Array(fixedFloor);
  for (let y = 1; y < VAULT_SIZE - 1; y++)
    for (let x = 1; x < VAULT_SIZE - 1; x++) {
      const i = index(x, y);
      if (fixedFloor[i] || fixedWall[i]) continue;
      let nearCore = false;
      for (let dy = -2; dy <= 2 && !nearCore; dy++)
        for (let dx = -2; dx <= 2 && !nearCore; dx++)
          if (inside(x + dx, y + dy) && fixedFloor[index(x + dx, y + dy)]) nearCore = true;
      if (nearCore && deriveSeed(seed, 'cave-noise', x, y) / 0xffffffff < 0.47) floor[i] = 1;
    }
  for (let step = 0; step < 4; step++) {
    const next = new Uint8Array(floor.length);
    for (let y = 0; y < VAULT_SIZE; y++)
      for (let x = 0; x < VAULT_SIZE; x++) {
        const i = index(x, y);
        if (fixedFloor[i]) {
          next[i] = 1;
          continue;
        }
        if (fixedWall[i]) continue;
        const alive = neighbors.reduce(
          (sum, [dx, dy]) => sum + (inside(x + dx, y + dy) ? floor[index(x + dx, y + dy)] : 0),
          0,
        );
        next[i] = alive >= 5 || (floor[i] === 1 && alive >= 4) ? 1 : 0;
      }
    floor = next;
  }

  // Only the component reachable from the actual south entrance survives.
  const distances = new Int16Array(floor.length).fill(-1);
  const queue: Point[] = [{ ...entrance }];
  distances[index(entrance.x, entrance.y)] = 0;
  for (let i = 0; i < queue.length; i++) {
    const point = queue[i];
    for (const [dx, dy] of steps) {
      const x = point.x + dx,
        y = point.y + dy;
      if (!inside(x, y) || !floor[index(x, y)] || distances[index(x, y)] !== -1) continue;
      distances[index(x, y)] = distances[index(point.x, point.y)] + 1;
      queue.push({ x, y });
    }
  }
  for (let i = 0; i < floor.length; i++) if (distances[i] === -1) floor[i] = 0;
  const reward = {
    ...[...rooms].sort(
      (a, b) =>
        distances[index(b.center.x, b.center.y)] - distances[index(a.center.x, a.center.y)] ||
        a.id - b.id,
    )[0].center,
  };
  const walls = new Uint8Array(floor.length),
    wallMask = new Uint8Array(floor.length);
  for (let y = 0; y < VAULT_SIZE; y++)
    for (let x = 0; x < VAULT_SIZE; x++) {
      if (floor[index(x, y)]) continue;
      neighbors.forEach(([dx, dy], bit) => {
        if (inside(x + dx, y + dy) && floor[index(x + dx, y + dy)])
          wallMask[index(x, y)] |= 1 << bit;
      });
      if (wallMask[index(x, y)]) walls[index(x, y)] = 1;
    }
  return {
    seed,
    size: VAULT_SIZE,
    floor,
    walls,
    wallMask,
    fixedFloor,
    rooms,
    connections: selected.map(({ from, to, loop }) => ({ from, to, loop })),
    corridors,
    entrance,
    reward,
  };
}
