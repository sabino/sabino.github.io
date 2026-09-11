import type { Appearance, ItemId, Point } from './types.ts';
import { deriveSeed } from '../procedural/random.ts';
import { plantProfile } from './botany.ts';

export type Profession = 'botany' | 'crafting' | 'combat';
export type UpgradeWeapon = 'staff' | 'sword' | 'bow';
export type GardenPlant = 'cequin' | 'heartleaf' | 'emberroot';
export type FurnitureSlot = 'rest' | 'hearth' | 'work' | 'garden';
export interface ProgressionCost {
  coins: number;
  items: Partial<Record<ItemId, number>>;
}
export interface ProgressionWallet {
  coins: number;
  inventory: Partial<Record<ItemId, number>>;
}
export interface HomeAddress extends Point {
  id: string;
  buildingId: string;
  settlementId: string;
  name: string;
}
export interface GardenCrop {
  plant: GardenPlant;
  seed: number;
  plantedAt: number;
  readyAt: number;
  yield: number;
}
export interface HomeState extends HomeAddress {
  purchasedAt: number;
  furniture: Partial<Record<FurnitureSlot, string>>;
  plots: (GardenCrop | null)[];
}
export interface ProgressionState {
  version: 1;
  seed: number;
  xp: Record<Profession, number>;
  upgrades: Record<string, Partial<Record<UpgradeWeapon, number>>>;
  homes: HomeState[];
  ownedStyles: string[];
  equippedStyles: Record<string, string>;
}
export interface ProgressionContext {
  bodyId: string;
  position: Point;
  time: number;
  capacity: number;
  nearWorkbench: boolean;
  ownedWeapons: readonly UpgradeWeapon[];
  /** Supplied by the verified account service; never hydrated from a local game save. */
  verifiedEntitlements?: readonly string[];
}
export type ProgressionAction =
  | { kind: 'upgrade'; weapon: UpgradeWeapon }
  | { kind: 'buy-home'; address: HomeAddress }
  | { kind: 'furnish'; homeId: string; furnitureId: string }
  | { kind: 'plant'; homeId: string; plot: number; plant: GardenPlant }
  | { kind: 'harvest'; homeId: string; plot: number }
  | { kind: 'buy-style'; styleId: string }
  | { kind: 'equip-style'; styleId: string | null };
export interface ProgressionResult {
  ok: boolean;
  message: string;
  cost?: ProgressionCost;
  gained?: Partial<Record<ItemId, number>>;
}
export interface FurnitureDefinition {
  id: string;
  name: string;
  slot: FurnitureSlot;
  description: string;
  cost: ProgressionCost;
  level: number;
  health?: number;
  warmth?: number;
  craftExtra?: number;
  growth?: number;
  harvestExtra?: number;
}
export const FURNITURE: readonly FurnitureDefinition[] = [
  {
    id: 'woven-cot',
    name: 'Woven cot',
    slot: 'rest',
    description: 'Rest here restores 8 additional health.',
    cost: { coins: 18, items: { wood: 3, heartleaf: 1 } },
    level: 1,
    health: 8,
  },
  {
    id: 'clinic-bed',
    name: 'Botanical clinic bed',
    slot: 'rest',
    description: 'Rest here restores 18 additional health.',
    cost: { coins: 32, items: { wood: 5, bandage: 2 } },
    level: 3,
    health: 18,
  },
  {
    id: 'iron-stove',
    name: 'Iron stove',
    slot: 'hearth',
    description: 'Rest here restores 15 additional warmth.',
    cost: { coins: 20, items: { ore: 2, wood: 2 } },
    level: 1,
    warmth: 15,
  },
  {
    id: 'tile-hearth',
    name: 'Glazed tile hearth',
    slot: 'hearth',
    description: 'Rest here restores 30 additional warmth.',
    cost: { coins: 36, items: { ore: 4, wood: 3 } },
    level: 3,
    warmth: 30,
  },
  {
    id: 'field-bench',
    name: 'Field workbench',
    slot: 'work',
    description: 'Craft workbench recipes in this home.',
    cost: { coins: 20, items: { wood: 4, ore: 1 } },
    level: 1,
  },
  {
    id: 'precision-bench',
    name: 'Precision workbench',
    slot: 'work',
    description: 'Workbench recipes; one extra prepared medicine per craft here.',
    cost: { coins: 42, items: { wood: 5, ore: 3, lens: 1 } },
    level: 3,
    craftExtra: 1,
  },
  {
    id: 'raised-beds',
    name: 'Raised garden beds',
    slot: 'garden',
    description: 'Expand this garden from two growing plots to four.',
    cost: { coins: 16, items: { wood: 4 } },
    level: 1,
    growth: 1,
  },
  {
    id: 'glass-planters',
    name: 'Sheltered glass planters',
    slot: 'garden',
    description: 'Four plots grow 25% faster and yield one extra portion.',
    cost: { coins: 38, items: { wood: 4, ore: 3 } },
    level: 3,
    growth: 0.75,
    harvestExtra: 1,
  },
];
export type CosmeticDefinition = {
  id: string;
  name: string;
  description: string;
  coat: string;
  trim: string;
  trousers: string;
  hat: number;
  cloak: boolean;
} & ({ currency: 'coins'; price: number } | { currency: 'premium'; price: null });
/** Paid IDs are stable server product identifiers. No client purchase grants them. */
export const COSMETICS: readonly CosmeticDefinition[] = [
  {
    id: 'field-botanist',
    name: 'Field Botanist',
    currency: 'coins',
    price: 24,
    description: 'Sage cloth and pale linen for a life among leaves.',
    coat: '#547c68',
    trim: '#c7c09a',
    trousers: '#405b55',
    hat: 0,
    cloak: false,
  },
  {
    id: 'copper-wanderer',
    name: 'Copper Wanderer',
    currency: 'coins',
    price: 28,
    description: 'Rust wool, brass edging and a travel hood.',
    coat: '#996845',
    trim: '#ddbb74',
    trousers: '#565650',
    hat: 1,
    cloak: true,
  },
  {
    id: 'frost-warden',
    name: 'Frost Warden',
    currency: 'coins',
    price: 36,
    description: 'A blue coat and pale steel cap. Appearance only.',
    coat: '#476680',
    trim: '#b0d3dc',
    trousers: '#3f5365',
    hat: 4,
    cloak: false,
  },
  {
    id: 'violet-archivist',
    name: 'Violet Archivist',
    currency: 'coins',
    price: 40,
    description: 'Violet cloth, an old gold collar and a scholar’s cap.',
    coat: '#685979',
    trim: '#ccbd91',
    trousers: '#4e4c62',
    hat: 2,
    cloak: true,
  },
  {
    id: 'ember-artisan',
    name: 'Ember Artisan',
    currency: 'coins',
    price: 44,
    description: 'Warm clay colors and an unencumbered workshop coat.',
    coat: '#875344',
    trim: '#d39e63',
    trousers: '#564845',
    hat: 0,
    cloak: false,
  },
  {
    id: 'moss-pilgrim',
    name: 'Moss Pilgrim',
    currency: 'coins',
    price: 48,
    description: 'An olive mantle with a pale botanical hem.',
    coat: '#72774e',
    trim: '#afc59d',
    trousers: '#505946',
    hat: 3,
    cloak: true,
  },
  {
    id: 'aurora-mantle',
    name: 'Aurora Mantle',
    currency: 'premium',
    price: null,
    description: 'Teal and violet cloth under a silver hood. Cosmetic only.',
    coat: '#397f83',
    trim: '#c1a1dc',
    trousers: '#4b536e',
    hat: 1,
    cloak: true,
  },
  {
    id: 'promethean-gold',
    name: 'Promethean Gold',
    currency: 'premium',
    price: null,
    description: 'Deep ember cloth with gold trim and a ceremonial cap. Cosmetic only.',
    coat: '#745148',
    trim: '#e1bd65',
    trousers: '#48434b',
    hat: 2,
    cloak: true,
  },
  {
    id: 'sallas-silver',
    name: 'Sallas Silver',
    currency: 'premium',
    price: null,
    description: 'Midnight blue and pale silver over a quiet traveling mantle. Cosmetic only.',
    coat: '#4b5876',
    trim: '#d4dfdf',
    trousers: '#394a5a',
    hat: 3,
    cloak: true,
  },
];
export const GARDEN_PLANTS: Readonly<Record<GardenPlant, { name: string; seconds: number }>> = {
  cequin: { name: 'Cequin', seconds: 60 },
  heartleaf: { name: 'Heartleaf', seconds: 90 },
  emberroot: { name: 'Emberroot', seconds: 120 },
};
const PROFESSIONS: readonly Profession[] = ['botany', 'crafting', 'combat'];
const WEAPONS: readonly UpgradeWeapon[] = ['staff', 'sword', 'bow'];
const ITEMS: readonly ItemId[] = [
  'cequin',
  'heartleaf',
  'emberroot',
  'wood',
  'ore',
  'salve',
  'tonic',
  'rations',
  'bandage',
  'seal',
  'lens',
];
const THRESHOLDS = [0, 40, 110, 220, 380, 600, 900, 1300] as const;
const MAX_HOMES = 3;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const object = (n: unknown): n is Record<string, unknown> =>
  !!n && typeof n === 'object' && !Array.isArray(n);
const id = (s: unknown): s is string =>
  typeof s === 'string' &&
  s.length > 0 &&
  s.length <= 160 &&
  !['__proto__', 'prototype', 'constructor'].includes(s);
const num = (n: unknown, max: number, fallback = 0) =>
  finite(n) ? clamp(Math.floor(n), 0, max) : fallback;
const record = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

export function createProgression(seed: number): ProgressionState {
  return {
    version: 1,
    seed: seed >>> 0,
    xp: { botany: 0, crafting: 0, combat: 0 },
    upgrades: record(),
    homes: [],
    ownedStyles: [],
    equippedStyles: record(),
  };
}
export function professionProfile(state: ProgressionState, profession: Profession) {
  const xp = num(state.xp[profession], 1000000);
  let level = 1;
  while (level < THRESHOLDS.length && xp >= THRESHOLDS[level]) level++;
  const nextAt = THRESHOLDS[level] ?? null;
  const floor = THRESHOLDS[level - 1];
  return {
    profession,
    level,
    xp,
    nextAt,
    progress: nextAt === null ? 1 : (xp - floor) / (nextAt - floor),
    title: ['Novice', 'Learner', 'Practiced', 'Skilled', 'Adept', 'Expert', 'Master', 'Virtuoso'][
      level - 1
    ],
  };
}
export function grantPractice(state: ProgressionState, profession: Profession, amount: number) {
  if (!PROFESSIONS.includes(profession) || !finite(amount) || amount <= 0) return 0;
  const before = professionProfile(state, profession).level;
  state.xp[profession] = Math.min(
    1000000,
    state.xp[profession] + Math.min(1000, Math.floor(amount)),
  );
  return professionProfile(state, profession).level - before;
}
export function skillBonuses(state: ProgressionState) {
  const botany = professionProfile(state, 'botany').level,
    crafting = professionProfile(state, 'crafting').level,
    combat = professionProfile(state, 'combat').level;
  return {
    harvestExtra: Math.floor((botany - 1) / 3),
    medicineBonus: (botany - 1) * 2,
    craftExtra: crafting >= 4 ? 1 : 0,
    damageBonus: Math.floor((combat - 1) / 2),
    cooldownMultiplier: 1 - (combat - 1) * 0.02,
  };
}
export function upgradeBonuses(state: ProgressionState, bodyId: string, weapon: UpgradeWeapon) {
  const rank = num(state.upgrades[bodyId]?.[weapon], 3);
  return {
    rank,
    damageBonus: rank * 2,
    rangeBonus: rank * 0.08,
    cooldownMultiplier: 1 - rank * 0.04,
  };
}
export function homeEffects(home: HomeState) {
  const parts = Object.values(home.furniture)
    .map((key) => FURNITURE.find((part) => part.id === key))
    .filter((part): part is FurnitureDefinition => !!part);
  return {
    healthRestBonus: parts.reduce((sum, part) => sum + (part.health ?? 0), 0),
    warmthRestBonus: parts.reduce((sum, part) => sum + (part.warmth ?? 0), 0),
    hasWorkbench: parts.some((part) => part.slot === 'work'),
    craftExtra: parts.reduce((sum, part) => sum + (part.craftExtra ?? 0), 0),
    growthMultiplier: parts.reduce((rate, part) => rate * (part.growth ?? 1), 1),
    harvestExtra: parts.reduce((sum, part) => sum + (part.harvestExtra ?? 0), 0),
  };
}
export function gardenStatus(home: HomeState, time: number) {
  return home.plots.map((crop, plot) => {
    const progress = crop
      ? clamp((time - crop.plantedAt) / Math.max(1, crop.readyAt - crop.plantedAt), 0, 1)
      : 0;
    return {
      plot,
      crop,
      progress,
      stage: !crop ? 'empty' : progress >= 1 ? 'ready' : progress < 0.3 ? 'seedling' : 'growing',
      secondsLeft: crop ? Math.max(0, Math.ceil(crop.readyAt - time)) : 0,
    };
  });
}
export function ownsCosmetic(
  state: ProgressionState,
  styleId: string,
  verifiedEntitlements: readonly string[] = [],
) {
  const style = COSMETICS.find((item) => item.id === styleId);
  return (
    !!style &&
    (style.currency === 'premium'
      ? verifiedEntitlements.includes(styleId)
      : state.ownedStyles.includes(styleId))
  );
}
/** Catalog preview only; gameplay must use applyCosmetic to enforce entitlement checks. */
export function previewCosmetic(base: Appearance, styleId: string): Appearance {
  const style = COSMETICS.find((item) => item.id === styleId);
  if (!style) return { ...base };
  return {
    ...base,
    coat: style.coat,
    trim: style.trim,
    trousers: style.trousers,
    hat: style.hat,
    cloak: style.cloak,
  };
}
/** Cosmetic appearance never changes seed, anatomy, weapon construction or combat values. */
export function applyCosmetic(
  base: Appearance,
  state: ProgressionState,
  bodyId: string,
  verifiedEntitlements: readonly string[] = [],
): Appearance {
  const style = state.equippedStyles[bodyId];
  return style && ownsCosmetic(state, style, verifiedEntitlements)
    ? previewCosmetic(base, style)
    : { ...base };
}

function validAddress(value: unknown): value is HomeAddress {
  if (!object(value)) return false;
  return (
    id(value.id) &&
    id(value.buildingId) &&
    id(value.settlementId) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 120 &&
    finite(value.x) &&
    finite(value.y) &&
    Math.abs(value.x) <= 1e9 &&
    Math.abs(value.y) <= 1e9
  );
}
export function restoreProgression(raw: unknown, seed: number): ProgressionState {
  const state = createProgression(seed);
  if (!object(raw) || raw.seed !== state.seed || raw.version !== 1) return state;
  if (object(raw.xp))
    for (const profession of PROFESSIONS) state.xp[profession] = num(raw.xp[profession], 1000000);
  if (object(raw.upgrades))
    for (const [body, value] of Object.entries(raw.upgrades).slice(0, 256)) {
      if (!id(body) || !object(value)) continue;
      state.upgrades[body] = {};
      for (const weapon of WEAPONS)
        if (num(value[weapon], 3)) state.upgrades[body][weapon] = num(value[weapon], 3);
    }
  if (Array.isArray(raw.ownedStyles))
    state.ownedStyles = [
      ...new Set(
        raw.ownedStyles.filter(
          (key): key is string =>
            typeof key === 'string' &&
            COSMETICS.some((style) => style.id === key && style.currency === 'coins'),
        ),
      ),
    ];
  if (object(raw.equippedStyles))
    for (const [body, value] of Object.entries(raw.equippedStyles).slice(0, 256)) {
      if (id(body) && typeof value === 'string' && COSMETICS.some((style) => style.id === value))
        state.equippedStyles[body] = value;
    }
  if (Array.isArray(raw.homes))
    for (const candidate of raw.homes) {
      if (state.homes.length >= MAX_HOMES) break;
      if (
        !validAddress(candidate) ||
        state.homes.some(
          (home) => home.id === candidate.id || home.buildingId === candidate.buildingId,
        )
      )
        continue;
      const stored = candidate as HomeAddress & Record<string, unknown>;
      const home: HomeState = {
        id: candidate.id,
        buildingId: candidate.buildingId,
        settlementId: candidate.settlementId,
        name: candidate.name,
        x: candidate.x,
        y: candidate.y,
        purchasedAt: num(stored.purchasedAt, 1e9),
        furniture: {},
        plots: [null, null],
      };
      if (object(stored.furniture))
        for (const key of Object.values(stored.furniture)) {
          const definition = FURNITURE.find((part) => part.id === key);
          if (definition) home.furniture[definition.slot] = definition.id;
        }
      if (home.furniture.garden) home.plots.push(null, null);
      if (Array.isArray(stored.plots))
        for (let plot = 0; plot < home.plots.length; plot++) {
          const crop = stored.plots[plot];
          if (
            !object(crop) ||
            !Object.hasOwn(GARDEN_PLANTS, String(crop.plant)) ||
            !finite(crop.plantedAt) ||
            !finite(crop.readyAt) ||
            crop.plantedAt < 0 ||
            crop.readyAt <= crop.plantedAt ||
            crop.readyAt - crop.plantedAt > 180
          )
            continue;
          home.plots[plot] = {
            plant: crop.plant as GardenPlant,
            seed: num(crop.seed, 0xffffffff),
            plantedAt: clamp(crop.plantedAt, 0, 1e9),
            readyAt: clamp(crop.readyAt, 0, 1e9 + 180),
            yield: clamp(num(crop.yield, 6, 1), 1, 6),
          };
        }
      state.homes.push(home);
    }
  return state;
}

type Plan = ProgressionResult & { commit?: () => void };
const fail = (message: string): Plan => ({ ok: false, message });
const cost = (coins = 0, items: Partial<Record<ItemId, number>> = {}): ProgressionCost => ({
  coins,
  items,
});
const count = (inventory: Partial<Record<ItemId, number>>) =>
  Object.values(inventory).reduce((total, amount) => total + (amount ?? 0), 0);
function planAction(
  state: ProgressionState,
  wallet: ProgressionWallet,
  action: ProgressionAction,
  context: ProgressionContext,
): Plan {
  if (
    !id(context.bodyId) ||
    !finite(context.time) ||
    context.time < 0 ||
    !finite(context.position.x) ||
    !finite(context.position.y) ||
    !finite(context.capacity) ||
    context.capacity < 0 ||
    !finite(wallet.coins) ||
    wallet.coins < 0
  )
    return fail('This action has no valid life or location.');
  if (
    Object.entries(wallet.inventory).some(
      ([item, amount]) =>
        !ITEMS.includes(item as ItemId) ||
        !finite(amount) ||
        amount < 0 ||
        !Number.isInteger(amount),
    )
  )
    return fail('The pack contains invalid supplies.');
  if (action.kind === 'upgrade') {
    if (!WEAPONS.includes(action.weapon) || !context.ownedWeapons.includes(action.weapon))
      return fail('This body must own that weapon first.');
    if (!context.nearWorkbench) return fail('Work at a field or home workbench.');
    const rank = upgradeBonuses(state, context.bodyId, action.weapon).rank;
    if (rank >= 3) return fail('This weapon already has all three improvements.');
    const required = [1, 2, 4][rank];
    if (professionProfile(state, 'crafting').level < required)
      return fail(`Crafting level ${required} is needed for this improvement.`);
    return {
      ok: true,
      message: `Improve this body’s ${action.weapon} to rank ${rank + 1}: +2 damage, +0.08 reach and quicker handling.`,
      cost: cost([8, 16, 28][rank], { ore: 2 + rank * 2, wood: rank + 1 }),
      commit: () => {
        state.upgrades[context.bodyId] ??= {};
        state.upgrades[context.bodyId][action.weapon] = rank + 1;
        grantPractice(state, 'crafting', 12 + rank * 4);
      },
    };
  }
  if (action.kind === 'buy-home') {
    if (!validAddress(action.address))
      return fail('Choose a real home offered in this settlement.');
    if (state.homes.length >= MAX_HOMES) return fail('Theo already keeps three homes.');
    if (
      state.homes.some(
        (home) => home.id === action.address.id || home.buildingId === action.address.buildingId,
      )
    )
      return fail('This home is already yours.');
    if (
      Math.hypot(context.position.x - action.address.x, context.position.y - action.address.y) > 10
    )
      return fail('Visit this home before purchasing it.');
    return {
      ok: true,
      message: `Buy ${action.address.name}, with four furnishing slots and two garden plots.`,
      cost: cost(96 + state.homes.length * 32, { wood: 4, ore: 2 }),
      commit: () =>
        state.homes.push({
          ...action.address,
          purchasedAt: context.time,
          furniture: {},
          plots: [null, null],
        }),
    };
  }
  if (action.kind === 'buy-style' || action.kind === 'equip-style') {
    if (action.kind === 'equip-style' && action.styleId === null)
      return {
        ok: true,
        message: 'Wear this body’s original clothing.',
        cost: cost(),
        commit: () => {
          delete state.equippedStyles[context.bodyId];
        },
      };
    const style = COSMETICS.find((item) => item.id === action.styleId);
    if (!style) return fail('That clothing style is unknown.');
    if (action.kind === 'buy-style') {
      if (style.currency === 'premium')
        return fail('This premium style requires a verified account purchase.');
      if (ownsCosmetic(state, style.id)) return fail('This clothing pattern is already learned.');
      return {
        ok: true,
        message: `Learn ${style.name}. Appearance only; no combat bonuses.`,
        cost: cost(style.price),
        commit: () => {
          state.ownedStyles.push(style.id);
        },
      };
    }
    if (!ownsCosmetic(state, style.id, context.verifiedEntitlements))
      return fail(
        style.currency === 'premium'
          ? 'The account service has not verified this style.'
          : 'Learn this clothing pattern first.',
      );
    return {
      ok: true,
      message: `Wear ${style.name} in this body.`,
      cost: cost(),
      commit: () => {
        state.equippedStyles[context.bodyId] = style.id;
      },
    };
  }
  if (!('homeId' in action)) return fail('That progression action is unknown.');
  const home = state.homes.find((owned) => owned.id === action.homeId);
  if (!home) return fail('Purchase this home first.');
  if (Math.hypot(context.position.x - home.x, context.position.y - home.y) > 10)
    return fail('Return to this home to tend it.');
  if (action.kind === 'furnish') {
    const part = FURNITURE.find((entry) => entry.id === action.furnitureId);
    if (!part) return fail('That furnishing is unknown.');
    if (home.furniture[part.slot] === part.id) return fail('That furnishing is already installed.');
    if (professionProfile(state, 'crafting').level < part.level)
      return fail(`Crafting level ${part.level} is needed for ${part.name.toLowerCase()}.`);
    const previous = FURNITURE.find((entry) => entry.id === home.furniture[part.slot]);
    return {
      ok: true,
      message: `${previous ? `Replace ${previous.name.toLowerCase()} with` : 'Install'} ${part.name.toLowerCase()}. ${part.description}`,
      cost: part.cost,
      commit: () => {
        home.furniture[part.slot] = part.id;
        if (part.slot === 'garden') while (home.plots.length < 4) home.plots.push(null);
        grantPractice(state, 'crafting', 8 + part.level * 2);
      },
    };
  }
  if (!Number.isInteger(action.plot) || action.plot < 0 || action.plot >= home.plots.length)
    return fail('Choose an existing garden plot.');
  const crop = home.plots[action.plot];
  if (action.kind === 'plant') {
    if (!Object.hasOwn(GARDEN_PLANTS, action.plant))
      return fail('That plant cannot grow in these beds.');
    if (crop) return fail('Harvest this plot before replanting.');
    const seed = deriveSeed(state.seed, home.id, action.plot, action.plant, context.time),
      effects = homeEffects(home),
      duration =
        GARDEN_PLANTS[action.plant].seconds *
        effects.growthMultiplier *
        (1 - (professionProfile(state, 'botany').level - 1) * 0.025),
      amount = Math.min(
        6,
        plantProfile(seed, action.plant).yield +
          1 +
          skillBonuses(state).harvestExtra +
          effects.harvestExtra,
      );
    return {
      ok: true,
      message: `Plant ${GARDEN_PLANTS[action.plant].name.toLowerCase()}: ${amount} portions ready after ${Math.ceil(duration)} seconds of lived time.`,
      cost: cost(0, { [action.plant]: 1 }),
      commit: () => {
        home.plots[action.plot] = {
          plant: action.plant,
          seed,
          plantedAt: context.time,
          readyAt: context.time + duration,
          yield: amount,
        };
        grantPractice(state, 'botany', 3);
      },
    };
  }
  if (action.kind === 'harvest') {
    if (!crop) return fail('Plant this empty plot first.');
    if (context.time < crop.readyAt)
      return fail(
        `This crop needs ${Math.ceil(crop.readyAt - context.time)} more seconds of lived time.`,
      );
    return {
      ok: true,
      message: `Gather ${crop.yield} ${GARDEN_PLANTS[crop.plant].name.toLowerCase()} from the garden.`,
      cost: cost(),
      gained: { [crop.plant]: crop.yield },
      commit: () => {
        home.plots[action.plot] = null;
        grantPractice(state, 'botany', 4 + crop.yield);
      },
    };
  }
  return fail('That progression action is unknown.');
}
function checkedPlan(
  state: ProgressionState,
  wallet: ProgressionWallet,
  action: ProgressionAction,
  context: ProgressionContext,
): Plan {
  const plan = planAction(state, wallet, action, context);
  if (!plan.ok) return plan;
  const payment = plan.cost ?? cost();
  if (wallet.coins < payment.coins)
    return {
      ...plan,
      ok: false,
      message: `Needs ${payment.coins} coins; this body carries ${wallet.coins}.`,
      commit: undefined,
    };
  for (const [item, amount] of Object.entries(payment.items))
    if ((wallet.inventory[item as ItemId] ?? 0) < (amount ?? 0))
      return { ...plan, ok: false, message: `Needs ${amount} ${item}.`, commit: undefined };
  if (count(wallet.inventory) - count(payment.items) + count(plan.gained ?? {}) > context.capacity)
    return {
      ...plan,
      ok: false,
      message: 'Make room in this body’s pack first.',
      commit: undefined,
    };
  return plan;
}
export function previewProgression(
  state: ProgressionState,
  wallet: ProgressionWallet,
  action: ProgressionAction,
  context: ProgressionContext,
): ProgressionResult {
  const { commit: _commit, ...result } = checkedPlan(state, wallet, action, context);
  return result;
}
/** All validations precede all mutation; failed purchases and full-pack harvests are atomic. */
export function applyProgression(
  state: ProgressionState,
  wallet: ProgressionWallet,
  action: ProgressionAction,
  context: ProgressionContext,
): ProgressionResult {
  const { commit, ...result } = checkedPlan(state, wallet, action, context);
  if (!result.ok) return result;
  wallet.coins -= result.cost?.coins ?? 0;
  for (const [item, amount] of Object.entries(result.cost?.items ?? {})) {
    const key = item as ItemId;
    wallet.inventory[key] = (wallet.inventory[key] ?? 0) - (amount ?? 0);
    if (!wallet.inventory[key]) delete wallet.inventory[key];
  }
  for (const [item, amount] of Object.entries(result.gained ?? {}))
    wallet.inventory[item as ItemId] = (wallet.inventory[item as ItemId] ?? 0) + (amount ?? 0);
  commit?.();
  return result;
}
