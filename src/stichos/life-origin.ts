import { deriveSeed, random } from '../procedural/random.ts';
import { InfiniteWorld, appearance, type WorldGeneration } from './world.ts';
import type { Appearance, ItemId, NpcRole, Point, Settlement } from './types.ts';
import type { HomeAddress, Profession } from './progression.ts';
import type { ToolKind } from './labor.ts';

export interface LifeCustomization {
  name?: string;
  skin?: string;
  hair?: string;
  coat?: string;
  trim?: string;
  trousers?: string;
  hairStyle?: number;
  hat?: number;
  cloak?: boolean;
  height?: number;
  build?: number;
}
export interface LifeOriginRecord {
  version: 1;
  index: number;
  customization: LifeCustomization;
}
export interface LifeCandidate {
  id: string;
  seed: number;
  index: number;
  name: string;
  age: number;
  profession: NpcRole;
  appearance: Appearance;
  clan: number;
  settlement: Settlement;
  home: HomeAddress;
  start: Point;
  activity: {
    kind: 'gathering' | 'crafting' | 'reading' | 'trading' | 'patrolling' | 'resting';
    label: string;
    target: Point;
  };
  stats: { maxHp: number; speed: number; warmth: number; breath: number };
  inventory: Partial<Record<ItemId, number>>;
  coins: number;
  professionXp: Record<Profession, number>;
  tools: ToolKind[];
  perk: string;
}
const fields = [
  'name',
  'skin',
  'hair',
  'coat',
  'trim',
  'trousers',
  'hairStyle',
  'hat',
  'cloak',
  'height',
  'build',
];
const candidateCache = new Map<string, LifeCandidate>();
export function normalizeLifeCustomization(value: unknown = {}): LifeCustomization {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid life customization.');
  const result: LifeCustomization = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!fields.includes(key)) throw new Error('Unknown life customization.');
    if (key === 'name') {
      if (
        typeof raw !== 'string' ||
        !raw.trim() ||
        raw.trim().length > 60 ||
        /[\u0000-\u001f\u007f]/.test(raw)
      )
        throw new Error('Choose a name of one to sixty characters.');
      result.name = raw.normalize('NFC').trim();
    } else if (['skin', 'hair', 'coat', 'trim', 'trousers'].includes(key)) {
      if (typeof raw !== 'string' || !/^#[0-9a-f]{6}$/i.test(raw))
        throw new Error('Choose a six-digit appearance color.');
      (result as Record<string, unknown>)[key] = raw.toLowerCase();
    } else if (key === 'cloak') {
      if (typeof raw !== 'boolean') throw new Error('Invalid cloak choice.');
      result.cloak = raw;
    } else {
      if (typeof raw !== 'number' || !Number.isFinite(raw))
        throw new Error('Invalid body proportion.');
      if (
        ['hairStyle', 'hat'].includes(key)
          ? !Number.isInteger(raw) || raw < 0 || raw > 4
          : raw < 0.8 || raw > 1.2
      )
        throw new Error('Body customization is outside the available range.');
      (result as Record<string, unknown>)[key] = raw;
    }
  }
  return result;
}
export function restoreLifeOrigin(value: unknown): LifeOriginRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid life origin.');
  const s = value as LifeOriginRecord;
  if (
    Object.keys(s).some((k) => !['version', 'index', 'customization'].includes(k)) ||
    s.version !== 1 ||
    !Number.isSafeInteger(s.index) ||
    s.index < 0 ||
    s.index > 1000000
  )
    throw new Error('Invalid life origin.');
  return { version: 1, index: s.index, customization: normalizeLifeCustomization(s.customization) };
}
const clear = (world: InfiniteWorld, p: Point) =>
  [
    [-0.22, -0.22],
    [0.22, -0.22],
    [-0.22, 0.22],
    [0.22, 0.22],
  ].every(([x, y]) => !world.blocked(p.x + x, p.y + y));

/** A candidate is a real resident of the existing geography, with a bounded cosmetic editor. */
export function generateLifeCandidate(
  seed: number,
  index: number,
  customization: LifeCustomization = {},
  generation: WorldGeneration = 3,
): LifeCandidate {
  if (!Number.isSafeInteger(seed) || !Number.isSafeInteger(index) || index < 0 || index > 1000000)
    throw new Error('Invalid life seed or candidate index.');
  const edit = normalizeLifeCustomization(customization);
  if (Object.keys(edit).length) {
    const candidate = generateLifeCandidate(seed, index, {}, generation),
      previousName = candidate.name;
    candidate.name = edit.name ?? candidate.name;
    candidate.home.name = candidate.home.name.replace(`${previousName}'s`, `${candidate.name}'s`);
    for (const key of fields.filter((k) => k !== 'name'))
      if (key in edit)
        (candidate.appearance as unknown as Record<string, unknown>)[key] = (
          edit as Record<string, unknown>
        )[key];
    return candidate;
  }
  const cacheKey = `${seed >>> 0}:${generation}:${index}`,
    cached = candidateCache.get(cacheKey);
  if (cached) {
    candidateCache.delete(cacheKey);
    candidateCache.set(cacheKey, cached);
    return structuredClone(cached);
  }
  const world = new InfiniteWorld(seed, generation);
  const candidateSeed = deriveSeed(seed, 'life-origin', index),
    rng = random(candidateSeed);
  const towns = world
    .settlementsAround(0, 0, generation >= 3 ? 340 : 110)
    .filter((t) => t.rank !== 'hamlet')
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y) || a.id.localeCompare(b.id));
  const town = towns[Math.floor(rng() * Math.min(9, towns.length))];
  if (!town) throw new Error('This world has no suitable settlement.');
  const residents = world
    .npcsAround(town.x, town.y, town.radius + 6)
    .filter(
      (n) =>
        !n.hostile &&
        n.hp > 0 &&
        n.id !== 'origin-botanist' &&
        n.id !== 'origin-archivist' &&
        n.id !== 'origin-engineer' &&
        Math.hypot(n.home.x - town.x, n.home.y - town.y) < town.radius + 5 &&
        clear(world, n),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const resident = residents[Math.floor(rng() * residents.length)];
  if (!resident) throw new Error('This settlement has no available resident.');
  const doors = world
    .propsAround(town.x, town.y, town.radius + 6)
    .filter(
      (p) =>
        p.kind === 'door' &&
        p.building &&
        (world.tile(p.x, p.y).buildingKind === 'house' ||
          world.tile(p.x, p.y).buildingKind === 'inn' ||
          p.building.includes(':house:')),
    );
  const homes = new Map<string, (typeof doors)[number]>();
  for (const door of doors)
    if (!homes.has(door.building!) || homes.get(door.building!)!.y < door.y)
      homes.set(door.building!, door);
  const ordered = [...homes.values()].sort(
    (a, b) =>
      Math.hypot(a.x - resident.x, a.y - resident.y) -
        Math.hypot(b.x - resident.x, b.y - resident.y) || a.id.localeCompare(b.id),
  );
  const door = ordered[0];
  if (!door) throw new Error('This resident needs a real home.');
  const name = edit.name ?? resident.name,
    look = appearance(candidateSeed, resident.role, resident.clan);
  for (const key of fields.filter((k) => k !== 'name'))
    if (key in edit)
      (look as unknown as Record<string, unknown>)[key] = (edit as Record<string, unknown>)[key];
  const xp = { botany: 0, crafting: 0, combat: 0 },
    inventory: Partial<Record<ItemId, number>> = { cequin: 3, rations: 2, bandage: 1 };
  let tools: ToolKind[] = ['sickle'],
    kind: LifeCandidate['activity']['kind'] = 'resting',
    label = 'Pausing beside the public way',
    perk = 'A light traveling kit and a steady walking pace.';
  if (resident.role === 'botanist') {
    xp.botany = 160;
    inventory.heartleaf = 4;
    inventory.emberroot = 2;
    kind = 'gathering';
    label = 'Inspecting winter seedlings';
    perk = 'Practiced botany improves medicine; a sickle and living specimens are already carried.';
  }
  if (resident.role === 'engineer') {
    xp.crafting = 160;
    inventory.wood = 5;
    inventory.ore = 4;
    tools = ['axe', 'pickaxe'];
    kind = 'crafting';
    label = 'Checking a workshop assembly';
    perk =
      'Practiced crafting opens forging immediately; timber, ore and working tools form the initial kit.';
  }
  if (resident.role === 'guard') {
    xp.combat = 160;
    inventory.bandage = 3;
    tools = ['axe'];
    kind = 'patrolling';
    label = 'Finishing a watch of the street';
    perk = 'Practiced combat gives stronger, faster attacks and a sturdier body.';
  }
  if (resident.role === 'archivist') {
    xp.crafting = 80;
    inventory.lens = 1;
    kind = 'reading';
    label = 'Comparing notes in the public archive';
    perk = 'A prepared signal lens and crafting experience support investigation.';
  }
  if (resident.role === 'merchant') {
    inventory.wood = 3;
    inventory.ore = 2;
    tools = ['axe', 'pickaxe', 'sickle'];
    kind = 'trading';
    label = 'Counting stock beside the market';
    perk = 'A larger coin reserve and three working tools support an independent workshop.';
  }
  if (resident.role === 'refugee') {
    xp.botany = 80;
    inventory.heartleaf = 3;
    kind = 'gathering';
    label = 'Sorting useful stems from a gathered bundle';
    perk = 'Field experience improves medicine; a quick stride helps reach new work.';
  }
  // Occupation, rather than character creation, determines what this resident carries.
  look.weapon = resident.appearance.weapon;
  if (resident.appearance.technology !== undefined)
    look.technology = resident.appearance.technology;
  if (look.weapon !== 'none')
    look.weaponSeed =
      resident.appearance.weaponSeed ?? deriveSeed(candidateSeed, 'owned-equipment', look.weapon);
  const candidate: LifeCandidate = {
    id: resident.id,
    seed: candidateSeed,
    index,
    name,
    age: 20 + Math.floor(rng() * 49),
    profession: resident.role,
    appearance: look,
    clan: resident.clan,
    settlement: town,
    home: {
      id: door.building!,
      buildingId: door.building!,
      settlementId: town.id,
      name: `${name}'s ${world.tile(door.x, door.y).buildingKind === 'inn' ? 'lodging' : 'home'} in ${town.name}`,
      x: door.x,
      y: door.y,
    },
    start: { x: resident.x, y: resident.y },
    activity: { kind, label, target: { x: resident.x, y: resident.y } },
    stats: {
      maxHp: resident.role === 'guard' ? 112 : resident.role === 'refugee' ? 92 : 100,
      speed:
        resident.role === 'refugee' || resident.role === 'pilgrim'
          ? 3.2
          : resident.role === 'guard'
            ? 2.9
            : 3,
      warmth: resident.role === 'refugee' ? 78 : 90,
      breath: 100,
    },
    inventory,
    coins:
      resident.role === 'merchant'
        ? 180
        : resident.role === 'engineer'
          ? 110
          : resident.role === 'refugee'
            ? 45
            : 85,
    professionXp: xp,
    tools,
    perk,
  };
  candidateCache.set(cacheKey, candidate);
  if (candidateCache.size > 128) candidateCache.delete(candidateCache.keys().next().value!);
  return structuredClone(candidate);
}
