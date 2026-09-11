import { deriveSeed, random } from '../procedural/random.ts';
import type { ItemId, Npc, Prop, PropKind } from './types.ts';
import type { ArtifactGenome } from './artifacts.ts';

export type ToolKind = 'axe' | 'pickaxe' | 'sickle';
export interface ToolState {
  kind: ToolKind;
  seed: number;
  durability: number;
}
export interface ToolProfile {
  id: string;
  kind: ToolKind;
  name: string;
  strength: number;
  maxDurability: number;
  staminaCost: number;
  cooldown: number;
  headWidth: number;
  haftLength: number;
  bladeLength: number;
  headThickness: number;
  color: string;
  metalColor: string;
  hardness: number;
  density: number;
}
export interface WorkProgress {
  propId: string;
  strokes: number;
  lastStrokeAt: number;
}
export type LaborKind = 'forestry' | 'quarry' | 'garden';
export interface WorkerProfile {
  id: string;
  name: string;
  eligible: boolean;
  loyalty: number;
  competence: number;
  specialty: LaborKind;
  motive: string;
  summary: string;
}
export interface LaborAllocation {
  propId: string;
  kind: PropKind;
  x: number;
  y: number;
  item: ItemId;
  amount: number;
}
export interface LaborOrder {
  id: string;
  serial: number;
  workerId: string;
  workerName: string;
  kind: LaborKind;
  status: 'working' | 'complete' | 'cancelled';
  startedAt: number;
  endsAt: number;
  wages: number;
  allocations: LaborAllocation[];
}
export const THEO_ESTATE = Object.freeze({
  residenceId: 'origin:house:-1:1',
  residenceName: 'The priest’s established residence',
  x: -13,
  y: 10,
  coins: 240,
  toolKinds: ['axe', 'pickaxe', 'sickle'] as readonly ToolKind[],
  staffIds: ['origin-botanist', 'origin-engineer', 'origin:resident:5'] as readonly string[],
  description:
    'Twenty stíchoi have left Theo a residence, working tools, savings and paid ties to the clinic, workshop and household. These people keep their own loyalties.',
});
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const integer = (n: unknown, low: number, high: number): n is number =>
  Number.isSafeInteger(n) && (n as number) >= low && (n as number) <= high;
const toolKinds = new Set<ToolKind>(['axe', 'pickaxe', 'sickle']);
const laborKinds = new Set<LaborKind>(['forestry', 'quarry', 'garden']);
const round = (n: number) => Math.round(n * 100) / 100;

export function seededTool(bodySeed: number, kind: ToolKind): ToolProfile {
  if (!Number.isSafeInteger(bodySeed) || !toolKinds.has(kind))
    throw new Error('Unknown tool construction.');
  const seed = deriveSeed(bodySeed >>> 0, 'estate-tool', kind),
    rng = random(seed);
  const hardness = round(0.4 + rng() * 0.55),
    density = round(0.3 + rng() * 0.65);
  const headWidth = round((kind === 'pickaxe' ? 12 : kind === 'axe' ? 7 : 5) + rng() * 6);
  const haftLength = round((kind === 'sickle' ? 14 : 27) + rng() * 11);
  const bladeLength = round((kind === 'sickle' ? 10 : 6) + rng() * 7),
    headThickness = round(2 + rng() * 3);
  const strength = round(
    clamp(0.55 + hardness * 0.65 + headWidth / 55 - density * 0.12, 0.75, 1.45),
  );
  const mass = headWidth * headThickness * density;
  const cooldown = round(
    clamp(
      (kind === 'pickaxe' ? 1.05 : kind === 'axe' ? 0.85 : 0.5) + mass / 180 - strength * 0.12,
      0.4,
      1.5,
    ),
  );
  const names = ['Alder', 'Morrow', 'Rime', 'Brass', 'Winter', 'Vesper'];
  return {
    id: `tool:${kind}:${bodySeed >>> 0}`,
    kind,
    name: `${names[seed % names.length]} ${kind}`,
    strength,
    maxDurability: Math.round(65 + hardness * 55 + density * 35),
    staminaCost: Math.ceil((kind === 'pickaxe' ? 11 : kind === 'axe' ? 8 : 3) / strength),
    cooldown,
    headWidth,
    haftLength,
    bladeLength,
    headThickness,
    hardness,
    density,
    color: `#${[92 + (seed % 38), 64 + ((seed >>> 8) % 25), 42 + ((seed >>> 16) % 20)].map((v) => v.toString(16).padStart(2, '0')).join('')}`,
    metalColor: `#${[131 + Math.floor(hardness * 35), 147 + Math.floor(hardness * 33), 151 + Math.floor(hardness * 37)].map((v) => v.toString(16)).join('')}`,
  };
}

export function requiredToolFor(kind: PropKind): ToolKind | null {
  return kind === 'pine'
    ? 'axe'
    : kind === 'rock'
      ? 'pickaxe'
      : ['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(kind)
        ? 'sickle'
        : null;
}
/** A generated implement has a physical specialization, rather than qualifying for every resource. */
export function artifactToolKind(genome: ArtifactGenome): ToolKind | null {
  if (genome.category !== 'implement' || genome.properties.harvest < 1) return null;
  let cutting = 0,
    piercing = 0,
    curved = 0;
  for (const p of genome.parts) {
    if (p.kind === 'blade') cutting += p.length * p.width * p.material.hardness;
    if (p.kind === 'tine' || p.kind === 'crystal')
      piercing += (p.length * p.material.hardness * 8) / p.width;
    if (p.kind === 'ring' || p.kind === 'leaf' || p.kind === 'root')
      curved += p.length * p.material.flexibility * 2;
  }
  return curved > cutting && curved > piercing ? 'sickle' : piercing > cutting ? 'pickaxe' : 'axe';
}
export function resourceWork(prop: Prop) {
  const kind = requiredToolFor(prop.kind);
  if (!kind) return null;
  const size = deriveSeed(prop.seed, 'resource-size', prop.id);
  return {
    requiredStrokes:
      prop.kind === 'pine' ? 4 + (size % 4) : prop.kind === 'rock' ? 5 + (size % 5) : 2,
    cooldown: prop.kind === 'rock' ? 1.05 : prop.kind === 'pine' ? 0.85 : 0.5,
    staminaCost: prop.kind === 'rock' ? 11 : prop.kind === 'pine' ? 8 : 3,
  };
}
export function applyToolStroke(input: {
  prop: Prop;
  tool: ToolState;
  work: WorkProgress | null;
  stamina: number;
  now: number;
}):
  | { ok: true; tool: ToolState; work: WorkProgress; staminaCost: number; complete: boolean }
  | { ok: false; reason: string } {
  const { prop, tool, work, stamina, now } = input,
    required = requiredToolFor(prop.kind);
  if (!required || tool.kind !== required)
    return {
      ok: false,
      reason: `This work requires ${required ? `a ${required}` : 'a gatherable resource'}.`,
    };
  if (!finite(now) || now < 0 || !finite(stamina) || !Number.isSafeInteger(tool.seed))
    return { ok: false, reason: 'Invalid work state.' };
  const profile = seededTool(tool.seed, tool.kind),
    effort = resourceWork(prop)!;
  const wear = prop.kind === 'rock' ? 2 : 1;
  if (!integer(tool.durability, 0, profile.maxDurability) || tool.durability < wear)
    return { ok: false, reason: 'Repair this tool before continuing.' };
  const previous = work?.propId === prop.id ? work : null;
  if (
    previous &&
    (!integer(previous.strokes, 0, effort.requiredStrokes) ||
      !finite(previous.lastStrokeAt) ||
      previous.lastStrokeAt > now)
  )
    return { ok: false, reason: 'Invalid work progress.' };
  if (previous && previous.strokes >= effort.requiredStrokes)
    return { ok: false, reason: 'This resource has already been worked.' };
  if (previous && now - previous.lastStrokeAt + 1e-8 < profile.cooldown)
    return { ok: false, reason: 'Let the tool recover before the next stroke.' };
  if (stamina < profile.staminaCost)
    return { ok: false, reason: 'Recover some energy before working.' };
  const next = { propId: prop.id, strokes: (previous?.strokes ?? 0) + 1, lastStrokeAt: now };
  return {
    ok: true,
    tool: { ...tool, durability: tool.durability - wear },
    work: next,
    staminaCost: profile.staminaCost,
    complete: next.strokes === effort.requiredStrokes,
  };
}

export function workerProfile(npc: Npc, reputation: readonly number[]): WorkerProfile {
  const rng = random(deriveSeed(npc.seed, 'labor-character'));
  const competence = Math.round(45 + rng() * 45);
  const trust = reputation[npc.clan];
  const loyalty = Math.round(clamp(35 + rng() * 30 + (finite(trust) ? trust : 0) * 0.35, 5, 95));
  const specialty: LaborKind =
    npc.role === 'engineer' ? 'quarry' : npc.role === 'botanist' ? 'garden' : 'forestry';
  const motive =
    npc.role === 'botanist'
      ? 'Protects the clinic’s medicine supply; paid work does not surrender clinical judgment.'
      : npc.role === 'engineer'
        ? 'Values maintained tools, fair wages and reliable workshop materials.'
        : npc.role === 'refugee'
          ? 'Seeks predictable wages and household security, while retaining the right to refuse.'
          : 'Offers practical work for wages; family loyalty and personal safety still matter.';
  return {
    id: npc.id,
    name: npc.name,
    eligible: npc.hp > 0 && !npc.hostile && npc.role !== 'raider',
    loyalty,
    competence,
    specialty,
    motive,
    summary: `${competence}/100 competence · ${loyalty}/100 trust · prefers ${specialty}. ${motive}`,
  };
}
const matching = (kind: LaborKind, prop: Prop) =>
  kind === 'forestry'
    ? prop.kind === 'pine'
    : kind === 'quarry'
      ? prop.kind === 'rock'
      : ['cequin', 'heartleaf', 'emberroot', 'mushroom'].includes(prop.kind);
const resourceItem = (prop: Pick<Prop, 'kind'>): ItemId =>
  prop.kind === 'pine'
    ? 'wood'
    : prop.kind === 'rock'
      ? 'ore'
      : prop.kind === 'mushroom'
        ? 'rations'
        : (prop.kind as ItemId);

export function assignLabor(input: {
  worker: Npc;
  reputation: readonly number[];
  kind: LaborKind;
  props: readonly Prop[];
  removed: ReadonlySet<string>;
  orders: readonly LaborOrder[];
  now: number;
  serial: number;
  coins: number;
  yieldFor: (prop: Prop) => number;
}): { ok: true; order: LaborOrder; wages: number } | { ok: false; reason: string } {
  const { worker, reputation, kind, props, removed, orders, now, serial, coins, yieldFor } = input;
  if (
    !laborKinds.has(kind) ||
    !finite(now) ||
    now < 0 ||
    !integer(serial, 1, Number.MAX_SAFE_INTEGER) ||
    !finite(coins)
  )
    return { ok: false, reason: 'Invalid labor assignment.' };
  if (orders.length >= 64 || orders.some((o) => o.id === `labor:${serial}`))
    return { ok: false, reason: 'The labor ledger cannot accept this assignment.' };
  const profile = workerProfile(worker, reputation);
  if (!profile.eligible)
    return { ok: false, reason: 'Only a living peaceful person can accept this work.' };
  if (profile.loyalty < 20)
    return {
      ok: false,
      reason: 'This person does not trust the household enough to accept the assignment.',
    };
  if (orders.some((o) => o.workerId === worker.id && o.status === 'working'))
    return { ok: false, reason: 'This worker already has an unfinished assignment.' };
  const reserved = new Set(
    orders.filter((o) => o.status === 'working').flatMap((o) => o.allocations.map((a) => a.propId)),
  );
  const selected = [...new Map(props.map((p) => [p.id, p])).values()]
    .filter(
      (p) =>
        matching(kind, p) &&
        !removed.has(p.id) &&
        !reserved.has(p.id) &&
        Math.hypot(p.x - worker.x, p.y - worker.y) <= 24,
    )
    .sort(
      (a, b) =>
        Math.hypot(a.x - worker.x, a.y - worker.y) - Math.hypot(b.x - worker.x, b.y - worker.y) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3);
  if (!selected.length)
    return { ok: false, reason: 'No unclaimed nearby resource is available for this work.' };
  const jitter = deriveSeed(worker.seed, kind, serial) % 31;
  const duration = Math.round(
    clamp(
      (kind === 'quarry' ? 150 : kind === 'forestry' ? 115 : 85) +
        jitter -
        profile.competence * 0.35 -
        (profile.specialty === kind ? 12 : 0),
      60,
      180,
    ),
  );
  const wages = 8 + Math.ceil(duration / 15) + Math.floor(profile.competence / 20);
  if (coins < wages)
    return { ok: false, reason: `The agreed wages are ${wages} coins, paid before work begins.` };
  const allocations = selected.map((p) => ({
    propId: p.id,
    kind: p.kind,
    x: p.x,
    y: p.y,
    item: resourceItem(p),
    amount: yieldFor(p),
  }));
  if (allocations.some((a) => !integer(a.amount, 1, 20)))
    return { ok: false, reason: 'Invalid resource yield.' };
  const order: LaborOrder = {
    id: `labor:${serial}`,
    serial,
    workerId: worker.id,
    workerName: worker.name,
    kind,
    status: 'working',
    startedAt: now,
    endsAt: now + duration,
    wages,
    allocations,
  };
  return { ok: true, order, wages };
}

export function finishLabor(
  order: LaborOrder,
  input: { worker: Npc; props: readonly Prop[]; removed: ReadonlySet<string>; now: number },
):
  | { ok: true; order: LaborOrder; consumeIds: string[]; output: Partial<Record<ItemId, number>> }
  | { ok: false; reason: string } {
  if (order.status !== 'working')
    return { ok: false, reason: 'This assignment has already ended.' };
  if (!finite(input.now) || input.now < order.endsAt)
    return { ok: false, reason: 'The work is still in progress.' };
  if (input.worker.id !== order.workerId || !workerProfile(input.worker, []).eligible)
    return { ok: false, reason: 'The assigned worker is no longer available.' };
  for (const allocation of order.allocations) {
    const actual = input.props.find((p) => p.id === allocation.propId);
    if (
      !actual ||
      actual.kind !== allocation.kind ||
      actual.x !== allocation.x ||
      actual.y !== allocation.y ||
      input.removed.has(actual.id)
    )
      return {
        ok: false,
        reason: 'An allocated resource is no longer available; withdraw or reassign this work.',
      };
  }
  const output: Partial<Record<ItemId, number>> = {};
  for (const allocation of order.allocations)
    output[allocation.item] = (output[allocation.item] ?? 0) + allocation.amount;
  return {
    ok: true,
    order: { ...order, allocations: order.allocations.map((a) => ({ ...a })), status: 'complete' },
    consumeIds: order.allocations.map((a) => a.propId),
    output,
  };
}

export function validateLaborOrders(value: unknown): LaborOrder[] {
  const bad = (): never => {
    throw new Error('Invalid estate labor ledger.');
  };
  if (!Array.isArray(value) || value.length > 64) return bad();
  const ids = new Set<string>(),
    workers = new Set<string>(),
    reservations = new Set<string>();
  for (const o of value as LaborOrder[]) {
    if (
      !o ||
      o.id !== `labor:${o.serial}` ||
      !integer(o.serial, 1, Number.MAX_SAFE_INTEGER) ||
      ids.has(o.id) ||
      typeof o.workerId !== 'string' ||
      !o.workerId ||
      o.workerId.length > 160 ||
      typeof o.workerName !== 'string' ||
      o.workerName.length > 160 ||
      !laborKinds.has(o.kind) ||
      !['working', 'complete', 'cancelled'].includes(o.status) ||
      !finite(o.startedAt) ||
      o.startedAt < 0 ||
      !finite(o.endsAt) ||
      o.endsAt - o.startedAt < 60 ||
      o.endsAt - o.startedAt > 180 ||
      !integer(o.wages, 1, 100) ||
      !Array.isArray(o.allocations) ||
      !o.allocations.length ||
      o.allocations.length > 3
    )
      return bad();
    ids.add(o.id);
    if (o.status === 'working') {
      if (workers.has(o.workerId)) return bad();
      workers.add(o.workerId);
    }
    const allocated = new Set<string>();
    for (const a of o.allocations) {
      if (
        !a ||
        typeof a.propId !== 'string' ||
        !a.propId ||
        a.propId.length > 160 ||
        allocated.has(a.propId) ||
        !finite(a.x) ||
        !finite(a.y) ||
        !matching(o.kind, a as unknown as Prop) ||
        resourceItem(a as unknown as Prop) !== a.item ||
        !integer(a.amount, 1, 20)
      )
        return bad();
      allocated.add(a.propId);
      if (o.status === 'working') {
        if (reservations.has(a.propId)) return bad();
        reservations.add(a.propId);
      }
    }
  }
  return structuredClone(value);
}
