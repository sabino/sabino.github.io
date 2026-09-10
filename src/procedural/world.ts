import { deriveSeed, random, mix } from './random.ts';
import { generateLaws, generateSpecies, generateWeapon } from './compose.ts';
import type { SpeciesGenome, V3, WeaponGenome, WorldLaws } from './schema.ts';

export interface Tile {
  x: number;
  z: number;
  height: number;
  kind: 'soil' | 'path' | 'stone' | 'ladder';
  decoration: number;
  seed: number;
}
export interface Room {
  x: number;
  z: number;
  radiusX: number;
  radiusZ: number;
  height: number;
}
export interface Mission {
  kind: 'survey' | 'escort' | 'attune' | 'hunt';
  target: string;
  required: number;
  title: string;
  reason: string;
  condition: string;
}
export interface WorldPlan {
  version: 1;
  seed: number;
  laws: WorldLaws;
  name: string;
  tiles: Tile[];
  rooms: Room[];
  links: [number, number][];
  species: SpeciesGenome[];
  weapon: WeaponGenome;
  spawn: V3;
  gate: V3;
  placements: { species: number; position: V3 }[];
  mission: Mission;
  resonator: V3;
}

/** Rooms establish topology; corridors solve connectivity before surface detail. */
export function generateWorld(seed: number, crossing = 0): WorldPlan {
  const laws = generateLaws(seed),
    rand = random(deriveSeed(seed, 'topology'));
  const roomCount = 5 + Math.floor(rand() * 5),
    rooms: Room[] = [];
  const radius = mix(6, 12, rand());
  for (let i = 0; i < roomCount; i++) {
    const angle = (i / roomCount) * Math.PI * 2 + rand() * 0.45;
    rooms.push({
      x: Math.round(Math.cos(angle) * radius),
      z: Math.round(Math.sin(angle) * radius),
      radiusX: 2 + Math.floor(rand() * 3),
      radiusZ: 2 + Math.floor(rand() * 3),
      height: Math.floor(rand() * 4) * 0.5,
    });
  }
  const links: [number, number][] = [],
    connected = new Set([0]);
  while (connected.size < rooms.length) {
    let best: [number, number] = [0, 1],
      cost = Infinity;
    for (const a of connected)
      for (let b = 0; b < rooms.length; b++) {
        if (connected.has(b)) continue;
        const distance = Math.hypot(rooms[a].x - rooms[b].x, rooms[a].z - rooms[b].z);
        if (distance < cost) {
          cost = distance;
          best = [a, b];
        }
      }
    links.push(best);
    connected.add(best[1]);
  }
  for (let i = 0; i < rooms.length; i++)
    if (rand() < 0.4) {
      const b = (i + 1) % rooms.length;
      if (!links.some(([a, c]) => (a === i && c === b) || (a === b && c === i))) links.push([i, b]);
    }
  const cells = new Map<string, Tile>();
  function put(x: number, z: number, height: number, kind: Tile['kind']) {
    const key = `${x},${z}`,
      existing = cells.get(key);
    const cellSeed = deriveSeed(seed, 'tile', x, z);
    const detail = random(cellSeed);
    if (existing && kind !== 'path') return;
    cells.set(key, {
      x,
      z,
      height,
      kind,
      seed: cellSeed,
      decoration: kind === 'soil' && detail() > 0.74 ? detail() : 0,
    });
  }
  for (const room of rooms)
    for (let x = -room.radiusX; x <= room.radiusX; x++)
      for (let z = -room.radiusZ; z <= room.radiusZ; z++) {
        if (Math.abs(x) === room.radiusX && Math.abs(z) === room.radiusZ && rand() < 0.6) continue;
        put(room.x + x, room.z + z, room.height, 'soil');
      }
  for (const [a, b] of links) {
    const start = rooms[a],
      end = rooms[b],
      path: { x: number; z: number }[] = [];
    let x = start.x,
      z = start.z;
    const xFirst = rand() > 0.5;
    while (x !== end.x || z !== end.z) {
      path.push({ x, z });
      if ((xFirst && x !== end.x) || z === end.z) x += Math.sign(end.x - x);
      else z += Math.sign(end.z - z);
    }
    path.push({ x, z });
    path.forEach((p, i) => {
      const height = mix(start.height, end.height, i / Math.max(1, path.length - 1));
      put(p.x, p.z, height, 'path');
      // Most passages have a shoulder; occasional narrow spans make topology visible.
      if (i % 4 !== 2) put(p.x + 1, p.z, height, 'path');
    });
  }
  // A reusable vertical observation module: platform + climbable boundary.
  const high = rooms[rooms.length - 1];
  const towerX = high.x + high.radiusX - 1,
    towerZ = high.z + high.radiusZ - 1;
  put(towerX, towerZ, high.height + 1.75, 'path');
  const tower = cells.get(`${towerX},${towerZ}`)!;
  tower.kind = 'ladder';
  tower.decoration = 0;
  const species = Array.from({ length: 5 + Math.floor(rand() * 4) }, (_, i) =>
    generateSpecies(deriveSeed(seed, 'species', i), laws),
  );
  const weapon = generateWeapon(deriveSeed(seed, 'equipment'), laws);
  const placements = species.map((_, i) => {
    const room = rooms[(i + 1) % rooms.length];
    const x = room.x + (i % 2 ? 1 : -1),
      z = room.z;
    return { species: i, position: { x, y: cells.get(`${x},${z}`)?.height ?? room.height, z } };
  });
  const spawnRoom = rooms[0],
    spawn = {
      x: spawnRoom.x,
      y: cells.get(`${spawnRoom.x},${spawnRoom.z}`)!.height,
      z: spawnRoom.z,
    };
  const targetIndex = Math.floor(rand() * species.length),
    target = species[targetIndex];
  let kind: Mission['kind'] =
    crossing === 0
      ? 'survey'
      : (['survey', 'escort', 'attune', 'hunt'] as const)[Math.floor(rand() * 4)];
  if (kind === 'hunt' && weapon.core === 'growth') kind = 'escort';
  const required = kind === 'survey' ? 3 : 1;
  const mission: Mission = {
    kind,
    target: target.id,
    required,
    title:
      kind === 'survey'
        ? 'Read an unfamiliar ecology.'
        : kind === 'escort'
          ? `Return a living ${target.name}.`
          : kind === 'attune'
            ? `Resonate with ${weapon.core}.`
            : `Interrupt the ${target.name} lineage.`,
    reason:
      kind === 'survey'
        ? `The company has no record of life under gravity ${laws.gravity.toFixed(1)}. Your observations will give this world a price.`
        : kind === 'escort'
          ? `A ${target.role} carries a process the company cannot synthesize. Establish contact, then bring it to the rift.`
          : kind === 'attune'
            ? `A local lattice responds to ${weapon.core}. Your issued ${weapon.name} can change its state. The buyer has not disclosed why.`
            : `A bidder wants a ${target.role} removed from this ecology. Its relationships will outlast your assignment.`,
    condition:
      kind === 'survey'
        ? 'Catalog three distinct species and return.'
        : kind === 'escort'
          ? 'Contact the marked lifeform; escort it to the rift.'
          : kind === 'attune'
            ? 'Use your weapon on the resonator, then return.'
            : 'Defeat the marked lifeform and return.',
  };
  const syllables = ['Ae', 'Iri', 'Oth', 'Vel', 'Sae', 'Nul', 'Ora', 'Thy'],
    endings = ['ra', 'uun', 'eth', 'ora', 'is', 'ael', 'um', 'oth'];
  const name = `${syllables[Math.floor(rand() * syllables.length)]}${endings[Math.floor(rand() * endings.length)]} ${seed.toString(36).slice(-3).toUpperCase()}`;
  const resonator = {
    ...placements[targetIndex].position,
    x: placements[targetIndex].position.x + 1,
  };
  resonator.y = cells.get(`${resonator.x},${resonator.z}`)!.height;
  return {
    version: 1,
    seed,
    laws,
    name,
    rooms,
    links,
    tiles: [...cells.values()],
    species,
    weapon,
    spawn,
    gate: { ...spawn },
    placements,
    mission,
    resonator,
  };
}

const tileIndexes = new WeakMap<WorldPlan, Map<string, Tile>>();
export function tileAt(world: WorldPlan, x: number, z: number): Tile | undefined {
  let index = tileIndexes.get(world);
  if (!index) {
    index = new Map(world.tiles.map((t) => [`${t.x},${t.z}`, t]));
    tileIndexes.set(world, index);
  }
  return index.get(`${Math.round(x)},${Math.round(z)}`);
}
