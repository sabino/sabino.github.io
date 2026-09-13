import { deriveSeed, random } from '../procedural/random.ts';
import { MAX_WEAPON_SEED, weaponProfile, type WeaponKind } from './equipment.ts';
import type { ActorAddress } from './actor-ledger.ts';
import { validFieldBundle, type FieldBundle, type FieldDeath } from './field-loot.ts';
import type { Point } from './types.ts';

/** Original underground grammar. Surface generation and old checkpoints never depend on it. */
export const UNDERWORLD_RULES = Object.freeze({
  version: 1,
  floors: 3,
  width: 58,
  height: 44,
  maxComplexes: 16,
  maxPeers: 128,
  maxProjectiles: 64,
  maxEvents: 256,
  maxStep: 1 / 30,
  interactDistance: 2.2,
  activeRadius: 20,
  rescueDistance: 2.2,
});
export type UnderworldRoomKind =
  | 'threshold'
  | 'cistern'
  | 'archive'
  | 'gauntlet'
  | 'vault'
  | 'foundry'
  | 'refuge'
  | 'rootbed';
export type UnderworldMaterial = 'stone' | 'metal' | 'shallow-water' | 'dirt' | 'wood';
export type UnderworldFeatureKind =
  | 'up'
  | 'down'
  | 'gate'
  | 'rune'
  | 'inscription'
  | 'shortcut'
  | 'survivor'
  | 'cache'
  | 'secret'
  | 'rest'
  | 'trap'
  | 'core';
export interface UnderworldRoom extends Point {
  id: string;
  kind: UnderworldRoomKind;
  name: string;
  width: number;
  height: number;
}
export interface UnderworldFeature extends Point {
  id: string;
  kind: UnderworldFeatureKind;
  name: string;
  description: string;
  value?: number;
}
export interface UnderworldEnemy extends Point {
  id: string;
  name: string;
  kind: 'crawler' | 'sentry' | 'mini' | 'boss';
  hp: number;
  maxHp: number;
  heading: number;
  phase: 1 | 2;
  state: 'idle' | 'pursue' | 'windup' | 'recovery' | 'dead';
  remaining: number;
  intent?: { shape: 'line' | 'cone' | 'radial'; heading: number; range: number; duration: number };
}
export interface UnderworldPlan {
  version: 1;
  seed: number;
  settlementId: string;
  spaceId: string;
  depth: number;
  name: string;
  biome: string;
  material: UnderworldMaterial;
  width: number;
  height: number;
  cells: number[];
  rooms: UnderworldRoom[];
  features: UnderworldFeature[];
  enemies: UnderworldEnemy[];
  puzzle: number[];
  entrance: Point;
  exit: Point;
}
export interface UnderworldPeer extends ActorAddress {
  id: string;
  heading: number;
  active: boolean;
  /** Authority resolves these from owned equipment; never pass request damage. */ weaponSeed?: number;
  weaponKind?: WeaponKind;
}
export interface UnderworldResident {
  id: string;
  address: ActorAddress;
  surface: ActorAddress;
  sequence: number;
  recoveryUntil?: number;
  recoverySequence?: number;
  lastRecoveryLoss?: number;
}
export interface UnderworldFloorState {
  spaceId: string;
  enemies: UnderworldEnemy[];
  opened: string[];
  puzzle: number;
  rescued: string[];
  discovered: number[];
}
export interface UnderworldSave {
  version: 1;
  seed: number;
  complexes: string[];
  floors: UnderworldFloorState[];
  residents: UnderworldResident[];
  rewards: UnderworldReward[];
  contributors: [string, string[]][];
  serial: number;
}
export interface UnderworldProjectile extends Point {
  id: string;
  ownerId: string;
  spaceId: string;
  heading: number;
  speed: number;
  remaining: number;
  damage: number;
  friendly: boolean;
  attack?: 'ranged' | 'spell';
}
export interface UnderworldFrame {
  plan: UnderworldPlan;
  state: UnderworldFloorState;
  projectiles: UnderworldProjectile[];
  time: number;
}
export interface UnderworldTransition {
  actorId: string;
  from: ActorAddress;
  to: ActorAddress;
  reason: 'enter' | 'stairs' | 'return' | 'recall' | 'clinic';
}
export type UnderworldEvent =
  | {
      id: string;
      kind: 'hit';
      actorId: string;
      targetId: string;
      damage: number;
      spaceId: string;
      x: number;
      y: number;
      attack: 'melee' | 'ranged' | 'spell' | 'trap';
    }
  | { id: string; kind: 'death'; death: FieldDeath }
  | {
      id: string;
      kind: 'reward';
      actorId: string;
      sourceId: string;
      bundle: FieldBundle;
      spaceId: string;
      x: number;
      y: number;
    }
  | {
      id: string;
      kind: 'rescue';
      actorId: string;
      survivorId: string;
      profession: 'mason' | 'herbalist' | 'engineer';
      settlementId: string;
      depth: number;
    }
  | {
      id: string;
      kind: 'unlock';
      actorId: string;
      settlementId: string;
      unlock: 'waterworks' | 'healing-garden' | 'deep-forge';
    }
  | {
      id: string;
      kind: 'cue';
      cue:
        | 'attack'
        | 'impact'
        | 'trap-warning'
        | 'gate'
        | 'secret'
        | 'rest'
        | 'boss-phase'
        | 'victory';
      spaceId: string;
      x: number;
      y: number;
    };
export type UnderworldReward = Extract<UnderworldEvent, { kind: 'reward' }>;
export interface UnderworldResult {
  ok: boolean;
  message: string;
  events: UnderworldEvent[];
  transition?: UnderworldTransition;
  recovery?: { coinLoss: number; cooldownUntil: number };
}
export interface UnderworldAttack {
  kind: 'melee' | 'ranged' | 'spell' | 'guard' | 'dodge';
  heading: number;
  sequence: number;
}
const roomKinds: UnderworldRoomKind[] = [
  'threshold',
  'cistern',
  'archive',
  'gauntlet',
  'vault',
  'foundry',
  'refuge',
  'rootbed',
];
const names = [
  'Intake Steps',
  'Settling Pools',
  'Survey Archive',
  'Pressure Walk',
  'Counterweight Hall',
  'Repair Bay',
  'Sheltered Hearth',
  'Root Galleries',
];
const biomeNames = ['Drowned Masonry', 'Mycelial Works', 'Resonance Furnace'];
const complexNames = [
  'The Buried Accord',
  'The Root Reservoir',
  'The Hollow Foundry',
  'The Undertide Works',
];
const symbolNames = ['Bowl', 'Branch', 'Spark'];
const position = (x: number, y: number): Point => ({ x, y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const idOK = (v: unknown): v is string =>
  typeof v === 'string' && /^[A-Za-z0-9_:.-]{1,160}$/.test(v);
const number = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const obj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const uint = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
export function underworldSpace(settlementId: string, depth: number): string {
  return `underground:${settlementId}:${depth}`;
}
export function parseUnderworldSpace(
  spaceId: string,
): { settlementId: string; depth: number } | undefined {
  const m = /^underground:(.+):([0-2])$/.exec(spaceId);
  return m && idOK(m[1]) && m[1].length <= 128
    ? { settlementId: m[1], depth: Number(m[2]) }
    : undefined;
}
export function generateUnderworld(
  seed: number,
  settlementId: string,
  depth: number,
): UnderworldPlan {
  if (
    !Number.isInteger(seed) ||
    !idOK(settlementId) ||
    settlementId.length > 128 ||
    !Number.isInteger(depth) ||
    depth < 0 ||
    depth >= 3
  )
    throw new Error('Invalid underground address.');
  const floorSeed = deriveSeed(seed, 'underworld-v1', settlementId, depth),
    rng = random(floorSeed),
    spaceId = underworldSpace(settlementId, depth),
    width = 58,
    height = 44,
    cells = new Array<number>(width * height).fill(0);
  const centers = [
    position(8, 7),
    position(25, 7),
    position(44, 7),
    position(44, 21),
    position(44, 35),
    position(25, 35),
    position(8, 35),
    position(8, 21),
  ];
  const rooms = centers.map((p, i) => ({
    ...p,
    id: `${spaceId}:room:${i}`,
    kind: roomKinds[i],
    name: names[i],
    width: 9 + Math.floor(rng() * 3) * 2,
    height: 7 + Math.floor(rng() * 2) * 2,
  }));
  const carve = (x: number, y: number, kind = 1) => {
    if (x > 0 && y > 0 && x < width - 1 && y < height - 1) cells[y * width + x] = kind;
  };
  for (const room of rooms)
    for (
      let y = room.y - Math.floor(room.height / 2);
      y <= room.y + Math.floor(room.height / 2);
      y++
    )
      for (
        let x = room.x - Math.floor(room.width / 2);
        x <= room.x + Math.floor(room.width / 2);
        x++
      )
        carve(
          x,
          y,
          room.kind === 'cistern'
            ? 2
            : room.kind === 'rootbed'
              ? 3
              : room.kind === 'foundry'
                ? 4
                : 1,
        );
  for (let i = 0; i < 8; i++) {
    const a = centers[i],
      b = centers[(i + 1) % 8];
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) carve(x, a.y);
    for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) carve(b.x, y);
  }
  const puzzle = [0, 1, 2].sort(
    (a, b) =>
      (deriveSeed(floorSeed, 'symbol', a) % 1000) - (deriveSeed(floorSeed, 'symbol', b) % 1000) ||
      a - b,
  );
  const features: UnderworldFeature[] = [];
  const feature = (
    kind: UnderworldFeatureKind,
    x: number,
    y: number,
    name: string,
    description: string,
    value?: number,
  ) =>
    features.push({
      id: `${spaceId}:${kind}:${features.filter((f) => f.kind === kind).length}`,
      kind,
      x,
      y,
      name,
      description,
      ...(value === undefined ? {} : { value }),
    });
  feature(
    'up',
    8,
    7,
    depth === 0 ? 'Return to the surface' : 'Ascend',
    'An open stair returns to the preceding threshold.',
  );
  feature(
    depth === 2 ? 'core' : 'down',
    44,
    35,
    depth === 2 ? 'Release the buried forge' : 'Descend',
    depth === 2
      ? 'Stabilize the engine after defeating its keeper. Restores the surface deep forge.'
      : 'Defeat this floor’s keeper before descending.',
  );
  feature(
    'gate',
    44,
    28,
    'Three-signal sluice',
    'Read the archive inscription and set its three controls in order.',
  );
  feature(
    'shortcut',
    34,
    35,
    'Counterweight shortcut',
    'Its release is on the vault side. Once opened, the passage stays open.',
  );
  feature(
    'inscription',
    43,
    6,
    'Maintenance inscription',
    `Restore the flow: ${puzzle.map((v) => symbolNames[v]).join(' → ')}. The controls are reset by a wrong signal.`,
  );
  for (let i = 0; i < 3; i++)
    feature(
      'rune',
      42 + i * 2,
      9,
      symbolNames[i],
      `Set the ${symbolNames[i].toLowerCase()} control.`,
      i,
    );
  feature(
    'survivor',
    8,
    34,
    ['Stranded stoneworker', 'Marooned field botanist', 'Isolated machinist'][depth],
    'The corridor overseer controls this refuge seal. Free the survivor to restore a surface trade.',
  );
  feature('cache', 25, 34, 'Salvage rack', 'Recover useful fittings and raw material once.');
  feature(
    'cache',
    26,
    7,
    'Flooded survey chest',
    'Recover field notes from the drained chest once.',
  );
  for (let x = 49; x <= 56; x++) carve(x, 7);
  for (let y = 5; y <= 9; y++) for (let x = 52; x <= 56; x++) carve(x, y);
  feature(
    'secret',
    51,
    7,
    'Hollow archive panel',
    'An irregular seam reveals a forgotten pocket and a recoverable relic.',
  );
  feature('rest', 9, 36, 'Sheltered hearth', 'Recover at the hearth while no hostile is close.');
  feature(
    'trap',
    44,
    25,
    'Pressure vent',
    'A bright rim warns before the pressure release; cross during the dark interval.',
  );
  feature('trap', 24, 7, 'Broken live conduit', 'The warning pulses before each discharge.');
  const enemies: UnderworldEnemy[] = [];
  const enemy = (kind: UnderworldEnemy['kind'], x: number, y: number, name: string, hp: number) =>
    enemies.push({
      id: `${spaceId}:enemy:${enemies.length}`,
      kind,
      x,
      y,
      name,
      hp,
      maxHp: hp,
      heading: 0,
      phase: 1,
      state: 'idle',
      remaining: 0,
    });
  enemy('crawler', 20, 7, 'Pipe scavenger', 42 + depth * 16);
  enemy('sentry', 28, 6, 'Survey sentry', 48 + depth * 16);
  enemy('crawler', 8, 23, 'Root forager', 40 + depth * 16);
  enemy(
    'mini',
    44,
    20,
    ['Sluice Overseer', 'Spore Shepherd', 'Coil Marshal'][depth],
    110 + depth * 40,
  );
  enemy('sentry', 25, 33, 'Repair sentinel', 50 + depth * 15);
  enemy(
    'boss',
    44,
    33,
    ['Kiln Sentinel', 'Rootbound Custodian', 'The Unmoored Engine'][depth],
    220 + depth * 110,
  );
  return {
    version: 1,
    seed: floorSeed,
    settlementId,
    spaceId,
    depth,
    name: complexNames[deriveSeed(seed, 'complex-name', settlementId) % complexNames.length],
    biome: biomeNames[depth],
    material: depth === 0 ? 'stone' : depth === 1 ? 'dirt' : 'metal',
    width,
    height,
    cells,
    rooms,
    features,
    enemies,
    puzzle,
    entrance: { x: 8, y: 7 },
    exit: { x: 44, y: 35 },
  };
}
function clone<T>(v: T): T {
  return structuredClone(v);
}
function floorState(plan: UnderworldPlan): UnderworldFloorState {
  return {
    spaceId: plan.spaceId,
    enemies: clone(plan.enemies),
    opened: [],
    puzzle: 0,
    rescued: [],
    discovered: [],
  };
}
function address(v: unknown): v is ActorAddress {
  return (
    obj(v) &&
    keys(v, ['spaceId', 'x', 'y']) &&
    typeof v.spaceId === 'string' &&
    (v.spaceId === 'surface' || !!parseUnderworldSpace(v.spaceId)) &&
    number(v.x) &&
    number(v.y) &&
    Math.abs(v.x) < 1e7 &&
    Math.abs(v.y) < 1e7
  );
}
export function validUnderworldSave(v: unknown): v is UnderworldSave {
  if (
    !obj(v) ||
    !keys(v, [
      'version',
      'seed',
      'complexes',
      'floors',
      'residents',
      'rewards',
      'contributors',
      'serial',
    ]) ||
    v.version !== 1 ||
    !uint(v.seed) ||
    v.seed > 0xffffffff ||
    !uint(v.serial) ||
    !Array.isArray(v.complexes) ||
    v.complexes.length > 16 ||
    new Set(v.complexes).size !== v.complexes.length ||
    !v.complexes.every((s) => idOK(s) && s.length <= 128) ||
    !Array.isArray(v.floors) ||
    v.floors.length > 48 ||
    !Array.isArray(v.residents) ||
    v.residents.length > 128 ||
    !Array.isArray(v.rewards) ||
    v.rewards.length > 256 ||
    !Array.isArray(v.contributors) ||
    v.contributors.length > 288
  )
    return false;
  const spaces = new Set<string>();
  for (const f of v.floors) {
    if (
      !obj(f) ||
      !keys(f, ['spaceId', 'enemies', 'opened', 'puzzle', 'rescued', 'discovered']) ||
      typeof f.spaceId !== 'string' ||
      spaces.has(f.spaceId)
    )
      return false;
    const parsed = parseUnderworldSpace(f.spaceId);
    if (!parsed || !v.complexes.includes(parsed.settlementId)) return false;
    spaces.add(f.spaceId);
    const plan = generateUnderworld(v.seed, parsed.settlementId, parsed.depth);
    if (
      !Array.isArray(f.enemies) ||
      f.enemies.length !== plan.enemies.length ||
      !Array.isArray(f.opened) ||
      f.opened.length > plan.features.length ||
      new Set(f.opened).size !== f.opened.length ||
      !f.opened.every((id) => plan.features.some((x) => x.id === id)) ||
      !Array.isArray(f.rescued) ||
      f.rescued.length > 1 ||
      !f.rescued.every((id) => plan.features.some((x) => x.kind === 'survivor' && x.id === id)) ||
      !uint(f.puzzle) ||
      f.puzzle > 3 ||
      !Array.isArray(f.discovered) ||
      f.discovered.length > plan.rooms.length ||
      new Set(f.discovered).size !== f.discovered.length ||
      !f.discovered.every((i) => uint(i) && i < plan.rooms.length)
    )
      return false;
    for (let i = 0; i < f.enemies.length; i++) {
      const e = f.enemies[i],
        base = plan.enemies[i];
      if (
        !obj(e) ||
        !keys(e, [
          'id',
          'name',
          'kind',
          'hp',
          'maxHp',
          'x',
          'y',
          'heading',
          'phase',
          'state',
          'remaining',
        ]) ||
        e.id !== base.id ||
        e.kind !== base.kind ||
        e.name !== base.name ||
        e.maxHp !== base.maxHp ||
        !number(e.hp) ||
        e.hp < 0 ||
        e.hp > base.maxHp ||
        !number(e.x) ||
        !number(e.y) ||
        e.x < 1 ||
        e.y < 1 ||
        e.x >= plan.width - 1 ||
        e.y >= plan.height - 1 ||
        !plan.cells[Math.round(e.y) * plan.width + Math.round(e.x)] ||
        !number(e.heading) ||
        !['idle', 'pursue', 'windup', 'recovery', 'dead'].includes(String(e.state)) ||
        ![1, 2].includes(Number(e.phase)) ||
        !number(e.remaining) ||
        e.remaining < 0 ||
        e.remaining > 10 ||
        (e.hp === 0) !== (e.state === 'dead')
      )
        return false;
    }
  }
  const ids = new Set<string>();
  for (const p of v.residents) {
    if (
      !obj(p) ||
      !keys(p, [
        'id',
        'address',
        'surface',
        'sequence',
        'recoveryUntil',
        'recoverySequence',
        'lastRecoveryLoss',
      ]) ||
      !idOK(p.id) ||
      ids.has(p.id) ||
      !address(p.address) ||
      !address(p.surface) ||
      p.surface.spaceId !== 'surface' ||
      !uint(p.sequence) ||
      (p.recoveryUntil !== undefined && (!number(p.recoveryUntil) || p.recoveryUntil < 0)) ||
      (p.recoverySequence !== undefined &&
        (!uint(p.recoverySequence) || p.recoverySequence > Number(p.sequence))) ||
      (['recoveryUntil', 'recoverySequence', 'lastRecoveryLoss'].some((k) => p[k] !== undefined) &&
        !['recoveryUntil', 'recoverySequence', 'lastRecoveryLoss'].every(
          (k) => p[k] !== undefined,
        )) ||
      (p.lastRecoveryLoss !== undefined &&
        (!uint(p.lastRecoveryLoss) || p.lastRecoveryLoss > 100000000))
    )
      return false;
    ids.add(p.id);
    if (p.address.spaceId !== 'surface') {
      if (!spaces.has(p.address.spaceId)) return false;
      const parsed = parseUnderworldSpace(p.address.spaceId)!,
        plan = generateUnderworld(v.seed, parsed.settlementId, parsed.depth),
        x = Math.round(p.address.x),
        y = Math.round(p.address.y);
      if (
        x < 1 ||
        y < 1 ||
        x >= plan.width - 1 ||
        y >= plan.height - 1 ||
        !plan.cells[y * plan.width + x]
      )
        return false;
    }
  }
  const enemyIds = new Set(
      (v.floors as UnderworldFloorState[]).flatMap((f) => f.enemies.map((e) => e.id)),
    ),
    contributorIds = new Set<string>();
  for (const entry of v.contributors) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      !enemyIds.has(entry[0]) ||
      contributorIds.has(entry[0]) ||
      !Array.isArray(entry[1]) ||
      entry[1].length > 128 ||
      new Set(entry[1]).size !== entry[1].length ||
      !entry[1].every((id) => ids.has(id))
    )
      return false;
    contributorIds.add(entry[0]);
  }
  const rewardIds = new Set<string>();
  for (const r of v.rewards) {
    if (
      !obj(r) ||
      !keys(r, ['id', 'kind', 'actorId', 'sourceId', 'bundle', 'spaceId', 'x', 'y']) ||
      r.kind !== 'reward' ||
      !idOK(r.id) ||
      rewardIds.has(r.id) ||
      !idOK(r.actorId) ||
      !ids.has(r.actorId) ||
      !idOK(r.sourceId) ||
      typeof r.spaceId !== 'string' ||
      !address({ spaceId: r.spaceId, x: r.x, y: r.y }) ||
      !validFieldBundle(r.bundle)
    )
      return false;
    const parsed = parseUnderworldSpace(r.spaceId);
    if (!parsed) return false;
    const f = v.floors.find((f) => obj(f) && f.spaceId === r.spaceId) as
      | UnderworldFloorState
      | undefined;
    if (!f || !f.opened.includes(r.sourceId)) return false;
    rewardIds.add(r.id);
  }
  return true;
}

export class Underworld {
  readonly seed: number;
  private rewards: UnderworldReward[] = [];
  private plans = new Map<string, UnderworldPlan>();
  private states = new Map<string, UnderworldFloorState>();
  private complexes = new Set<string>();
  private residents = new Map<string, UnderworldResident>();
  private projectiles: UnderworldProjectile[] = [];
  private cooldowns = new Map<
    string,
    {
      attack: number;
      combo: number;
      last: number;
      guard: number;
      dodge: number;
      trap: number;
      rest: number;
    }
  >();
  private serial = 0;
  private time = 0;
  private navigation = new Map<
    string,
    { key: string; updated: number; distances: Int16Array; queue: Int16Array }
  >();
  private contributors = new Map<string, Set<string>>();
  private canDefeat: (id: string, time: number) => boolean;
  constructor(
    seed: number,
    save?: unknown,
    options: { canDefeat?: (id: string, time: number) => boolean } = {},
  ) {
    this.canDefeat = options.canDefeat ?? (() => true);
    this.seed = seed >>> 0;
    if (save !== undefined) {
      if (!validUnderworldSave(save) || save.seed !== this.seed)
        throw new Error('Invalid underground save.');
      this.serial = save.serial;
      this.rewards = clone(save.rewards);
      for (const [id, actors] of save.contributors) this.contributors.set(id, new Set(actors));
      for (const id of save.complexes) this.complexes.add(id);
      for (const f of save.floors) {
        const restored = clone(f);
        for (const enemy of restored.enemies) {
          delete enemy.intent;
          enemy.remaining = 0;
          if (enemy.hp > 0) enemy.state = 'idle';
        }
        this.states.set(f.spaceId, restored);
      }
      for (const p of save.residents) this.residents.set(p.id, clone(p));
    }
  }
  floor(settlementId: string, depth: number): UnderworldPlan {
    const space = underworldSpace(settlementId, depth);
    let plan = this.plans.get(space);
    if (!plan) {
      if (!this.complexes.has(settlementId) && this.complexes.size >= 16)
        throw new Error('Underground persistence capacity reached.');
      plan = generateUnderworld(this.seed, settlementId, depth);
      this.plans.set(space, plan);
      this.complexes.add(settlementId);
      if (!this.states.has(space)) this.states.set(space, floorState(plan));
    }
    return plan;
  }
  private resolve(
    spaceId: string,
  ): { plan: UnderworldPlan; state: UnderworldFloorState } | undefined {
    const parsed = parseUnderworldSpace(spaceId);
    if (!parsed || !this.complexes.has(parsed.settlementId)) return;
    const plan = this.floor(parsed.settlementId, parsed.depth);
    return { plan, state: this.states.get(spaceId)! };
  }
  blocked(spaceId: string, x: number, y: number): boolean {
    const f = this.resolve(spaceId);
    if (!f || !number(x) || !number(y)) return true;
    const tx = Math.round(x),
      ty = Math.round(y);
    if (
      tx < 0 ||
      ty < 0 ||
      tx >= f.plan.width ||
      ty >= f.plan.height ||
      !f.plan.cells[ty * f.plan.width + tx]
    )
      return true;
    return f.plan.features.some(
      (v) =>
        (v.kind === 'gate' || v.kind === 'shortcut' || v.kind === 'secret') &&
        Math.round(v.x) === tx &&
        Math.round(v.y) === ty &&
        !f.state.opened.includes(v.id),
    );
  }
  material(spaceId: string, x: number, y: number): UnderworldMaterial {
    const f = this.resolve(spaceId);
    const c = f?.plan.cells[Math.round(y) * f.plan.width + Math.round(x)];
    return c === 2
      ? 'shallow-water'
      : c === 3
        ? 'dirt'
        : c === 4
          ? 'metal'
          : (f?.plan.material ?? 'stone');
  }
  frame(spaceId: string): UnderworldFrame | undefined {
    const f = this.resolve(spaceId);
    return f
      ? {
          plan: clone(f.plan),
          state: clone(f.state),
          projectiles: clone(this.projectiles.filter((p) => p.spaceId === spaceId)),
          time: this.time,
        }
      : undefined;
  }
  nextSequence(id: string): number {
    return (this.residents.get(id)?.sequence ?? 0) + 1;
  }
  location(id: string): ActorAddress | undefined {
    const a = this.residents.get(id)?.address;
    return a ? { ...a } : undefined;
  }
  /** Caller supplies the established game's accepted pose. This never accepts a space change. */
  syncPeer(peer: UnderworldPeer): boolean {
    const r = this.residents.get(peer.id);
    if (
      !r ||
      r.address.spaceId !== peer.spaceId ||
      !number(peer.heading) ||
      !number(peer.x) ||
      !number(peer.y)
    )
      return false;
    if (peer.spaceId !== 'surface' && this.blocked(peer.spaceId, peer.x, peer.y)) return false;
    r.address = { spaceId: peer.spaceId, x: peer.x, y: peer.y };
    return true;
  }
  private eventId() {
    return `underworld:${this.seed}:${++this.serial}`;
  }
  private result(
    ok: boolean,
    message: string,
    events: UnderworldEvent[] = [],
    transition?: UnderworldTransition,
  ): UnderworldResult {
    return { ok, message, events, ...(transition ? { transition } : {}) };
  }
  enter(peer: UnderworldPeer, settlementId: string, entrance: Point): UnderworldResult {
    if (
      peer.spaceId !== 'surface' ||
      !peer.active ||
      !number(peer.x) ||
      !number(peer.y) ||
      !number(peer.heading) ||
      !idOK(peer.id) ||
      !number(entrance.x) ||
      !number(entrance.y) ||
      distance(peer, entrance) > 2.2
    )
      return this.result(false, 'Stand beside the underground entrance.');
    if (!this.residents.has(peer.id) && this.residents.size >= 128)
      return this.result(false, 'This world has reached its persistent traveler limit.');
    if (!this.complexes.has(settlementId) && this.complexes.size >= 16)
      return this.result(false, 'This world cannot open another complex.');
    const plan = this.floor(settlementId, 0),
      from = { spaceId: 'surface', x: peer.x, y: peer.y },
      to = { spaceId: plan.spaceId, ...plan.entrance };
    const old = this.residents.get(peer.id);
    if (old && old.address.spaceId !== 'surface')
      return this.result(false, 'You are already underground.');
    this.residents.set(peer.id, {
      id: peer.id,
      address: to,
      surface: from,
      sequence: old?.sequence ?? 0,
      ...(old?.recoveryUntil !== undefined
        ? {
            recoveryUntil: old.recoveryUntil,
            recoverySequence: old.recoverySequence,
            lastRecoveryLoss: old.lastRecoveryLoss,
          }
        : {}),
    });
    return this.result(true, `${plan.name} · ${plan.biome}`, [], {
      actorId: peer.id,
      from,
      to,
      reason: 'enter',
    });
  }
  recoveryStatus(actorId: string) {
    const resident = this.residents.get(actorId);
    return {
      cooldownUntil: resident?.recoveryUntil ?? 0,
      lastCoinLoss: resident?.lastRecoveryLoss ?? 0,
    };
  }
  /** Explicit mind recall, not pathfinding or a claim that the legacy client health is authoritative. */
  recall(
    actorId: string,
    now: number,
    sequence: number,
    options: {
      coinLoss: number;
      canOccupySurface: (point: ActorAddress) => boolean;
      debit: () => boolean;
    },
  ): UnderworldResult {
    const resident = this.residents.get(actorId);
    if (
      !resident ||
      !resident.address.spaceId.startsWith('underground:') ||
      !number(now) ||
      now < 0 ||
      !uint(sequence) ||
      sequence <= resident.sequence ||
      !uint(options.coinLoss) ||
      options.coinLoss > 100000000
    )
      return this.result(false, 'There is no current expedition to recall.');
    if (now < (resident.recoveryUntil ?? 0))
      return this.result(false, 'The recall anchor is still recovering.');
    const origin = resident.surface,
      candidates = [{ ...origin }];
    for (let radius = 1; radius <= 3; radius++)
      for (const [dx, dy] of [
        [radius, 0],
        [-radius, 0],
        [0, radius],
        [0, -radius],
      ])
        candidates.push({ spaceId: 'surface', x: origin.x + dx, y: origin.y + dy });
    const to = candidates.find((p) => address(p) && options.canOccupySurface(p));
    if (!to)
      return this.result(
        false,
        'The original surface anchor is obstructed. Clear a nearby landing tile before recalling.',
      );
    // No mutation before a real return tile and the bounded economic loss are accepted.
    if (!options.debit())
      return this.result(false, 'The recall loss could not be recorded. Nothing was moved.');
    const from = { ...resident.address };
    resident.address = { ...to };
    resident.sequence = sequence;
    resident.recoverySequence = sequence;
    resident.recoveryUntil = now + 30;
    resident.lastRecoveryLoss = options.coinLoss;
    this.leave(actorId);
    const cooldown = this.cooldowns.get(actorId);
    if (cooldown) {
      cooldown.guard = 0;
      cooldown.dodge = 0;
    }
    return {
      ...this.result(true, 'The expedition tether recalls you to its surface anchor.', [], {
        actorId,
        from,
        to: { ...to },
        reason: 'recall',
      }),
      recovery: { coinLoss: options.coinLoss, cooldownUntil: resident.recoveryUntil },
    };
  }
  private action(peer: UnderworldPeer, sequence: number): boolean {
    const r = this.residents.get(peer.id);
    if (
      !r ||
      !peer.active ||
      !uint(sequence) ||
      sequence <= r.sequence ||
      !this.syncPeer(peer) ||
      peer.spaceId === 'surface'
    )
      return false;
    r.sequence = sequence;
    return true;
  }
  private cd(id: string) {
    let c = this.cooldowns.get(id);
    if (!c) {
      c = { attack: 0, combo: 0, last: -10, guard: 0, dodge: 0, trap: 0, rest: 0 };
      this.cooldowns.set(id, c);
    }
    return c;
  }
  interact(
    peer: UnderworldPeer,
    targetId: string,
    now: number,
    sequence: number,
  ): UnderworldResult {
    if (!number(now) || now < 0 || !this.action(peer, sequence))
      return this.result(false, 'That action is stale or outside this floor.');
    const f = this.resolve(peer.spaceId)!;
    const feature = f.plan.features.find((v) => v.id === targetId);
    if (!feature || distance(peer, feature) > 2.2)
      return this.result(false, 'Move closer to inspect it.');
    const s = f.state,
      nearThreat = s.enemies.some((e) => e.hp > 0 && distance(e, peer) < 6),
      events: UnderworldEvent[] = [];
    const opened = () => s.opened.includes(feature.id);
    const open = () => {
      if (!opened()) s.opened.push(feature.id);
    };
    if (feature.kind === 'inscription') return this.result(true, feature.description);
    if (feature.kind === 'gate')
      return this.result(opened(), opened() ? 'The sluice stands open.' : feature.description);
    if (feature.kind === 'rune') {
      if (s.puzzle === 3) return this.result(true, 'The signal circuit is already complete.');
      s.puzzle = f.plan.puzzle[s.puzzle] === feature.value ? s.puzzle + 1 : 0;
      if (s.puzzle === 3) {
        const gate = f.plan.features.find((v) => v.kind === 'gate')!;
        s.opened.push(gate.id);
        events.push({
          id: this.eventId(),
          kind: 'cue',
          cue: 'gate',
          spaceId: peer.spaceId,
          x: gate.x,
          y: gate.y,
        });
      }
      return this.result(
        true,
        s.puzzle === 3
          ? 'The sluice opens.'
          : s.puzzle === 0
            ? 'A wrong signal resets the circuit.'
            : `${s.puzzle} of 3 signals aligned.`,
        events,
      );
    }
    if (feature.kind === 'shortcut') {
      if (opened()) return this.result(true, 'The shortcut remains open.');
      if (peer.x <= feature.x) return this.result(false, 'The release is on the vault side.');
      open();
      return this.result(true, 'The return shortcut opens.', [
        {
          id: this.eventId(),
          kind: 'cue',
          cue: 'gate',
          spaceId: peer.spaceId,
          x: feature.x,
          y: feature.y,
        },
      ]);
    }
    if (feature.kind === 'up' || feature.kind === 'down') {
      if (feature.kind === 'down' && s.enemies.some((e) => e.kind === 'boss' && e.hp > 0))
        return this.result(false, 'The keeper still controls the descent.');
      const resident = this.residents.get(peer.id)!,
        from = { ...resident.address };
      let to: ActorAddress;
      if (feature.kind === 'up' && f.plan.depth === 0) to = { ...resident.surface };
      else {
        const depth = f.plan.depth + (feature.kind === 'down' ? 1 : -1),
          next = this.floor(f.plan.settlementId, depth);
        to = { spaceId: next.spaceId, ...(feature.kind === 'down' ? next.entrance : next.exit) };
      }
      if (to.spaceId !== 'surface' && this.blocked(to.spaceId, to.x, to.y))
        return this.result(false, 'The destination stair is obstructed.');
      resident.address = to;
      this.projectiles = this.projectiles.filter((p) => p.ownerId !== peer.id);
      return this.result(
        true,
        to.spaceId === 'surface' ? 'You return to the surface.' : 'You follow the stair.',
        [],
        { actorId: peer.id, from, to, reason: to.spaceId === 'surface' ? 'return' : 'stairs' },
      );
    }
    if (feature.kind === 'rest') {
      if (nearThreat) return this.result(false, 'The hearth is unsafe while enemies are close.');
      const c = this.cd(peer.id);
      if (now < c.rest) return this.result(false, 'The hearth is still settling.');
      c.rest = now + 20;
      return this.result(true, 'The sheltered hearth steadies your breathing.', [
        {
          id: this.eventId(),
          kind: 'cue',
          cue: 'rest',
          spaceId: peer.spaceId,
          x: peer.x,
          y: peer.y,
        },
      ]);
    }
    if (feature.kind === 'survivor') {
      if (s.rescued.includes(feature.id))
        return this.result(true, 'The survivor has returned to the settlement.');
      if (s.enemies.some((e) => e.kind === 'mini' && e.hp > 0))
        return this.result(false, 'Defeat the corridor overseer to release the refuge seal.');
      s.rescued.push(feature.id);
      const profession = (['mason', 'herbalist', 'engineer'] as const)[f.plan.depth],
        unlock = (['waterworks', 'healing-garden', 'deep-forge'] as const)[f.plan.depth];
      events.push(
        {
          id: this.eventId(),
          kind: 'rescue',
          actorId: peer.id,
          survivorId: `${f.plan.settlementId}:rescued:${f.plan.depth}`,
          profession,
          settlementId: f.plan.settlementId,
          depth: f.plan.depth,
        },
        {
          id: this.eventId(),
          kind: 'unlock',
          actorId: peer.id,
          settlementId: f.plan.settlementId,
          unlock,
        },
      );
      return this.result(
        true,
        `The ${profession} returns home and offers a new rebuilding trade.`,
        events,
      );
    }
    if (feature.kind === 'cache' || feature.kind === 'secret' || feature.kind === 'core') {
      if (this.rewards.length >= 256)
        return this.result(false, 'Recover pending salvage before opening another cache.');
      if (opened()) return this.result(false, 'Already recovered.');
      if (feature.kind === 'core' && s.enemies.some((e) => e.kind === 'boss' && e.hp > 0))
        return this.result(false, 'The engine keeper must be defeated first.');
      if (nearThreat) return this.result(false, 'Clear nearby threats before salvaging.');
      open();
      const bundle: FieldBundle =
        feature.kind === 'core'
          ? { coins: 35, items: { relic: 1, knowledge: 3, crystal: 3 } }
          : feature.kind === 'secret'
            ? { coins: 8, items: { relic: 1 } }
            : feature.x === 26
              ? { coins: 0, items: { knowledge: 1 } }
              : { coins: 0, items: { scrap: 3 + f.plan.depth, ore: 2 + f.plan.depth } };
      const reward: UnderworldReward = {
        id: this.eventId(),
        kind: 'reward',
        actorId: peer.id,
        sourceId: feature.id,
        bundle,
        spaceId: peer.spaceId,
        x: feature.x,
        y: feature.y,
      };
      this.rewards.push(reward);
      events.push(clone(reward), {
        id: this.eventId(),
        kind: 'cue',
        cue: feature.kind === 'core' ? 'victory' : 'secret',
        spaceId: peer.spaceId,
        x: feature.x,
        y: feature.y,
      });
      if (feature.kind === 'core')
        events.push({
          id: this.eventId(),
          kind: 'unlock',
          actorId: peer.id,
          settlementId: f.plan.settlementId,
          unlock: 'deep-forge',
        });
      return this.result(
        true,
        feature.kind === 'core'
          ? 'The buried forge is stable. Its recovered plans can rebuild the town.'
          : 'Recovered useful underground salvage.',
        events,
      );
    }
    return this.result(true, feature.description);
  }
  private lineClear(spaceId: string, a: Point, b: Point) {
    const n = Math.ceil(distance(a, b) * 4);
    for (let i = 1; i <= n; i++)
      if (this.blocked(spaceId, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n))
        return false;
    return true;
  }
  private hurt(
    f: { plan: UnderworldPlan; state: UnderworldFloorState },
    enemy: UnderworldEnemy,
    peerId: string,
    damage: number,
    attack: 'melee' | 'ranged' | 'spell',
    events: UnderworldEvent[],
  ) {
    if (enemy.hp <= 0 || events.length >= 254) return;
    if (damage >= enemy.hp && !this.canDefeat(enemy.id, this.time)) return;
    enemy.hp = Math.max(0, enemy.hp - damage);
    let contributors = this.contributors.get(enemy.id);
    if (!contributors) {
      contributors = new Set();
      this.contributors.set(enemy.id, contributors);
    }
    contributors.add(peerId);
    events.push({
      id: this.eventId(),
      kind: 'hit',
      actorId: peerId,
      targetId: enemy.id,
      damage,
      spaceId: f.plan.spaceId,
      x: enemy.x,
      y: enemy.y,
      attack,
    });
    if (enemy.hp === 0) {
      enemy.state = 'dead';
      enemy.remaining = 0;
      delete enemy.intent;
      events.push({
        id: this.eventId(),
        kind: 'death',
        death: {
          actorId: enemy.id,
          spaceId: f.plan.spaceId,
          x: enemy.x,
          y: enemy.y,
          kind: 'enemy',
          role:
            enemy.kind === 'boss'
              ? 'dungeon boss'
              : enemy.kind === 'mini'
                ? 'dungeon elite'
                : 'dungeon sentinel',
          difficulty: f.plan.depth + (enemy.kind === 'boss' ? 5 : enemy.kind === 'mini' ? 3 : 1),
          contributors: [...contributors],
          time: this.time,
          biome: f.plan.biome,
        },
      });
    } else if (enemy.kind !== 'boss' && attack === 'melee') {
      enemy.state = 'recovery';
      enemy.remaining = 0.22;
      delete enemy.intent;
    }
  }
  attack(peer: UnderworldPeer, attack: UnderworldAttack, now: number): UnderworldResult {
    if (
      !number(now) ||
      now < 0 ||
      !number(attack.heading) ||
      !['melee', 'ranged', 'spell', 'guard', 'dodge'].includes(attack.kind) ||
      !this.action(peer, attack.sequence)
    )
      return this.result(false, 'That combat action is stale.');
    const c = this.cd(peer.id);
    if (now < c.attack) return this.result(false, 'Recover before acting again.');
    const f = this.resolve(peer.spaceId)!,
      events: UnderworldEvent[] = [];
    if (attack.kind === 'guard' || attack.kind === 'dodge') {
      c.attack = now + 0.55;
      c.guard = attack.kind === 'guard' ? now + 0.7 : c.guard;
      c.dodge = attack.kind === 'dodge' ? now + 0.22 : c.dodge;
      return this.result(true, attack.kind === 'guard' ? 'Guard raised.' : 'Evade window opened.');
    }
    if (
      (attack.kind === 'ranged' && peer.weaponKind && peer.weaponKind !== 'bow') ||
      (attack.kind === 'spell' && peer.weaponKind && peer.weaponKind !== 'staff') ||
      (peer.weaponKind !== undefined && !['sword', 'staff', 'bow'].includes(peer.weaponKind)) ||
      (peer.weaponSeed !== undefined &&
        (!Number.isSafeInteger(peer.weaponSeed) ||
          peer.weaponSeed < -0xffffffff ||
          peer.weaponSeed > MAX_WEAPON_SEED))
    )
      return this.result(false, 'That weapon cannot perform this action.');
    this.time = Math.max(this.time, now);
    const kind =
        peer.weaponKind ??
        (attack.kind === 'ranged' ? 'bow' : attack.kind === 'spell' ? 'staff' : 'sword'),
      seed = Number.isSafeInteger(peer.weaponSeed)
        ? peer.weaponSeed!
        : deriveSeed(this.seed, peer.id, 'underground-weapon'),
      profile = weaponProfile(seed, kind, 1);
    c.combo = now - c.last < 1.15 ? (c.combo + 1) % 3 : 0;
    c.last = now;
    c.attack = now + Math.max(0.35, profile.cooldown) * (c.combo === 2 ? 1.18 : 1);
    const damage = Math.round(profile.damage * (c.combo === 2 ? 1.4 : 1)),
      heading = attack.heading;
    events.push({
      id: this.eventId(),
      kind: 'cue',
      cue: 'attack',
      spaceId: peer.spaceId,
      x: peer.x,
      y: peer.y,
    });
    if (attack.kind === 'ranged' || attack.kind === 'spell') {
      if (this.projectiles.length >= 64) return this.result(false, 'Too many active projectiles.');
      const offsets = attack.kind === 'spell' && c.combo === 2 ? [-0.2, 0, 0.2] : [0];
      for (const offset of offsets) {
        if (this.projectiles.length >= 64) break;
        this.projectiles.push({
          id: this.eventId(),
          ownerId: peer.id,
          spaceId: peer.spaceId,
          x: peer.x,
          y: peer.y,
          heading: heading + offset,
          speed: attack.kind === 'spell' ? 8 : 12,
          remaining:
            (attack.kind === 'spell' ? 6 : Math.min(profile.range, 10)) /
            (attack.kind === 'spell' ? 8 : 12),
          damage: offset === 0 ? damage : Math.round(damage * 0.55),
          friendly: true,
          attack: attack.kind,
        });
      }
    } else {
      const range = Math.min(3, profile.range + (c.combo === 2 ? 0.35 : 0));
      for (const enemy of f.state.enemies) {
        const d = distance(peer, enemy),
          dot =
            d < 0.01
              ? 1
              : ((enemy.x - peer.x) * Math.cos(heading) + (enemy.y - peer.y) * Math.sin(heading)) /
                d;
        if (
          enemy.hp > 0 &&
          d <= range &&
          dot > (c.combo === 2 ? 0 : 0.3) &&
          this.lineClear(peer.spaceId, peer, enemy)
        )
          this.hurt(f, enemy, peer.id, damage, 'melee', events);
      }
    }
    return this.result(true, c.combo === 2 ? 'Finisher.' : 'Attack.', events);
  }
  tick(dt: number, peers: readonly UnderworldPeer[], now: number): UnderworldEvent[] {
    if (!number(dt) || dt <= 0 || !number(now) || now < 0) return [];
    this.time = now;
    const active = peers
      .slice(0, 128)
      .filter((p) => p.active && this.syncPeer(p) && p.spaceId !== 'surface');
    const events: UnderworldEvent[] = [];
    let remaining = Math.min(dt, 0.25);
    while (remaining > 0.00001) {
      const step = Math.min(remaining, 1 / 30);
      this.step(step, active, events);
      remaining -= step;
      if (events.length >= 256) break;
    }
    return events.slice(0, 256);
  }
  private routeDirection(spaceId: string, from: Point, target: Point): Point {
    if (this.lineClear(spaceId, from, target))
      return { x: target.x - from.x, y: target.y - from.y };
    const f = this.resolve(spaceId)!,
      plan = f.plan,
      tx = Math.round(target.x),
      ty = Math.round(target.y),
      key = `${tx}:${ty}:${f.state.opened.length}`;
    let field = this.navigation.get(spaceId);
    if (!field) {
      field = {
        key: '',
        updated: -1,
        distances: new Int16Array(plan.cells.length),
        queue: new Int16Array(plan.cells.length),
      };
      this.navigation.set(spaceId, field);
    }
    if (field.key !== key && this.time - field.updated >= 0.25) {
      field.key = key;
      field.updated = this.time;
      field.distances.fill(-1);
      const closed = new Set(
        plan.features
          .filter(
            (v) =>
              ['gate', 'shortcut', 'secret'].includes(v.kind) && !f.state.opened.includes(v.id),
          )
          .map((v) => Math.round(v.y) * plan.width + Math.round(v.x)),
      );
      let head = 0,
        tail = 0;
      const start = ty * plan.width + tx;
      if (plan.cells[start] && !closed.has(start)) {
        field.queue[tail++] = start;
        field.distances[start] = 0;
      }
      while (head < tail) {
        const at = field.queue[head++],
          x = at % plan.width,
          y = Math.floor(at / plan.width);
        for (let side = 0; side < 4; side++) {
          const nx = x + (side === 0 ? 1 : side === 1 ? -1 : 0),
            ny = y + (side === 2 ? 1 : side === 3 ? -1 : 0),
            next = ny * plan.width + nx;
          if (
            nx < 0 ||
            ny < 0 ||
            nx >= plan.width ||
            ny >= plan.height ||
            !plan.cells[next] ||
            closed.has(next) ||
            field.distances[next] >= 0
          )
            continue;
          field.distances[next] = field.distances[at] + 1;
          field.queue[tail++] = next;
        }
      }
    }
    const x = Math.round(from.x),
      y = Math.round(from.y),
      at = y * plan.width + x;
    let best = at,
      value = field.distances[at];
    if (value < 0) return { x: 0, y: 0 };
    for (let side = 0; side < 4; side++) {
      const nx = x + (side === 0 ? 1 : side === 1 ? -1 : 0),
        ny = y + (side === 2 ? 1 : side === 3 ? -1 : 0),
        next = ny * plan.width + nx;
      if (nx < 0 || ny < 0 || nx >= plan.width || ny >= plan.height) continue;
      const d = field.distances[next];
      if (d >= 0 && d < value) {
        best = next;
        value = d;
      }
    }
    return { x: (best % plan.width) - from.x, y: Math.floor(best / plan.width) - from.y };
  }
  private peerHit(
    peer: UnderworldPeer,
    actorId: string,
    damage: number,
    attack: 'melee' | 'ranged' | 'trap',
    events: UnderworldEvent[],
  ) {
    const c = this.cd(peer.id);
    if (this.time < c.dodge || events.length >= 256) return;
    const actual = Math.round(damage * (this.time < c.guard ? 0.25 : 1));
    events.push({
      id: this.eventId(),
      kind: 'hit',
      actorId,
      targetId: peer.id,
      damage: actual,
      spaceId: peer.spaceId,
      x: peer.x,
      y: peer.y,
      attack,
    });
  }
  private step(dt: number, peers: UnderworldPeer[], events: UnderworldEvent[]) {
    for (const [spaceId, state] of this.states) {
      const here = peers.filter((p) => p.spaceId === spaceId);
      if (!here.length) continue;
      const f = this.resolve(spaceId)!;
      for (const peer of here) {
        for (let i = 0; i < f.plan.rooms.length; i++) {
          const room = f.plan.rooms[i];
          if (
            Math.abs(peer.x - room.x) < room.width / 2 + 1 &&
            Math.abs(peer.y - room.y) < room.height / 2 + 1 &&
            !state.discovered.includes(i)
          )
            state.discovered.push(i);
        }
        for (const trap of f.plan.features.filter((t) => t.kind === 'trap')) {
          const phase = underworldTrapPhase(this.time, trap.id),
            c = this.cd(peer.id);
          if (phase === 'active' && distance(peer, trap) < 0.9 && this.time >= c.trap) {
            c.trap = this.time + 1;
            this.peerHit(peer, trap.id, 8 + f.plan.depth * 3, 'trap', events);
          }
        }
      }
      for (const enemy of state.enemies) {
        if (enemy.hp <= 0) continue;
        let target: UnderworldPeer | undefined,
          d = Infinity;
        for (const p of here) {
          const pd = distance(enemy, p);
          if (pd < d) {
            target = p;
            d = pd;
          }
        }
        if (!target || d > 20) continue;
        if (enemy.kind === 'boss' && enemy.hp < enemy.maxHp * 0.5 && enemy.phase === 1) {
          enemy.phase = 2;
          events.push({
            id: this.eventId(),
            kind: 'cue',
            cue: 'boss-phase',
            spaceId,
            x: enemy.x,
            y: enemy.y,
          });
        }
        enemy.remaining = Math.max(0, enemy.remaining - dt);
        if (enemy.state === 'windup' && enemy.intent) {
          if (enemy.remaining > 0) continue;
          const intent = enemy.intent;
          if (enemy.kind === 'sentry') {
            if (this.projectiles.length < 64)
              this.projectiles.push({
                id: this.eventId(),
                ownerId: enemy.id,
                spaceId,
                x: enemy.x,
                y: enemy.y,
                heading: intent.heading,
                speed: 5.5,
                remaining: 1.4,
                damage: 8 + f.plan.depth * 2,
                friendly: false,
              });
            delete enemy.intent;
            enemy.state = 'recovery';
            enemy.remaining = 2;
            continue;
          }
          for (const peer of here) {
            const dx = peer.x - enemy.x,
              dy = peer.y - enemy.y,
              dist = Math.hypot(dx, dy),
              along = dx * Math.cos(intent.heading) + dy * Math.sin(intent.heading),
              side = Math.abs(-dx * Math.sin(intent.heading) + dy * Math.cos(intent.heading));
            const inside =
              dist <= intent.range &&
              (intent.shape === 'radial' ||
                (intent.shape === 'line' && along >= 0 && side < 0.65) ||
                (intent.shape === 'cone' && along / Math.max(dist, 0.001) > 0.35));
            if (inside && this.lineClear(spaceId, enemy, peer))
              this.peerHit(
                peer,
                enemy.id,
                enemy.kind === 'boss'
                  ? enemy.phase === 2
                    ? 20
                    : 16
                  : enemy.kind === 'mini'
                    ? 12
                    : 7,
                'melee',
                events,
              );
          }
          delete enemy.intent;
          enemy.state = 'recovery';
          enemy.remaining = enemy.kind === 'boss' ? 1.6 : 1.1;
          continue;
        }
        if (enemy.state === 'recovery' && enemy.remaining > 0) continue;
        const ranged = enemy.kind === 'sentry',
          range =
            enemy.kind === 'boss' ? (enemy.phase === 2 ? 3.5 : 5) : enemy.kind === 'mini' ? 3 : 1.5;
        if (d <= (ranged ? 7 : range) && this.lineClear(spaceId, enemy, target)) {
          enemy.heading = Math.atan2(target.y - enemy.y, target.x - enemy.x);
          if (ranged) {
            enemy.state = 'windup';
            enemy.remaining = 0.8;
            enemy.intent = { shape: 'line', heading: enemy.heading, range: 7, duration: 0.8 };
            continue;
          }
          const duration =
            enemy.kind === 'boss'
              ? enemy.phase === 2
                ? 1.15
                : 0.95
              : enemy.kind === 'mini'
                ? 0.85
                : 0.55;
          enemy.state = 'windup';
          enemy.remaining = duration;
          enemy.intent = {
            shape:
              enemy.kind === 'boss'
                ? enemy.phase === 2
                  ? 'radial'
                  : 'line'
                : enemy.kind === 'mini'
                  ? 'line'
                  : 'cone',
            heading: enemy.heading,
            range,
            duration,
          };
          continue;
        }
        enemy.state = 'pursue';
        const speed = enemy.kind === 'boss' ? 0.95 : enemy.kind === 'crawler' ? 1.6 : 1.2;
        const direction = this.routeDirection(spaceId, enemy, target),
          length = Math.hypot(direction.x, direction.y);
        const dx = (direction.x / Math.max(length, 0.01)) * speed * dt,
          dy = (direction.y / Math.max(length, 0.01)) * speed * dt;
        const free = (x: number, y: number) =>
          !this.blocked(spaceId, x, y) &&
          !state.enemies.some(
            (other) => other !== enemy && other.hp > 0 && distance(other, { x, y }) < 0.5,
          );
        if (free(enemy.x + dx, enemy.y)) enemy.x += dx;
        if (free(enemy.x, enemy.y + dy)) enemy.y += dy;
        enemy.heading = Math.atan2(dy, dx);
      }
    }
    const alive: UnderworldProjectile[] = [];
    for (const p of this.projectiles) {
      if (!peers.some((peer) => peer.spaceId === p.spaceId)) continue;
      const nx = p.x + Math.cos(p.heading) * p.speed * dt,
        ny = p.y + Math.sin(p.heading) * p.speed * dt;
      p.remaining -= dt;
      if (p.remaining <= 0 || !this.lineClear(p.spaceId, p, { x: nx, y: ny })) continue;
      p.x = nx;
      p.y = ny;
      const f = this.resolve(p.spaceId)!;
      if (p.friendly) {
        const enemy = f.state.enemies.find((e) => e.hp > 0 && distance(e, p) < 0.55);
        if (enemy) {
          this.hurt(f, enemy, p.ownerId, p.damage, p.attack ?? 'ranged', events);
          continue;
        }
      } else {
        const peer = peers.find((peer) => peer.spaceId === p.spaceId && distance(peer, p) < 0.45);
        if (peer) {
          this.peerHit(peer, p.ownerId, p.damage, 'ranged', events);
          continue;
        }
      }
      alive.push(p);
    }
    this.projectiles = alive;
  }
  pendingRewardCount(actorId: string): number {
    let count = 0;
    for (const reward of this.rewards) if (reward.actorId === actorId) count++;
    return count;
  }
  pendingRewards(actorId: string, limit = 256): UnderworldReward[] {
    return clone(
      this.rewards
        .filter((r) => r.actorId === actorId)
        .slice(0, Math.max(0, Math.min(256, Math.trunc(limit) || 0))),
    );
  }
  /** Authority calls only after the exact field transaction succeeds. Never expose a client ack command. */
  acknowledgeReward(actorId: string, rewardId: string): boolean {
    const i = this.rewards.findIndex((r) => r.actorId === actorId && r.id === rewardId);
    if (i < 0) return false;
    this.rewards.splice(i, 1);
    return true;
  }
  leave(id: string): void {
    this.projectiles = this.projectiles.filter(
      (p) => p.ownerId !== id,
    ); /* Keep bounded combat cooldowns across disconnect: reconnect is not an extra strike. */
  }
  save(): UnderworldSave {
    return {
      version: 1,
      seed: this.seed,
      complexes: [...this.complexes],
      floors: [...this.states.values()].map((f) => {
        const out = clone(f);
        for (const enemy of out.enemies) {
          delete enemy.intent;
          enemy.remaining = 0;
          if (enemy.hp > 0) enemy.state = 'idle';
        }
        return out;
      }),
      residents: clone([...this.residents.values()]),
      rewards: clone(this.rewards),
      contributors: [...this.contributors].map(([id, actors]) => [id, [...actors]]),
      serial: this.serial,
    };
  }
  diagnostics() {
    return {
      complexes: this.complexes.size,
      floors: this.states.size,
      residents: this.residents.size,
      projectiles: this.projectiles.length,
      enemyCount: [...this.states.values()].reduce((n, f) => n + f.enemies.length, 0),
    };
  }
}
export function underworldTrapPhase(time: number, id: string): 'idle' | 'warning' | 'active' {
  const phase = (time + (deriveSeed(1, id) % 200) / 100) % 4;
  return phase < 2.4 ? 'idle' : phase < 3.2 ? 'warning' : 'active';
}
