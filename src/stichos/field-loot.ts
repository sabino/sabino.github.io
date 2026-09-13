import { deriveSeed, random } from '../procedural/random.ts';
import type { ActorAddress } from './actor-ledger.ts';
import type { FaunaActor, FaunaKind } from './living-world.ts';

/** Authoritative balances are deliberately separate from imported personal inventory. */
export const FIELD_ITEMS = {
  wood: { name: 'Timber', value: 2, family: 'material' },
  stone: { name: 'Building stone', value: 2, family: 'material' },
  ore: { name: 'Metal ore', value: 4, family: 'material' },
  fiber: { name: 'Plant fiber', value: 2, family: 'material' },
  resin: { name: 'Binding resin', value: 5, family: 'material' },
  meat: { name: 'Fresh game', value: 4, family: 'animal' },
  hide: { name: 'Game hide', value: 6, family: 'animal' },
  feather: { name: 'Flight feather', value: 3, family: 'animal' },
  bone: { name: 'Carving bone', value: 3, family: 'animal' },
  fang: { name: 'Predator fang', value: 10, family: 'animal' },
  scrap: { name: 'Recovered fittings', value: 4, family: 'material' },
  crystal: { name: 'Resonant crystal', value: 14, family: 'relic' },
  knowledge: { name: 'Recovered field notes', value: 18, family: 'relic' },
  relic: { name: 'Civilization relic', value: 30, family: 'relic' },
  planks: { name: 'Planed boards', value: 5, family: 'building' },
  ingot: { name: 'Worked metal', value: 10, family: 'building' },
  leather: { name: 'Cured leather', value: 12, family: 'building' },
  ration: { name: 'Trail meal', value: 9, family: 'supply' },
  bandage: { name: 'Field dressing', value: 6, family: 'supply' },
  'field-knife': { name: 'Field knife', value: 0, family: 'tool' },
  hatchet: { name: 'Forester hatchet', value: 0, family: 'tool' },
  pickaxe: { name: 'Quarry pick', value: 0, family: 'tool' },
  spear: { name: 'Hunting spear', value: 0, family: 'tool' },
  'ward-kit': { name: 'Bone and crystal ward', value: 0, family: 'equipment' },
} as const;
export type FieldItem = keyof typeof FIELD_ITEMS;
export type FieldStacks = Partial<Record<FieldItem, number>>;
export type FieldRarity = 'common' | 'uncommon' | 'rare' | 'exceptional';
export interface FieldPeer extends ActorAddress {
  id: string;
}
export interface FieldBundle {
  coins: number;
  items: FieldStacks;
}
export interface FieldSatchel extends FieldBundle {
  actorId: string;
  capacity: number;
  lastHuntAt: number;
  lastGatherAt: number;
}
export interface FieldDeath extends ActorAddress {
  actorId: string;
  kind: 'enemy' | FaunaKind;
  /** Server-resolved role, never the requester's supplied description. */
  role?: string;
  difficulty: number;
  contributors: string[];
  time: number;
  biome?: string;
  night?: boolean;
  protected?: boolean;
  factionId?: string;
}
export interface FieldDrop extends ActorAddress {
  id: string;
  sourceId: string;
  name: string;
  kind: FieldDeath['kind'];
  rarity: FieldRarity;
  bundle: FieldBundle;
  eligible: string[];
  createdAt: number;
  exclusiveUntil: number;
  expiresAt: number;
  protected: boolean;
  factionId?: string;
  /** A knife is required to dress an actual animal carcass. */
  harvest: boolean;
}
export interface FieldReceipt {
  id: string;
  actorId: string;
  kind: 'death' | 'claim' | 'transaction' | 'gather';
}
export interface WildlifeWound {
  actorId: string;
  kind: FaunaKind;
  hp: number;
  contributors: string[];
}
export interface FieldEconomySave {
  version: 1;
  seed: number;
  satchels: FieldSatchel[];
  drops: FieldDrop[];
  receipts: FieldReceipt[];
  wounds: WildlifeWound[];
}
export interface FieldEconomyFrame {
  version: 1;
  satchel: FieldSatchel;
  drops: FieldDrop[];
  saturated: boolean;
}
export interface FieldOutcome {
  ok: boolean;
  message: string;
  drop?: FieldDrop;
  reward?: FieldBundle;
  scavenged?: boolean;
  consequence?: 'protected-hunt' | 'protected-harvest' | 'hunt' | 'gather';
}
export interface FieldHuntOutcome extends FieldOutcome {
  health?: number;
  damage?: number;
  killed?: boolean;
  reaction?: 'flee' | 'defend';
}
export const FIELD_RULES = Object.freeze({
  maxSatchels: 128,
  maxDrops: 256,
  maxReceipts: 16384,
  maxWounds: 2048,
  bagSlots: 24,
  maxSlots: 64,
  stackSize: 99,
  maxCoins: 100000000,
  claimDistance: 2.2,
  ownershipSeconds: 90,
  expirySeconds: 1800,
  visibleDrops: 64,
  viewDistance: 36,
  knifeRange: 1.8,
  spearRange: 2.8,
  huntCooldown: 0.8,
  gatherCooldown: 1.2,
});
export const WILDLIFE_HEALTH: Readonly<Record<FaunaKind, number>> = Object.freeze({
  bird: 12,
  grazer: 36,
  boar: 54,
  wolf: 44,
});
export interface FieldRecipe {
  id: string;
  name: string;
  station: 'field' | 'workshop' | 'hearth';
  cost: FieldBundle;
  reward: FieldBundle;
  description: string;
}
export const FIELD_RECIPES: readonly FieldRecipe[] = [
  {
    id: 'knife',
    name: 'Knapped field knife',
    station: 'field',
    cost: { coins: 0, items: { stone: 2, fiber: 1 } },
    reward: { coins: 0, items: { 'field-knife': 1 } },
    description: 'Dress game carcasses and defend yourself at close range.',
  },
  {
    id: 'hatchet',
    name: 'Forester hatchet',
    station: 'field',
    cost: { coins: 0, items: { wood: 2, stone: 2, fiber: 1 } },
    reward: { coins: 0, items: { hatchet: 1 } },
    description: 'Fell harvestable timber with an owned cutting tool.',
  },
  {
    id: 'pickaxe',
    name: 'Quarry pick',
    station: 'field',
    cost: { coins: 0, items: { wood: 2, stone: 2, fiber: 1 } },
    reward: { coins: 0, items: { pickaxe: 1 } },
    description: 'Extract building stone and metal ore from actual deposits.',
  },
  {
    id: 'spear',
    name: 'Balanced hunting spear',
    station: 'workshop',
    cost: { coins: 4, items: { planks: 2, bone: 2, resin: 1 } },
    reward: { coins: 0, items: { spear: 1 } },
    description: 'A longer reach and stronger strike for hunting dangerous game.',
  },
  {
    id: 'boards',
    name: 'Saw boards',
    station: 'workshop',
    cost: { coins: 0, items: { wood: 3 } },
    reward: { coins: 0, items: { planks: 2 } },
    description: 'Structural boards for homes, stores, furniture and workstations.',
  },
  {
    id: 'metal',
    name: 'Work metal',
    station: 'workshop',
    cost: { coins: 0, items: { ore: 3, wood: 1 } },
    reward: { coins: 0, items: { ingot: 1 } },
    description: 'Machine parts, building hardware and guild commissions.',
  },
  {
    id: 'leather',
    name: 'Cure hide',
    station: 'workshop',
    cost: { coins: 0, items: { hide: 2, resin: 1 } },
    reward: { coins: 0, items: { leather: 1 } },
    description: 'Durable straps for equipment, packs and workshops.',
  },
  {
    id: 'meal',
    name: 'Cook trail meals',
    station: 'hearth',
    cost: { coins: 0, items: { meat: 2, wood: 1 } },
    reward: { coins: 0, items: { ration: 2 } },
    description: 'Provisions for workers and expeditions; raw meat is not a finished meal.',
  },
  {
    id: 'dressing',
    name: 'Weave field dressing',
    station: 'field',
    cost: { coins: 0, items: { fiber: 3, resin: 1 } },
    reward: { coins: 0, items: { bandage: 2 } },
    description: 'A useful expedition and survivor-recovery supply.',
  },
  {
    id: 'ward',
    name: 'Carve a resonance ward',
    station: 'workshop',
    cost: { coins: 12, items: { bone: 3, crystal: 2, leather: 1 } },
    reward: { coins: 0, items: { 'ward-kit': 1 } },
    description: 'An authoritative equipment reward for subterranean expeditions.',
  },
];

const clone = <T>(value: T): T => structuredClone(value);
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const number = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= 240 &&
  !/[\u0000-\u001f\u007f]/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v);
const ids = (v: unknown, max = 32): v is string[] =>
  Array.isArray(v) && v.length <= max && v.every(id) && new Set(v).size === v.length;
const address = (v: unknown): v is ActorAddress =>
  object(v) &&
  id(v.spaceId) &&
  /^[a-zA-Z0-9:_.,-]+$/.test(v.spaceId) &&
  number(v.x, -1e8, 1e8) &&
  number(v.y, -1e8, 1e8);
const faunaKind = (v: unknown): v is FaunaKind =>
  ['bird', 'grazer', 'boar', 'wolf'].includes(v as string);
const item = (v: string): v is FieldItem => Object.hasOwn(FIELD_ITEMS, v);
export function validFieldBundle(v: unknown): v is FieldBundle {
  return (
    object(v) &&
    keys(v, ['coins', 'items']) &&
    integer(v.coins, 0, FIELD_RULES.maxCoins) &&
    object(v.items) &&
    Object.entries(v.items).every(
      ([k, count]) => item(k) && integer(count, 1, FIELD_RULES.stackSize * FIELD_RULES.maxSlots),
    )
  );
}
export function fieldSlots(items: FieldStacks): number {
  return Object.values(items).reduce(
    (sum, quantity) => sum + Math.ceil((quantity ?? 0) / FIELD_RULES.stackSize),
    0,
  );
}
const validSatchel = (v: unknown): v is FieldSatchel =>
  object(v) &&
  keys(v, ['actorId', 'coins', 'items', 'capacity', 'lastHuntAt', 'lastGatherAt']) &&
  id(v.actorId) &&
  validFieldBundle({ coins: v.coins, items: v.items }) &&
  integer(v.capacity, 1, FIELD_RULES.maxSlots) &&
  fieldSlots(v.items as FieldStacks) <= v.capacity &&
  number(v.lastHuntAt, -1) &&
  number(v.lastGatherAt, -1);
const validDrop = (v: unknown): v is FieldDrop =>
  object(v) &&
  keys(v, [
    'id',
    'sourceId',
    'name',
    'kind',
    'rarity',
    'bundle',
    'eligible',
    'createdAt',
    'exclusiveUntil',
    'expiresAt',
    'protected',
    'factionId',
    'harvest',
    'spaceId',
    'x',
    'y',
  ]) &&
  address(v) &&
  id(v.id) &&
  id(v.sourceId) &&
  id(v.name) &&
  (v.kind === 'enemy' || faunaKind(v.kind)) &&
  ['common', 'uncommon', 'rare', 'exceptional'].includes(v.rarity as string) &&
  validFieldBundle(v.bundle) &&
  ids(v.eligible) &&
  v.eligible.length > 0 &&
  number(v.createdAt) &&
  number(v.exclusiveUntil, v.createdAt) &&
  number(v.expiresAt, v.exclusiveUntil) &&
  v.exclusiveUntil === v.createdAt + FIELD_RULES.ownershipSeconds &&
  v.expiresAt === v.createdAt + FIELD_RULES.expirySeconds &&
  typeof v.protected === 'boolean' &&
  (v.factionId === undefined || id(v.factionId)) &&
  v.harvest === (v.kind !== 'enemy');
export function validFieldEconomySave(v: unknown): v is FieldEconomySave {
  if (
    !object(v) ||
    !keys(v, ['version', 'seed', 'satchels', 'drops', 'receipts', 'wounds']) ||
    v.version !== 1 ||
    !integer(v.seed, -0xffffffff, 0x4ffffffff) ||
    !Array.isArray(v.satchels) ||
    v.satchels.length > FIELD_RULES.maxSatchels ||
    !v.satchels.every(validSatchel) ||
    !Array.isArray(v.drops) ||
    v.drops.length > FIELD_RULES.maxDrops ||
    !v.drops.every(validDrop) ||
    !Array.isArray(v.receipts) ||
    v.receipts.length + v.drops.length > FIELD_RULES.maxReceipts ||
    !Array.isArray(v.wounds) ||
    v.wounds.length > FIELD_RULES.maxWounds
  )
    return false;
  if (
    !v.receipts.every(
      (r) =>
        object(r) &&
        keys(r, ['id', 'actorId', 'kind']) &&
        id(r.id) &&
        id(r.actorId) &&
        ['death', 'claim', 'transaction', 'gather'].includes(r.kind as string),
    )
  )
    return false;
  if (
    !v.wounds.every(
      (w) =>
        object(w) &&
        keys(w, ['actorId', 'kind', 'hp', 'contributors']) &&
        id(w.actorId) &&
        faunaKind(w.kind) &&
        number(w.hp, 1, WILDLIFE_HEALTH[w.kind]) &&
        ids(w.contributors) &&
        w.contributors.length > 0,
    )
  )
    return false;
  for (const [rows, key] of [
    [v.satchels, 'actorId'],
    [v.drops, 'id'],
    [v.receipts, 'id'],
    [v.wounds, 'actorId'],
  ] as const)
    if (new Set(rows.map((row) => row[key])).size !== rows.length) return false;
  const receipts = new Map((v.receipts as FieldReceipt[]).map((r) => [r.id, r]));
  return (
    (v.receipts as FieldReceipt[]).every((r) => {
      if (r.kind === 'death') return r.id === `death:${r.actorId}`;
      if (r.kind === 'claim')
        return (
          r.id.startsWith('claim:drop:') &&
          receipts.get(`death:${r.id.slice(11)}`)?.kind === 'death'
        );
      return r.id.startsWith(`${r.kind}:`) && r.id.length > r.kind.length + 1;
    }) &&
    (v.drops as FieldDrop[]).every(
      (d) =>
        receipts.get(`death:${d.sourceId}`)?.kind === 'death' &&
        d.id === `drop:${d.sourceId}` &&
        !receipts.has(`claim:${d.id}`),
    ) &&
    (v.wounds as WildlifeWound[]).every((w) => !receipts.has(`death:${w.actorId}`))
  );
}

/** Negotiated client frames expose only the recipient's satchel and nearby ground records. */
export function validFieldEconomyFrame(v: unknown): v is FieldEconomyFrame {
  return (
    object(v) &&
    keys(v, ['version', 'satchel', 'drops', 'saturated']) &&
    v.version === 1 &&
    validSatchel(v.satchel) &&
    typeof v.saturated === 'boolean' &&
    Array.isArray(v.drops) &&
    v.drops.length <= FIELD_RULES.visibleDrops &&
    v.drops.every(validDrop) &&
    new Set(v.drops.map((d) => d.id)).size === v.drops.length
  );
}

/** Stable IDs address the table; hit order, peer order and reconnection never reroll it. */
export function rollFieldLoot(
  seed: number,
  death: FieldDeath,
): Pick<FieldDrop, 'name' | 'rarity' | 'bundle'> {
  const rng = random(
    deriveSeed(
      seed,
      'field-loot-v1',
      death.actorId,
      death.kind,
      death.role ?? '',
      death.biome ?? '',
      death.night ? 'night' : 'day',
    ),
  );
  const tier = Math.max(1, Math.min(8, Math.floor(death.difficulty))),
    roll = rng(),
    rarity: FieldRarity =
      roll < 0.012 + tier * 0.002
        ? 'exceptional'
        : roll < 0.06 + tier * 0.008
          ? 'rare'
          : roll < 0.25 + tier * 0.014
            ? 'uncommon'
            : 'common';
  const items: FieldStacks = {};
  let coins = 0;
  if (death.kind === 'enemy') {
    coins = 3 + tier * 2 + Math.floor(rng() * (4 + tier));
    const role = death.role ?? '';
    if (/warden|boss|sentinel/.test(role)) {
      items.crystal = 1 + Math.floor(tier / 3);
      items.scrap = 2;
    } else if (/scholar|mage|priest|oracle/.test(role)) {
      items.knowledge = 1;
      items.resin = 1;
    } else if (/hunter|scout|bow/.test(role)) {
      items.fiber = 2;
      items.feather = 2;
    } else if (/guard|soldier|marauder/.test(role)) {
      items.scrap = 1 + Math.floor(tier / 2);
    } else {
      items.fiber = 1 + Math.floor(rng() * 2);
      items.scrap = 1;
    }
    if (rarity === 'rare' || rarity === 'exceptional')
      items.relic = rarity === 'exceptional' ? 2 : 1;
    else if (rarity === 'uncommon') items.resin = 1;
  } else {
    // Animals carry no coins or forged equipment. Protected status never increases yield.
    if (death.kind === 'bird') {
      items.feather = 2 + Math.floor(rng() * 3);
      items.meat = 1;
    }
    if (death.kind === 'grazer') {
      items.meat = 3 + Math.floor(rng() * 2);
      items.hide = 2;
      items.bone = 1;
    }
    if (death.kind === 'boar') {
      items.meat = 4 + Math.floor(rng() * 2);
      items.hide = 1;
      items.bone = 2;
    }
    if (death.kind === 'wolf') {
      items.hide = 2;
      items.bone = 1;
      items.fang = 1;
    }
    if (rarity === 'rare' || rarity === 'exceptional') items.bone = (items.bone ?? 0) + 1;
  }
  return {
    name:
      death.kind === 'enemy'
        ? 'Recovered belongings'
        : `${death.kind[0].toUpperCase()}${death.kind.slice(1)} carcass`,
    rarity,
    bundle: { coins, items },
  };
}
const fail = (message: string): FieldOutcome => ({ ok: false, message });
const peerValid = (peer: FieldPeer) => address(peer) && id(peer.id);
const nearby = (a: ActorAddress, b: ActorAddress, radius: number) =>
  a.spaceId === b.spaceId && Math.hypot(a.x - b.x, a.y - b.y) <= radius;
function validDeath(death: FieldDeath): boolean {
  return (
    address(death) &&
    id(death.actorId) &&
    death.actorId.length <= 220 &&
    (death.kind === 'enemy' || faunaKind(death.kind)) &&
    number(death.difficulty, 1, 100) &&
    ids(death.contributors) &&
    death.contributors.length > 0 &&
    number(death.time) &&
    (death.role === undefined || id(death.role)) &&
    (death.biome === undefined || id(death.biome)) &&
    (death.factionId === undefined || id(death.factionId))
  );
}

export class FieldEconomy {
  readonly seed: number;
  private satchels = new Map<string, FieldSatchel>();
  private drops = new Map<string, FieldDrop>();
  private receipts = new Map<string, FieldReceipt>();
  private wounds = new Map<string, WildlifeWound>();
  constructor(seed: number, save?: unknown) {
    if (!integer(seed, -0xffffffff, 0x4ffffffff)) throw Error('Invalid field economy seed.');
    this.seed = seed;
    if (save !== undefined) {
      if (!validFieldEconomySave(save) || save.seed !== seed)
        throw Error('Invalid field economy save.');
      this.satchels = new Map(clone(save.satchels).map((s) => [s.actorId, s]));
      this.drops = new Map(clone(save.drops).map((d) => [d.id, d]));
      this.receipts = new Map(save.receipts.map((r) => [r.id, { ...r }]));
      this.wounds = new Map(clone(save.wounds).map((w) => [w.actorId, w]));
    }
  }
  get saturated(): boolean {
    return (
      this.receipts.size + this.drops.size >= FIELD_RULES.maxReceipts ||
      this.drops.size >= FIELD_RULES.maxDrops
    );
  }
  get diagnostics() {
    return {
      satchels: this.satchels.size,
      drops: this.drops.size,
      receipts: this.receipts.size,
      wounds: this.wounds.size,
      saturated: this.saturated,
    };
  }
  save(): FieldEconomySave {
    // Receipts are flat immutable facts. Avoid structured-cloning thousands of flat
    // entries through the generic serializer on every operator checkpoint.
    return {
      version: 1,
      seed: this.seed,
      satchels: clone([...this.satchels.values()]),
      drops: clone([...this.drops.values()]),
      receipts: [...this.receipts.values()].map((r) => ({ ...r })),
      wounds: clone([...this.wounds.values()]),
    };
  }
  /** One settled-life kit per authenticated persistent identity, never per reconnect. */
  ensure(actorId: string): FieldSatchel | undefined {
    if (!id(actorId)) return undefined;
    const existing = this.satchels.get(actorId);
    if (existing) return clone(existing);
    if (this.satchels.size >= FIELD_RULES.maxSatchels) return undefined;
    const satchel: FieldSatchel = {
      actorId,
      coins: 24,
      items: { 'field-knife': 1, wood: 4, stone: 4, fiber: 3 },
      capacity: FIELD_RULES.bagSlots,
      lastHuntAt: -1,
      lastGatherAt: -1,
    };
    this.satchels.set(actorId, satchel);
    return clone(satchel);
  }
  satchel(actorId: string): FieldSatchel | undefined {
    const s = this.satchels.get(actorId);
    return s ? clone(s) : undefined;
  }
  drop(dropId: string): FieldDrop | undefined {
    const drop = this.drops.get(dropId);
    return drop ? clone(drop) : undefined;
  }
  wound(actorId: string): WildlifeWound | undefined {
    const wound = this.wounds.get(actorId);
    return wound ? clone(wound) : undefined;
  }
  hasItem(actorId: string, itemId: FieldItem): boolean {
    return (this.satchels.get(actorId)?.items[itemId] ?? 0) > 0;
  }
  /** Call on room-authoritative elapsed seconds; expiry removes visuals, never death receipts. */
  tick(time: number): void {
    if (!number(time)) return;
    for (const [id, drop] of this.drops) if (time >= drop.expiresAt) this.drops.delete(id);
  }
  frame(
    peer: FieldPeer,
    time: number,
    range = FIELD_RULES.viewDistance,
  ): FieldEconomyFrame | undefined {
    if (!peerValid(peer) || !number(time)) return undefined;
    const satchel = this.ensure(peer.id);
    if (!satchel) return undefined;
    const radius = Number.isFinite(range)
      ? Math.max(0, Math.min(FIELD_RULES.viewDistance, range))
      : 0;
    const drops = [...this.drops.values()]
      .filter((d) => time < d.expiresAt && nearby(peer, d, radius))
      .sort(
        (a, b) =>
          Math.hypot(a.x - peer.x, a.y - peer.y) - Math.hypot(b.x - peer.x, b.y - peer.y) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, FIELD_RULES.visibleDrops);
    return { version: 1, satchel, drops: clone(drops), saturated: this.saturated };
  }
  /** Room calls before fatal damage when possible; full ledgers never evict old claims. */
  canAdmitDeath(actorId: string, time: number): boolean {
    if (!id(actorId) || !number(time)) return false;
    this.tick(time);
    return (
      !this.receipts.has(`death:${actorId}`) &&
      this.drops.size < FIELD_RULES.maxDrops &&
      this.receipts.size + this.drops.size + 2 <= FIELD_RULES.maxReceipts
    );
  }
  spawnDeath(death: FieldDeath): FieldOutcome {
    if (!validDeath(death)) return fail('Invalid authoritative death.');
    if (this.receipts.has(`death:${death.actorId}`))
      return fail('This death has already been recorded.');
    if (!this.canAdmitDeath(death.actorId, death.time))
      return fail('The field ledger is full. Recover existing drops before creating another.');
    const drop: FieldDrop = {
      id: `drop:${death.actorId}`,
      sourceId: death.actorId,
      spaceId: death.spaceId,
      x: death.x,
      y: death.y,
      kind: death.kind,
      ...rollFieldLoot(this.seed, death),
      eligible: [...death.contributors].sort(),
      createdAt: death.time,
      exclusiveUntil: death.time + FIELD_RULES.ownershipSeconds,
      expiresAt: death.time + FIELD_RULES.expirySeconds,
      protected: death.protected ?? false,
      ...(death.factionId ? { factionId: death.factionId } : {}),
      harvest: death.kind !== 'enemy',
    };
    this.receipts.set(`death:${death.actorId}`, {
      id: `death:${death.actorId}`,
      actorId: death.actorId,
      kind: 'death',
    });
    this.drops.set(drop.id, drop);
    this.wounds.delete(death.actorId);
    return {
      ok: true,
      message: drop.harvest
        ? 'Game is down. Dress the carcass with a field knife.'
        : 'Recovered belongings remain where the enemy fell.',
      drop: clone(drop),
    };
  }
  claim(peer: FieldPeer, dropId: string, time: number): FieldOutcome {
    if (!peerValid(peer) || !id(dropId) || !number(time)) return fail('Invalid recovery request.');
    const drop = this.drops.get(dropId),
      satchel = this.satchels.get(peer.id);
    if (!drop || time >= drop.expiresAt) return fail('Those belongings are no longer here.');
    if (!satchel || !nearby(peer, drop, FIELD_RULES.claimDistance))
      return fail('Move within reach of the belongings.');
    const eligible = drop.eligible.includes(peer.id);
    if (!eligible && time < drop.exclusiveUntil)
      return fail('The contributing party has the first claim.');
    if (drop.harvest && !this.hasItem(peer.id, 'field-knife'))
      return fail('A field knife is required to dress this carcass.');
    if (this.receipts.size >= FIELD_RULES.maxReceipts)
      return fail('The field ledger cannot accept another claim.');
    const next = this.balanceAfter(satchel, { coins: 0, items: {} }, drop.bundle);
    if (!next) return fail('Your field satchel is full. Nothing was taken; make room and return.');
    // All-or-nothing synchronous commit: no yield between credit, tombstone and ground removal.
    this.satchels.set(peer.id, next);
    this.receipts.set(`claim:${drop.id}`, {
      id: `claim:${drop.id}`,
      actorId: peer.id,
      kind: 'claim',
    });
    this.drops.delete(drop.id);
    return {
      ok: true,
      message: drop.harvest
        ? 'Carcass dressed; useful materials recovered.'
        : 'Belongings recovered.',
      reward: clone(drop.bundle),
      scavenged: !eligible,
      ...(drop.harvest && drop.protected ? { consequence: 'protected-harvest' as const } : {}),
    };
  }
  /** Internal authority transaction API. Never pass a wire-supplied cost or reward here. */
  /** Authority-only loss for explicit expedition recall. No credit, reward or receipt capacity is admitted.
   * Caller must commit this in the same synchronous snapshot transaction as its durable recall sequence. */
  forfeitCoins(actorId: string, amount: number): FieldOutcome {
    if (!id(actorId) || !integer(amount, 0, FIELD_RULES.maxCoins))
      return fail('Invalid coin forfeiture.');
    const satchel = this.satchels.get(actorId);
    if (!satchel || amount > satchel.coins)
      return fail('The loss exceeds this life’s authoritative coins.');
    satchel.coins -= amount;
    return {
      ok: true,
      message: amount
        ? `${amount} field coins were lost during recall.`
        : 'No field coins remained to lose.',
    };
  }
  transact(actorId: string, cost: FieldBundle, reward: FieldBundle, eventId: string): FieldOutcome {
    if (
      !id(actorId) ||
      !id(eventId) ||
      eventId.length > 210 ||
      !validFieldBundle(cost) ||
      !validFieldBundle(reward)
    )
      return fail('Invalid field transaction.');
    const receiptId = `transaction:${eventId}`;
    if (this.receipts.has(receiptId)) return fail('This transaction has already been applied.');
    if (this.receipts.size + this.drops.size >= FIELD_RULES.maxReceipts)
      return fail('The field ledger cannot accept another transaction.');
    const satchel = this.satchels.get(actorId);
    if (!satchel) return fail('No authoritative field satchel exists for this life.');
    const next = this.balanceAfter(satchel, cost, reward);
    if (!next) return fail('Required funds/materials are missing, or the field satchel is full.');
    this.satchels.set(actorId, next);
    this.receipts.set(receiptId, { id: receiptId, actorId, kind: 'transaction' });
    return { ok: true, message: 'Field transaction completed.', reward: clone(reward) };
  }
  craft(
    peer: FieldPeer,
    recipeId: string,
    station: { kind: FieldRecipe['station']; spaceId: string; x: number; y: number },
    eventId: string,
  ): FieldOutcome {
    const recipe = FIELD_RECIPES.find((r) => r.id === recipeId);
    if (!peerValid(peer) || !address(station) || !recipe || !nearby(peer, station, 3))
      return fail('Move to a suitable work surface.');
    if (recipe.station !== 'field' && station.kind !== recipe.station)
      return fail(`This recipe needs a ${recipe.station}.`);
    const outcome = this.transact(peer.id, recipe.cost, recipe.reward, eventId);
    return outcome.ok ? { ...outcome, message: `${recipe.name} completed.` } : outcome;
  }
  sell(
    peer: FieldPeer,
    itemId: FieldItem,
    quantity: number,
    market: ActorAddress & { buyMultiplier?: number },
    eventId: string,
  ): FieldOutcome {
    if (
      !peerValid(peer) ||
      !address(market) ||
      !nearby(peer, market, 3) ||
      !item(itemId) ||
      !integer(quantity, 1, 99)
    )
      return fail('Move to an open market to trade field goods.');
    const multiplier = market.buyMultiplier ?? 1;
    if (!number(multiplier, 0.25, 2)) return fail('Invalid authoritative market price.');
    const value = FIELD_ITEMS[itemId].value;
    if (value <= 0) return fail('Personal field tools cannot be sold for starter-kit profit.');
    return this.transact(
      peer.id,
      { coins: 0, items: { [itemId]: quantity } },
      { coins: Math.max(1, Math.floor(value * quantity * multiplier)), items: {} },
      eventId,
    );
  }
  /** Root resolves actual prop identity/location and marks that prop removed after success. */
  gather(
    peer: FieldPeer,
    resource: ActorAddress & {
      id: string;
      kind: 'wood' | 'stone' | 'ore' | 'fiber' | 'resin';
      protected?: boolean;
    },
    time: number,
  ): FieldOutcome {
    if (
      !peerValid(peer) ||
      !address(resource) ||
      !id(resource.id) ||
      resource.id.length > 210 ||
      !number(time) ||
      !['wood', 'stone', 'ore', 'fiber', 'resin'].includes(resource.kind) ||
      !nearby(peer, resource, 2.5)
    )
      return fail('Move within reach of a harvestable resource.');
    const receiptId = `gather:${resource.id}`,
      satchel = this.satchels.get(peer.id);
    if (!satchel) return fail('No authoritative field satchel exists for this life.');
    if (this.receipts.has(receiptId)) return fail('This resource has already been gathered.');
    if (time - satchel.lastGatherAt < FIELD_RULES.gatherCooldown)
      return fail('Finish the current gathering stroke.');
    const tool =
      resource.kind === 'wood' || resource.kind === 'resin'
        ? 'hatchet'
        : resource.kind === 'stone' || resource.kind === 'ore'
          ? 'pickaxe'
          : undefined;
    if (tool && !this.hasItem(peer.id, tool))
      return fail(`An owned ${FIELD_ITEMS[tool].name.toLowerCase()} is required.`);
    if (this.receipts.size + this.drops.size >= FIELD_RULES.maxReceipts)
      return fail('The field ledger cannot accept another resource.');
    const quantity =
      2 + (deriveSeed(this.seed, 'field-resource-v1', resource.id, resource.kind) % 3);
    const reward = { coins: 0, items: { [resource.kind]: quantity } };
    const next = this.balanceAfter(satchel, { coins: 0, items: {} }, reward);
    if (!next) return fail('Your field satchel is full. The resource remains untouched.');
    next.lastGatherAt = time;
    this.satchels.set(peer.id, next);
    this.receipts.set(receiptId, { id: receiptId, actorId: peer.id, kind: 'gather' });
    return {
      ok: true,
      message: `${quantity} ${FIELD_ITEMS[resource.kind].name.toLowerCase()} gathered.`,
      reward,
      consequence: 'gather',
    };
  }
  /** A real fauna frame is supplied by the authority, not a client-authored target. */
  hunt(
    peer: FieldPeer,
    animal: FaunaActor & { spaceId?: string },
    time: number,
    context: {
      protected?: boolean;
      factionId?: string;
      biome?: string;
      night?: boolean;
      clearLine?: boolean;
    } = {},
  ): FieldHuntOutcome {
    if (!peerValid(peer) || !id(animal?.id) || !faunaKind(animal?.kind) || !number(time))
      return fail('Invalid wildlife target.');
    const target = { spaceId: animal.spaceId ?? 'surface', x: animal.x, y: animal.y };
    const satchel = this.satchels.get(peer.id),
      spear = this.hasItem(peer.id, 'spear');
    if (
      !address(target) ||
      !nearby(peer, target, spear ? FIELD_RULES.spearRange : FIELD_RULES.knifeRange) ||
      context.clearLine !== true
    )
      return fail('There is no clear strike within your tool’s reach.');
    if (!satchel || (!spear && !this.hasItem(peer.id, 'field-knife')))
      return fail('Equip an owned field knife or hunting spear.');
    if (time - satchel.lastHuntAt < FIELD_RULES.huntCooldown)
      return fail('Recover before the next hunting strike.');
    if (this.receipts.has(`death:${animal.id}`)) return fail('This animal has already died.');
    let wound = this.wounds.get(animal.id);
    if (wound && wound.kind !== animal.kind)
      return fail('Wildlife identity does not match its persistent record.');
    if (!wound && this.wounds.size >= FIELD_RULES.maxWounds)
      return fail('The wildlife ledger cannot track another injury.');
    wound ??= {
      actorId: animal.id,
      kind: animal.kind,
      hp: WILDLIFE_HEALTH[animal.kind],
      contributors: [],
    };
    if (!wound.contributors.includes(peer.id) && wound.contributors.length >= 32)
      return fail('This encounter already has its maximum contributing party.');
    const damage = spear ? 18 : 8,
      health = Math.max(0, wound.hp - damage);
    if (health <= 0 && !this.canAdmitDeath(animal.id, time))
      return fail('Recover existing drops before finishing another hunt.');
    const contributors = [...new Set([...wound.contributors, peer.id])].sort();
    if (health <= 0) {
      const outcome = this.spawnDeath({
        ...target,
        actorId: animal.id,
        kind: animal.kind,
        difficulty: animal.dangerous ? 2 : 1,
        contributors,
        time,
        biome: context.biome,
        night: context.night,
        protected: context.protected,
        factionId: context.factionId,
      });
      if (!outcome.ok) return outcome;
      satchel.lastHuntAt = time;
      return {
        ...outcome,
        health,
        damage,
        killed: true,
        reaction: animal.dangerous ? 'defend' : 'flee',
        consequence: context.protected ? 'protected-hunt' : 'hunt',
      };
    }
    satchel.lastHuntAt = time;
    this.wounds.set(animal.id, { ...wound, hp: health, contributors });
    return {
      ok: true,
      message: animal.dangerous
        ? 'The wounded animal turns to defend itself.'
        : 'The wounded animal tries to flee.',
      health,
      damage,
      killed: false,
      reaction: animal.dangerous ? 'defend' : 'flee',
    };
  }
  private balanceAfter(
    satchel: FieldSatchel,
    cost: FieldBundle,
    reward: FieldBundle,
  ): FieldSatchel | undefined {
    if (satchel.coins < cost.coins) return undefined;
    const items = { ...satchel.items };
    for (const [key, quantity] of Object.entries(cost.items) as [FieldItem, number][]) {
      if ((items[key] ?? 0) < quantity) return undefined;
      const remainder = items[key]! - quantity;
      if (remainder) items[key] = remainder;
      else delete items[key];
    }
    for (const [key, quantity] of Object.entries(reward.items) as [FieldItem, number][]) {
      items[key] = (items[key] ?? 0) + quantity;
      if (items[key]! > FIELD_RULES.stackSize * FIELD_RULES.maxSlots) return undefined;
    }
    const coins = satchel.coins - cost.coins + reward.coins;
    if (
      !Number.isSafeInteger(coins) ||
      coins > FIELD_RULES.maxCoins ||
      fieldSlots(items) > satchel.capacity
    )
      return undefined;
    return { ...satchel, coins, items };
  }
}
