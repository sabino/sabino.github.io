import { deriveSeed } from '../procedural/random.ts';
import { weaponGenome, weaponProfileFromGenome } from './equipment.ts';
import type { WeaponGenome, WeaponKind } from './equipment.ts';
import type { ItemId } from './types.ts';

export type ForgeMaterial = 0 | 1 | 2;
export type ForgeCore = WeaponGenome['effect'];
export type ForgeSpan = 'swift' | 'balanced' | 'long';
export interface ForgeRecipe {
  kind: WeaponKind;
  material: ForgeMaterial;
  core: ForgeCore;
  span: ForgeSpan;
}
export interface ForgeCost {
  items: Partial<Record<ItemId, number>>;
  coins: number;
}
export interface ForgeResult {
  /** Pass this owner seed to the existing weapon renderer/profile generator. */
  seed: number;
  recipe: ForgeRecipe;
  genome: WeaponGenome;
  profile: ReturnType<typeof weaponProfileFromGenome>;
  cost: ForgeCost;
  attempts: number;
}

/** Indices follow the existing equipment generator's material catalogue. */
export const FORGE_MATERIALS = {
  staff: ['frostwood', 'ironbark', 'silver birch'],
  sword: ['blue steel', 'tempered iron', 'Sallas alloy'],
  bow: ['frostwood', 'ironbark', 'silver birch'],
} as const;
export const FORGE_CORES = [
  {
    id: 'stagger',
    name: 'Heartleaf binding',
    item: 'heartleaf',
    description: 'A living fibrous binding; successful hits delay the target’s next attack.',
  },
  {
    id: 'breath',
    name: 'Cequin seed',
    item: 'cequin',
    description: 'A green living seed; successful hits restore two breath.',
  },
  {
    id: 'warmth',
    name: 'Emberroot heart',
    item: 'emberroot',
    description: 'An amber living heart; successful hits restore three warmth.',
  },
] as const;
export const FORGE_SPANS = [
  {
    id: 'swift',
    name: 'Swift',
    min: 37,
    max: 41,
    breadth: 2,
    description: 'Short and narrow: quick recovery, shorter reach.',
  },
  {
    id: 'balanced',
    name: 'Balanced',
    min: 42,
    max: 47,
    breadth: 4,
    description: 'A broader middle frame: more reach and a measured recovery.',
  },
  {
    id: 'long',
    name: 'Long',
    min: 48,
    max: 53,
    breadth: 5,
    description: 'Long and substantial: greatest reach, slowest recovery.',
  },
] as const;
export const FORGE_SEARCH_LIMIT = 4096;
const CACHE_LIMIT = 128;
const resolved = new Map<string, { seed: number; attempts: number }>();

/** Validate at the engine boundary as well as in the preview UI. */
export function validForgeRecipe(value: unknown): value is ForgeRecipe {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const r = value as ForgeRecipe;
  return (
    ['staff', 'sword', 'bow'].includes(r.kind) &&
    [0, 1, 2].includes(r.material) &&
    FORGE_CORES.some((c) => c.id === r.core) &&
    FORGE_SPANS.some((s) => s.id === r.span)
  );
}

/** Finite raw materials represent selecting, shaping and binding the chosen physical parts. */
export function forgeCost(recipe: ForgeRecipe): ForgeCost | null {
  if (!validForgeRecipe(recipe)) return null;
  const frame = {
    staff: { wood: 3, ore: 1, coins: 18 },
    sword: { wood: 1, ore: 4, coins: 24 },
    bow: { wood: 4, ore: 1, coins: 20 },
  }[recipe.kind];
  const material = [
    { wood: 0, ore: 0, coins: 0 },
    { wood: 1, ore: 2, coins: 8 },
    { wood: 0, ore: 3, coins: 12 },
  ][recipe.material];
  const span = FORGE_SPANS.findIndex((s) => s.id === recipe.span);
  const core = FORGE_CORES.find((c) => c.id === recipe.core)!;
  return {
    items: {
      wood: frame.wood + material.wood + span,
      ore: frame.ore + material.ore + span,
      [core.item]: 2,
    },
    coins: frame.coins + material.coins + span * 4,
  };
}

/** Resolve actual generator parts, not a renamed or independently drawn approximation.
 * The bounded search addresses each candidate independently, so call order cannot affect it.
 * Only seeds are cached. Returned records are fresh and safe for a caller to retain.
 */
export function resolveForge(
  ownerSeed: number,
  recipe: ForgeRecipe,
  level = 1,
): ForgeResult | null {
  if (
    !Number.isInteger(ownerSeed) ||
    ownerSeed < -0xffffffff ||
    ownerSeed > 0xffffffff ||
    !Number.isInteger(level) ||
    level < 1 ||
    level > 1000000 ||
    !validForgeRecipe(recipe)
  )
    return null;
  const normalized = ownerSeed >>> 0;
  const key = `${normalized}:${recipe.kind}:${recipe.material}:${recipe.core}:${recipe.span}`;
  const span = FORGE_SPANS.find((s) => s.id === recipe.span)!;
  let match = resolved.get(key);
  if (!match) {
    for (let attempt = 0; attempt < FORGE_SEARCH_LIMIT; attempt++) {
      const seed = deriveSeed(
        normalized,
        'stichos-forge',
        recipe.kind,
        recipe.material,
        recipe.core,
        recipe.span,
        attempt,
      );
      const genome = weaponGenome(seed, recipe.kind);
      if (
        genome.material === FORGE_MATERIALS[recipe.kind][recipe.material] &&
        genome.effect === recipe.core &&
        genome.length >= span.min &&
        genome.length <= span.max &&
        genome.breadth === span.breadth
      ) {
        match = { seed, attempts: attempt + 1 };
        resolved.set(key, match);
        if (resolved.size > CACHE_LIMIT) resolved.delete(resolved.keys().next().value!);
        break;
      }
    }
  } else {
    resolved.delete(key);
    resolved.set(key, match);
  }
  if (!match) return null;
  const genome = weaponGenome(match.seed, recipe.kind);
  return {
    seed: match.seed,
    recipe: { kind: recipe.kind, material: recipe.material, core: recipe.core, span: recipe.span },
    genome,
    profile: weaponProfileFromGenome(genome, level),
    cost: forgeCost(recipe)!,
    attempts: match.attempts,
  };
}
