import { deriveSeed } from '../procedural/random.ts';
import type { ItemId, Npc, Point, Prop, Settlement } from './types.ts';
import type { ProgressionState } from './progression.ts';
import { professionProfile } from './progression.ts';

export interface Commission {
  id: string;
  number: number;
  boardId: string;
  board: Point;
  town: string;
  clan: number;
  kind: 'field' | 'workshop' | 'garden' | 'watch';
  title: string;
  description: string;
  item?: ItemId;
  required: number;
  progress: number;
  targets: string[];
  target: Point;
  reward: number;
  status: 'active' | 'complete' | 'cancelled';
}
export interface FreeLifeState {
  version: 1;
  serial: number;
  completed: number;
  gardenProduce: number;
  hostProfessions: string[];
  rewarded: string[];
  knownHosts: string[];
  commission: Commission | null;
}
export function createFreeLife(): FreeLifeState {
  return {
    version: 1,
    serial: 0,
    completed: 0,
    gardenProduce: 0,
    hostProfessions: [],
    rewarded: [],
    knownHosts: [],
    commission: null,
  };
}
export function createCommission(
  seed: number,
  number: number,
  town: Settlement,
  board: Prop,
  plants: Prop[],
  enemies: Npc[],
  garden: { x: number; y: number; plant: ItemId } | undefined,
  yieldFor: (prop: Prop) => number = () => 1,
): Commission {
  const h = deriveSeed(seed, 'free-life-contract', town.id, number),
    mode = h % 4;
  const base = {
    id: `life:commission:${number}`,
    number,
    boardId: board.id,
    board: { x: board.x, y: board.y },
    town: town.name,
    clan: town.clan,
    progress: 0,
    targets: [] as string[],
    status: 'active' as const,
  };
  if (mode === 3 && enemies.length) {
    const targets = enemies.slice(0, 1 + ((h >>> 8) % 2));
    return {
      ...base,
      kind: 'watch',
      title: `Road watch for ${town.name}`,
      description:
        'Confront these identified raiders. Only their actual defeats count; uninvolved people are not targets. Report to the issuing noticeboard.',
      required: targets.length,
      target: { x: targets[0].x, y: targets[0].y },
      targets: targets.map((n) => n.id),
      reward: 30 + targets.length * 14,
    };
  }
  if (mode === 2 && garden)
    return {
      ...base,
      kind: 'garden',
      title: `A cultivated supply for ${town.name}`,
      description:
        'Harvest six portions from your own growing beds after accepting this order. Deliver those plants to the issuing noticeboard.',
      item: garden.plant,
      required: 6,
      target: { x: garden.x, y: garden.y },
      reward: 44,
    };
  if (mode === 1 || !plants.length) {
    const item = (['salve', 'tonic', 'bandage'] as const)[(h >>> 4) % 3],
      required = 3 + ((h >>> 12) % 3);
    return {
      ...base,
      kind: 'workshop',
      title: `Clinic preparations for ${town.name}`,
      description: `Prepare ${required} ${item} after accepting this order, then deliver the medicine. Existing stock alone does not demonstrate the requested work.`,
      item,
      required,
      target: { x: town.x + 4, y: town.y + 5 },
      reward: 24 + required * 7,
    };
  }
  const plot = plants[(h >>> 4) % plants.length];
  const matching = new Map(plants.filter((p) => p.kind === plot.kind).map((p) => [p.id, p]));
  const available = [...matching.values()].reduce((sum, p) => {
    const amount = yieldFor(p);
    return sum + (Number.isSafeInteger(amount) && amount >= 1 ? amount : 1);
  }, 0);
  const required = Math.min(6 + ((h >>> 12) % 5), available);
  return {
    ...base,
    kind: 'field',
    title: `Field gathering for ${town.name}`,
    description: `Gather ${required} fresh ${plot.kind} after accepting this order and deliver the plants. The marked plot is a real remaining plant; other matching plots also count.`,
    item: plot.kind as ItemId,
    required,
    target: { x: plot.x, y: plot.y },
    reward: 20 + required * 3,
  };
}
export function freeLifeMilestones(
  state: FreeLifeState,
  progression: ProgressionState,
  supplies: number,
  dispatches: number,
) {
  const level = Math.max(
    ...(['botany', 'crafting', 'combat'] as const).map(
      (p) => professionProfile(progression, p).level,
    ),
  );
  const furnished = Math.max(0, ...progression.homes.map((h) => Object.keys(h.furniture).length));
  const upgrades = Object.values(progression.upgrades).reduce(
    (n, body) => n + Object.values(body).reduce((a, b) => a + (b ?? 0), 0),
    0,
  );
  return [
    {
      id: 'life:profession',
      title: 'A practiced calling',
      description: 'Reach profession level five through actual botany, crafting or combat work.',
      progress: level,
      goal: 5,
    },
    {
      id: 'life:home',
      title: 'A home with a purpose',
      description: 'Own a real home and furnish its rest, hearth, workshop and garden slots.',
      progress: furnished,
      goal: 4,
    },
    {
      id: 'life:garden',
      title: 'Food without a factory',
      description: 'Harvest twenty-four plant portions from gardens you cultivated.',
      progress: state.gardenProduce,
      goal: 24,
    },
    {
      id: 'life:equipment',
      title: 'Tools kept in working order',
      description: 'Earn three physical equipment upgrade ranks; each remains with its body.',
      progress: upgrades,
      goal: 3,
    },
    {
      id: 'life:service',
      title: 'A name the clinics remember',
      description: 'Complete six paid botanical supply jobs or local commissions.',
      progress: supplies + state.completed,
      goal: 6,
    },
    {
      id: 'life:correspondence',
      title: 'Words carried faithfully—or questioned',
      description:
        'Resolve three real correspondence routes through delivery, disclosure or withholding.',
      progress: dispatches,
      goal: 3,
    },
    {
      id: 'life:identity',
      title: 'Lives beyond one office',
      description:
        'After the return investigation, inhabit willing people from four different professions.',
      progress: state.hostProfessions.length,
      goal: 4,
    },
  ].map((m) => ({
    ...m,
    progress: Math.min(m.goal, m.progress),
    complete: m.progress >= m.goal,
    rewarded: state.rewarded.includes(m.id),
  }));
}
export function restoreFreeLife(raw: unknown): FreeLifeState {
  const fail = (): never => {
    throw new Error('Invalid free-life record.');
  };
  if (raw === undefined) return createFreeLife();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail();
  const s = raw as FreeLifeState;
  const count = (v: unknown, max = 1e9) =>
    typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;
  const text = (v: unknown, max = 200) => typeof v === 'string' && v.length > 0 && v.length <= max;
  const point = (p: Point) =>
    !!p &&
    typeof p.x === 'number' &&
    typeof p.y === 'number' &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Math.abs(p.x) <= Number.MAX_SAFE_INTEGER &&
    Math.abs(p.y) <= Number.MAX_SAFE_INTEGER;
  const roles = [
    'botanist',
    'merchant',
    'archivist',
    'engineer',
    'guard',
    'refugee',
    'raider',
    'pilgrim',
  ];
  const list = (v: unknown, max: number) =>
    Array.isArray(v) &&
    v.length <= max &&
    new Set(v).size === v.length &&
    v.every((x) => text(x, 160));
  if (
    s.version !== 1 ||
    !count(s.serial) ||
    !count(s.completed) ||
    s.completed > s.serial ||
    !count(s.gardenProduce) ||
    !list(s.hostProfessions, 8) ||
    s.hostProfessions.some((r) => !roles.includes(r)) ||
    !list(s.rewarded, 7) ||
    s.rewarded.some(
      (id) =>
        ![
          'life:profession',
          'life:home',
          'life:garden',
          'life:equipment',
          'life:service',
          'life:correspondence',
          'life:identity',
        ].includes(id),
    ) ||
    !list(s.knownHosts, 128)
  )
    return fail();
  if (s.commission !== null) {
    const c = s.commission;
    if (
      !c ||
      typeof c !== 'object' ||
      c.number !== s.serial ||
      c.number < 1 ||
      c.id !== `life:commission:${c.number}` ||
      !text(c.boardId, 160) ||
      !point(c.board) ||
      !text(c.town) ||
      !count(c.clan, 5) ||
      !['field', 'workshop', 'garden', 'watch'].includes(c.kind) ||
      !text(c.title) ||
      !text(c.description, 1000) ||
      !count(c.required, 20) ||
      c.required < 1 ||
      !count(c.progress, c.required) ||
      !list(c.targets, 2) ||
      (c.kind === 'watch' ? c.targets.length !== c.required : c.targets.length !== 0) ||
      (c.status === 'complete' && c.progress !== c.required) ||
      !point(c.target) ||
      !count(c.reward, 100) ||
      !['active', 'complete', 'cancelled'].includes(c.status) ||
      (c.kind === 'watch') !== !c.item ||
      (c.item &&
        !['cequin', 'heartleaf', 'emberroot', 'salve', 'tonic', 'bandage'].includes(c.item))
    )
      return fail();
  }
  return structuredClone(s);
}
