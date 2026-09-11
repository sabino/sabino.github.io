import type { ItemId, Point, Prop } from './types.ts';

export type ProductionKind = 'garden' | 'sawmill' | 'ore-sorter';
export interface ProductionRecipe {
  id: string;
  kind: ProductionKind;
  name: string;
  seconds: number;
  inputs: Partial<Record<ItemId, number>>;
  output: Partial<Record<ItemId, number>>;
  source?: 'pine' | 'rock';
}
export const PRODUCTION_KINDS: readonly {
  id: ProductionKind;
  name: string;
  description: string;
  coins: number;
  items: Partial<Record<ItemId, number>>;
}[] = [
  {
    id: 'garden',
    name: 'Sheltered propagation beds',
    description:
      'Living cuttings grow in a timber-fed bed. Each batch needs a real cutting and fresh growing medium.',
    coins: 35,
    items: { wood: 5, ore: 1 },
  },
  {
    id: 'sawmill',
    name: 'Portable sawmill',
    description:
      'A geared cutting platform processes reserved nearby timber, wearing its metal blade with each batch.',
    coins: 55,
    items: { wood: 6, ore: 4 },
  },
  {
    id: 'ore-sorter',
    name: 'Ore sorting table',
    description:
      'A vibrating sieve separates a reserved nearby outcrop, using timber fuel for each batch.',
    coins: 50,
    items: { wood: 4, ore: 5 },
  },
];
export const PRODUCTION_RECIPES: readonly ProductionRecipe[] = [
  ...(['cequin', 'heartleaf', 'emberroot'] as const).map((item) => ({
    id: `grow-${item}`,
    kind: 'garden' as const,
    name: `Propagate ${item}`,
    seconds: 80,
    inputs: { [item]: 1, wood: 1 },
    output: { [item]: 3 },
  })),
  {
    id: 'cut-timber',
    kind: 'sawmill',
    name: 'Process nearby timber',
    seconds: 55,
    inputs: { ore: 1 },
    output: { wood: 4 },
    source: 'pine',
  },
  {
    id: 'sort-ore',
    kind: 'ore-sorter',
    name: 'Separate nearby ore',
    seconds: 65,
    inputs: { wood: 1 },
    output: { ore: 4 },
    source: 'rock',
  },
];
export interface ProductionSource extends Point {
  id: string;
  kind: 'pine' | 'rock';
}
export interface ProductionJob {
  id: number;
  recipe: string;
  batches: number;
  completed: number;
  elapsed: number;
  sources: ProductionSource[];
  awaitingClaim?: boolean;
  blocked?: string;
}
export interface ProductionStructure extends Point {
  id: string;
  kind: ProductionKind;
  createdAt: number;
  output: Partial<Record<ItemId, number>>;
  job: ProductionJob | null;
}
export interface ProductionState {
  version: 1;
  serial: number;
  jobSerial: number;
  structures: ProductionStructure[];
}
export const createProduction = (): ProductionState => ({
  version: 1,
  serial: 0,
  jobSerial: 0,
  structures: [],
});
const itemIds: readonly ItemId[] = [
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
const integer = (n: unknown, a: number, b: number): n is number =>
  typeof n === 'number' && Number.isSafeInteger(n) && n >= a && n <= b;
const finite = (n: unknown, a: number, b: number): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= a && n <= b;
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function restoreProduction(value: unknown, time: number): ProductionState {
  if (value === undefined) return createProduction();
  const fail = (): never => {
    throw new Error('Invalid production structures.');
  };
  if (
    !object(value) ||
    value.version !== 1 ||
    !integer(value.serial, 0, 1000000) ||
    !integer(value.jobSerial, 0, 1000000) ||
    !Array.isArray(value.structures) ||
    value.structures.length > 24
  )
    return fail();
  const ids = new Set<string>(),
    jobs = new Set<number>(),
    sources = new Set<string>();
  for (const s of value.structures) {
    if (
      !object(s) ||
      typeof s.id !== 'string' ||
      !/^production:[0-9]+$/.test(s.id) ||
      !integer(Number(s.id.slice(11)), 1, value.serial) ||
      ids.has(s.id) ||
      !PRODUCTION_KINDS.some((k) => k.id === s.kind) ||
      !integer(s.x, -10000000, 10000000) ||
      !integer(s.y, -10000000, 10000000) ||
      !finite(s.createdAt, 0, time) ||
      !object(s.output) ||
      Object.entries(s.output).some(
        ([k, n]) => !itemIds.includes(k as ItemId) || !integer(n, 0, 60),
      ) ||
      Object.values(s.output).reduce<number>((n, v) => n + (v as number), 0) > 60
    )
      return fail();
    ids.add(s.id);
    const recipeOutputs = new Set(
      PRODUCTION_RECIPES.filter((r) => r.kind === s.kind).flatMap((r) => Object.keys(r.output)),
    );
    if (Object.keys(s.output).some((k) => !recipeOutputs.has(k))) return fail();
    if (s.job === null) continue;
    const j = s.job;
    if (
      !object(j) ||
      !integer(j.id, 1, value.jobSerial) ||
      jobs.has(j.id) ||
      !integer(j.batches, 1, 5) ||
      !integer(j.completed, 0, j.batches - 1) ||
      !Array.isArray(j.sources) ||
      j.sources.length > 5 ||
      (j.awaitingClaim !== undefined && typeof j.awaitingClaim !== 'boolean') ||
      (j.blocked !== undefined && (typeof j.blocked !== 'string' || j.blocked.length > 200))
    )
      return fail();
    jobs.add(j.id);
    const recipe = PRODUCTION_RECIPES.find((r) => r.id === j.recipe && r.kind === s.kind);
    if (
      !recipe ||
      !finite(j.elapsed, 0, recipe.seconds) ||
      j.sources.length !== (recipe.source ? j.batches : 0) ||
      (j.awaitingClaim && (j.elapsed !== recipe.seconds || !recipe.source))
    )
      return fail();
    for (const [i, source] of j.sources.entries()) {
      if (
        !object(source) ||
        typeof source.id !== 'string' ||
        !source.id ||
        source.id.length > 160 ||
        source.kind !== recipe.source ||
        !integer(source.x, -10000000, 10000000) ||
        !integer(source.y, -10000000, 10000000) ||
        Math.hypot(source.x - (s.x as number), source.y - (s.y as number)) > 16
      )
        return fail();
      if (i >= j.completed) {
        if (sources.has(source.id)) return fail();
        sources.add(source.id);
      }
    }
  }
  const structures = value.structures as unknown as ProductionStructure[];
  if (
    structures.some((s, i) =>
      structures.some((other, j) => i !== j && Math.hypot(s.x - other.x, s.y - other.y) < 3),
    )
  )
    return fail();
  return structuredClone(value) as unknown as ProductionState;
}
export function productionSources(
  props: readonly Prop[],
  kind: 'pine' | 'rock',
  center: Point,
  removed: ReadonlySet<string>,
  reserved: ReadonlySet<string>,
  count: number,
): ProductionSource[] {
  return [
    ...new Map(
      props
        .filter(
          (p) =>
            p.kind === kind &&
            !removed.has(p.id) &&
            !reserved.has(p.id) &&
            Math.hypot(p.x - center.x, p.y - center.y) <= 16,
        )
        .map((p) => [p.id, p]),
    ).values(),
  ]
    .sort(
      (a, b) =>
        Math.hypot(a.x - center.x, a.y - center.y) - Math.hypot(b.x - center.x, b.y - center.y) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, count)
    .map((p) => ({ id: p.id, kind, x: p.x, y: p.y }));
}
